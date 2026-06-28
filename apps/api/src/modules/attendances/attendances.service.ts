import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import {
  AccessLevel,
  ACCESS_LEVEL_HIERARCHY,
  AttendanceStatus,
  TimeclockAuthMethod,
} from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { AuditService } from '../audit/audit.service'
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
import { CreateAttendanceDto, UpdateBreaksDto } from './dto/create-attendance.dto'

/** 출근 상태 판정에 필요한 회사 설정 키 */
const LATE_GRACE_MINUTES_KEY = 'late_grace_minutes'
const CLOCKIN_BEFORE_SHIFT_MINUTES_KEY = 'clockin_before_shift_minutes'
const ALLOW_UNSCHEDULED_KEY = 'allow_unscheduled'

/** 무일정 출근 정책 값 */
const UnscheduledPolicy = {
  ALWAYS: 'always',
  IF_NO_SHIFT: 'if_no_shift',
  NEVER: 'never',
} as const

/** GPS 검증이 필요한 출퇴근 장소 인증 방식 */
const GPS_AUTH_METHODS: readonly string[] = [
  TimeclockAuthMethod.GPS,
  TimeclockAuthMethod.GPS_OR_WIFI,
  TimeclockAuthMethod.GPS_AND_WIFI,
]

/** 지구 평균 반경 (m) — haversine 거리 계산용 */
const EARTH_RADIUS_METERS = 6_371_000

