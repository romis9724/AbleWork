import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { CompanyHolidaysService } from './company-holidays.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateCompanyHolidayDto } from './dto/create-company-holiday.dto'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const HOLIDAY_ID = 'holiday-1'

const baseHoliday = {
  id: HOLIDAY_ID,
  companyId: COMPANY_ID,
  name: '창립기념일',
  holidayDate: new Date('2026-05-01'),
  isAnnualRepeat: false,
  type: 'custom',
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제로 사용하는 companyHoliday 모델 메서드만 정의한다.

const mockPrisma = {
  companyHoliday: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('CompanyHolidaysService', () => {
  let service: CompanyHolidaysService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyHolidaysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<CompanyHolidaysService>(CompanyHolidaysService)
    jest.clearAllMocks()
  })

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('회사에 속한 휴일 목록을 holidayDate 오름차순으로 반환한다', async () => {
      mockPrisma.companyHoliday.findMany.mockResolvedValue([baseHoliday])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([baseHoliday])
      // 멀티테넌시: where에 companyId 필수
      expect(mockPrisma.companyHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
          orderBy: { holidayDate: 'asc' },
        }),
      )
    })

    it('휴일이 없으면 빈 배열을 반환한다', async () => {
      mockPrisma.companyHoliday.findMany.mockResolvedValue([])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([])
    })

    it('멀티테넌시 — 조회 시 호출자의 companyId만 사용한다', async () => {
      mockPrisma.companyHoliday.findMany.mockResolvedValue([])

      await service.findAll(OTHER_COMPANY_ID)

      expect(mockPrisma.companyHoliday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: OTHER_COMPANY_ID }),
        }),
      )
    })
  })

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const fullDto: CreateCompanyHolidayDto = {
      name: '창립기념일',
      holidayDate: '2026-05-01',
      isAnnualRepeat: true,
      type: 'anniversary',
    }

    it('모든 필드가 제공되면 휴일을 생성하고 반환한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue({
        ...baseHoliday,
        isAnnualRepeat: true,
        type: 'anniversary',
      })

      const result = await service.create(COMPANY_ID, fullDto)

      expect(result).toEqual(
        expect.objectContaining({ isAnnualRepeat: true, type: 'anniversary' }),
      )
      expect(mockPrisma.companyHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            name: '창립기념일',
            holidayDate: new Date('2026-05-01'),
            isAnnualRepeat: true,
            type: 'anniversary',
          }),
        }),
      )
    })

    it('멀티테넌시 — write 시 data에 호출자의 companyId를 저장한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue(baseHoliday)

      await service.create(COMPANY_ID, fullDto)

      expect(mockPrisma.companyHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      )
    })

    it('선택 필드를 생략하면 isAnnualRepeat=false, type=custom 기본값을 사용한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue(baseHoliday)

      const dto: CreateCompanyHolidayDto = {
        name: '근로자의 날',
        holidayDate: '2026-05-01',
      }
      await service.create(COMPANY_ID, dto)

      expect(mockPrisma.companyHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isAnnualRepeat: false,
            type: 'custom',
          }),
        }),
      )
    })

    it('isAnnualRepeat=true가 제공되면 그대로 보존한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue(baseHoliday)

      await service.create(COMPANY_ID, {
        name: '신정',
        holidayDate: '2026-01-01',
        isAnnualRepeat: true,
      })

      expect(mockPrisma.companyHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isAnnualRepeat: true }),
        }),
      )
    })

    it('isAnnualRepeat=false가 명시되면 false를 유지한다 (?? 연산자 회귀 방지)', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue(baseHoliday)

      await service.create(COMPANY_ID, {
        name: '임시휴일',
        holidayDate: '2026-08-15',
        isAnnualRepeat: false,
      })

      expect(mockPrisma.companyHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isAnnualRepeat: false }),
        }),
      )
    })

    it('YYYY-MM-DD 문자열을 Date 객체로 변환하여 중복 조회와 저장에 사용한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue(baseHoliday)

      await service.create(COMPANY_ID, {
        name: '근로자의 날',
        holidayDate: '2026-05-01',
      })

      const expectedDate = new Date('2026-05-01')
      // 중복 검사도 변환된 Date 기준으로 수행되어야 한다
      expect(mockPrisma.companyHoliday.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            holidayDate: expectedDate,
          }),
        }),
      )
      expect(mockPrisma.companyHoliday.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ holidayDate: expectedDate }),
        }),
      )
    })

    it('같은 회사에 같은 날짜 휴일이 이미 있으면 BadRequestException(COMPANY_HOLIDAY_ALREADY_EXISTS)을 던진다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(baseHoliday)

      await expect(service.create(COMPANY_ID, fullDto)).rejects.toThrow(
        BadRequestException,
      )
      // 중복이면 생성하지 않는다
      expect(mockPrisma.companyHoliday.create).not.toHaveBeenCalled()
    })

    it('중복 에러는 올바른 code/message를 포함한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(baseHoliday)

      await expect(service.create(COMPANY_ID, fullDto)).rejects.toMatchObject({
        response: {
          code: 'COMPANY_HOLIDAY_ALREADY_EXISTS',
          message: '해당 날짜에 이미 지정된 휴일이 있습니다.',
        },
      })
    })

    it('멀티테넌시 — 중복 검사는 호출자의 companyId로 격리되어, 타사의 같은 날짜는 중복으로 보지 않는다', async () => {
      // 타사 휴일은 findFirst(where companyId 격리)에서 조회되지 않음 → null 반환
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)
      mockPrisma.companyHoliday.create.mockResolvedValue({
        ...baseHoliday,
        companyId: OTHER_COMPANY_ID,
      })

      await service.create(OTHER_COMPANY_ID, fullDto)

      expect(mockPrisma.companyHoliday.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: OTHER_COMPANY_ID }),
        }),
      )
      expect(mockPrisma.companyHoliday.create).toHaveBeenCalled()
    })
  })

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('회사에 속한 휴일을 삭제하고 { deleted: true }를 반환한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(baseHoliday)
      mockPrisma.companyHoliday.deleteMany.mockResolvedValue({ count: 1 })

      const result = await service.remove(COMPANY_ID, HOLIDAY_ID)

      expect(result).toEqual({ deleted: true })
      // 존재 검증도 companyId로 격리
      expect(mockPrisma.companyHoliday.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: HOLIDAY_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('멀티테넌시(CRITICAL) — 삭제 쿼리 where에 companyId가 포함된다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(baseHoliday)
      mockPrisma.companyHoliday.deleteMany.mockResolvedValue({ count: 1 })

      await service.remove(COMPANY_ID, HOLIDAY_ID)

      // 실제 삭제 연산이 id + companyId로 스코프되어야 타사 데이터 삭제를 방어한다
      expect(mockPrisma.companyHoliday.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: HOLIDAY_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('회사에 휴일이 없으면 NotFoundException을 던지고 삭제를 시도하지 않는다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.companyHoliday.deleteMany).not.toHaveBeenCalled()
    })

    it('Not Found 에러는 올바른 code/message를 포함한다', async () => {
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toMatchObject({
        response: {
          code: 'COMPANY_HOLIDAY_NOT_FOUND',
          message: '휴일을 찾을 수 없습니다.',
        },
      })
    })

    it('멀티테넌시 — 타사 휴일 삭제 요청은 NotFoundException으로 차단된다', async () => {
      // 타사 ID로 조회 시 companyId 격리로 인해 findFirst가 null을 반환
      mockPrisma.companyHoliday.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'other-company-holiday')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.companyHoliday.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      )
      expect(mockPrisma.companyHoliday.deleteMany).not.toHaveBeenCalled()
    })
  })
})
