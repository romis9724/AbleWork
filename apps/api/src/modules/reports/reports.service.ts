import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { ReportFilterDto, SnapshotListFilterDto } from './dto/report-filter.dto'
import { CreateSnapshotDto, CreateCustomColumnDto } from './dto/snapshot.dto'

export interface EmployeeReportRow {
  employeeId: string
  employeeName: string
  totalWorkDays: number
  scheduledWorkDays: number
  scheduledWorkMinutes: number
  normalCount: number
  lateCount: number
  earlyLeaveCount: number
  absentCount: number
  noScheduleCount: number
  missingClockOutCount: number
  totalWorkMinutes: number
  standardizedWorkMinutes: number
  overtimeMinutes: number
  usedLeaveDays: number
}

// ── 집계용 내부 타입 ──────────────────────────────────────────────────────────

interface BreakForReport {
  startAt: Date
  endAt: Date | null
  isManual: boolean
}

interface AttendanceForReport {
  employeeId: string
  status: string
  isOncall: boolean
  clockInAt: Date
  clockOutAt: Date | null
  shift: { startAt: Date; endAt: Date } | null
  breaks: BreakForReport[]
  employee: { name: string }
}

interface ShiftForReport {
  employeeId: string
  startAt: Date
  endAt: Date
  attendance: { id: string } | null
  employee: { name: string }
}

interface WageInfoForReport {
  employeeId: string
  contractedWorkDays: string
  contractedHoursPerWeek: Prisma.Decimal | number
}

interface StandardizationRuleForReport {
  startTimeRule: string
  endTimeRule: string
  includeManualBreak: boolean
}

// ── 상수 ─────────────────────────────────────────────────────────────────────

