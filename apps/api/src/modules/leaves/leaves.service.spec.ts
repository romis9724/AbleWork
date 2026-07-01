import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { AccessLevel } from '@ablework/shared-constants'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { LeavesService } from './leaves.service'
import { LeaveAccrualService } from './leave-accrual.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const EMPLOYEE_ID = 'employee-1'
const GROUP_ID = 'group-1'
const TYPE_ID = 'type-1'
const YEAR = 2024

const baseGroup = {
  id: GROUP_ID,
  companyId: COMPANY_ID,
  name: '연차',
  code: 'ANNUAL',
  overageLimitDays: 0,
  isActive: true,
}

const baseType = {
  id: TYPE_ID,
  groupId: GROUP_ID,
  name: '연차 휴가',
  displayName: null,
  code: 'ANNUAL_LEAVE',
  timeOption: 'full_day',
  deductionDays: Number(1),
  isActive: true,
}

const baseBalance = {
  id: 'balance-1',
  employeeId: EMPLOYEE_ID,
  leaveTypeId: TYPE_ID,
  year: YEAR,
  accruedDays: Number(15),
  usedDays: Number(3),
  remainingDays: Number(12),
  expiresAt: new Date('2024-12-31'),
  createdAt: new Date(),
  updatedAt: new Date(),
  leaveType: { groupId: GROUP_ID },
}

