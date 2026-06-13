import { Test, TestingModule } from '@nestjs/testing'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── PrismaService mock factory ────────────────────────────────────────────────

const makePrismaMock = () => ({
  attendance: {
    findMany: jest.fn(),
  },
  leave: {
    findMany: jest.fn(),
  },
  shift: {
    findMany: jest.fn(),
  },
  wageInfo: {
    findMany: jest.fn(),
  },
  standardizationRule: {
    findFirst: jest.fn(),
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

    // getRealtimeReport이 항상 조회하는 부가 데이터의 기본값
    prisma.shift.findMany.mockResolvedValue([])
    prisma.wageInfo.findMany.mockResolvedValue([])
    prisma.standardizationRule.findFirst.mockResolvedValue(null)
  })

  afterEach(() => jest.clearAllMocks())

  // ── getRealtimeReport ──────────────────────────────────────────────────────

  describe('getRealtimeReport', () => {
    const clockIn9am  = new Date('2026-01-15T09:00:00')
    const clockOut17  = new Date('2026-01-15T17:00:00')  // 480분, overtime=0
    const clockOut18  = new Date('2026-01-15T18:30:00')  // 570분, overtime=90

    it('집계된 직원별 근태 데이터를 반환한다', async () => {
      // Arrange — 실제 Prisma 리턴 형식 (clockInAt/clockOutAt/status)
      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-001', status: 'normal',  clockInAt: clockIn9am, clockOutAt: clockOut18, employee: { name: '홍길동' } },
        { employeeId: 'emp-001', status: 'late',    clockInAt: clockIn9am, clockOutAt: clockOut17, employee: { name: '홍길동' } },
        { employeeId: 'emp-002', status: 'absent',  clockInAt: clockIn9am, clockOutAt: null,       employee: { name: '김철수' } },
      ])
      prisma.leave.findMany.mockResolvedValue([
        { employeeId: 'emp-001', daysUsed: 1, employee: { name: '홍길동' } },
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
      expect(emp001!.totalWorkDays).toBe(2)       // normal + late 모두 workDay로 카운트
      expect(emp001!.normalCount).toBe(1)          // status='normal' 1건
      expect(emp001!.lateCount).toBe(1)            // status='late' 1건
      expect(emp001!.earlyLeaveCount).toBe(0)
      expect(emp001!.absentCount).toBe(0)
      expect(emp001!.totalWorkMinutes).toBe(570 + 480)  // 18:30-9:00=570, 17:00-9:00=480
      expect(emp001!.overtimeMinutes).toBe(90 + 0)      // 570-480=90, 480-480=0
      expect(emp001!.usedLeaveDays).toBe(1)

      const emp002 = result.find((r) => r.employeeId === 'emp-002')
      expect(emp002!.absentCount).toBe(1)
      expect(emp002!.totalWorkDays).toBe(1)        // absent도 workDay 카운트 (NO_SCHEDULE만 제외)
      expect(emp002!.usedLeaveDays).toBe(0)
    })

    it('무일정 근무(isOncall=true)는 noScheduleCount로 집계되고 totalWorkDays에 포함되지 않는다', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-003', status: 'oncall', isOncall: true, clockInAt: clockIn9am, clockOutAt: clockOut17, employee: { name: '이영희' } },
      ])
      prisma.leave.findMany.mockResolvedValue([])

      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      const emp003 = result.find((r) => r.employeeId === 'emp-003')
      expect(emp003!.totalWorkDays).toBe(0)
      expect(emp003!.noScheduleCount).toBe(1)
    })

    it('종료된 휴게(AttendanceBreak)는 totalWorkMinutes에서 차감된다', async () => {
      // Arrange — 09:00~18:30 근무(570분), 휴게 12:00~13:00(60분 종료) + 미종료 휴게 1건
      prisma.attendance.findMany.mockResolvedValue([
        {
          employeeId: 'emp-001',
          status: 'normal',
          isOncall: false,
          clockInAt: clockIn9am,
          clockOutAt: clockOut18,
          breaks: [
            { startAt: new Date('2026-01-15T12:00:00'), endAt: new Date('2026-01-15T13:00:00'), isManual: false },
            { startAt: new Date('2026-01-15T15:00:00'), endAt: null, isManual: true }, // 미종료 → 차감 제외
          ],
          employee: { name: '홍길동' },
        },
      ])
      prisma.leave.findMany.mockResolvedValue([])

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert — 570 - 60 = 510분, 연장 = 510 - 480 = 30분
      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001!.totalWorkMinutes).toBe(510)
      expect(emp001!.overtimeMinutes).toBe(30)
    })

    it('기간 내 종료된 shift 중 attendance가 없는 건은 결근으로 합산된다', async () => {
      // Arrange — emp-001: 일정 2건(1건 출근, 1건 미출근/종료), attendance 1건
      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-001', status: 'normal', isOncall: false, clockInAt: clockIn9am, clockOutAt: clockOut17, employee: { name: '홍길동' } },
      ])
      prisma.leave.findMany.mockResolvedValue([])
      prisma.shift.findMany.mockResolvedValue([
        {
          employeeId: 'emp-001',
          startAt: new Date('2026-01-15T09:00:00'),
          endAt: new Date('2026-01-15T18:00:00'),
          attendance: { id: 'att-001' },
          employee: { name: '홍길동' },
        },
        {
          employeeId: 'emp-001',
          startAt: new Date('2026-01-16T09:00:00'),
          endAt: new Date('2026-01-16T18:00:00'),
          attendance: null, // 종료됐지만 출근 기록 없음 → 결근
          employee: { name: '홍길동' },
        },
      ])

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert
      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001!.scheduledWorkDays).toBe(2)
      expect(emp001!.scheduledWorkMinutes).toBe(540 * 2) // 09:00~18:00 = 540분 × 2
      expect(emp001!.absentCount).toBe(1)               // 미출근 shift 1건
      expect(emp001!.totalWorkDays).toBe(1)
    })

    it('출근만 있고 퇴근이 없는 건은 missingClockOutCount로 집계된다', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-001', status: 'normal', isOncall: false, clockInAt: clockIn9am, clockOutAt: null, employee: { name: '홍길동' } },
        { employeeId: 'emp-002', status: 'absent', isOncall: false, clockInAt: clockIn9am, clockOutAt: null, employee: { name: '김철수' } },
      ])
      prisma.leave.findMany.mockResolvedValue([])

      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001!.missingClockOutCount).toBe(1)

      // 결근 건은 퇴근 누락으로 세지 않는다
      const emp002 = result.find((r) => r.employeeId === 'emp-002')
      expect(emp002!.missingClockOutCount).toBe(0)
    })

    it('유효 WageInfo의 주 계약시간 기준으로 연장근로를 계산한다', async () => {
      // Arrange — 주 35시간 / 5일 = 일 420분 소정근로
      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-001', status: 'normal', isOncall: false, clockInAt: clockIn9am, clockOutAt: clockOut17, employee: { name: '홍길동' } },
      ])
      prisma.leave.findMany.mockResolvedValue([])
      prisma.wageInfo.findMany.mockResolvedValue([
        {
          employeeId: 'emp-001',
          contractedWorkDays: 'mon,tue,wed,thu,fri',
          contractedHoursPerWeek: 35,
        },
      ])

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert — 480분 근무 - 420분 소정근로 = 60분 연장
      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001!.totalWorkMinutes).toBe(480)
      expect(emp001!.overtimeMinutes).toBe(60)
    })

    it('기본 표준화 규칙(shift_start)이 있으면 standardizedWorkMinutes를 일정 시작 기준으로 재계산한다', async () => {
      // Arrange — 일정 09:00 시작, 실제 출근 09:30 (30분 지각)
      prisma.attendance.findMany.mockResolvedValue([
        {
          employeeId: 'emp-001',
          status: 'late',
          isOncall: false,
          clockInAt: new Date('2026-01-15T09:30:00'),
          clockOutAt: clockOut18,
          shift: { startAt: clockIn9am, endAt: new Date('2026-01-15T18:00:00') },
          employee: { name: '홍길동' },
        },
        {
          // shift 미연결 기록 → 실제 시간 그대로
          employeeId: 'emp-002',
          status: 'normal',
          isOncall: false,
          clockInAt: clockIn9am,
          clockOutAt: clockOut17,
          shift: null,
          employee: { name: '김철수' },
        },
      ])
      prisma.leave.findMany.mockResolvedValue([])
      prisma.standardizationRule.findFirst.mockResolvedValue({
        startTimeRule: 'shift_start',
        endTimeRule: 'clock_out',
        includeManualBreak: true,
      })

      // Act
      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      // Assert
      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001!.totalWorkMinutes).toBe(540)          // 09:30~18:30 실제
      expect(emp001!.standardizedWorkMinutes).toBe(570)   // 09:00(일정)~18:30 표준화

      const emp002 = result.find((r) => r.employeeId === 'emp-002')
      expect(emp002!.standardizedWorkMinutes).toBe(emp002!.totalWorkMinutes)
    })

    it('표준화 규칙이 없으면 standardizedWorkMinutes는 totalWorkMinutes와 동일하다', async () => {
      prisma.attendance.findMany.mockResolvedValue([
        { employeeId: 'emp-001', status: 'normal', isOncall: false, clockInAt: clockIn9am, clockOutAt: clockOut18, employee: { name: '홍길동' } },
      ])
      prisma.leave.findMany.mockResolvedValue([])

      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

      const emp001 = result.find((r) => r.employeeId === 'emp-001')
      expect(emp001!.standardizedWorkMinutes).toBe(emp001!.totalWorkMinutes)
    })

    it('데이터가 없을 때 빈 배열을 반환한다', async () => {
      prisma.attendance.findMany.mockResolvedValue([])
      prisma.leave.findMany.mockResolvedValue([])

      const result = await service.getRealtimeReport(COMPANY_ID, {
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      })

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
