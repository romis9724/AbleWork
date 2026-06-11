import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { CreateLeaveGroupDto } from './dto/create-leave-group.dto'
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/create-leave-type.dto'
import { CreateAccrualRuleDto, RunAccrualRuleDto } from './dto/accrual-rule.dto'
import {
  ManualAccrualDto,
  CompensationLeaveDto,
  LeaveFilterDto,
} from './dto/create-leave.dto'

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── HR-06-01 휴가 그룹 목록 ──────────────────────────────────────────────────

  async findGroups(companyId: string) {
    return this.prisma.leaveGroup.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: { leaveTypes: { where: { isActive: true }, select: { id: true, name: true } } },
    })
  }

  // ── HR-06-02 휴가 그룹 생성 ──────────────────────────────────────────────────

  async createGroup(companyId: string, dto: CreateLeaveGroupDto) {
    return this.prisma.leaveGroup.create({
      data: { companyId, ...dto },
    })
  }

  // ── HR-06-03 휴가 유형 목록 ──────────────────────────────────────────────────

  async findTypes(companyId: string) {
    return this.prisma.leaveType.findMany({
      where: { group: { companyId } },
      orderBy: { name: 'asc' },
      include: { group: { select: { id: true, name: true } } },
    })
  }

  // ── HR-06-04 휴가 유형 생성 ──────────────────────────────────────────────────

  async createType(companyId: string, dto: CreateLeaveTypeDto) {
    await this.assertGroupBelongsToCompany(companyId, dto.groupId)

    return this.prisma.leaveType.create({
      data: {
        ...dto,
        orgScopeIds: dto.orgScopeIds ?? undefined,
        positionScopeIds: dto.positionScopeIds ?? undefined,
      },
    })
  }

  // ── HR-06-05 휴가 유형 수정 ──────────────────────────────────────────────────

  async updateType(companyId: string, id: string, dto: UpdateLeaveTypeDto) {
    await this.assertTypeBelongsToCompany(companyId, id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = { ...dto }
    if (dto.orgScopeIds !== undefined) {
      data['orgScopeIds'] = dto.orgScopeIds ?? undefined
    }
    if (dto.positionScopeIds !== undefined) {
      data['positionScopeIds'] = dto.positionScopeIds ?? undefined
    }

    return this.prisma.leaveType.update({ where: { id }, data })
  }

  // ── HR-06-06 발생 규칙 목록 ──────────────────────────────────────────────────

  async findAccrualRules(companyId: string) {
    return this.prisma.leaveAccrualRule.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        leaveGroup: { select: { id: true, name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    })
  }

  // ── HR-06-07 발생 규칙 생성 ──────────────────────────────────────────────────

  async createAccrualRule(companyId: string, dto: CreateAccrualRuleDto) {
    await this.assertGroupBelongsToCompany(companyId, dto.leaveGroupId)

    const { items, ...ruleData } = dto

    return this.prisma.leaveAccrualRule.create({
      data: {
        companyId,
        ...ruleData,
        items: { create: items },
      },
      include: { items: true },
    })
  }

  // ── HR-06-08 발생 규칙 실행 ──────────────────────────────────────────────────

  async runAccrualRule(
    companyId: string,
    ruleId: string,
    dto: RunAccrualRuleDto,
  ) {
    const rule = await this.prisma.leaveAccrualRule.findFirst({
      where: { id: ruleId, companyId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        leaveGroup: { include: { leaveTypes: { where: { isActive: true } } } },
      },
    })

    if (!rule) {
      throw new NotFoundException({
        code: 'ACCRUAL_RULE_NOT_FOUND',
        message: '발생 규칙을 찾을 수 없습니다.',
      })
    }

    // 대상 직원 목록 결정
    const employees = dto.employeeId
      ? await this.prisma.employee.findMany({
          where: { id: dto.employeeId, companyId, isActive: true },
          select: { id: true, joinedAt: true },
        })
      : await this.prisma.employee.findMany({
          where: { companyId, isActive: true },
          select: { id: true, joinedAt: true },
        })

    if (employees.length === 0) return { processed: 0 }

    const targetYear = dto.year
    const referenceDate = new Date(`${targetYear}-12-31`)

    let processed = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.prisma.$transaction(async (tx: any) => {
      for (const employee of employees) {
        const tenureMonths = this.calcTenureMonths(employee.joinedAt, referenceDate)
        const tenureYears = Math.floor(tenureMonths / 12)

        // 해당 직원에게 적용할 규칙 항목 선택 (기준: 근속기간)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applicableItem = rule.items.find((item: any) => {
          if (item.accrualBasis === 'yearly') {
            return item.tenureYears !== null && item.tenureYears !== undefined
              ? tenureYears >= item.tenureYears
              : true
          }
          return item.tenureMonths !== null && item.tenureMonths !== undefined
            ? tenureMonths >= item.tenureMonths
            : true
        })

        if (!applicableItem) continue

        // 그룹의 첫 번째 활성 휴가 유형에 잔액 생성/업데이트
        for (const leaveType of rule.leaveGroup.leaveTypes) {
          const expiresAt = applicableItem.validMonths
            ? new Date(
                new Date(`${targetYear}-01-01`).setMonth(
                  applicableItem.validMonths,
                ),
              )
            : null

          await tx.leaveBalance.upsert({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: employee.id,
                leaveTypeId: leaveType.id,
                year: targetYear,
              },
            },
            create: {
              employeeId: employee.id,
              leaveTypeId: leaveType.id,
              year: targetYear,
              accruedDays: applicableItem.accrualDays,
              usedDays: 0,
              remainingDays: applicableItem.accrualDays,
              expiresAt,
            },
            update: {
              accruedDays: applicableItem.accrualDays,
              remainingDays: { increment: applicableItem.accrualDays },
              expiresAt,
            },
          })
        }

        processed++
      }
    })

    return { processed }
  }

  // ── HR-06-09 잔여 휴가 조회 ──────────────────────────────────────────────────

  async getBalance(companyId: string, employeeId: string) {
    await this.assertEmployeeBelongsToCompany(companyId, employeeId)

    return this.prisma.leaveBalance.findMany({
      where: { employeeId },
      include: {
        leaveType: {
          select: { id: true, name: true, displayName: true, code: true, groupId: true },
        },
      },
      orderBy: [{ year: 'desc' }, { leaveType: { name: 'asc' } }],
    })
  }

  // ── HR-06-10 수동 발생 ───────────────────────────────────────────────────────

  async manualAccrual(companyId: string, dto: ManualAccrualDto) {
    await this.assertEmployeeBelongsToCompany(companyId, dto.employeeId)
    await this.assertTypeBelongsToCompany(companyId, dto.leaveTypeId)

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null

    const balance = await this.prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          year: dto.year,
        },
      },
      create: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        year: dto.year,
        accruedDays: dto.days,
        usedDays: 0,
        remainingDays: dto.days,
        expiresAt,
      },
      update: {
        accruedDays: { increment: dto.days },
        remainingDays: { increment: dto.days },
        ...(expiresAt && { expiresAt }),
      },
    })

    this.events.emit('leave.accrued', {
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      year: dto.year,
      days: dto.days,
      companyId,
    })

    return balance
  }

  // ── HR-06-11 휴가 일정 조회 ──────────────────────────────────────────────────

  async findLeaves(companyId: string, filter: LeaveFilterDto) {
    const { employeeId, leaveTypeId, startDate, endDate, page, limit } = filter
    const skip = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      employee: { companyId },
      ...(employeeId && { employeeId }),
      ...(leaveTypeId && { leaveTypeId }),
      ...(startDate && { startDate: { gte: new Date(startDate) } }),
      ...(endDate && { endDate: { lte: new Date(endDate) } }),
    }

    const [items, total] = await Promise.all([
      this.prisma.leave.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          employee: { select: { id: true, name: true } },
          leaveType: { select: { id: true, name: true, displayName: true } },
        },
      }),
      this.prisma.leave.count({ where }),
    ])

    return { items, total, page, limit }
  }

  // ── HR-06-12 보상휴가 발생 ───────────────────────────────────────────────────

  async createCompensationLeave(companyId: string, dto: CompensationLeaveDto) {
    await this.assertEmployeeBelongsToCompany(companyId, dto.employeeId)
    await this.assertTypeBelongsToCompany(companyId, dto.leaveTypeId)

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null

    const balance = await this.prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          year: dto.year,
        },
      },
      create: {
        employeeId: dto.employeeId,
        leaveTypeId: dto.leaveTypeId,
        year: dto.year,
        accruedDays: dto.days,
        usedDays: 0,
        remainingDays: dto.days,
        expiresAt,
      },
      update: {
        accruedDays: { increment: dto.days },
        remainingDays: { increment: dto.days },
        ...(expiresAt && { expiresAt }),
      },
    })

    this.events.emit('leave.compensation.accrued', {
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      year: dto.year,
      days: dto.days,
      reason: dto.reason,
      companyId,
    })

    return balance
  }

  // ── 휴가 잔액 검증 (외부 모듈 — requests에서 사용) ──────────────────────────

  async validateBalance(params: {
    employeeId: string
    leaveTypeId: string
    daysUsed: number
    startDate: Date
    year: number
  }): Promise<void> {
    const { employeeId, leaveTypeId, daysUsed, startDate, year } = params

    const balance = await this.prisma.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year },
      },
      include: {
        leaveType: { select: { groupId: true } },
      },
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
        message: `잔여 휴가일이 부족합니다. (잔여: ${balance.remainingDays}일, 신청: ${daysUsed}일)`,
      })
    }

    if (balance.expiresAt && balance.expiresAt < startDate) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_EXPIRED',
        message: '휴가 유효기간이 만료되었습니다.',
      })
    }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

  private async assertGroupBelongsToCompany(companyId: string, groupId: string) {
    const group = await this.prisma.leaveGroup.findFirst({
      where: { id: groupId, companyId },
    })
    if (!group) {
      throw new NotFoundException({
        code: 'LEAVE_GROUP_NOT_FOUND',
        message: '휴가 그룹을 찾을 수 없습니다.',
      })
    }
    return group
  }

  private async assertTypeBelongsToCompany(companyId: string, typeId: string) {
    const type = await this.prisma.leaveType.findFirst({
      where: { id: typeId, group: { companyId } },
    })
    if (!type) {
      throw new NotFoundException({
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: '휴가 유형을 찾을 수 없습니다.',
      })
    }
    return type
  }

  private async assertEmployeeBelongsToCompany(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId },
    })
    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '직원을 찾을 수 없습니다.',
      })
    }
    return employee
  }

  private calcTenureMonths(joinedAt: Date, referenceDate: Date): number {
    const diffMs = referenceDate.getTime() - joinedAt.getTime()
    if (diffMs < 0) return 0
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return Math.floor(diffDays / 30.44)
  }
}
