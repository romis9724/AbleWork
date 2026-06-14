import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { StandardizationRulesService } from './standardization-rules.service'
import { PrismaService } from '../../prisma/prisma.service'
import type {
  CreateStandardizationRuleDto,
  UpdateStandardizationRuleDto,
} from './dto/standardization-rule.dto'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const RULE_ID = 'rule-1'
const POSITION_ID = '11111111-1111-1111-1111-111111111111'

const baseRule = {
  id: RULE_ID,
  companyId: COMPANY_ID,
  positionId: null as string | null,
  name: '기본 표준화 규칙',
  calculationBasis: 'attendance',
  startTimeRule: 'shift_start',
  endTimeRule: 'shift_end',
  excludeNoCheckin: false,
  includeManualBreak: true,
  isDefault: true,
  isActive: true,
  createdAt: new Date('2024-01-01'),
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────

const mockPrisma = {
  standardizationRule: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('StandardizationRulesService', () => {
  let service: StandardizationRulesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StandardizationRulesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<StandardizationRulesService>(StandardizationRulesService)
    jest.clearAllMocks()
  })

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('회사에 속한 활성 규칙 목록을 반환한다', async () => {
      mockPrisma.standardizationRule.findMany.mockResolvedValue([baseRule])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([baseRule])
    })

    it('멀티테넌시 — companyId 및 isActive=true 조건으로만 조회한다', async () => {
      mockPrisma.standardizationRule.findMany.mockResolvedValue([baseRule])

      await service.findAll(COMPANY_ID)

      expect(mockPrisma.standardizationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      )
    })

    it('기본 규칙 우선·생성 오래된 순으로 정렬한다 (isDefault DESC, createdAt ASC)', async () => {
      mockPrisma.standardizationRule.findMany.mockResolvedValue([baseRule])

      await service.findAll(COMPANY_ID)

      expect(mockPrisma.standardizationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        }),
      )
    })

    it('회사에 규칙이 없으면 빈 배열을 반환한다', async () => {
      mockPrisma.standardizationRule.findMany.mockResolvedValue([])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([])
    })
  })

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    // $transaction 콜백 안에서 tx === mockPrisma 가 되도록 연결
    const wireTransaction = () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
      )
    }

    const baseDto: CreateStandardizationRuleDto = {
      name: '신규 규칙',
      calculationBasis: 'attendance',
      startTimeRule: 'shift_start',
      endTimeRule: 'shift_end',
    }

    it('일반 규칙을 생성한다 (isDefault 미지정 → false)', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockResolvedValue({
        ...baseRule,
        isDefault: false,
      })

      const result = await service.create(COMPANY_ID, baseDto)

      expect(result.isDefault).toBe(false)
      // 기본 규칙 생성이 아니므로 기존 기본 규칙 해제는 일어나지 않는다
      expect(mockPrisma.standardizationRule.updateMany).not.toHaveBeenCalled()
    })

    it('멀티테넌시 — 본문이 아닌 경로 companyId만 사용해 저장한다', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockResolvedValue(baseRule)

      // 본문에 companyId를 끼워 넣어도 무시되어야 한다
      await service.create(COMPANY_ID, {
        ...baseDto,
        companyId: OTHER_COMPANY_ID,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      expect(mockPrisma.standardizationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_ID }),
        }),
      )
    })

    it('기본 규칙 생성 시 기존 기본 규칙을 모두 해제한다 (해당 회사 한정)', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockResolvedValue({
        ...baseRule,
        isDefault: true,
      })

      await service.create(COMPANY_ID, { ...baseDto, isDefault: true })

      expect(mockPrisma.standardizationRule.updateMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, isDefault: true },
        data: { isDefault: false },
      })
    })

    it('positionId 미지정 시 null로 저장한다', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockResolvedValue(baseRule)

      await service.create(COMPANY_ID, baseDto)

      expect(mockPrisma.standardizationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ positionId: null }),
        }),
      )
    })

    it('positionId가 주어지면 그대로 저장한다', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockResolvedValue(baseRule)

      await service.create(COMPANY_ID, { ...baseDto, positionId: POSITION_ID })

      expect(mockPrisma.standardizationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ positionId: POSITION_ID }),
        }),
      )
    })

    it('불리언 기본값 — excludeNoCheckin=false, includeManualBreak=true가 적용된다', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockResolvedValue(baseRule)

      await service.create(COMPANY_ID, baseDto)

      expect(mockPrisma.standardizationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            excludeNoCheckin: false,
            includeManualBreak: true,
          }),
        }),
      )
    })

    it('원자성 — 생성 중 실패하면 전체 트랜잭션이 reject 된다', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockRejectedValue(
        new Error('DB write failed'),
      )

      await expect(
        service.create(COMPANY_ID, { ...baseDto, isDefault: true }),
      ).rejects.toThrow('DB write failed')
      // 트랜잭션 내부에서 처리되었음을 확인
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('FK 위반 — 존재하지 않는 positionId면 Prisma 에러가 전파된다', async () => {
      wireTransaction()
      mockPrisma.standardizationRule.create.mockRejectedValue(
        new Error('Foreign key constraint failed'),
      )

      await expect(
        service.create(COMPANY_ID, { ...baseDto, positionId: POSITION_ID }),
      ).rejects.toThrow('Foreign key constraint failed')
    })
  })

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    const wireTransaction = () => {
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma),
      )
    }

    it('부분 업데이트 — name만 전달하면 name만 반영한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        name: '변경됨',
      })

      const dto: UpdateStandardizationRuleDto = { name: '변경됨' }
      const result = await service.update(COMPANY_ID, RULE_ID, dto)

      expect(result.name).toBe('변경됨')
      expect(mockPrisma.standardizationRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { name: '변경됨' },
      })
    })

    it('멀티테넌시 — 소유권 검증(findOneOrThrow)을 companyId 조건으로 수행한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue(baseRule)

      await service.update(COMPANY_ID, RULE_ID, { name: 'x' })

      expect(mockPrisma.standardizationRule.findFirst).toHaveBeenCalledWith({
        where: { id: RULE_ID, companyId: COMPANY_ID, isActive: true },
      })
    })

    it('isDefault=true로 전환 시 같은 회사의 다른 기본 규칙을 해제한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue({
        ...baseRule,
        isDefault: false,
      })
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        isDefault: true,
      })

      await service.update(COMPANY_ID, RULE_ID, { isDefault: true })

      // 자기 자신은 제외하고 companyId 범위 내에서만 해제
      expect(mockPrisma.standardizationRule.updateMany).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, isDefault: true, NOT: { id: RULE_ID } },
        data: { isDefault: false },
      })
    })

    it('isDefault=false로 전환 시 다른 규칙을 건드리지 않는다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        isDefault: false,
      })

      await service.update(COMPANY_ID, RULE_ID, { isDefault: false })

      expect(mockPrisma.standardizationRule.updateMany).not.toHaveBeenCalled()
      expect(mockPrisma.standardizationRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { isDefault: false },
      })
    })

    it('positionId를 다른 값으로 업데이트한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        positionId: POSITION_ID,
      })

      await service.update(COMPANY_ID, RULE_ID, { positionId: POSITION_ID })

      expect(mockPrisma.standardizationRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { positionId: POSITION_ID },
      })
    })

    it('positionId를 null로 업데이트한다 (직위 제한 해제)', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue({
        ...baseRule,
        positionId: POSITION_ID,
      })
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        positionId: null,
      })

      await service.update(COMPANY_ID, RULE_ID, { positionId: null })

      expect(mockPrisma.standardizationRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { positionId: null },
      })
    })

    it('전달하지 않은 필드는 data에 포함되지 않는다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      wireTransaction()
      mockPrisma.standardizationRule.update.mockResolvedValue(baseRule)

      await service.update(COMPANY_ID, RULE_ID, { name: '변경됨' })

      const callArg = mockPrisma.standardizationRule.update.mock.calls[0][0] as {
        data: Record<string, unknown>
      }
      expect(Object.keys(callArg.data)).toEqual(['name'])
    })

    it('존재하지 않는 규칙이면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.standardizationRule.update).not.toHaveBeenCalled()
    })

    it('타 회사 규칙 업데이트 시도는 NotFoundException으로 차단된다 (멀티테넌시)', async () => {
      // 다른 회사 소유 → findFirst가 companyId 조건으로 null 반환
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(null)

      await expect(
        service.update(OTHER_COMPANY_ID, RULE_ID, { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.standardizationRule.findFirst).toHaveBeenCalledWith({
        where: { id: RULE_ID, companyId: OTHER_COMPANY_ID, isActive: true },
      })
    })

    it('원자성 — isDefault 해제 중 실패하면 트랜잭션이 reject 된다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      wireTransaction()
      mockPrisma.standardizationRule.updateMany.mockRejectedValue(
        new Error('updateMany failed'),
      )

      await expect(
        service.update(COMPANY_ID, RULE_ID, { isDefault: true }),
      ).rejects.toThrow('updateMany failed')
      expect(mockPrisma.standardizationRule.update).not.toHaveBeenCalled()
    })
  })

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('소프트 삭제 — isActive=false, isDefault=false로 업데이트한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        isActive: false,
        isDefault: false,
      })

      const result = await service.remove(COMPANY_ID, RULE_ID)

      expect(result.isActive).toBe(false)
      expect(result.isDefault).toBe(false)
      expect(mockPrisma.standardizationRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { isActive: false, isDefault: false },
      })
    })

    it('기본 규칙 삭제 시에도 isDefault를 함께 false로 정리한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue({
        ...baseRule,
        isDefault: true,
      })
      mockPrisma.standardizationRule.update.mockResolvedValue({
        ...baseRule,
        isActive: false,
        isDefault: false,
      })

      await service.remove(COMPANY_ID, RULE_ID)

      expect(mockPrisma.standardizationRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isDefault: false }),
        }),
      )
    })

    it('멀티테넌시 — 소유권 검증(findOneOrThrow)을 companyId 조건으로 수행한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.standardizationRule.update.mockResolvedValue(baseRule)

      await service.remove(COMPANY_ID, RULE_ID)

      expect(mockPrisma.standardizationRule.findFirst).toHaveBeenCalledWith({
        where: { id: RULE_ID, companyId: COMPANY_ID, isActive: true },
      })
    })

    it('존재하지 않는 규칙이면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.standardizationRule.update).not.toHaveBeenCalled()
    })

    it('타 회사 규칙 삭제 시도는 NotFoundException으로 차단된다 (멀티테넌시)', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(null)

      await expect(service.remove(OTHER_COMPANY_ID, RULE_ID)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.standardizationRule.findFirst).toHaveBeenCalledWith({
        where: { id: RULE_ID, companyId: OTHER_COMPANY_ID, isActive: true },
      })
    })
  })

  // ── findOneOrThrow (private, update/remove 경유로 검증) ──────────────────────

  describe('findOneOrThrow (간접 검증)', () => {
    it('isActive=true 조건으로만 규칙을 조회한다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.standardizationRule.update.mockResolvedValue(baseRule)

      await service.remove(COMPANY_ID, RULE_ID)

      expect(mockPrisma.standardizationRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      )
    })

    it('NotFoundException에 STANDARDIZATION_RULE_NOT_FOUND 코드와 메시지가 포함된다', async () => {
      mockPrisma.standardizationRule.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toMatchObject({
        response: {
          code: 'STANDARDIZATION_RULE_NOT_FOUND',
          message: '표준화 규칙을 찾을 수 없습니다.',
        },
      })
    })
  })
})
