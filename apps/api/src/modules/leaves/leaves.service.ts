import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'
import { EVENTS } from '../../events/domain-events'
import { LeaveAccrualService } from './leave-accrual.service'
import { CreateLeaveGroupDto, UpdateLeaveGroupDto } from './dto/create-leave-group.dto'
import { CreateLeaveTypeDto, UpdateLeaveTypeDto } from './dto/create-leave-type.dto'
import {
  CreateAccrualRuleDto,
  UpdateAccrualRuleDto,
  RunAccrualRuleDto,
} from './dto/accrual-rule.dto'
import {
  CreateLeaveDto,
  ManualAccrualDto,
  CompensationLeaveDto,
  LeaveFilterDto,
  CompanyBalanceFilterDto,
} from './dto/create-leave.dto'

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly accrual: LeaveAccrualService,
  ) {}

  // ── 연차 발생 규칙 실행 (LeaveAccrualService 위임) ───────────────────────────

  runAccrualRule(companyId: string, ruleId: string, dto: RunAccrualRuleDto) {
    return this.accrual.runAccrualRule(companyId, ruleId, dto)
  }

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

  // ── 휴가 그룹 수정 ───────────────────────────────────────────────────────────

  async updateGroup(companyId: string, id: string, dto: UpdateLeaveGroupDto) {
    await this.assertGroupBelongsToCompany(companyId, id)

    return this.prisma.leaveGroup.update({ where: { id }, data: dto })
  }

  // ── 휴가 그룹 삭제 (소프트 — isActive=false, 자식 유형 cascade) ───────────────

  async deleteGroup(companyId: string, id: string) {
    await this.assertGroupBelongsToCompany(companyId, id)

    // 사용 중 검사: 그룹 내 자식 유형 중 잔여 휴가가 남은 직원이 있으면 삭제 차단.
    // (Prisma Decimal 비교는 { gt: 0 } 사용)
    const inUseCount = await this.prisma.leaveBalance.count({
      where: { leaveType: { groupId: id }, remainingDays: { gt: 0 } },
    })
    if (inUseCount > 0) {
      throw new ForbiddenException({
        code: 'LEAVE_GROUP_IN_USE',
        message: '잔여 휴가가 남은 직원이 있어 휴가 그룹을 삭제할 수 없습니다.',
      })
    }

    // 그룹 soft-delete 시 자식 LeaveType도 함께 soft-delete (cascade)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.$transaction(async (tx: any) => {
      await tx.leaveType.updateMany({
        where: { groupId: id },
        data: { isActive: false },
      })

      return tx.leaveGroup.update({
        where: { id },
        data: { isActive: false },
      })
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

  // ── 휴가 유형 삭제 (소프트 — isActive=false) ─────────────────────────────────

  async deleteType(companyId: string, id: string) {
    await this.assertTypeBelongsToCompany(companyId, id)

    // 사용 중 검사: 잔여 휴가가 남은 직원이 있으면 삭제 차단.
    // (Prisma Decimal 비교는 { gt: 0 } 사용)
    const inUseCount = await this.prisma.leaveBalance.count({
      where: { leaveTypeId: id, remainingDays: { gt: 0 } },
    })
    if (inUseCount > 0) {
      throw new ForbiddenException({
        code: 'LEAVE_TYPE_IN_USE',
        message: '잔여 휴가가 남은 직원이 있어 휴가 유형을 삭제할 수 없습니다.',
      })
    }

    return this.prisma.leaveType.update({
      where: { id },
      data: { isActive: false },
    })
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

  // ── 발생 규칙 수정 (items 제공 시 전체 교체) ─────────────────────────────────

  async updateAccrualRule(companyId: string, id: string, dto: UpdateAccrualRuleDto) {
    await this.assertAccrualRuleBelongsToCompany(companyId, id)

    if (dto.leaveGroupId) {
      await this.assertGroupBelongsToCompany(companyId, dto.leaveGroupId)
    }

    const { items, ...ruleData } = dto

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.$transaction(async (tx: any) => {
      if (items) {
        await tx.leaveAccrualRuleItem.deleteMany({ where: { ruleId: id } })
        await tx.leaveAccrualRuleItem.createMany({
          data: items.map((item) => ({ ...item, ruleId: id })),
        })
      }

      return tx.leaveAccrualRule.update({
        where: { id },
        data: ruleData,
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      })
    })
  }

  // ── 발생 규칙 삭제 (하드 — items는 onDelete: Cascade) ────────────────────────

  async deleteAccrualRule(companyId: string, id: string) {
    await this.assertAccrualRuleBelongsToCompany(companyId, id)

    return this.prisma.leaveAccrualRule.delete({ where: { id } })
  }

  // ── HR-06-08 발생 규칙 실행 ──────────────────────────────────────────────────

  async getBalance(companyId: string, employeeId: string, requester: JwtPayload) {
    // 권한: 본인 잔액은 누구나, 타인 잔액은 ORG_ADMIN 이상만 조회 가능
    const isManager =
      requester.accessLevel === AccessLevel.ORG_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN ||
      requester.accessLevel === AccessLevel.SUPER_ADMIN
    if (employeeId !== requester.employeeId && !isManager) {
      throw new ForbiddenException({
        code: 'LEAVE_BALANCE_FORBIDDEN',
        message: '본인의 휴가 잔액만 조회할 수 있습니다.',
      })
    }

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

  // ── 회사 전체 잔여 휴가 일괄 조회 (N+1 제거용) ───────────────────────────────

  async findCompanyBalances(companyId: string, filter: CompanyBalanceFilterDto) {
    const { year, organizationId } = filter

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        ...(organizationId && {
          organizations: { some: { organizationId } },
        }),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        leaveBalances: {
          where: { ...(year && { year }) },
          include: {
            leaveType: {
              select: { id: true, name: true, displayName: true, code: true, groupId: true },
            },
          },
          orderBy: [{ year: 'desc' }, { leaveType: { name: 'asc' } }],
        },
      },
    })

    return employees.map((employee) => ({
      employee: { id: employee.id, name: employee.name },
      balances: employee.leaveBalances,
    }))
  }

  // ── HR-06-10 수동 발생 ───────────────────────────────────────────────────────

  async manualAccrual(companyId: string, dto: ManualAccrualDto, actorId?: string) {
    for (const employeeId of dto.employeeIds) {
      await this.assertEmployeeBelongsToCompany(companyId, employeeId)
    }
    await this.assertTypeBelongsToCompany(companyId, dto.leaveTypeId)

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const balances = await this.prisma.$transaction(async (tx: any) => {
      const results = []
      for (const employeeId of dto.employeeIds) {
        results.push(
          await this.upsertAccruedBalance(tx, {
            employeeId,
            leaveTypeId: dto.leaveTypeId,
            year: dto.year,
            days: dto.days,
            expiresAt,
          }),
        )
      }
      return results
    })

    for (const employeeId of dto.employeeIds) {
      this.events.emit(EVENTS.LEAVE_ACCRUED, {
        employeeId,
        leaveTypeId: dto.leaveTypeId,
        year: dto.year,
        days: dto.days,
        companyId,
      })
    }

    // 감사 로그 (수동 휴가 부여)
    try {
      await this.audit.record({
        companyId,
        actorId,
        action: 'LEAVE_GRANT',
        targetType: 'LEAVE_BALANCE',
        targetLabel: `${dto.employeeIds.length}명 / ${dto.days}일`,
        result: 'SUCCESS',
        detail: {
          employeeIds: dto.employeeIds,
          leaveTypeId: dto.leaveTypeId,
          year: dto.year,
          days: dto.days,
        },
      })
    } catch {
      // 감사 로그 실패가 본 동작을 막지 않도록 무시
    }

    return balances
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
          leaveType: { select: { id: true, name: true, displayName: true, timeOption: true } },
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

    const balance = await this.upsertAccruedBalance(this.prisma, {
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      year: dto.year,
      days: dto.days,
      expiresAt,
    })

    this.events.emit(EVENTS.LEAVE_COMPENSATION_ACCRUED, {
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      year: dto.year,
      days: dto.days,
      reason: dto.reason,
      companyId,
    })

    return balance
  }

  // ── 관리자 휴가 직접 추가 (잔액 검증 → Leave 생성 + 잔액 차감) ───────────────

  async createLeave(companyId: string, dto: CreateLeaveDto) {
    await this.assertEmployeeBelongsToCompany(companyId, dto.employeeId)
    const leaveType = await this.assertTypeBelongsToCompany(companyId, dto.leaveTypeId)

    const daysUsed = this.calcLeaveDaysUsed(
      dto.startDate,
      dto.endDate,
      Number(leaveType.deductionDays),
    )
    const startDate = new Date(dto.startDate)
    const year = startDate.getFullYear()

    await this.validateBalance({
      employeeId: dto.employeeId,
      leaveTypeId: dto.leaveTypeId,
      daysUsed,
      startDate,
      year,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this.prisma.$transaction(async (tx: any) => {
      const leave = await tx.leave.create({
        data: {
          employeeId: dto.employeeId,
          leaveTypeId: dto.leaveTypeId,
          startDate,
          endDate: new Date(dto.endDate),
          daysUsed,
          status: 'APPROVED',
          reason: dto.reason ?? null,
        },
      })

      await tx.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: dto.employeeId,
            leaveTypeId: dto.leaveTypeId,
            year,
          },
        },
        data: {
          usedDays: { increment: daysUsed },
          remainingDays: { decrement: daysUsed },
        },
      })

      return leave
    })
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

  /** 잔액 발생 공통 로직 (manualAccrual / createCompensationLeave 공용) */
  private async upsertAccruedBalance(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    params: {
      employeeId: string
      leaveTypeId: string
      year: number
      days: number
      expiresAt: Date | null
    },
  ) {
    const { employeeId, leaveTypeId, year, days, expiresAt } = params

    return tx.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year },
      },
      create: {
        employeeId,
        leaveTypeId,
        year,
        accruedDays: days,
        usedDays: 0,
        remainingDays: days,
        expiresAt,
      },
      update: {
        accruedDays: { increment: days },
        remainingDays: { increment: days },
        ...(expiresAt && { expiresAt }),
      },
    })
  }

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

  private async assertAccrualRuleBelongsToCompany(companyId: string, ruleId: string) {
    const rule = await this.prisma.leaveAccrualRule.findFirst({
      where: { id: ruleId, companyId },
    })
    if (!rule) {
      throw new NotFoundException({
        code: 'ACCRUAL_RULE_NOT_FOUND',
        message: '발생 규칙을 찾을 수 없습니다.',
      })
    }
    return rule
  }

  /** 휴가 차감 일수 계산: 기간 일수(양 끝 포함) × 유형별 차감 단위 */
  private calcLeaveDaysUsed(startDate: string, endDate: string, deductionDays: number): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`)
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00.000Z`)
    const calendarDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1)
    return calendarDays * (deductionDays > 0 ? deductionDays : 1)
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

}
