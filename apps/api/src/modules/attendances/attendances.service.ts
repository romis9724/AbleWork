import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AccessLevel } from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { EVENTS } from '../../events/domain-events'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { ClockInDto } from './dto/clock-in.dto'
import { ClockOutDto, BreakStartDto, BreakEndDto } from './dto/clock-out.dto'
import {
  AttendanceFilterDto,
  ConfirmPeriodDto,
  UnconfirmAttendancesDto,
} from './dto/attendance-filter.dto'
import { UpdateAttendanceDto } from './dto/update-attendance.dto'

/** 출근 상태 판정에 필요한 회사 설정 키 */
const LATE_GRACE_MINUTES_KEY = 'late_grace_minutes'
const CLOCKIN_BEFORE_SHIFT_MINUTES_KEY = 'clockin_before_shift_minutes'

/** 현재 근무 현황 7가지 상태 */
export const WorkingStatus = {
  WORKING: 'WORKING',
  ONCALL: 'ONCALL',
  REMOTE: 'REMOTE',
  ON_LEAVE: 'ON_LEAVE',
  LATE: 'LATE',
  ABSENT: 'ABSENT',
  DEEMED_WORK: 'DEEMED_WORK',
} as const

@Injectable()
export class AttendancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly settingsService: CompanySettingsService,
  ) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string, filter: AttendanceFilterDto) {
    const { startDate, endDate, organizationId, employeeId, status, page, limit } = filter
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {
      employee: { companyId },
      ...(employeeId && { employeeId }),
      ...(status && { status }),
      ...(organizationId && {
        employee: {
          companyId,
          organizations: { some: { organizationId } },
        },
      }),
      ...(startDate && {
        clockInAt: { gte: new Date(startDate) },
      }),
      ...(endDate && {
        clockInAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          lte: new Date(`${endDate}T23:59:59.999Z`),
        },
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clockInAt: 'desc' },
        include: {
          employee: { select: { id: true, name: true, employeeNumber: true } },
          shift: {
            select: {
              id: true,
              startAt: true,
              endAt: true,
              shiftType: { select: { id: true, name: true, color: true } },
            },
          },
          timeclockArea: { select: { id: true, name: true } },
          breaks: true,
        },
      }),
      this.prisma.attendance.count({ where }),
    ])

    return { items, total, page, limit }
  }

  // ── 출근 기록 ───────────────────────────────────────────────────────────────

  async clockIn(companyId: string, employeeId: string, dto: ClockInDto) {
    const { lat, lng, method, timeclockAreaId, note } = dto

    await this.assertEmployee(companyId, employeeId)

    // 출퇴근 장소가 지정된 경우 자사 소속인지 검증 (멀티테넌시)
    if (timeclockAreaId) {
      await this.assertTimeclockAreaBelongsToCompany(companyId, timeclockAreaId)
    }

    // 이미 진행 중인 출근 기록 확인
    const openAttendance = await this.prisma.attendance.findFirst({
      where: { employeeId, clockOutAt: null },
    })
    if (openAttendance) {
      throw new ConflictException({
        code: 'ATTENDANCE_ALREADY_CLOCKED_IN',
        message: '이미 출근 중인 기록이 있습니다. 먼저 퇴근 처리를 해주세요.',
      })
    }

    const clockInDate = new Date() // 서버 현재 시각

    // 해당 날짜의 Shift 조회
    const shift = await this.findShiftForClockIn(employeeId, clockInDate)

    // 출근 상태 판정
    const { status, isOncall } = await this.determineStatus(
      companyId,
      employeeId,
      clockInDate,
      shift,
    )

    const attendance = await this.prisma.attendance.create({
      data: {
        employeeId,
        shiftId: shift?.id ?? null,
        timeclockAreaId: timeclockAreaId ?? null,
        clockInAt: clockInDate,
        clockInLat: lat ?? null,
        clockInLng: lng ?? null,
        clockInMethod: method ?? null,
        status,
        isOncall,
        note: note ?? null,
      },
    })

    // 이벤트 발행
    this.eventEmitter.emit(EVENTS.ATTENDANCE_CLOCK_IN, {
      companyId,
      employeeId,
      timestamp: attendance.clockInAt,
      status: attendance.status,
    })

    if (status === 'late') {
      this.eventEmitter.emit(EVENTS.ATTENDANCE_LATE, {
        companyId,
        employeeId,
        timestamp: attendance.clockInAt,
        shiftId: shift?.id,
      })
    }

    return attendance
  }

  // ── 퇴근 기록 ───────────────────────────────────────────────────────────────

  async clockOut(companyId: string, employeeId: string, dto: ClockOutDto) {
    // 해당 직원의 현재 진행 중인 출근 기록 자동 조회
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        employee: { companyId },
        clockOutAt: null,
      },
    })
    if (!attendance) {
      throw new NotFoundException({
        code: 'ATTENDANCE_NOT_FOUND',
        message: '현재 출근 중인 기록이 없습니다.',
      })
    }
    this.assertNotConfirmed(attendance)

    return this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOutAt: new Date(),
        clockOutLat: dto.lat ?? undefined,
        clockOutLng: dto.lng ?? undefined,
        clockOutMethod: dto.method ?? undefined,
        note: dto.note ?? undefined,
      },
    })
  }

  // ── 휴게 시작 ───────────────────────────────────────────────────────────────

  async breakStart(companyId: string, employeeId: string, dto: BreakStartDto) {
    // 현재 출근 중인 기록 자동 조회
    const attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, employee: { companyId }, clockOutAt: null },
    })
    if (!attendance) {
      throw new NotFoundException({ code: 'ATTENDANCE_NOT_FOUND', message: '출근 기록이 없습니다.' })
    }
    this.assertNotConfirmed(attendance)

    return this.prisma.attendanceBreak.create({
      data: {
        attendanceId: attendance.id,
        breakType: dto.breakType,
        startAt: new Date(),
        isManual: false,
      },
    })
  }

  // ── 휴게 종료 ───────────────────────────────────────────────────────────────

  async breakEnd(companyId: string, employeeId: string, dto: BreakEndDto) {
    // 현재 출근 중인 기록 자동 조회
    const attendance = await this.prisma.attendance.findFirst({
      where: { employeeId, employee: { companyId }, clockOutAt: null },
    })
    if (!attendance) {
      throw new NotFoundException({ code: 'ATTENDANCE_NOT_FOUND', message: '출근 기록이 없습니다.' })
    }
    this.assertNotConfirmed(attendance)

    // breakId 없으면 열려있는 마지막 휴게 자동 선택
    const breakRecord = await this.prisma.attendanceBreak.findFirst({
      where: {
        ...(dto.breakId ? { id: dto.breakId } : {}),
        attendanceId: attendance.id,
        endAt: null,
      },
      orderBy: { startAt: 'desc' },
    })
    if (!breakRecord) {
      throw new NotFoundException({
        code: 'BREAK_NOT_FOUND',
        message: '진행 중인 휴게 기록을 찾을 수 없습니다.',
      })
    }

    return this.prisma.attendanceBreak.update({
      where: { id: breakRecord.id },
      data: { endAt: new Date() },
    })
  }

  // ── 출퇴근 수정 (관리자) ─────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateAttendanceDto) {
    const attendance = await this.assertAttendance(companyId, id)
    this.assertNotConfirmed(attendance)

    return this.prisma.attendance.update({
      where: { id },
      data: {
        ...(dto.clockInAt && { clockInAt: new Date(dto.clockInAt) }),
        ...(dto.clockOutAt && { clockOutAt: new Date(dto.clockOutAt) }),
        ...(dto.status && { status: dto.status }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    })
  }

  // ── 삭제 (관리자) ────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    const attendance = await this.assertAttendance(companyId, id)
    this.assertNotConfirmed(attendance)

    return this.prisma.attendance.delete({ where: { id } })
  }

  // ── 현재 근무 현황 ───────────────────────────────────────────────────────────

  async getNowAtWork(companyId: string) {
    // 오늘 날짜 기준 00:00 ~ 현재까지 출근한 직원
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const openAttendances = await this.prisma.attendance.findMany({
      where: {
        employee: { companyId },
        clockInAt: { gte: todayStart },
        clockOutAt: null,
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeNumber: true,
            organizations: {
              where: { isPrimary: true },
              select: { organizationId: true, organization: { select: { name: true } } },
            },
          },
        },
        breaks: { where: { endAt: null }, take: 1 },
      },
    })

    type AttendanceWithEmployee = (typeof openAttendances)[number]
    const result = openAttendances.map((att: AttendanceWithEmployee) => {
      const hasOpenBreak = att.breaks.length > 0
      let workingStatus: string

      if (hasOpenBreak) {
        workingStatus = WorkingStatus.WORKING // 휴게 중도 근무 중으로 표시
      } else if (att.isOncall) {
        workingStatus = WorkingStatus.ONCALL
      } else if (att.status === 'late') {
        workingStatus = WorkingStatus.LATE
      } else if (att.status === 'deemed_work') {
        workingStatus = WorkingStatus.DEEMED_WORK
      } else if (att.status === 'remote') {
        workingStatus = WorkingStatus.REMOTE
      } else {
        workingStatus = WorkingStatus.WORKING
      }

      return {
        attendanceId: att.id,
        employeeId: att.employeeId,
        employeeName: att.employee.name,
        employeeNumber: att.employee.employeeNumber,
        organization: att.employee.organizations[0]?.organization ?? null,
        clockInAt: att.clockInAt,
        status: att.status,
        workingStatus,
        isOncall: att.isOncall,
      }
    })

    return {
      total: result.length,
      items: result,
    }
  }

  // ── 기간 확정 ───────────────────────────────────────────────────────────────

  async confirmPeriod(companyId: string, dto: ConfirmPeriodDto, confirmedById: string) {
    const where: Record<string, unknown> = {
      employee: { companyId },
      clockInAt: { gte: new Date(dto.startDate) },
      ...(dto.endDate && {
        clockInAt: {
          gte: new Date(dto.startDate),
          lte: new Date(`${dto.endDate}T23:59:59.999Z`),
        },
      }),
      isConfirmed: false,
      ...(dto.employeeIds && { employeeId: { in: dto.employeeIds } }),
    }

    const result = await this.prisma.attendance.updateMany({
      where,
      data: {
        isConfirmed: true,
        confirmedBy: confirmedById,
        confirmedAt: new Date(),
      },
    })

    return { confirmed: result.count }
  }

  // ── 확정 해제 ───────────────────────────────────────────────────────────────

  async unconfirm(companyId: string, dto: UnconfirmAttendancesDto, requester: JwtPayload) {
    // RolesGuard로 처리하지만 서비스 레벨에서도 이중 방어 (shifts.service.unconfirm 패턴)
    if (
      requester.accessLevel !== AccessLevel.GENERAL_ADMIN &&
      requester.accessLevel !== AccessLevel.SUPER_ADMIN
    ) {
      throw new ForbiddenException('확정 해제는 GENERAL_ADMIN 이상만 가능합니다.')
    }

    const where: Record<string, unknown> = {
      employee: { companyId },
      isConfirmed: true,
      ...(dto.attendanceIds?.length && { id: { in: dto.attendanceIds } }),
      ...(dto.startDate &&
        dto.endDate && {
          clockInAt: {
            gte: new Date(dto.startDate),
            lte: new Date(`${dto.endDate}T23:59:59.999Z`),
          },
        }),
    }

    const result = await this.prisma.attendance.updateMany({
      where,
      data: {
        isConfirmed: false,
        confirmedBy: null,
        confirmedAt: null,
      },
    })

    return { unconfirmed: result.count }
  }

  // ── 출근 상태 판정 ─────────────────────────────────────────────────────────

  /**
   * 출근 시각과 Shift를 바탕으로 출근 상태를 판정한다.
   *
   * 판정 규칙:
   * - shift 없음 → 'oncall' (무일정 근무)
   * - clockInAt > shiftStartAt + late_grace_minutes → 'late'
   * - clockInAt < shiftStartAt - clockin_before_shift_minutes → 'oncall'
   * - 그 외 → 'normal'
   */
  async determineStatus(
    companyId: string,
    _employeeId: string,
    clockInAt: Date,
    shift: { startAt: Date } | null,
  ): Promise<{ status: string; isOncall: boolean }> {
    if (!shift) {
      return { status: 'oncall', isOncall: true }
    }

    const [lateGrace, clockinBefore] = await Promise.all([
      this.settingsService.getNumber(companyId, 'attendance', LATE_GRACE_MINUTES_KEY, 10),
      this.settingsService.getNumber(companyId, 'attendance', CLOCKIN_BEFORE_SHIFT_MINUTES_KEY, 30),
    ])

    const shiftStartMs = shift.startAt.getTime()
    const clockInMs = clockInAt.getTime()
    const lateThresholdMs = shiftStartMs + lateGrace * 60 * 1000
    const earlyThresholdMs = shiftStartMs - clockinBefore * 60 * 1000

    if (clockInMs > lateThresholdMs) {
      return { status: 'late', isOncall: false }
    }

    if (clockInMs < earlyThresholdMs) {
      return { status: 'oncall', isOncall: true }
    }

    return { status: 'normal', isOncall: false }
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  private async assertEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    })
    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '직원을 찾을 수 없습니다.',
      })
    }
    return employee
  }

  private async assertAttendance(companyId: string, id: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, employee: { companyId } },
    })
    if (!attendance) {
      throw new NotFoundException({
        code: 'ATTENDANCE_NOT_FOUND',
        message: '출퇴근 기록을 찾을 수 없습니다.',
      })
    }
    return attendance
  }

  private async assertOpenAttendance(companyId: string, id: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id, employee: { companyId } },
    })
    if (!attendance) {
      throw new NotFoundException({
        code: 'ATTENDANCE_NOT_FOUND',
        message: '출퇴근 기록을 찾을 수 없습니다.',
      })
    }
    return attendance
  }

  private assertNotConfirmed(attendance: { isConfirmed: boolean }) {
    if (attendance.isConfirmed) {
      throw new BadRequestException({
        code: 'ATTENDANCE_ALREADY_CONFIRMED',
        message: '이미 확정된 출퇴근 기록은 수정하거나 삭제할 수 없습니다.',
      })
    }
  }

  private async findShiftForClockIn(
    employeeId: string,
    clockInAt: Date,
  ): Promise<{ id: string; startAt: Date; endAt: Date } | null> {
    const dayStart = new Date(clockInAt)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(clockInAt)
    dayEnd.setHours(23, 59, 59, 999)

    return this.prisma.shift.findFirst({
      where: {
        employeeId,
        startAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { startAt: 'asc' },
      select: { id: true, startAt: true, endAt: true },
    })
  }

  private async assertTimeclockAreaBelongsToCompany(companyId: string, timeclockAreaId: string) {
    const area = await this.prisma.timeclockArea.findFirst({
      where: { id: timeclockAreaId, isActive: true, organization: { companyId } },
      select: { id: true },
    })
    if (!area) {
      throw new NotFoundException({
        code: 'TIMECLOCK_AREA_NOT_FOUND',
        message: '출퇴근 장소를 찾을 수 없습니다.',
      })
    }
    return area
  }
}