const MS_PER_MINUTE = 60_000
const DEFAULT_DAILY_WORK_MINUTES = 480 // WageInfo 부재 시 일 8시간 기준
const DEFAULT_CONTRACTED_WORK_DAYS = 5

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 실시간 리포트 ──────────────────────────────────────────────────────────

  async getRealtimeReport(
    companyId: string,
    filter: ReportFilterDto,
  ): Promise<EmployeeReportRow[]> {
    // 지각/조퇴 임곗값: 지정 시 근무일정(shift) 시작/종료 시각과 비교해 '분' 단위로 재판정한다.
    // 미지정 시 저장된 attendance.status('late'/'early_leave') 기준을 그대로 사용한다.
    const {
      startDate,
      endDate,
      organizationId,
      employeeId,
      lateThresholdMinutes,
      earlyLeaveThresholdMinutes,
    } = filter
    const start = new Date(startDate)
    const end = new Date(endDate)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const employeeWhere: Record<string, any> = organizationId
      ? { companyId, organizations: { some: { organizationId } } }
      : { companyId }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attendanceWhere: Record<string, any> = {
      employee: employeeWhere,
      clockInAt: { gte: start, lte: end },
    }
    if (employeeId) attendanceWhere['employeeId'] = employeeId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaveWhere: Record<string, any> = {
      status: 'APPROVED',
      employee: employeeWhere,
      OR: [{ startDate: { lte: end }, endDate: { gte: start } }],
    }
    if (employeeId) leaveWhere['employeeId'] = employeeId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shiftWhere: Record<string, any> = {
      employee: employeeWhere,
      startAt: { gte: start, lte: end },
    }
    if (employeeId) shiftWhere['employeeId'] = employeeId

    const [attendances, leaveRecords, shifts, wageInfos, standardRule] =
      await Promise.all([
        this.prisma.attendance.findMany({
          where: attendanceWhere,
          select: {
            employeeId: true,
            status: true,
            isOncall: true,
            clockInAt: true,
            clockOutAt: true,
            shift: { select: { startAt: true, endAt: true } },
            breaks: { select: { startAt: true, endAt: true, isManual: true } },
            employee: { select: { name: true } },
          },
        }) as Promise<AttendanceForReport[]>,
        this.prisma.leave.findMany({
          where: leaveWhere,
          select: {
            employeeId: true,
            daysUsed: true,
            employee: { select: { name: true } },
          },
        }),
        this.prisma.shift.findMany({
          where: shiftWhere,
          select: {
            employeeId: true,
            startAt: true,
            endAt: true,
            attendance: { select: { id: true } },
            employee: { select: { name: true } },
          },
        }) as Promise<ShiftForReport[]>,
        this.prisma.wageInfo.findMany({
          where: { employee: employeeWhere, effectiveFrom: { lte: end } },
          orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
          select: {
            employeeId: true,
            contractedWorkDays: true,
            contractedHoursPerWeek: true,
          },
        }) as Promise<WageInfoForReport[]>,
        this.prisma.standardizationRule.findFirst({
          where: { companyId, isDefault: true, isActive: true },
        }) as Promise<StandardizationRuleForReport | null>,
      ])

    // 직원별 유효 WageInfo (effectiveFrom 최신 1건)
    const wageMap = new Map<string, WageInfoForReport>()
    for (const wage of wageInfos) {
      if (!wageMap.has(wage.employeeId)) wageMap.set(wage.employeeId, wage)
    }

    // 직원별 집계
    const rowMap = new Map<string, EmployeeReportRow>()

    const getOrCreate = (empId: string, empName: string): EmployeeReportRow => {
      if (!rowMap.has(empId)) {
        rowMap.set(empId, {
          employeeId: empId,
          employeeName: empName,
          totalWorkDays: 0,
          scheduledWorkDays: 0,
          scheduledWorkMinutes: 0,
          normalCount: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          absentCount: 0,
          noScheduleCount: 0,
          missingClockOutCount: 0,
          totalWorkMinutes: 0,
          standardizedWorkMinutes: 0,
          overtimeMinutes: 0,
          usedLeaveDays: 0,
        })
      }
      return rowMap.get(empId)!
    }

    for (const att of attendances) {
      const row = getOrCreate(att.employeeId, att.employee.name)

      // 휴게(종료된 건) 차감 후 실근무 분
      const breakMinutes = this.sumBreakMinutes(att.breaks ?? [])
      const rawMinutes =
        att.clockOutAt != null
          ? this.diffMinutes(att.clockInAt, att.clockOutAt)
          : 0
      const workMinutes = Math.max(0, rawMinutes - breakMinutes)

      // 연장근로: 유효 WageInfo의 일일 소정근로 초과분 (없으면 480분 기준)
      const dailyContracted = this.getDailyContractedMinutes(
        wageMap.get(att.employeeId),
      )

      // 상태별 집계 — 실제 저장값(소문자) 기준
      if (att.isOncall) {
        row.noScheduleCount++ // 무일정 근무
      } else {
        row.totalWorkDays++
      }
      if (att.status === 'normal') row.normalCount++
      // 지각: 임곗값 지정 시 (출근시각 − 일정시작) 분이 임곗값 초과일 때만 집계
      if (lateThresholdMinutes != null && att.shift) {
        if (this.diffMinutes(att.shift.startAt, att.clockInAt) > lateThresholdMinutes) row.lateCount++
      } else if (att.status === 'late') {
        row.lateCount++
      }
      // 조퇴: 임곗값 지정 시 (일정종료 − 퇴근시각) 분이 임곗값 초과일 때만 집계
      if (earlyLeaveThresholdMinutes != null && att.shift && att.clockOutAt != null) {
        if (this.diffMinutes(att.clockOutAt, att.shift.endAt) > earlyLeaveThresholdMinutes) row.earlyLeaveCount++
      } else if (att.status === 'early_leave') {
        row.earlyLeaveCount++
      }
      if (att.status === 'absent') row.absentCount++
      if (att.clockOutAt == null && att.status !== 'absent') {
        row.missingClockOutCount++ // 출근만 있고 퇴근 없는 건
      }

      row.totalWorkMinutes += workMinutes
      row.overtimeMinutes += Math.max(0, workMinutes - dailyContracted)
      row.standardizedWorkMinutes += standardRule
        ? this.getStandardizedMinutes(att, standardRule)
        : workMinutes
    }

    // Shift 연동 집계: 일정 일수/합계 분 + 일정만 있고 출근이 없는 결근
    const scheduledDates = new Map<string, Set<string>>()
    const now = new Date()
    for (const shift of shifts) {
      const row = getOrCreate(shift.employeeId, shift.employee.name)

      if (!scheduledDates.has(shift.employeeId)) {
        scheduledDates.set(shift.employeeId, new Set())
      }
      scheduledDates
        .get(shift.employeeId)!
        .add(shift.startAt.toISOString().slice(0, 10))

      row.scheduledWorkMinutes += Math.max(
        0,
        this.diffMinutes(shift.startAt, shift.endAt),
      )

      // 기간 내 종료된 shift 중 attendance가 없는 건 → 결근 합산
      // (attendance.status='absent' 건과는 attendance 유무로 자연 중복 제거)
      if (shift.endAt.getTime() <= now.getTime() && shift.attendance == null) {
        row.absentCount++
      }
    }
    for (const [empId, dates] of scheduledDates) {
      rowMap.get(empId)!.scheduledWorkDays = dates.size
    }

    for (const leave of leaveRecords) {
      const row = getOrCreate(leave.employeeId, leave.employee.name)
      row.usedLeaveDays += Number(leave.daysUsed ?? 0)
    }

    return Array.from(rowMap.values())
  }

  // ── 집계 헬퍼 ─────────────────────────────────────────────────────────────

  private diffMinutes(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / MS_PER_MINUTE)
  }

  /** 종료(endAt)된 휴게만 합산. includeManual=false면 수동 휴게 제외. */
  private sumBreakMinutes(
    breaks: BreakForReport[],
    includeManual = true,
  ): number {
    let total = 0
    for (const brk of breaks) {
      if (brk.endAt == null) continue
      if (!includeManual && brk.isManual) continue
      total += Math.max(0, this.diffMinutes(brk.startAt, brk.endAt))
    }
    return total
  }

  /** 주 계약시간을 근무일수로 환산한 일일 소정근로(분). WageInfo 없으면 480분. */
  private getDailyContractedMinutes(wage?: WageInfoForReport): number {
    if (!wage) return DEFAULT_DAILY_WORK_MINUTES

    const weeklyHours = Number(wage.contractedHoursPerWeek)
    if (!Number.isFinite(weeklyHours) || weeklyHours <= 0) {
      return DEFAULT_DAILY_WORK_MINUTES
    }

    const workDays = this.parseContractedWorkDays(wage.contractedWorkDays)
    return Math.round((weeklyHours * 60) / workDays)
  }

  /** contracted_work_days('mon,tue,…' 또는 '5') → 주 근무일수. 기본 5일. */
  private parseContractedWorkDays(value: string | null | undefined): number {
    if (!value) return DEFAULT_CONTRACTED_WORK_DAYS

    const trimmed = value.trim()
    const asNumber = Number(trimmed)
    if (Number.isInteger(asNumber) && asNumber > 0) return asNumber

    const dayCount = trimmed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean).length
    return dayCount > 0 ? dayCount : DEFAULT_CONTRACTED_WORK_DAYS
  }

  /**
   * 표준화 규칙 적용 근무 분.
   * - startTimeRule='shift_start' → 일정 시작 시각으로 표준화 (그 외 실제 출근)
   * - endTimeRule='shift_end' → 일정 종료 시각으로 표준화 (그 외 실제 퇴근)
   * - shift 미연결 기록은 실제 시각 그대로 사용
   */
  private getStandardizedMinutes(
    att: AttendanceForReport,
    rule: StandardizationRuleForReport,
  ): number {
    const shift = att.shift ?? null

    const startAt =
      rule.startTimeRule === 'shift_start' && shift
        ? shift.startAt
        : att.clockInAt
    const endAt =
      rule.endTimeRule === 'shift_end' && shift ? shift.endAt : att.clockOutAt

    if (endAt == null) return 0

    const rawMinutes = this.diffMinutes(startAt, endAt)
    const breakMinutes = this.sumBreakMinutes(
      att.breaks ?? [],
      rule.includeManualBreak,
    )
    return Math.max(0, rawMinutes - breakMinutes)
  }

  // ── CSV 내보내기 ───────────────────────────────────────────────────────────

  async exportReportCsv(
    companyId: string,
    filter: ReportFilterDto,
  ): Promise<string> {
    const rows = await this.getRealtimeReport(companyId, filter)

    const header = [
      'employeeId',
      'employeeName',
      'totalWorkDays',
      'scheduledWorkDays',
      'scheduledWorkMinutes',
      'normalCount',
      'lateCount',
      'earlyLeaveCount',
      'absentCount',
      'noScheduleCount',
      'missingClockOutCount',
      'totalWorkMinutes',
      'standardizedWorkMinutes',
      'overtimeMinutes',
      'usedLeaveDays',
    ].join(',')

    const lines = rows.map((r) =>
      [
        r.employeeId,
        `"${r.employeeName.replace(/"/g, '""')}"`,
        r.totalWorkDays,
        r.scheduledWorkDays,
        r.scheduledWorkMinutes,
        r.normalCount,
        r.lateCount,
        r.earlyLeaveCount,
        r.absentCount,
        r.noScheduleCount,
        r.missingClockOutCount,
        r.totalWorkMinutes,
        r.standardizedWorkMinutes,
        r.overtimeMinutes,
        r.usedLeaveDays,
      ].join(','),
    )

    return [header, ...lines].join('\n')
  }

  // ── 스냅샷 목록 ───────────────────────────────────────────────────────────

  async findSnapshots(companyId: string, filter: SnapshotListFilterDto) {
    const { page, limit } = filter
    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      this.prisma.reportSnapshot.findMany({
        where: { companyId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          locker: { select: { id: true, name: true } },
        },
      }),
      this.prisma.reportSnapshot.count({ where: { companyId } }),
    ])

    return { items, total, page, limit }
  }

  // ── 스냅샷 생성 ───────────────────────────────────────────────────────────

  async createSnapshot(
    companyId: string,
    dto: CreateSnapshotDto,
    _user: JwtPayload,
  ) {
    const snapshot = await this.prisma.reportSnapshot.create({
      data: {
        companyId,
        name: dto.name,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        columnConfig: (dto.columnConfig ?? {}) as unknown as Prisma.InputJsonValue,
      },
    })

    // 동일 기간 집계 데이터로 스냅샷 행 생성
    const rows = await this.getRealtimeReport(companyId, {
      startDate: dto.periodStart,
      endDate: dto.periodEnd,
    })

    if (rows.length > 0) {
      await this.prisma.reportSnapshotRow.createMany({
        data: rows.map((r) => ({
          snapshotId: snapshot.id,
          employeeId: r.employeeId,
          values: {
            totalWorkDays: r.totalWorkDays,
            scheduledWorkDays: r.scheduledWorkDays,
            scheduledWorkMinutes: r.scheduledWorkMinutes,
            normalCount: r.normalCount,
            lateCount: r.lateCount,
            earlyLeaveCount: r.earlyLeaveCount,
            absentCount: r.absentCount,
            noScheduleCount: r.noScheduleCount,
            missingClockOutCount: r.missingClockOutCount,
            totalWorkMinutes: r.totalWorkMinutes,
            standardizedWorkMinutes: r.standardizedWorkMinutes,
            overtimeMinutes: r.overtimeMinutes,
            usedLeaveDays: r.usedLeaveDays,
            employeeName: r.employeeName,
          } as unknown as Prisma.InputJsonValue,
          calculationBasis: {
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            generatedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        })),
      })
    }

    return snapshot
  }

  // ── 스냅샷 행(직원별 집계) 조회 ──────────────────────────────────────────────

  async findSnapshotRows(companyId: string, snapshotId: string) {
    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: { id: snapshotId, companyId },
    })
    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: '스냅샷을 찾을 수 없습니다.',
      })
    }
    const rows = await this.prisma.reportSnapshotRow.findMany({
      where: { snapshotId },
      orderBy: { id: 'asc' },
    })
    return {
      snapshot: { id: snapshot.id, name: snapshot.name, isLocked: snapshot.isLocked },
      rows: rows.map((r) => ({
        employeeId: r.employeeId,
        ...((r.values ?? {}) as Record<string, unknown>),
      })),
    }
  }

  // ── 스냅샷 잠금 ───────────────────────────────────────────────────────────

  async lockSnapshot(companyId: string, snapshotId: string) {
    const snapshot = await this.prisma.reportSnapshot.findFirst({
      where: { id: snapshotId, companyId },
    })

    if (!snapshot) {
      throw new NotFoundException({
        code: 'SNAPSHOT_NOT_FOUND',
        message: '스냅샷을 찾을 수 없습니다.',
      })
    }

    if (snapshot.isLocked) {
      throw new ConflictException({
        code: 'SNAPSHOT_LOCKED',
        message: '이미 잠금된 스냅샷입니다.',
      })
    }

    return this.prisma.reportSnapshot.update({
      where: { id: snapshotId },
      data: { isLocked: true },
    })
  }

  // ── 커스텀 열 목록 ────────────────────────────────────────────────────────

  async findCustomColumns(companyId: string) {
    return this.prisma.customReportColumn.findMany({
      where: { companyId },
      orderBy: { sortOrder: 'asc' },
    })
  }

  // ── 커스텀 열 생성 ────────────────────────────────────────────────────────

  async createCustomColumn(companyId: string, dto: CreateCustomColumnDto) {
    const count = await this.prisma.customReportColumn.count({
      where: { companyId },
    })

    return this.prisma.customReportColumn.create({
      data: {
        companyId,
        name: dto.name,
        formula: dto.formula,
        filterLeaveTypeId: dto.leaveTypeId ?? null,
        filterShiftTypeId: dto.shiftTypeId ?? null,
        sortOrder: count + 1,
      },
    })
  }
}