const baseEmployee = {
  id: EMPLOYEE_ID,
  companyId: COMPANY_ID,
  name: '홍길동',
  isActive: true,
  joinedAt: new Date('2022-01-01'),
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────

const mockPrisma = {
  leaveGroup: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveType: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveAccrualRule: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveAccrualRuleItem: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  leaveBalance: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  leave: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  employee: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockEvents = { emit: jest.fn() }

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('LeavesService', () => {
  let service: LeavesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeavesService,
        LeaveAccrualService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile()

    service = module.get<LeavesService>(LeavesService)
    jest.clearAllMocks()
  })

  // ── findGroups ───────────────────────────────────────────────────────────────

  describe('findGroups', () => {
    it('회사에 속한 휴가 그룹 목록을 반환한다', async () => {
      mockPrisma.leaveGroup.findMany.mockResolvedValue([baseGroup])

      const result = await service.findGroups(COMPANY_ID)

      expect(result).toEqual([baseGroup])
      expect(mockPrisma.leaveGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
    })
  })

  // ── createGroup ──────────────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('휴가 그룹을 생성한다', async () => {
      mockPrisma.leaveGroup.create.mockResolvedValue(baseGroup)

      const dto = { name: '연차', code: 'ANNUAL', overageLimitDays: 0, isActive: true }
      const result = await service.createGroup(COMPANY_ID, dto)

      expect(result).toEqual(baseGroup)
      expect(mockPrisma.leaveGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_ID, name: '연차' }),
        }),
      )
    })
  })

  // ── createType ───────────────────────────────────────────────────────────────

  describe('createType', () => {
    it('존재하는 그룹에 휴가 유형을 생성한다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(baseGroup)
      mockPrisma.leaveType.create.mockResolvedValue(baseType)

      const dto = {
        groupId: GROUP_ID,
        name: '연차 휴가',
        timeOption: 'full_day' as const,
        deductionDays: 1,
        includeHolidaysInConsecutive: false,
        allowArbitraryTime: false,
        reasonDisplay: false,
        deleteEnclosedShifts: false,
        isActive: true,
      }

      const result = await service.createType(COMPANY_ID, dto)
      expect(result).toEqual(baseType)
    })

    it('존재하지 않는 그룹이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(null)

      const dto = {
        groupId: 'nonexistent-group',
        name: '연차 휴가',
        timeOption: 'full_day' as const,
        deductionDays: 1,
        includeHolidaysInConsecutive: false,
        allowArbitraryTime: false,
        reasonDisplay: false,
        deleteEnclosedShifts: false,
        isActive: true,
      }

      await expect(service.createType(COMPANY_ID, dto)).rejects.toThrow(NotFoundException)
    })
  })

  // ── updateGroup / deleteGroup ────────────────────────────────────────────────

  describe('updateGroup', () => {
    it('회사에 속한 그룹을 수정한다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(baseGroup)
      mockPrisma.leaveGroup.update.mockResolvedValue({ ...baseGroup, name: '연차(수정)' })

      const result = await service.updateGroup(COMPANY_ID, GROUP_ID, { name: '연차(수정)' })

      expect(result.name).toBe('연차(수정)')
      expect(mockPrisma.leaveGroup.update).toHaveBeenCalledWith({
        where: { id: GROUP_ID },
        data: { name: '연차(수정)' },
      })
    })

    it('타 회사 그룹이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(null)

      await expect(
        service.updateGroup(COMPANY_ID, 'other-group', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteGroup', () => {
    it('사용 중이 아니면 소프트 삭제 — 자식 유형까지 cascade로 isActive를 false로 변경한다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(baseGroup)
      mockPrisma.leaveBalance.count.mockResolvedValue(0) // 자식 유형에 잔여 휴가 없음
      mockPrisma.leaveType.updateMany.mockResolvedValue({ count: 2 })
      mockPrisma.leaveGroup.update.mockResolvedValue({ ...baseGroup, isActive: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))

      const result = await service.deleteGroup(COMPANY_ID, GROUP_ID)

      expect(result.isActive).toBe(false)
      // cascade: 그룹 내 자식 유형 일괄 soft-delete
      expect(mockPrisma.leaveType.updateMany).toHaveBeenCalledWith({
        where: { groupId: GROUP_ID },
        data: { isActive: false },
      })
      // 그룹 본체 soft-delete
      expect(mockPrisma.leaveGroup.update).toHaveBeenCalledWith({
        where: { id: GROUP_ID },
        data: { isActive: false },
      })
      // 사용 중 검사는 그룹 관계 기준으로 수행
      expect(mockPrisma.leaveBalance.count).toHaveBeenCalledWith({
        where: { leaveType: { groupId: GROUP_ID }, remainingDays: { gt: 0 } },
      })
    })

    it('자식 유형에 잔여 휴가가 남은 직원이 있으면 ForbiddenException(LEAVE_GROUP_IN_USE)을 던지고 삭제하지 않는다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(baseGroup)
      mockPrisma.leaveBalance.count.mockResolvedValue(1) // 잔여 휴가 남은 직원 존재

      await expect(service.deleteGroup(COMPANY_ID, GROUP_ID)).rejects.toThrow(ForbiddenException)
      await expect(service.deleteGroup(COMPANY_ID, GROUP_ID)).rejects.toMatchObject({
        response: { code: 'LEAVE_GROUP_IN_USE' },
      })
      expect(mockPrisma.leaveType.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.leaveGroup.update).not.toHaveBeenCalled()
    })

    it('타 회사 그룹이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveGroup.findFirst.mockResolvedValue(null)

      await expect(service.deleteGroup(COMPANY_ID, 'other-group')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── deleteType ───────────────────────────────────────────────────────────────

  describe('deleteType', () => {
    it('사용 중이 아니면 소프트 삭제 — isActive를 false로 변경한다', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.count.mockResolvedValue(0) // 잔여 휴가 없음
      mockPrisma.leaveType.update.mockResolvedValue({ ...baseType, isActive: false })

      const result = await service.deleteType(COMPANY_ID, TYPE_ID)

      expect(result.isActive).toBe(false)
      expect(mockPrisma.leaveBalance.count).toHaveBeenCalledWith({
        where: { leaveTypeId: TYPE_ID, remainingDays: { gt: 0 } },
      })
      expect(mockPrisma.leaveType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: { isActive: false },
      })
    })

    it('잔여 휴가가 남은 직원이 있으면 ForbiddenException(LEAVE_TYPE_IN_USE)을 던지고 삭제하지 않는다', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.count.mockResolvedValue(2) // 잔여 휴가 남은 직원 2명

      await expect(service.deleteType(COMPANY_ID, TYPE_ID)).rejects.toThrow(ForbiddenException)
      await expect(service.deleteType(COMPANY_ID, TYPE_ID)).rejects.toMatchObject({
        response: { code: 'LEAVE_TYPE_IN_USE' },
      })
      expect(mockPrisma.leaveType.update).not.toHaveBeenCalled()
    })

    it('타 회사 유형이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValue(null)

      await expect(service.deleteType(COMPANY_ID, 'other-type')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── updateAccrualRule / deleteAccrualRule ────────────────────────────────────

  describe('updateAccrualRule', () => {
    const baseRule = {
      id: 'rule-1',
      companyId: COMPANY_ID,
      leaveGroupId: GROUP_ID,
      name: '연차 발생',
      isActive: true,
    }

    it('items 제공 시 전체 교체 후 규칙을 수정한다', async () => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.leaveAccrualRule.update.mockResolvedValue({ ...baseRule, name: '수정됨' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))

      const items = [
        { accrualBasis: 'yearly' as const, tenureYears: 1, accrualDays: 15, sortOrder: 0 },
      ]
      const result = await service.updateAccrualRule(COMPANY_ID, 'rule-1', {
        name: '수정됨',
        items,
      })

      expect(mockPrisma.leaveAccrualRuleItem.deleteMany).toHaveBeenCalledWith({
        where: { ruleId: 'rule-1' },
      })
      expect(mockPrisma.leaveAccrualRuleItem.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ ruleId: 'rule-1', accrualDays: 15 })],
      })
      expect(result.name).toBe('수정됨')
    })

    it('items 미제공 시 규칙 필드만 수정한다', async () => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.leaveAccrualRule.update.mockResolvedValue({ ...baseRule, isActive: false })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))

      await service.updateAccrualRule(COMPANY_ID, 'rule-1', { isActive: false })

      expect(mockPrisma.leaveAccrualRuleItem.deleteMany).not.toHaveBeenCalled()
    })

    it('존재하지 않는 규칙이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue(null)

      await expect(
        service.updateAccrualRule(COMPANY_ID, 'nonexistent', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  describe('deleteAccrualRule', () => {
    it('규칙을 하드 삭제한다', async () => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue({
        id: 'rule-1',
        companyId: COMPANY_ID,
      })
      mockPrisma.leaveAccrualRule.delete.mockResolvedValue({ id: 'rule-1' })

      await service.deleteAccrualRule(COMPANY_ID, 'rule-1')

      expect(mockPrisma.leaveAccrualRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      })
    })

    it('존재하지 않는 규칙이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue(null)

      await expect(service.deleteAccrualRule(COMPANY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── createLeave (관리자 직접 추가) ───────────────────────────────────────────

  describe('createLeave', () => {
    const dto = {
      employeeId: EMPLOYEE_ID,
      leaveTypeId: TYPE_ID,
      startDate: '2024-06-03',
      endDate: '2024-06-05',
      daysUsed: 1,
    }

    it('잔액 검증 후 Leave 생성 + 잔액을 차감한다 (daysUsed = 기간일수 × deductionDays)', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.findUnique.mockResolvedValue(baseBalance)
      mockPrisma.leave.create.mockResolvedValue({ id: 'leave-1', daysUsed: 3 })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))

      const result = await service.createLeave(COMPANY_ID, dto)

      // 6/3~6/5 = 3일 × deductionDays(1) = 3
      expect(mockPrisma.leave.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            employeeId: EMPLOYEE_ID,
            daysUsed: 3,
            status: 'APPROVED',
          }),
        }),
      )
      expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            usedDays: { increment: 3 },
            remainingDays: { decrement: 3 },
          },
        }),
      )
      expect(result).toEqual({ id: 'leave-1', daysUsed: 3 })
    })

    it('잔액이 부족하면 BadRequestException을 던지고 Leave를 생성하지 않는다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({
        ...baseBalance,
        remainingDays: Number(1),
      })

      await expect(service.createLeave(COMPANY_ID, dto)).rejects.toThrow(BadRequestException)
      expect(mockPrisma.leave.create).not.toHaveBeenCalled()
    })

    it('타 회사 직원이면 NotFoundException을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.createLeave(COMPANY_ID, dto)).rejects.toThrow(NotFoundException)
    })
  })

  // ── getBalance ───────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    // 관리자 권한 요청자 — 타인 잔액 조회 허용 경로 검증용
    const adminRequester = {
      sub: 'user-admin',
      employeeId: 'admin-1',
      companyId: COMPANY_ID,
      accessLevel: AccessLevel.GENERAL_ADMIN,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    it('직원의 휴가 잔액 목록을 반환한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveBalance.findMany.mockResolvedValue([baseBalance])

      const result = await service.getBalance(COMPANY_ID, EMPLOYEE_ID, adminRequester)

      expect(result).toEqual([baseBalance])
      expect(mockPrisma.leaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: EMPLOYEE_ID } }),
      )
    })

    it('존재하지 않는 직원이면 NotFoundException을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(
        service.getBalance(COMPANY_ID, 'nonexistent', adminRequester),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── findCompanyBalances (일괄 조회) ─────────────────────────────────────────

  describe('findCompanyBalances', () => {
    it('직원별로 그룹화된 잔액 목록을 반환한다', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: EMPLOYEE_ID, name: '홍길동', leaveBalances: [baseBalance] },
        { id: 'employee-2', name: '김철수', leaveBalances: [] },
      ])

      const result = await service.findCompanyBalances(COMPANY_ID, {})

      expect(result).toEqual([
        { employee: { id: EMPLOYEE_ID, name: '홍길동' }, balances: [baseBalance] },
        { employee: { id: 'employee-2', name: '김철수' }, balances: [] },
      ])
      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      )
    })

    it('연도 필터가 잔액 조회 조건에 적용된다', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([])

      await service.findCompanyBalances(COMPANY_ID, { year: YEAR })

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            leaveBalances: expect.objectContaining({ where: { year: YEAR } }),
          }),
        }),
      )
    })

    it('조직 필터가 직원 조회 조건에 적용된다', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([])

      await service.findCompanyBalances(COMPANY_ID, { organizationId: 'org-1' })

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: COMPANY_ID,
            isActive: true,
            organizations: { some: { organizationId: 'org-1' } },
          },
        }),
      )
    })
  })

  // ── validateBalance ──────────────────────────────────────────────────────────

  describe('validateBalance', () => {
    it('잔액이 충분하면 통과한다', async () => {
      mockPrisma.leaveBalance.findUnique.mockResolvedValue(baseBalance)

      await expect(
        service.validateBalance({
          employeeId: EMPLOYEE_ID,
          leaveTypeId: TYPE_ID,
          daysUsed: 3,
          startDate: new Date('2024-06-01'),
          year: YEAR,
        }),
      ).resolves.toBeUndefined()
    })

    it('잔액이 없으면 LEAVE_BALANCE_NOT_FOUND를 던진다', async () => {
      mockPrisma.leaveBalance.findUnique.mockResolvedValue(null)

      await expect(
        service.validateBalance({
          employeeId: EMPLOYEE_ID,
          leaveTypeId: TYPE_ID,
          daysUsed: 1,
          startDate: new Date('2024-06-01'),
          year: YEAR,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('잔액이 부족하면 LEAVE_BALANCE_INSUFFICIENT를 던진다', async () => {
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({
        ...baseBalance,
        remainingDays: Number(2),
      })

      await expect(
        service.validateBalance({
          employeeId: EMPLOYEE_ID,
          leaveTypeId: TYPE_ID,
          daysUsed: 5,
          startDate: new Date('2024-06-01'),
          year: YEAR,
        }),
      ).rejects.toThrow(BadRequestException)
    })

    it('휴가 유효기간이 만료되면 LEAVE_BALANCE_EXPIRED를 던진다', async () => {
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({
        ...baseBalance,
        expiresAt: new Date('2024-01-31'),
        remainingDays: Number(10),
      })

      await expect(
        service.validateBalance({
          employeeId: EMPLOYEE_ID,
          leaveTypeId: TYPE_ID,
          daysUsed: 1,
          startDate: new Date('2024-06-01'),
          year: YEAR,
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── manualAccrual ────────────────────────────────────────────────────────────

  describe('manualAccrual', () => {
    it('수동으로 휴가를 발생시키고 이벤트를 emit한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.upsert.mockResolvedValue({
        ...baseBalance,
        accruedDays: Number(20),
        remainingDays: Number(17),
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))

      const dto = {
        employeeIds: [EMPLOYEE_ID],
        leaveTypeId: TYPE_ID,
        year: YEAR,
        days: 5,
      }

      const result = await service.manualAccrual(COMPANY_ID, dto)

      expect(mockPrisma.leaveBalance.upsert).toHaveBeenCalled()
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.accrued',
        expect.objectContaining({ employeeId: EMPLOYEE_ID, days: 5 }),
      )
      expect(result).toHaveLength(1)
    })

    it('여러 직원에게 동시에 휴가를 발생시킨다', async () => {
      const SECOND_EMPLOYEE_ID = 'employee-2'
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.upsert.mockResolvedValue(baseBalance)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))

      const result = await service.manualAccrual(COMPANY_ID, {
        employeeIds: [EMPLOYEE_ID, SECOND_EMPLOYEE_ID],
        leaveTypeId: TYPE_ID,
        year: YEAR,
        days: 3,
      })

      expect(mockPrisma.leaveBalance.upsert).toHaveBeenCalledTimes(2)
      expect(mockEvents.emit).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
    })

    it('존재하지 않는 직원이면 NotFoundException을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(
        service.manualAccrual(COMPANY_ID, {
          employeeIds: ['nonexistent'],
          leaveTypeId: TYPE_ID,
          year: YEAR,
          days: 5,
        }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── createCompensationLeave ──────────────────────────────────────────────────

  describe('createCompensationLeave', () => {
    it('보상휴가를 발생시키고 이벤트를 emit한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveType.findFirst.mockResolvedValue(baseType)
      mockPrisma.leaveBalance.upsert.mockResolvedValue({
        ...baseBalance,
        accruedDays: Number(8),
        remainingDays: Number(8),
      })

      const dto = {
        employeeId: EMPLOYEE_ID,
        leaveTypeId: TYPE_ID,
        year: YEAR,
        days: 8,
        reason: '주말 초과근무',
      }

      await service.createCompensationLeave(COMPANY_ID, dto)

      expect(mockPrisma.leaveBalance.upsert).toHaveBeenCalled()
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.compensation.accrued',
        expect.objectContaining({ employeeId: EMPLOYEE_ID, days: 8 }),
      )
    })
  })

  // ── findLeaves ───────────────────────────────────────────────────────────────

  describe('findLeaves', () => {
    it('페이징된 휴가 일정 목록을 반환한다', async () => {
      const leaves = [
        {
          id: 'leave-1',
          employeeId: EMPLOYEE_ID,
          leaveTypeId: TYPE_ID,
          startDate: new Date('2024-06-01'),
          endDate: new Date('2024-06-02'),
          daysUsed: Number(2),
          status: 'APPROVED',
        },
      ]
      mockPrisma.leave.findMany.mockResolvedValue(leaves)
      mockPrisma.leave.count.mockResolvedValue(1)

      const filter = { page: 1, limit: 20 }
      const result = await service.findLeaves(COMPANY_ID, filter)

      expect(result.items).toEqual(leaves)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
    })

    it('직원 필터가 적용된다', async () => {
      mockPrisma.leave.findMany.mockResolvedValue([])
      mockPrisma.leave.count.mockResolvedValue(0)

      await service.findLeaves(COMPANY_ID, { employeeId: EMPLOYEE_ID, page: 1, limit: 20 })

      expect(mockPrisma.leave.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: EMPLOYEE_ID }),
        }),
      )
    })
  })

  // ── runAccrualRule (자동 발생 규칙 실행) ─────────────────────────────────────

  describe('runAccrualRule', () => {
    const RULE_ID = 'rule-1'

    const makeRule = (overrides: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items?: any[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      leaveTypes?: any[]
    }) => ({
      id: RULE_ID,
      companyId: COMPANY_ID,
      leaveGroupId: GROUP_ID,
      name: '연차 발생',
      isActive: true,
      items: overrides.items ?? [
        {
          accrualBasis: 'yearly',
          tenureYears: 1,
          tenureMonths: null,
          accrualDays: 15,
          validMonths: 12,
          periodStartMd: null,
          periodEndMd: null,
          sortOrder: 0,
        },
        {
          accrualBasis: 'yearly',
          tenureYears: 3,
          tenureMonths: null,
          accrualDays: 16,
          validMonths: 12,
          periodStartMd: null,
          periodEndMd: null,
          sortOrder: 1,
        },
      ],
      leaveGroup: {
        ...baseGroup,
        leaveTypes: overrides.leaveTypes ?? [
          { id: TYPE_ID, deductionDays: 1, timeOption: 'full_day' },
        ],
      },
    })

    const setupRun = (rule: ReturnType<typeof makeRule>, joinedAt: Date) => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue(rule)
      mockPrisma.employee.findMany.mockResolvedValue([
        { id: EMPLOYEE_ID, joinedAt },
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma))
      mockPrisma.leaveBalance.findUnique.mockResolvedValue(null)
    }

    it('충족하는 구간 중 가장 높은 구간을 선택한다 (근속 4년 → 3년 구간 16일)', async () => {
      // 2020-01-01 입사, 2024년 기준 근속 약 4년 → 1년/3년 구간 모두 충족 → 16일이어야 함
      setupRun(makeRule({}), new Date('2020-01-01'))

      const result = await service.runAccrualRule(COMPANY_ID, RULE_ID, { year: 2024 })

      expect(result).toEqual({ processed: 1 })
      expect(mockPrisma.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accruedDays: 16,
            remainingDays: 16,
          }),
        }),
      )
    })

    it('그룹 내 여러 유형이 있어도 대표 유형 1개에만 발생한다', async () => {
      setupRun(
        makeRule({
          leaveTypes: [
            { id: 'type-half', deductionDays: 0.5, timeOption: 'half_day' },
            { id: TYPE_ID, deductionDays: 1, timeOption: 'full_day' },
            { id: 'type-extra', deductionDays: 1, timeOption: 'full_day' },
          ],
        }),
        new Date('2020-01-01'),
      )

      await service.runAccrualRule(COMPANY_ID, RULE_ID, { year: 2024 })

      // 대표 유형(deductionDays=1, full_day 중 첫 번째)에만 1회 발생
      expect(mockPrisma.leaveBalance.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leaveTypeId: TYPE_ID }),
        }),
      )
    })

    it('멱등성 — 같은 연도에 2회 실행해도 잔액이 중복 증가하지 않는다', async () => {
      setupRun(makeRule({}), new Date('2020-01-01'))

      // 1회차: 잔액 없음 → 생성
      const first = await service.runAccrualRule(COMPANY_ID, RULE_ID, { year: 2024 })
      expect(first).toEqual({ processed: 1 })
      expect(mockPrisma.leaveBalance.create).toHaveBeenCalledTimes(1)

      // 2회차: 이미 목표값(16)만큼 발생됨 → 스킵
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({
        ...baseBalance,
        accruedDays: 16,
        usedDays: 0,
        remainingDays: 16,
      })

      const second = await service.runAccrualRule(COMPANY_ID, RULE_ID, { year: 2024 })

      expect(second).toEqual({ processed: 0 })
      expect(mockPrisma.leaveBalance.create).toHaveBeenCalledTimes(1) // 추가 생성 없음
      expect(mockPrisma.leaveBalance.update).not.toHaveBeenCalled() // 증가 없음
    })

    it('월 기준 규칙 — 경과 개월 수만큼 누적 발생한다 (3/15 입사, 연말 기준 9개월 → 9일)', async () => {
      setupRun(
        makeRule({
          items: [
            {
              accrualBasis: 'monthly',
              tenureYears: null,
              tenureMonths: 1,
              accrualDays: 1,
              validMonths: 12,
              periodStartMd: null,
              periodEndMd: null,
              sortOrder: 0,
            },
          ],
        }),
        new Date('2024-03-15'),
      )

      const result = await service.runAccrualRule(COMPANY_ID, RULE_ID, { year: 2024 })

      expect(result).toEqual({ processed: 1 })
      expect(mockPrisma.leaveBalance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accruedDays: 9, remainingDays: 9 }),
        }),
      )
    })

    it('월 기준 규칙 — 이미 발생한 누적분이 있으면 증가분만 가산한다 (멱등 증분)', async () => {
      setupRun(
        makeRule({
          items: [
            {
              accrualBasis: 'monthly',
              tenureYears: null,
              tenureMonths: 1,
              accrualDays: 1,
              validMonths: 12,
              periodStartMd: null,
              periodEndMd: null,
              sortOrder: 0,
            },
          ],
        }),
        new Date('2024-03-15'),
      )
      // 직전 실행까지 8개월분(8일) 발생되어 있음 → 목표 9일과의 차액 1일만 가산
      mockPrisma.leaveBalance.findUnique.mockResolvedValue({
        ...baseBalance,
        accruedDays: 8,
        usedDays: 2,
        remainingDays: 6,
      })

      await service.runAccrualRule(COMPANY_ID, RULE_ID, { year: 2024 })

      expect(mockPrisma.leaveBalance.create).not.toHaveBeenCalled()
      expect(mockPrisma.leaveBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accruedDays: 9,
            remainingDays: { increment: 1 },
          }),
        }),
      )
    })

    it('존재하지 않는 규칙이면 NotFoundException을 던진다', async () => {
      mockPrisma.leaveAccrualRule.findFirst.mockResolvedValue(null)

      await expect(
        service.runAccrualRule(COMPANY_ID, 'nonexistent', { year: 2024 }),
      ).rejects.toThrow(NotFoundException)
    })
  })
})
