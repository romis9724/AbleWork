import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { ReportFilterDto, SnapshotListFilterDto } from './dto/report-filter.dto'
import { CreateSnapshotDto, CreateCustomColumnDto } from './dto/snapshot.dto'

export interface EmployeeReportRow {
  employeeId: string
  employeeName: string
  totalWorkDays: number
  normalCount: number
  lateCount: number
  earlyLeaveCount: number
  absentCount: number
  noScheduleCount: number
  totalWorkMinutes: number
  overtimeMinutes: number
  usedLeaveDays: number
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 실시간 리포트 ──────────────────────────────────────────────────────────

  async getRealtimeReport(
    companyId: string,
    filter: ReportFilterDto,
  ): Promise<EmployeeReportRow[]> {
    const { startDate, endDate, organizationId, employeeId } = filter
    const start = new Date(startDate)
    const end = new Date(endDate)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attendanceWhere: Record<string, any> = {
      companyId,
      date: { gte: start, lte: end },
    }
    if (employeeId) attendanceWhere['employeeId'] = employeeId
    if (organizationId) attendanceWhere['employee'] = { organizationId }

    const attendances = await this.prisma.attendance.findMany({
      where: attendanceWhere,
      select: {
        employeeId: true,
        status: true,
        workMinutes: true,
        overtimeMinutes: true,
        isLate: true,
        isEarlyLeave: true,
        employee: { select: { name: true } },
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const leaveWhere: Record<string, any> = {
      companyId,
      status: 'APPROVED',
      OR: [
        { startDate: { lte: end }, endDate: { gte: start } },
      ],
    }
    if (employeeId) leaveWhere['employeeId'] = employeeId
    if (organizationId) leaveWhere['employee'] = { organizationId }

    const leaveRequests = await this.prisma.leaveRequest.findMany({
      where: leaveWhere,
      select: {
        employeeId: true,
        leaveDays: true,
        employee: { select: { name: true } },
      },
    })

    // 직원별 집계
    const rowMap = new Map<string, EmployeeReportRow>()

    const getOrCreate = (empId: string, empName: string): EmployeeReportRow => {
      if (!rowMap.has(empId)) {
        rowMap.set(empId, {
          employeeId: empId,
          employeeName: empName,
          totalWorkDays: 0,
          normalCount: 0,
          lateCount: 0,
          earlyLeaveCount: 0,
          absentCount: 0,
          noScheduleCount: 0,
          totalWorkMinutes: 0,
          overtimeMinutes: 0,
          usedLeaveDays: 0,
        })
      }
      return rowMap.get(empId)!
    }

    for (const att of attendances) {
      const row = getOrCreate(att.employeeId, att.employee.name)

      if (att.status !== 'NO_SCHEDULE') {
        row.totalWorkDays++
      }
      if (att.status === 'NORMAL') row.normalCount++
      if (att.status === 'ABSENT') row.absentCount++
      if (att.status === 'NO_SCHEDULE') row.noScheduleCount++
      if (att.isLate) row.lateCount++
      if (att.isEarlyLeave) row.earlyLeaveCount++

      row.totalWorkMinutes += att.workMinutes ?? 0
      row.overtimeMinutes += att.overtimeMinutes ?? 0
    }

    for (const leave of leaveRequests) {
      const row = getOrCreate(leave.employeeId, leave.employee.name)
      row.usedLeaveDays += Number(leave.leaveDays ?? 0)
    }

    return Array.from(rowMap.values())
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
      'normalCount',
      'lateCount',
      'earlyLeaveCount',
      'absentCount',
      'totalWorkMinutes',
      'overtimeMinutes',
      'usedLeaveDays',
    ].join(',')

    const lines = rows.map((r) =>
      [
        r.employeeId,
        `"${r.employeeName.replace(/"/g, '""')}"`,
        r.totalWorkDays,
        r.normalCount,
        r.lateCount,
        r.earlyLeaveCount,
        r.absentCount,
        r.totalWorkMinutes,
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
          createdBy: { select: { id: true, name: true } },
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
    user: JwtPayload,
  ) {
    const snapshot = await this.prisma.reportSnapshot.create({
      data: {
        companyId,
        name: dto.name,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        columnConfig: dto.columnConfig ?? {},
        isLocked: false,
        createdById: user.employeeId,
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
            normalCount: r.normalCount,
            lateCount: r.lateCount,
            earlyLeaveCount: r.earlyLeaveCount,
            absentCount: r.absentCount,
            noScheduleCount: r.noScheduleCount,
            totalWorkMinutes: r.totalWorkMinutes,
            overtimeMinutes: r.overtimeMinutes,
            usedLeaveDays: r.usedLeaveDays,
            employeeName: r.employeeName,
          },
          calculationBasis: {
            periodStart: dto.periodStart,
            periodEnd: dto.periodEnd,
            generatedAt: new Date().toISOString(),
          },
        })),
      })
    }

    return snapshot
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
      orderBy: { createdAt: 'desc' },
    })
  }

  // ── 커스텀 열 생성 ────────────────────────────────────────────────────────

  async createCustomColumn(companyId: string, dto: CreateCustomColumnDto) {
    return this.prisma.customReportColumn.create({
      data: {
        companyId,
        name: dto.name,
        formula: dto.formula,
        leaveTypeId: dto.leaveTypeId ?? null,
        shiftTypeId: dto.shiftTypeId ?? null,
      },
    })
  }
}
