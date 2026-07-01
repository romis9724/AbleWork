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
import { AuditService } from '../audit/audit.service'
import { AttendanceClockInService } from './attendance-clockin.service'
import { AttendanceQueryService } from './attendance-query.service'
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
    private readonly audit: AuditService,
    private readonly clockin: AttendanceClockInService,
    private readonly query: AttendanceQueryService,
  ) {}

  // ── 조회·판정 위임 (AttendanceQueryService / AttendanceClockInService) ────────

  findAll(companyId: string, filter: AttendanceFilterDto, user: JwtPayload) {
    return this.query.findAll(companyId, filter, user)
  }

  getMyToday(companyId: string, employeeId: string) {
    return this.query.getMyToday(companyId, employeeId)
  }

  determineStatus(
    companyId: string,
    employeeId: string,
    clockInAt: Date,
    shift: {
      startAt: Date
      shiftType?: { isDeemedWork: boolean; noClockInRequired: boolean } | null
    } | null,
  ) {
    return this.clockin.determineStatus(companyId, employeeId, clockInAt, shift)
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
    const shift = await this.clockin.findShiftForClockIn(dto.employeeId, clockInAt)
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
      const judged = await this.clockin.determineStatus(companyId, dto.employeeId, clockInAt, shift)
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
    const { lat, lng, method, organizationId, timeclockAreaId, positionId, note } = dto
    const channel = dto.channel ?? 'web'

    await this.assertEmployee(companyId, employeeId)

    // 선택한 조직이 본인 소속인지 검증 (무일정 출근 모달에서 보낸 조직)
    if (organizationId) {
      await this.clockin.assertOrgMembership(employeeId, organizationId)
    }

    // 선택한 직무가 자사 소속·활성인지 검증
    if (positionId) {
      await this.clockin.assertPositionBelongsToCompany(companyId, positionId)
    }

    // 출퇴근 장소가 지정된 경우 자사 소속 검증(멀티테넌시) + 채널/조직 정합 + GPS 반경 검증
    if (timeclockAreaId) {
      const area = await this.clockin.assertTimeclockAreaBelongsToCompany(companyId, timeclockAreaId)
      // 웹은 WiFi 검증 수단이 없어 WiFi 필수 장소(wifi/gps_and_wifi)를 사용할 수 없다 (앱 전용)
      this.clockin.assertAreaChannelAllowed(area, channel)
      // 조직과 장소를 함께 보낸 경우, 장소가 그 조직에 연결(N:N)돼 있는지 확인
      if (
        organizationId &&
        !area.organizations.some((o) => o.organizationId === organizationId)
      ) {
        throw new BadRequestException({
          code: 'TIMECLOCK_AREA_ORG_MISMATCH',
          message: '선택한 조직에 속하지 않는 출퇴근 장소입니다.',
        })
      }
      this.clockin.assertWithinTimeclockArea(area, lat, lng, channel)
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
    const shift = await this.clockin.findShiftForClockIn(employeeId, clockInDate)

    // 출근 상태 판정
    const { status, isOncall } = await this.clockin.determineStatus(
      companyId,
      employeeId,
      clockInDate,
      shift,
    )

    // 무일정 출근 정책 enforcement (CLAUDE.md §6)
    if (isOncall) {
      await this.clockin.assertUnscheduledAllowed(companyId, shift)
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        employeeId,
        shiftId: shift?.id ?? null,
        timeclockAreaId: timeclockAreaId ?? null,
        positionId: positionId ?? null,
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
    const earlyLeaveStatus = await this.clockin.resolveClockOutStatus(attendance, clockOutAt)

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

}
