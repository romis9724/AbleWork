import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { SchedulePatternsService } from './schedule-patterns.service'
import { PrismaService } from '../../prisma/prisma.service'
import { ShiftsService } from '../shifts/shifts.service'

// ── 픽스처 ───────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const PATTERN_ID = 'pattern-1'

const basePattern = {
  id: PATTERN_ID,
  companyId: COMPANY_ID,
  name: '주 5일 패턴',
  description: null,
  repeatCycleDays: 7,
  patternDefinition: {
    '0': 'tmpl-1',
    '1': 'tmpl-1',
    '2': 'tmpl-1',
    '3': 'tmpl-1',
    '4': 'tmpl-1',
  },
  holidayHandling: 'skip_and_keep',
  isActive: true,
  createdAt: new Date('2024-01-01'),
}

const baseTemplate = {
  id: 'tmpl-1',
  companyId: COMPANY_ID,
  shiftTypeId: 'shift-type-1',
  name: '오전 9시 ~ 오후 6시',
  code: 'DAY',
  startTime: new Date('1970-01-01T09:00:00.000Z'),
  endTime: new Date('1970-01-01T18:00:00.000Z'),
  isActive: true,
  createdAt: new Date(),
}

// ── 목 ──────────────────────────────────────────────────────────────────────

const mockPrisma = {
  schedulePattern: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  employee: {
    findMany: jest.fn(),
  },
  companyHoliday: {
    findMany: jest.fn(),
  },
  shiftTemplate: {
    findMany: jest.fn(),
  },
  shift: {
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

// 주52h 경고 일괄 수집은 ShiftsService에 위임 — 기본은 경고 없음([]) 으로 둔다.
const mockShiftsService = {
  collectWeeklyWarnings: jest.fn().mockResolvedValue([]),
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

describe('SchedulePatternsService', () => {
  let service: SchedulePatternsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulePatternsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShiftsService, useValue: mockShiftsService },
      ],
    }).compile()

    service = module.get<SchedulePatternsService>(SchedulePatternsService)
    jest.clearAllMocks()
  })

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('활성 패턴 목록을 반환한다', async () => {
      mockPrisma.schedulePattern.findMany.mockResolvedValue([basePattern])
      const result = await service.findAll(COMPANY_ID)
      expect(result).toHaveLength(1)
      expect(mockPrisma.schedulePattern.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('패턴을 생성하고 반환한다', async () => {
      const dto = {
        name: '신규 패턴',
        repeatCycleDays: 5,
        patternDefinition: { '0': 'tmpl-1', '1': 'tmpl-1' },
        holidayHandling: 'no_skip' as const,
      }
      mockPrisma.schedulePattern.create.mockResolvedValue({
        ...basePattern,
        ...dto,
        id: 'pattern-new',
      })

      const result = await service.create(COMPANY_ID, dto)
      expect(result.name).toBe('신규 패턴')
      expect(mockPrisma.schedulePattern.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_ID, repeatCycleDays: 5 }),
        }),
      )
    })
  })

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('패턴이 존재하면 수정한다', async () => {
      mockPrisma.schedulePattern.findFirst.mockResolvedValue(basePattern)
      mockPrisma.schedulePattern.update.mockResolvedValue({
        ...basePattern,
        name: '수정된 패턴',
      })

      const result = await service.update(COMPANY_ID, PATTERN_ID, { name: '수정된 패턴' })
      expect(result.name).toBe('수정된 패턴')
    })

    it('패턴이 없으면 NotFoundException(SCHEDULE_PATTERN_NOT_FOUND)을 던진다', async () => {
      mockPrisma.schedulePattern.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('isActive=false로 소프트 삭제한다', async () => {
      mockPrisma.schedulePattern.findFirst.mockResolvedValue(basePattern)
      mockPrisma.schedulePattern.update.mockResolvedValue({
        ...basePattern,
        isActive: false,
      })

      const result = await service.remove(COMPANY_ID, PATTERN_ID)
      expect(result.isActive).toBe(false)
      expect(mockPrisma.schedulePattern.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PATTERN_ID },
          data: { isActive: false },
        }),
      )
    })
  })

  // ── applyPattern ─────────────────────────────────────────────────────────

  describe('applyPattern', () => {
    const dto = {
      employeeIds: ['emp-1'],
      startDate: '2024-06-03', // 월요일
      endDate: '2024-06-07',   // 금요일
    }

    beforeEach(() => {
      mockPrisma.schedulePattern.findFirst.mockResolvedValue(basePattern)
      mockPrisma.employee.findMany.mockResolvedValue([
        {
          id: 'emp-1',
          organizations: [{ organizationId: 'org-1' }],
        },
      ])
      mockPrisma.companyHoliday.findMany.mockResolvedValue([])
      mockPrisma.shiftTemplate.findMany.mockResolvedValue([baseTemplate])
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      )
      mockPrisma.shift.createMany.mockResolvedValue({ count: 5 })
    })

    it('기간 내 Shift를 대량 생성하고 count를 반환한다', async () => {
      const result = await service.applyPattern(COMPANY_ID, PATTERN_ID, dto)
      expect(result.created).toBe(5)
      expect(mockPrisma.shift.createMany).toHaveBeenCalled()
    })

    it('유효하지 않은 직원이 포함되면 BadRequestException(INVALID_EMPLOYEES)을 던진다', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([]) // 빈 결과 = 직원 없음

      await expect(
        service.applyPattern(COMPANY_ID, PATTERN_ID, { ...dto, employeeIds: ['emp-invalid'] }),
      ).rejects.toThrow(BadRequestException)
    })

    it('패턴이 없으면 NotFoundException을 던진다', async () => {
      mockPrisma.schedulePattern.findFirst.mockResolvedValue(null)

      await expect(service.applyPattern(COMPANY_ID, 'nonexistent', dto)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('skip_and_keep: 공휴일 날짜는 Shift를 생성하지 않는다', async () => {
      // 2024-06-03 공휴일 설정
      mockPrisma.companyHoliday.findMany.mockResolvedValue([
        { holidayDate: new Date('2024-06-03') },
      ])
      mockPrisma.shift.createMany.mockResolvedValue({ count: 4 })

      const result = await service.applyPattern(COMPANY_ID, PATTERN_ID, dto)
      expect(result.created).toBe(4)
    })

    it('주52시간 초과 시 warnings를 함께 반환한다 (A-8)', async () => {
      mockShiftsService.collectWeeklyWarnings.mockResolvedValueOnce([
        'emp-1: 이번 주 예정 근무시간이 55시간으로 52시간을 초과합니다.',
      ])
      const result = await service.applyPattern(COMPANY_ID, PATTERN_ID, dto)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings?.[0]).toContain('52시간을 초과')
      // 생성된 근무 묶음으로 직원×주 경고를 조회했는지 확인
      expect(mockShiftsService.collectWeeklyWarnings).toHaveBeenCalled()
    })

    it('경고가 없으면 warnings를 반환하지 않는다 (A-8)', async () => {
      const result = await service.applyPattern(COMPANY_ID, PATTERN_ID, dto)
      expect(result.warnings).toBeUndefined()
    })
  })
})
