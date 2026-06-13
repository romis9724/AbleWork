import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { ShiftTypesService, CreateShiftTypeDto } from './shift-types.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const TYPE_ID = 'shift-type-1'

const baseType = {
  id: TYPE_ID,
  companyId: COMPANY_ID,
  name: '주간 근무',
  category: 'REGULAR',
  color: '#f36f20',
  isOvertime: false,
  isNight: false,
  isHoliday: false,
  isDeemedWork: false,
  deemedWorkHours: null,
  noClockInRequired: false,
  confirmedAlert: null,
  noteTemplates: null,
  orgScopeIds: null,
  positionScopeIds: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제 사용하는 모델/메서드만 정의한다.

const mockPrisma = {
  shiftType: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('ShiftTypesService', () => {
  let service: ShiftTypesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftTypesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<ShiftTypesService>(ShiftTypesService)
    jest.clearAllMocks()
  })

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('회사에 속한 활성 근무유형을 이름순으로 반환한다', async () => {
      mockPrisma.shiftType.findMany.mockResolvedValue([baseType])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([baseType])
      // 멀티테넌시: companyId 필터 + isActive=true + name asc 정렬 검증
      expect(mockPrisma.shiftType.findMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, isActive: true },
        orderBy: { name: 'asc' },
      })
    })

    it('비활성 레코드를 제외하기 위해 isActive=true 필터를 항상 적용한다', async () => {
      mockPrisma.shiftType.findMany.mockResolvedValue([])

      await service.findAll(COMPANY_ID)

      expect(mockPrisma.shiftType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, isActive: true }),
        }),
      )
    })

    it('조회 쿼리의 where에 companyId가 반드시 포함된다 (멀티테넌시)', async () => {
      mockPrisma.shiftType.findMany.mockResolvedValue([])

      await service.findAll(OTHER_COMPANY_ID)

      expect(mockPrisma.shiftType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: OTHER_COMPANY_ID }),
        }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateShiftTypeDto = {
      name: '야간 근무',
      category: 'NIGHT',
      isOvertime: false,
      isNight: true,
      isHoliday: false,
      isDeemedWork: false,
      noClockInRequired: false,
    }

    it('근무유형을 생성하고 companyId를 주입한다', async () => {
      const created = { ...baseType, ...dto, id: 'shift-type-new' }
      mockPrisma.shiftType.create.mockResolvedValue(created)

      const result = await service.create(COMPANY_ID, dto)

      expect(result).toEqual(created)
      // 멀티테넌시: 생성 데이터에 companyId가 주입되는지 검증
      expect(mockPrisma.shiftType.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ companyId: COMPANY_ID, name: '야간 근무', isNight: true }),
      })
    })

    it('전달된 DTO 필드를 그대로 data에 펼쳐 넣는다', async () => {
      mockPrisma.shiftType.create.mockResolvedValue(baseType)

      await service.create(COMPANY_ID, dto)

      const callArg = mockPrisma.shiftType.create.mock.calls[0][0]
      expect(callArg.data).toMatchObject({
        companyId: COMPANY_ID,
        name: '야간 근무',
        category: 'NIGHT',
        isNight: true,
      })
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('존재하는 근무유형을 부분 수정한다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(baseType)
      mockPrisma.shiftType.update.mockResolvedValue({ ...baseType, name: '주간(수정)' })

      const result = await service.update(COMPANY_ID, TYPE_ID, { name: '주간(수정)' })

      expect(result.name).toBe('주간(수정)')
      // partial DTO: 전달한 필드만 data에 들어가야 함
      expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: '주간(수정)' } }),
      )
    })

    it('수정 전 findFirst로 companyId 소유권을 검증한다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(baseType)
      mockPrisma.shiftType.update.mockResolvedValue(baseType)

      await service.update(COMPANY_ID, TYPE_ID, { color: '#000000' })

      expect(mockPrisma.shiftType.findFirst).toHaveBeenCalledWith({
        where: { id: TYPE_ID, companyId: COMPANY_ID },
      })
    })

    it('[보안] update 쿼리의 where에 companyId가 포함된다 (타사 데이터 수정 차단)', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(baseType)
      mockPrisma.shiftType.update.mockResolvedValue(baseType)

      await service.update(COMPANY_ID, TYPE_ID, { name: 'x' })

      // 멀티테넌시 CRITICAL: where에 id만 있으면 타사 레코드 수정 가능 → companyId 필수
      expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: TYPE_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('타 회사 근무유형이면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(
        service.update(OTHER_COMPANY_ID, TYPE_ID, { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.shiftType.update).not.toHaveBeenCalled()
    })

    it('존재하지 않는 근무유형이면 NotFoundException을 던진다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('소프트 삭제 — isActive를 false로 변경한다 (물리 삭제하지 않음)', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(baseType)
      mockPrisma.shiftType.update.mockResolvedValue({ ...baseType, isActive: false })

      const result = await service.remove(COMPANY_ID, TYPE_ID)

      expect(result.isActive).toBe(false)
      expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } }),
      )
    })

    it('삭제 전 findFirst로 companyId 소유권을 검증한다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(baseType)
      mockPrisma.shiftType.update.mockResolvedValue(baseType)

      await service.remove(COMPANY_ID, TYPE_ID)

      expect(mockPrisma.shiftType.findFirst).toHaveBeenCalledWith({
        where: { id: TYPE_ID, companyId: COMPANY_ID },
      })
    })

    it('[보안] remove 쿼리의 where에 companyId가 포함된다 (타사 데이터 삭제 차단)', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(baseType)
      mockPrisma.shiftType.update.mockResolvedValue({ ...baseType, isActive: false })

      await service.remove(COMPANY_ID, TYPE_ID)

      // 멀티테넌시 CRITICAL: where에 id만 있으면 타사 레코드 soft-delete 가능 → companyId 필수
      expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: TYPE_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('타 회사 근무유형이면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(service.remove(OTHER_COMPANY_ID, TYPE_ID)).rejects.toThrow(NotFoundException)
      expect(mockPrisma.shiftType.update).not.toHaveBeenCalled()
    })

    it('존재하지 않는 근무유형이면 NotFoundException을 던진다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  // ── findOneOrThrow (에러 응답 형식) ──────────────────────────────────────────

  describe('findOneOrThrow (에러 응답 형식)', () => {
    it('레코드가 없으면 { code, message } 구조의 NotFoundException을 던진다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      try {
        await service.update(COMPANY_ID, 'nonexistent', { name: 'x' })
        fail('NotFoundException이 발생해야 한다')
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException)
        const response = (error as NotFoundException).getResponse() as {
          code: string
          message: string
        }
        // 에러코드 네이밍 규칙: [도메인]_[상황]
        expect(response.code).toBe('SHIFT_TYPE_NOT_FOUND')
        expect(response.message).toBe('근무일정 유형을 찾을 수 없습니다.')
      }
    })
  })
})
