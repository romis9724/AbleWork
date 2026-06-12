import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { LeavesService } from './leaves.service'
import { PrismaService } from '../../prisma/prisma.service'

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
    findFirst: jest.fn(),
  },
  leaveType: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveAccrualRule: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveBalance: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
    create: jest.fn(),
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
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
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

  // ── getBalance ───────────────────────────────────────────────────────────────

  describe('getBalance', () => {
    it('직원의 휴가 잔액 목록을 반환한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.leaveBalance.findMany.mockResolvedValue([baseBalance])

      const result = await service.getBalance(COMPANY_ID, EMPLOYEE_ID)

      expect(result).toEqual([baseBalance])
      expect(mockPrisma.leaveBalance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: EMPLOYEE_ID } }),
      )
    })

    it('존재하지 않는 직원이면 NotFoundException을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.getBalance(COMPANY_ID, 'nonexistent')).rejects.toThrow(NotFoundException)
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
})
