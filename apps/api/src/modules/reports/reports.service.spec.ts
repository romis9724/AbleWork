import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── PrismaService mock factory ────────────────────────────────────────────────

const makePrismaMock = () => ({
  attendance: {
    findMany: jest.fn(),
  },
  leaveRequest: {
    findMany: jest.fn(),
  },
  reportSnapshot: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  reportSnapshotRow: {
    createMany: jest.fn(),
  },
  customReportColumn: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
})

// ── helpers ───────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-uuid-001'
const SNAPSHOT_ID = 'snapshot-uuid-001'

// ── test suite ────────────────────────────────────────────────────────────────

describe('ReportsService', () => {
  let service: ReportsService
  let prisma: ReturnType<typeof makePrismaMock>

  beforeEach(async () => {
    prisma = makePrismaMock()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile()

    service = module.get<ReportsService>(ReportsService)
  })

  afterEach(() => jest.clearAllMocks())

  // ── getRealtimeReport ──────────────────────────────────────────────────────

  describe('getRealtimeReport', () => {
    it('집계된 직원별 근태 데이터를 반환한다', async () => {
      // Arrange
      prisma.attendance.findMany.mockResolvedValue([
        {
          employeeId: 'emp-001',
          status: 'NORMAL',
          workMinutes: 480,
          overtimeMinutes: 60,
          isLate: false,
          isEarlyLeave: false,
          employee: { name: '홍길동' },
        },
        {
          employeeId: 'emp-001',
          status: 'NORMAL',
          workMinutes: 480,
          overtimeMinutes: 0,
          isLate: true,
          isEarlyLeave: false,
          employee: { name: '홍길동' },
        },
        {
          employeeId: 'emp-002',
          status: 'ABSENT',
          workMinutes: 0,
          overtimeMinutes: 0,
          isLate: false,
          isEarlyLeave: false,
          employee: { name: '김철수' },
        },
      ])
      prisma.leaveRequest.findMany.mockResolvedValue([
        {
          employeeId: 'emp-001',
          leaveDays: 1,
          employee: { name: '홍길동' },
        },
      ])

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert
      expect(result).toHaveLength(2)

      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001).toBeDefined()
      expect(emp001!.employeeName).toBe('홍길동')
      expect(emp001!.totalWorkDays).toBe(2)
      expect(emp001!.normalCount).toBe(2)
      expect(emp001!.lateCount).toBe(1)
      expect(emp001!.earlyLeaveCount).toBe(0)
      expect(emp001!.absentCount).toBe(0)
      expect(emp001!.totalWorkMinutes).toBe(960)
      expect(emp001!.overtimeMinutes).toBe(60)
      expect(emp001!.usedLeaveDays).toBe(1)

      const emp002 = result.find((r) => r.employeeId === 'emp-002')
      expect(emp002).toBeDefined()
      expect(emp002!.absentCount).toBe(1)
      expect(emp002!.totalWorkDays).toBe(1)
      expect(emp002!.usedLeaveDays).toBe(0)
    })

    it('NO_SCHEDULE 상태는 totalWorkDays에 포함되지 않는다', async () => {
      // Arrange
      prisma.attendance.findMany.mockResolvedValue([
        {
          employeeId: 'emp-003',
          status: 'NO_SCHEDULE',
          workMinutes: 0,
          overtimeMinutes: 0,
          isLate: false,
          isEarlyLeave: false,
          employee: { name: '이영희' },
        },
      ])
      prisma.leaveRequest.findMany.mockResolvedValue([])

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert
      const emp003 = result.find((r) => r.employeeId === 'emp-003')
      expect(emp003!.totalWorkDays).toBe(0)
      expect(emp003!.noScheduleCount).toBe(1)
    })

    it('데이터가 없을 때 빈 배열을 반환한다', async () => {
      // Arrange
      prisma.attendance.findMany.mockResolvedValue([])
      prisma.leaveRequest.findMany.mockResolvedValue([])

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert
      expect(result).toEqual([])
    })
  })

  // ── lockSnapshot ──────────────────────────────────────────────────────────

  describe('lockSnapshot', () => {
    it('이미 잠금된 스냅샷에 ConflictException을 던진다', async () => {
      // Arrange
      prisma.reportSnapshot.findFirst.mockResolvedValue({
        id: SNAPSHOT_ID,
        companyId: COMPANY_ID,
        isLocked: true,
      })

      // Act & Assert
      await expect(
        service.lockSnapshot(COMPANY_ID, SNAPSHOT_ID),
      ).rejects.toThrow(ConflictException)

      await expect(
        service.lockSnapshot(COMPANY_ID, SNAPSHOT_ID),
      ).rejects.toMatchObject({
        response: { code: 'SNAPSHOT_LOCKED' },
      })
    })

    it('잠금되지 않은 스냅샷의 isLocked를 true로 업데이트한다', async () => {
      // Arrange
      prisma.reportSnapshot.findFirst.mockResolvedValue({
        id: SNAPSHOT_ID,
        companyId: COMPANY_ID,
        isLocked: false,
      })
      prisma.reportSnapshot.update.mockResolvedValue({
        id: SNAPSHOT_ID,
        companyId: COMPANY_ID,
        isLocked: true,
      })

      // Act
      const result = await service.lockSnapshot(COMPANY_ID, SNAPSHOT_ID)

      // Assert
      expect(prisma.reportSnapshot.update).toHaveBeenCalledWith({
        where: { id: SNAPSHOT_ID },
        data: { isLocked: true },
      })
      expect(result.isLocked).toBe(true)
    })

    it('존재하지 않는 스냅샷에 NotFoundException을 던진다', async () => {
      // Arrange
      prisma.reportSnapshot.findFirst.mockResolvedValue(null)

      // Act & Assert
      await expect(
        service.lockSnapshot(COMPANY_ID, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException)

      await expect(
        service.lockSnapshot(COMPANY_ID, 'non-existent-id'),
      ).rejects.toMatchObject({
        response: { code: 'SNAPSHOT_NOT_FOUND' },
      })
    })
  })
})
