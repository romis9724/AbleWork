import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { LeavesService } from '../leaves/leaves.service'
import { ShiftStatus } from '@ablework/shared-constants'
import { parseTimeToDate, hoursBetween, combineDateAndTime } from './requests.helpers'

/**
 * 요청 승인 효과 적용 — 휴가/근무/근태 실데이터 반영 + 접수 전 사전 검증 (god file 분할 · 항목 24).
 * 승인 $transaction 내에서 호출되어 여기서 던지는 예외는 승인 전체를 롤백시킨다(CLAUDE.md §7).
 */
@Injectable()
export class RequestEffectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leavesService: LeavesService,
  ) {}

  // ── 승인 → 실데이터 반영 파이프라인 ─────────────────────────────────────────

  /**
   * 최종 승인된 요청을 실데이터에 반영한다 (CLAUDE.md §7 — 승인 $transaction 내 원자 처리).
   * 여기서 던지는 예외는 승인 트랜잭션 전체를 롤백시킨다 (예: 잔액 부족 시 승인 자체가 실패).
   */
  async applyApprovedRequest(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    request: { id: string; requesterId: string; type: string; payload: unknown },
  ): Promise<void> {
    const payload = (request.payload ?? {}) as Record<string, unknown>
    const employeeId = request.requesterId

    switch (request.type) {
      case 'LEAVE_CREATE':
        await this.applyLeaveCreate(tx, companyId, employeeId, payload)
        break
      case 'LEAVE_MODIFY':
        await this.applyLeaveModify(tx, companyId, employeeId, payload)
        break
      case 'LEAVE_DELETE':
        await this.applyLeaveDelete(tx, companyId, employeeId, payload)
        break
      case 'SHIFT_CREATE':
        await this.applyShiftCreate(tx, companyId, employeeId, payload)
        break
      case 'SHIFT_MODIFY':
        await this.applyShiftModify(tx, companyId, employeeId, payload)
        break
      case 'SHIFT_DELETE':
        await this.applyShiftDelete(tx, companyId, employeeId, payload)
        break
      case 'ATTENDANCE_EDIT':
      case 'ATTENDANCE_CREATE':
        await this.applyAttendanceUpsert(tx, companyId, employeeId, payload)
        break
      case 'ATTENDANCE_DELETE':
        await this.applyAttendanceDelete(tx, companyId, employeeId, payload)
        break
      case 'DEVICE_CHANGE': {
        // payload.newDeviceId가 있으면 새 기기를 즉시 바인딩, 없으면 기존 기기 해제
        // (다음 출근 시 재바인딩). 둘 다 출근 인증 기기를 교체하는 정상 경로.
        const newDeviceId =
          typeof payload.newDeviceId === 'string' && payload.newDeviceId.trim()
            ? payload.newDeviceId.trim()
            : null
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            deviceId: newDeviceId,
            deviceBoundAt: newDeviceId ? new Date() : null,
          },
        })
        break
      }
      // OFFSITE_WORK / CUSTOM: Phase 1에서는 데이터 반영 없음 (기록·결재만)
      default:
        break
    }
  }

  /** 휴가 신청 접수 전 사전 검증 — 잔액/유효기간 (createRequest에서 호출) */
  async validateLeaveCreatePayload(
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { leaveTypeId, startDate, endDate, startTime, endTime } = payload as {
      leaveTypeId?: string
      startDate?: string
      endDate?: string
      startTime?: string
      endTime?: string
    }
    if (!leaveTypeId || !startDate || !endDate) {
      throw new BadRequestException({
        code: 'REQUEST_PAYLOAD_INVALID',
        message: '휴가 유형과 기간을 입력해 주세요.',
      })
    }

    const leaveType = await this.prisma.leaveType.findFirst({ where: { id: leaveTypeId } })
    if (!leaveType) {
      throw new BadRequestException({
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: '휴가 유형을 찾을 수 없습니다.',
      })
    }
    // 비활성화된(소프트 삭제) 휴가 유형으로는 신규 신청 불가 — 기존 잔액/이력은 보존하되 선택은 차단
    if (!leaveType.isActive) {
      throw new BadRequestException({
        code: 'LEAVE_TYPE_INACTIVE',
        message: '비활성화된 휴가 유형으로는 신청할 수 없습니다.',
      })
    }
    // 시간 단위 휴가는 당일(시작일=종료일)만 허용
    if (leaveType.timeOption === 'hourly' && startDate.slice(0, 10) !== endDate.slice(0, 10)) {
      throw new BadRequestException({
        code: 'LEAVE_TIME_SAME_DAY_ONLY',
        message: '시간 단위 휴가는 당일만 신청할 수 있습니다.',
      })
    }

    const start = new Date(startDate)
    const daysUsed = await this.computeLeaveDaysUsed(
      this.prisma,
      companyId,
      leaveType,
      startDate,
      endDate,
      startTime,
      endTime,
    )

    // 잔액은 그룹 대표 유형에만 발생하므로 대표 유형 기준으로 검증
    const balanceTypeId = await this.resolveBalanceTypeId(this.prisma, leaveTypeId)
    await this.leavesService.validateBalance({
      employeeId,
      leaveTypeId: balanceTypeId,
      daysUsed,
      startDate: start,
      year: start.getFullYear(),
    })
  }

  /** 근무일정 신청 접수 전 사전 검증 — 생성 가능 여부(템플릿/근무유형) (createRequest에서 호출) */
  async validateShiftCreatePayload(
    companyId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { templateId } = payload as { templateId?: string }
    if (templateId) {
      const template = await this.prisma.shiftTemplate.findFirst({
        where: { id: templateId, companyId, isActive: true },
        select: { id: true },
      })
      if (!template) {
        throw new BadRequestException({
          code: 'SHIFT_TEMPLATE_NOT_FOUND',
          message: '근무 템플릿을 찾을 수 없습니다.',
        })
      }
      return
    }
    // 템플릿 미지정 시 기본 근무유형이 최소 1개는 있어야 승인 시 일정 생성이 가능하다.
    const shiftType = await this.prisma.shiftType.findFirst({
      where: { companyId, isActive: true },
      select: { id: true },
    })
    if (!shiftType) {
      throw new BadRequestException({
        code: 'SHIFT_TYPE_NOT_FOUND',
        message: '근무일정 유형이 등록되어 있지 않습니다. 관리자에게 근무 유형 등록을 요청하세요.',
      })
    }
  }

  /** 회사 공휴일 집합 로드 — 정확일자(YYYY-MM-DD) + 매년반복(MM-DD) */
  private async loadHolidaySets(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    companyId: string,
  ): Promise<{ exact: Set<string>; repeat: Set<string> }> {
    const rows: Array<{ holidayDate: Date; isAnnualRepeat: boolean }> =
      await client.companyHoliday.findMany({
        where: { companyId },
        select: { holidayDate: true, isAnnualRepeat: true },
      })
    const exact = new Set<string>()
    const repeat = new Set<string>()
    for (const r of rows) {
      const iso = r.holidayDate.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)
      if (r.isAnnualRepeat) repeat.add(iso.slice(5))
      else exact.add(iso)
    }
    return { exact, repeat }
  }

  /** 영업일 수: 주말(토·일)·회사 공휴일을 제외하고 시작~종료(양 끝 포함)를 센다. UTC 기준. */
  private countBusinessDays(
    startDate: string,
    endDate: string,
    holidays: { exact: Set<string>; repeat: Set<string> },
  ): number {
    const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`)
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00.000Z`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0
    let count = 0
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay() // 0=일, 6=토
      if (dow === 0 || dow === 6) continue
      const iso = d.toISOString().slice(0, 10)
      if (holidays.exact.has(iso) || holidays.repeat.has(iso.slice(5))) continue
      count++
    }
    return count
  }

  /**
   * 휴가 차감 일수 계산: 영업일(주말·공휴일 제외, 양 끝 포함) × 유형별 차감 단위.
   * 영업일이 0이면(주말/공휴일만 선택) 최소 1영업일로 간주해 차감 단위만큼 차감한다.
   */
  private async calcLeaveDaysUsed(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    companyId: string,
    startDate: string,
    endDate: string,
    deductionDays: number,
  ): Promise<number> {
    const holidays = await this.loadHolidaySets(client, companyId)
    const businessDays = Math.max(1, this.countBusinessDays(startDate, endDate, holidays))
    return businessDays * (deductionDays > 0 ? deductionDays : 1)
  }

  /** 'HH:MM' → 1970-01-01 기준 UTC Date (@db.Time 저장용). 형식 오류면 null. */
  /**
   * 휴가 차감 일수 — 유형 단위(timeOption)에 따라 분기.
   * - hourly(시간 단위): 당일(시작=종료) 시작/종료 시간으로 시간 산정, **8시간=1일** 환산(소수 2자리).
   * - full_day: 영업일(주말·공휴일 제외) × 차감 단위.
   */
  private async computeLeaveDaysUsed(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    companyId: string,
    leaveType: { timeOption: string; deductionDays: unknown; paidHours?: number | null },
    startDate: string,
    endDate: string,
    startTime?: string | null,
    endTime?: string | null,
  ): Promise<number> {
    const HOURS_PER_DAY = 8
    if (leaveType.timeOption === 'hourly') {
      const hours = hoursBetween(startTime, endTime)
      if (hours <= 0) {
        throw new BadRequestException({
          code: 'LEAVE_TIME_INVALID',
          message: '시간 단위 휴가는 종료 시간이 시작 시간보다 늦어야 합니다.',
        })
      }
      // 신청 시간은 유형에 설정된 시간(paidHours)을 초과할 수 없다.
      if (leaveType.paidHours != null && hours > Number(leaveType.paidHours)) {
        throw new BadRequestException({
          code: 'LEAVE_TIME_EXCEEDS_LIMIT',
          message: `신청 시간(${hours}시간)이 휴가 유형의 설정 시간(${leaveType.paidHours}시간)을 초과할 수 없습니다.`,
        })
      }
      return Math.round((hours / HOURS_PER_DAY) * 100) / 100
    }
    return this.calcLeaveDaysUsed(client, companyId, startDate, endDate, Number(leaveType.deductionDays))
  }

  /**
   * 잔액 차감 대상 유형 해석 — 잔액은 그룹의 대표 유형(deductionDays=1·full_day)에만 발생하므로,
   * 시간/반일 등 비대표 유형 신청도 같은 그룹의 대표 유형 잔액에서 차감한다.
   */
  private async resolveBalanceTypeId(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    leaveTypeId: string,
  ): Promise<string> {
    const lt = await client.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { groupId: true },
    })
    if (!lt?.groupId) return leaveTypeId
    const types: Array<{ id: string; deductionDays: unknown; timeOption: string; isActive: boolean }> =
      await client.leaveType.findMany({
        where: { groupId: lt.groupId },
        select: { id: true, deductionDays: true, timeOption: true, isActive: true },
      })
    const pool = types.some((t) => t.isActive) ? types.filter((t) => t.isActive) : types
    const rep =
      pool.find((t) => Number(t.deductionDays) === 1 && t.timeOption === 'full_day') ?? pool[0]
    return rep?.id ?? leaveTypeId
  }

  /** LEAVE_CREATE 승인 → Leave 생성 + 잔액 차감 */
  private async applyLeaveCreate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { leaveTypeId, startDate, endDate, reason, startTime, endTime } = payload as {
      leaveTypeId: string
      startDate: string
      endDate: string
      reason?: string
      startTime?: string
      endTime?: string
    }

    const leaveType = await tx.leaveType.findFirst({ where: { id: leaveTypeId } })
    if (!leaveType) {
      throw new BadRequestException({
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: '휴가 유형을 찾을 수 없습니다.',
      })
    }

    // 시간 단위 휴가는 당일(시작일=종료일)로 강제
    const isHourly = leaveType.timeOption === 'hourly'
    const effectiveEndDate = isHourly ? startDate : endDate
    const daysUsed = await this.computeLeaveDaysUsed(
      tx,
      companyId,
      leaveType,
      startDate,
      effectiveEndDate,
      startTime,
      endTime,
    )
    const year = new Date(startDate).getFullYear()

    // 잔액 재검증 (신청~승인 사이 잔액 변동 가능) — 부족하면 승인 트랜잭션 롤백
    // 잔액은 그룹 대표 유형에만 발생하므로 대표 유형 잔액에서 차감한다.
    const balanceTypeId = await this.resolveBalanceTypeId(tx, leaveTypeId)
    const balance = await tx.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: balanceTypeId, year } },
    })
    if (!balance) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_NOT_FOUND',
        message: '해당 연도에 휴가 잔액이 없습니다.',
      })
    }
    if (Number(balance.remainingDays) < daysUsed) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_INSUFFICIENT',
        message: `잔여 휴가일이 부족합니다. (잔여: ${balance.remainingDays}일, 필요: ${daysUsed}일)`,
      })
    }
    if (balance.expiresAt && balance.expiresAt < new Date(startDate)) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_EXPIRED',
        message: '휴가 유효기간이 만료되었습니다.',
      })
    }

    await tx.leave.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(effectiveEndDate),
        startTime: isHourly ? parseTimeToDate(startTime) : null,
        endTime: isHourly ? parseTimeToDate(endTime) : null,
        daysUsed,
        status: 'APPROVED',
        reason: (reason as string) ?? null,
      },
    })

    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        usedDays: { increment: daysUsed },
        remainingDays: { decrement: daysUsed },
      },
    })
  }

  /** LEAVE_MODIFY 승인 → 기간 수정 + 잔액 차액 반영 */
  private async applyLeaveModify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { leaveId, startDate, endDate, reason, startTime, endTime } = payload as {
      leaveId: string
      startDate?: string
      endDate?: string
      reason?: string
      startTime?: string
      endTime?: string
    }

    // 소유권 검증: 요청자 본인의 휴가만 수정 가능 (타 직원 레코드 조작 차단)
    const leave = await tx.leave.findFirst({
      where: { id: leaveId, employeeId, employee: { companyId } },
      include: { leaveType: { select: { deductionDays: true, timeOption: true, paidHours: true } } },
    })
    if (!leave) {
      throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: '휴가를 찾을 수 없습니다.' })
    }

    const isHourly = leave.leaveType.timeOption === 'hourly'
    const newStart = startDate ?? leave.startDate.toISOString()
    // 시간 단위 휴가는 당일(시작=종료)로 강제
    const newEnd = isHourly ? newStart : (endDate ?? leave.endDate.toISOString())
    const newDaysUsed = await this.computeLeaveDaysUsed(
      tx,
      companyId,
      leave.leaveType,
      newStart,
      newEnd,
      startTime,
      endTime,
    )
    const delta = newDaysUsed - Number(leave.daysUsed)

    await tx.leave.update({
      where: { id: leaveId },
      data: {
        startDate: new Date(newStart),
        endDate: new Date(newEnd),
        ...(isHourly && {
          startTime: parseTimeToDate(startTime),
          endTime: parseTimeToDate(endTime),
        }),
        daysUsed: newDaysUsed,
        ...(reason !== undefined && { reason }),
      },
    })

    if (delta !== 0) {
      const year = leave.startDate.getFullYear()
      const balanceTypeId = await this.resolveBalanceTypeId(tx, leave.leaveTypeId)
      await tx.leaveBalance.updateMany({
        where: { employeeId, leaveTypeId: balanceTypeId, year },
        data: {
          usedDays: { increment: delta },
          remainingDays: { decrement: delta },
        },
      })
    }
  }

  /** LEAVE_DELETE 승인 → 휴가 삭제 + 잔액 복원 */
  private async applyLeaveDelete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { leaveId } = payload as { leaveId: string }

    // 소유권 검증: 요청자 본인의 휴가만 삭제 가능
    const leave = await tx.leave.findFirst({
      where: { id: leaveId, employeeId, employee: { companyId } },
    })
    if (!leave) {
      throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: '휴가를 찾을 수 없습니다.' })
    }

    await tx.leave.delete({ where: { id: leaveId } })

    const restored = Number(leave.daysUsed)
    const balanceTypeId = await this.resolveBalanceTypeId(tx, leave.leaveTypeId)
    await tx.leaveBalance.updateMany({
      where: {
        employeeId: leave.employeeId,
        leaveTypeId: balanceTypeId,
        year: leave.startDate.getFullYear(),
      },
      data: {
        usedDays: { decrement: restored },
        remainingDays: { increment: restored },
      },
    })
  }

  /** SHIFT_CREATE 승인 → Shift 생성 (승인됨 = 확정 상태) */
  private async applyShiftCreate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { date, templateId, startTime, endTime } = payload as {
      date: string
      templateId?: string
      startTime?: string
      endTime?: string
    }

    // 본조직(또는 첫 소속 조직) 결정
    const employeeOrg = await tx.employeeOrganization.findFirst({
      where: { employeeId, organization: { companyId } },
      orderBy: [{ isPrimary: 'desc' }],
    })
    if (!employeeOrg) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ORGANIZATION_NOT_FOUND',
        message: '직원의 소속 조직이 없어 근무일정을 생성할 수 없습니다.',
      })
    }

    let shiftTypeId: string
    let startAt: Date
    let endAt: Date
    let resolvedTemplateId: string | null = null

    if (templateId) {
      const template = await tx.shiftTemplate.findFirst({
        where: { id: templateId, companyId, isActive: true },
      })
      if (!template) {
        throw new BadRequestException({
          code: 'SHIFT_TEMPLATE_NOT_FOUND',
          message: '근무 템플릿을 찾을 수 없습니다.',
        })
      }
      shiftTypeId = template.shiftTypeId
      resolvedTemplateId = template.id
      startAt = combineDateAndTime(date, template.startTime)
      endAt = combineDateAndTime(date, template.endTime)
    } else {
      const defaultType = await tx.shiftType.findFirst({
        where: { companyId, isActive: true },
        orderBy: { createdAt: 'asc' },
      })
      if (!defaultType) {
        throw new BadRequestException({
          code: 'SHIFT_TYPE_NOT_FOUND',
          message: '근무일정 유형이 없어 일정을 생성할 수 없습니다.',
        })
      }
      shiftTypeId = defaultType.id
      // 시간 미지정 시 09:00~18:00 기본 (과거 요청 호환)
      startAt = new Date(`${date}T${(startTime ?? '09:00').padStart(5, '0')}:00`)
      endAt = new Date(`${date}T${(endTime ?? '18:00').padStart(5, '0')}:00`)
    }

    // 야간 근무: 종료가 시작보다 이르면 익일 처리
    if (endAt <= startAt) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000)
    }

    await tx.shift.create({
      data: {
        employeeId,
        organizationId: employeeOrg.organizationId,
        shiftTypeId,
        templateId: resolvedTemplateId,
        startAt,
        endAt,
        status: ShiftStatus.CONFIRMED,
        confirmedAt: new Date(),
        createdBy: employeeId,
      },
    })
  }

  /** SHIFT_MODIFY 승인 → Shift 시간 수정 */
  private async applyShiftModify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { shiftId, date, startTime, endTime } = payload as {
      shiftId: string
      date?: string
      startTime?: string
      endTime?: string
    }

    // 소유권 검증: 요청자 본인의 근무일정만 수정 가능
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, employeeId, organization: { companyId } },
    })
    if (!shift) {
      throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: '근무일정을 찾을 수 없습니다.' })
    }

    const baseDate = date ?? shift.startAt.toISOString().slice(0, 10)
    const newStart = startTime ? new Date(`${baseDate}T${startTime}:00`) : shift.startAt
    let newEnd = endTime ? new Date(`${baseDate}T${endTime}:00`) : shift.endAt
    if (newEnd <= newStart) {
      newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000)
    }

    await tx.shift.update({
      where: { id: shiftId },
      data: { startAt: newStart, endAt: newEnd },
    })
  }

  /** SHIFT_DELETE 승인 → Shift 삭제 */
  private async applyShiftDelete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { shiftId } = payload as { shiftId: string }

    // 소유권 검증: 요청자 본인의 근무일정만 삭제 가능
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, employeeId, organization: { companyId } },
    })
    if (!shift) {
      throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: '근무일정을 찾을 수 없습니다.' })
    }

    await tx.shift.delete({ where: { id: shiftId } })
  }

  /** ATTENDANCE_EDIT/CREATE 승인 → 출퇴근 기록 수정(없으면 생성) */
  private async applyAttendanceUpsert(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { attendanceId, date, clockInAt, clockOutAt, note } = payload as {
      attendanceId?: string
      date: string
      clockInAt?: string // 'HH:MM'
      clockOutAt?: string // 'HH:MM'
      note?: string
    }

    const newClockIn = clockInAt ? new Date(`${date}T${clockInAt}:00`) : undefined
    let newClockOut = clockOutAt ? new Date(`${date}T${clockOutAt}:00`) : undefined
    if (newClockIn && newClockOut && newClockOut <= newClockIn) {
      newClockOut = new Date(newClockOut.getTime() + 24 * 60 * 60 * 1000)
    }

    // 대상 기록: attendanceId 지정 시 해당 건, 아니면 해당 날짜의 첫 기록
    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(`${date}T23:59:59.999`)
    const existing = attendanceId
      ? await tx.attendance.findFirst({
          // 소유권 검증: 요청자 본인의 출퇴근 기록만 정정 가능
          where: { id: attendanceId, employeeId, employee: { companyId } },
        })
      : await tx.attendance.findFirst({
          where: {
            employeeId,
            employee: { companyId },
            clockInAt: { gte: dayStart, lte: dayEnd },
          },
          orderBy: { clockInAt: 'asc' },
        })

    if (existing) {
      if (existing.isConfirmed) {
        throw new BadRequestException({
          code: 'ATTENDANCE_ALREADY_CONFIRMED',
          message: '확정된 출퇴근 기록은 정정할 수 없습니다.',
        })
      }
      await tx.attendance.update({
        where: { id: existing.id },
        data: {
          ...(newClockIn && { clockInAt: newClockIn }),
          ...(newClockOut && { clockOutAt: newClockOut }),
          ...(note !== undefined && { note }),
        },
      })
      return
    }

    // 기록이 없으면 신규 생성 (누락 기록 보정)
    if (!newClockIn) {
      throw new BadRequestException({
        code: 'REQUEST_PAYLOAD_INVALID',
        message: '출근 시각이 없어 출퇴근 기록을 생성할 수 없습니다.',
      })
    }
    await tx.attendance.create({
      data: {
        employeeId,
        clockInAt: newClockIn,
        clockOutAt: newClockOut ?? null,
        clockInMethod: 'manual',
        status: 'normal',
        isOncall: false,
        note: note ?? '[요청 승인으로 생성]',
      },
    })
  }

  /** ATTENDANCE_DELETE 승인 → 출퇴근 기록 삭제 */
  private async applyAttendanceDelete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { attendanceId } = payload as { attendanceId: string }

    // 소유권 검증: 요청자 본인의 출퇴근 기록만 삭제 가능
    const attendance = await tx.attendance.findFirst({
      where: { id: attendanceId, employeeId, employee: { companyId } },
    })
    if (!attendance) {
      throw new NotFoundException({
        code: 'ATTENDANCE_NOT_FOUND',
        message: '출퇴근 기록을 찾을 수 없습니다.',
      })
    }
    if (attendance.isConfirmed) {
      throw new BadRequestException({
        code: 'ATTENDANCE_ALREADY_CONFIRMED',
        message: '확정된 출퇴근 기록은 삭제할 수 없습니다.',
      })
    }

    await tx.attendance.delete({ where: { id: attendanceId } })
  }
}