/** GPS 검증에 필요한 출퇴근 장소 필드 */
interface TimeclockAreaForGps {
  authMethod: string
  locationLat: unknown | null
  locationLng: unknown | null
  locationRadiusMeters: number | null
}

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
    private readonly audit: AuditService,
  ) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string, filter: AttendanceFilterDto, user: JwtPayload) {
    const { startDate, endDate, organizationId, employeeId, status, missingClockOut, page, limit } =
      filter
    const skip = (page - 1) * limit

    // 보안: ORG_ADMIN 미만(EMPLOYEE)은 본인 출퇴근만 조회하도록 employeeId를 서버측에서 강제한다.
    // 관리자(ORG_ADMIN+)는 필터의 employeeId/조직 범위 조회 허용. (shifts.findAll 과 동일 정책)
    const isManager =
      ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]
    const scopedEmployeeId = isManager ? employeeId : user.employeeId

    const where: Record<string, unknown> = {
      employee: { companyId },
      ...(scopedEmployeeId && { employeeId: scopedEmployeeId }),
      ...(status && { status }),
      ...(missingClockOut && { clockOutAt: null }),
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

  // ── 수기 추가 (관리자) ──────────────────────────────────────────────────────

  /**
   * 관리자가 출퇴근 기록을 수기로 추가한다 (ORG_ADMIN 이상).
   *
   * - 직원의 회사 소속 검증 (멀티테넌시)
   * - 출근 일자의 Shift를 자동 연결 (이미 다른 기록에 연결된 Shift는 제외 — shiftId unique)
   * - status 미지정 시 determineStatus로 자동 판정
   */
  async createManual(companyId: string, dto: CreateAttendanceDto) {
    await this.assertEmployee(companyId, dto.employeeId)

    const clockInAt = new Date(dto.clockInAt)
    const clockOutAt = dto.clockOutAt ? new Date(dto.clockOutAt) : null

    // 당일 Shift 자동 연결 (clockIn과 동일 로직 재사용)
    const shift = await this.findShiftForClockIn(dto.employeeId, clockInAt)
    let shiftId = shift?.id ?? null
    if (shiftId) {
      // attendances.shift_id는 unique — 이미 연결된 기록이 있으면 연결하지 않음
      const taken = await this.prisma.attendance.findFirst({ where: { shiftId } })
      if (taken) {
        shiftId = null
      }
    }

    // status 미지정 시 자동 판정
    let status: string | undefined = dto.status
    let isOncall = false
    if (status) {
      isOncall = status === 'oncall'
    } else {
      const judged = await this.determineStatus(companyId, dto.employeeId, clockInAt, shift)
      status = judged.status
      isOncall = judged.isOncall
    }

    return this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        shiftId,
        clockInAt,
        clockOutAt,
        clockInMethod: 'manual',
        ...(clockOutAt && { clockOutMethod: 'manual' }),
        status,
        isOncall,
        note: dto.note ?? null,
      },
    })
  }

  // ── 출근 기록 ───────────────────────────────────────────────────────────────

  async clockIn(companyId: string, employeeId: string, dto: ClockInDto) {
    const { lat, lng, method, timeclockAreaId, note } = dto

    await this.assertEmployee(companyId, employeeId)

    // 출퇴근 장소가 지정된 경우 자사 소속인지 검증 (멀티테넌시) + GPS 반경 검증
    if (timeclockAreaId) {
      const area = await this.assertTimeclockAreaBelongsToCompany(companyId, timeclockAreaId)
      this.assertWithinTimeclockArea(area, lat, lng)
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

    // 무일정 출근 정책 enforcement (CLAUDE.md §6)
    if (isOncall) {
      await this.assertUnscheduledAllowed(companyId, shift)
    }

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

    const clockOutAt = new Date()

    // 조퇴(early_leave) 판정: 연결된 Shift 종료 전 퇴근 시
    const earlyLeaveStatus = await this.resolveClockOutStatus(attendance, clockOutAt)

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOutAt,
        clockOutLat: dto.lat ?? undefined,
        clockOutLng: dto.lng ?? undefined,
        clockOutMethod: dto.method ?? undefined,
        note: dto.note ?? undefined,
        ...(earlyLeaveStatus && { status: earlyLeaveStatus }),
      },
    })

    // 퇴근 이벤트 — 소속 부서 팀장에게 알림(AttendanceNotificationListener)
    this.eventEmitter.emit(EVENTS.ATTENDANCE_CLOCK_OUT, {
      companyId,
      employeeId,
      timestamp: updated.clockOutAt,
      status: updated.status,
    })

    return updated
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

  /**
   * 출퇴근 기록을 수정한다.
   *
   * 보안 주의: 이 라우트(PATCH /attendances/:id)는 컨트롤러에서 @Roles(GENERAL_ADMIN)로 보호되어
   * ORG_ADMIN은 진입할 수 없으므로 조직 경계 가드(guardOrgScope)를 의도적으로 생략한다.
   * GENERAL_ADMIN/SUPER_ADMIN은 전사 권한이라 조직 경계 검사 대상이 아니다.
   * 만약 @Roles를 ORG_ADMIN으로 낮춘다면(updateBreaks처럼) 반드시 guardOrgScope를 추가해야 한다.
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateAttendanceDto,
    actorId?: string,
  ) {
    const attendance = await this.assertAttendance(companyId, id)
    this.assertNotConfirmed(attendance)

    const updated = await this.prisma.attendance.update({
      where: { id },
      data: {
        ...(dto.clockInAt && { clockInAt: new Date(dto.clockInAt) }),
        ...(dto.clockOutAt && { clockOutAt: new Date(dto.clockOutAt) }),
        ...(dto.status && { status: dto.status }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
    })

    // 감사 로그 (fire-and-forget — record 자체가 안전하나 본 동작 보호 위해 try/catch)
    try {
      await this.audit.record({
        companyId,
        actorId,
        action: 'ATTENDANCE_UPDATE',
        targetType: 'ATTENDANCE',
        targetId: id,
        result: 'SUCCESS',
        detail: {
          before: {
            clockInAt: attendance.clockInAt?.toISOString() ?? null,
            clockOutAt: attendance.clockOutAt?.toISOString() ?? null,
            status: attendance.status,
          },
          after: {
            clockInAt: updated.clockInAt?.toISOString() ?? null,
            clockOutAt: updated.clockOutAt?.toISOString() ?? null,
            status: updated.status,
          },
        },
      })
    } catch {
      // 감사 로그 실패가 본 동작을 막지 않도록 무시
    }

    return updated
  }

  // ── 휴게 전체 교체 (관리자) ──────────────────────────────────────────────────

  /**
   * 휴게 기록을 전달된 목록으로 전체 교체한다 (ORG_ADMIN 이상, $transaction).
   * 확정된 기록은 수정할 수 없다.
   */
  async updateBreaks(
    companyId: string,
    id: string,
    dto: UpdateBreaksDto,
    requester: JwtPayload,
  ) {
    const attendance = await this.assertAttendance(companyId, id)
    await this.guardOrgScope(requester, attendance)
    this.assertNotConfirmed(attendance)

    return this.prisma.$transaction(async (tx) => {
      await tx.attendanceBreak.deleteMany({ where: { attendanceId: id } })

      if (dto.breaks.length > 0) {
        await tx.attendanceBreak.createMany({
          data: dto.breaks.map((b) => ({
            attendanceId: id,
            breakType: b.breakType,
            startAt: new Date(b.startAt),
            endAt: b.endAt ? new Date(b.endAt) : null,
            isManual: true,
          })),
        })
      }

      return tx.attendanceBreak.findMany({
        where: { attendanceId: id },
        orderBy: { startAt: 'asc' },
      })
    })
  }

  // ── 삭제 (관리자) ────────────────────────────────────────────────────────────

  /**
   * 출퇴근 기록을 삭제한다.
   *
   * 보안 주의: 이 라우트(DELETE /attendances/:id)는 컨트롤러에서 @Roles(GENERAL_ADMIN)로 보호되어
   * ORG_ADMIN은 진입할 수 없으므로 조직 경계 가드(guardOrgScope)를 의도적으로 생략한다.
   * GENERAL_ADMIN/SUPER_ADMIN은 전사 권한이라 조직 경계 검사 대상이 아니다.
   * 만약 @Roles를 ORG_ADMIN으로 낮춘다면(updateBreaks처럼) 반드시 guardOrgScope를 추가해야 한다.
   */
  async remove(companyId: string, id: string) {
    const attendance = await this.assertAttendance(companyId, id)
    this.assertNotConfirmed(attendance)

    return this.prisma.attendance.delete({ where: { id } })
  }

  // ── 내 오늘 출근 상태 ────────────────────────────────────────────────────────

  /**
   * 직원 본인의 오늘 출퇴근 기록을 반환한다 (me/home 새로고침 시 상태 복원용).
   *
   * - attendance: 오늘(clockInAt 당일) 최신 출퇴근 기록. 근무중·퇴근완료 모두 포함 (없으면 null)
   * - openBreak: 진행 중(endAt null)인 휴게 (없으면 null)
   */
  async getMyToday(companyId: string, employeeId: string) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date()
    dayEnd.setHours(23, 59, 59, 999)

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        employee: { companyId },
        clockInAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { clockInAt: 'desc' },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    })

    if (!attendance) {
      return { attendance: null, openBreak: null }
    }

    type BreakRecord = (typeof attendance.breaks)[number]
    const openBreak =
      attendance.breaks.find((b: BreakRecord) => b.endAt === null) ?? null

    return { attendance, openBreak }
  }

  // ── 현재 근무 현황 ───────────────────────────────────────────────────────────

  async getNowAtWork(companyId: string, organizationId?: string) {
    // 오늘 날짜 기준 00:00 ~ 현재까지 출근한 직원 (조직 필터는 주 소속 기준)
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const openAttendances = await this.prisma.attendance.findMany({
      where: {
        employee: {
          companyId,
          ...(organizationId && {
            organizations: { some: { organizationId, isPrimary: true } },
          }),
        },
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
      isConfirmed: false,
      ...(dto.attendanceIds?.length && { id: { in: dto.attendanceIds } }),
      ...(dto.startDate && {
        clockInAt: {
          gte: new Date(dto.startDate),
          ...(dto.endDate && { lte: new Date(`${dto.endDate}T23:59:59.999Z`) }),
        },
      }),
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
    shift: {
      startAt: Date
      shiftType?: { isDeemedWork: boolean; noClockInRequired: boolean } | null
    } | null,
  ): Promise<{ status: string; isOncall: boolean }> {
    if (!shift) {
      return { status: 'oncall', isOncall: true }
    }

    // 간주근로(isDeemedWork) 유형은 출근 시각과 무관하게 deemed_work 로 판정
    if (shift.shiftType?.isDeemedWork) {
      return { status: 'deemed_work', isOncall: false }
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

  /**
   * 조직 경계 가드 (보안): ORG_ADMIN이 동일 회사 내 타 조직 출퇴근 기록을 수정하지 못하도록 막는다.
   * (employees.service.guardOrgScope 와 동일 정책 — 대상 직원 소속 조직 ∩ 요청자 소속 조직)
   *
   * - SUPER_ADMIN / GENERAL_ADMIN → 통과 (전사)
   * - EMPLOYEE → 본인 기록만 (admin 게이트 경로라 통상 도달하지 않으나 방어)
   * - ORG_ADMIN → 대상 기록 직원의 소속 조직과 요청자 소속 조직 교집합이 있으면 통과, 없으면 Forbidden
   */
  private async guardOrgScope(requester: JwtPayload, attendance: { employeeId: string }) {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return
    }

    if (requester.accessLevel === AccessLevel.EMPLOYEE) {
      if (requester.employeeId !== attendance.employeeId) {
        throw new ForbiddenException('해당 출퇴근 기록에 대한 접근 권한이 없습니다.')
      }
      return
    }

    const [requesterOrgs, targetOrgs] = await Promise.all([
      this.prisma.employeeOrganization.findMany({
        where: { employeeId: requester.employeeId },
        select: { organizationId: true },
      }),
      this.prisma.employeeOrganization.findMany({
        where: { employeeId: attendance.employeeId },
        select: { organizationId: true },
      }),
    ])

    const requesterOrgIds = new Set(
      requesterOrgs.map((o: { organizationId: string }) => o.organizationId),
    )
    const hasOverlap = targetOrgs.some((o: { organizationId: string }) =>
      requesterOrgIds.has(o.organizationId),
    )
    if (!hasOverlap) {
      throw new ForbiddenException('해당 출퇴근 기록에 대한 접근 권한이 없습니다.')
    }
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
  ): Promise<{
    id: string
    startAt: Date
    endAt: Date
    shiftType: { isDeemedWork: boolean; noClockInRequired: boolean } | null
  } | null> {
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
      select: {
        id: true,
        startAt: true,
        endAt: true,
        shiftType: { select: { isDeemedWork: true, noClockInRequired: true } },
      },
    })
  }

  private async assertTimeclockAreaBelongsToCompany(companyId: string, timeclockAreaId: string) {
    const area = await this.prisma.timeclockArea.findFirst({
      where: { id: timeclockAreaId, isActive: true, organization: { companyId } },
      select: {
        id: true,
        authMethod: true,
        locationLat: true,
        locationLng: true,
        locationRadiusMeters: true,
      },
    })
    if (!area) {
      throw new NotFoundException({
        code: 'TIMECLOCK_AREA_NOT_FOUND',
        message: '출퇴근 장소를 찾을 수 없습니다.',
      })
    }
    return area
  }

  /**
   * 무일정 출근 정책 검증 (CLAUDE.md §6 — company_settings.attendance.allow_unscheduled)
   *
   * - 'always'      → 항상 허용
   * - 'if_no_shift' → 당일 Shift가 없으면 허용, Shift가 있는데 oncall(조기 출근 케이스)이면 거부
   * - 'never'       → 무일정 출근 거부
   */
  private async assertUnscheduledAllowed(
    companyId: string,
    shift: { id: string } | null,
  ): Promise<void> {
    const policy = await this.settingsService.get<string>(
      companyId,
      'attendance',
      ALLOW_UNSCHEDULED_KEY,
      UnscheduledPolicy.ALWAYS,
    )

    const isNever = policy === UnscheduledPolicy.NEVER
    const isConditionalRejected = policy === UnscheduledPolicy.IF_NO_SHIFT && shift !== null

    if (isNever || isConditionalRejected) {
      throw new ForbiddenException({
        code: 'ATTENDANCE_UNSCHEDULED_NOT_ALLOWED',
        message: '무일정 출근이 허용되지 않습니다.',
      })
    }
  }

  /**
   * GPS 반경 검증 (haversine)
   *
   * - authMethod가 gps 계열(gps, gps_or_wifi, gps_and_wifi)이 아니면 검증 생략 (none/wifi)
   * - 장소 좌표 미설정 또는 반경 0/null → 무제한 허용
   * - lat/lng 미전송 + gps 필수 장소 → ATTENDANCE_LOCATION_REQUIRED
   * - 반경 초과 → ATTENDANCE_OUT_OF_RANGE
   * - gps_or_wifi는 GPS 검증 실패해도 거부하지 않음 (현재 WiFi 검증 수단이 없으므로 통과)
   */
  private assertWithinTimeclockArea(
    area: TimeclockAreaForGps,
    lat?: number,
    lng?: number,
  ): void {
    if (!GPS_AUTH_METHODS.includes(area.authMethod)) {
      return // none / wifi → GPS 검증 생략
    }
    if (area.locationLat == null || area.locationLng == null) {
      return // 좌표 미설정 장소는 거리 검증 불가 → 허용
    }
    const radiusMeters = area.locationRadiusMeters
    if (!radiusMeters) {
      return // 반경 0 또는 null = 무제한 허용
    }

    // TODO: WiFi SSID 검증 수단 도입 시 gps_or_wifi는 GPS 실패 → WiFi 검증으로 폴백할 것.
    //       현재는 WiFi 검증 수단이 없으므로 gps_or_wifi는 GPS 실패 시 통과시킨다.
    const isGpsOptional = area.authMethod === TimeclockAuthMethod.GPS_OR_WIFI

    if (lat == null || lng == null) {
      if (isGpsOptional) {
        return
      }
      throw new BadRequestException({
        code: 'ATTENDANCE_LOCATION_REQUIRED',
        message: 'GPS 위치 정보(lat/lng)가 필요한 출퇴근 장소입니다.',
      })
    }

    const distanceMeters = this.haversineDistanceMeters(
      lat,
      lng,
      Number(area.locationLat),
      Number(area.locationLng),
    )

    if (distanceMeters > radiusMeters) {
      if (isGpsOptional) {
        return
      }
      throw new BadRequestException({
        code: 'ATTENDANCE_OUT_OF_RANGE',
        message: `출퇴근 장소 허용 반경을 벗어났습니다. (현재 거리 ${Math.round(distanceMeters)}m, 허용 반경 ${radiusMeters}m)`,
      })
    }
  }

  /** 두 좌표 간 haversine 거리(m) 계산 */
  private haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number): number => (deg * Math.PI) / 180

    const dLat = toRad(lat2 - lat1)
    const dLng = toRad(lng2 - lng1)

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return EARTH_RADIUS_METERS * c
  }

  /**
   * 퇴근 시 조퇴(early_leave) 판정.
   *
   * - 연결된 Shift가 없으면 상태 변경 없음
   * - clockOutAt < shift.endAt → 'early_leave'
   * - 단, 기존 status가 'late'면 유지: 지각 + 조퇴가 모두 해당하는 경우
   *   Shiftee 동작이 모호하므로 조퇴로 덮어쓰지 않고 'late'를 우선한다.
   */
  private async resolveClockOutStatus(
    attendance: { shiftId: string | null; status: string },
    clockOutAt: Date,
  ): Promise<string | undefined> {
    if (!attendance.shiftId) {
      return undefined
    }

    const shift = await this.prisma.shift.findFirst({
      where: { id: attendance.shiftId },
      select: { endAt: true },
    })
    if (!shift || clockOutAt.getTime() >= shift.endAt.getTime()) {
      return undefined
    }

    // 지각 + 조퇴 모두 해당 → 'late' 유지 (조퇴로 덮지 않음)
    if (attendance.status === AttendanceStatus.LATE) {
      return undefined
    }

    return AttendanceStatus.EARLY_LEAVE
  }
}
