import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { CustomTypesService } from './custom-types.service'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateCustomRequestTypeDto,
  UpdateCustomRequestTypeDto,
} from './dto/custom-request-type.dto'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const TYPE_ID = 'custom-type-1'

const baseField = {
  id: 'field-1',
  customTypeId: TYPE_ID,
  fieldName: '사유',
  fieldType: 'text',
  isRequired: true,
  options: null,
  description: null,
  imageUrl: null,
  sortOrder: 0,
}

const baseType = {
  id: TYPE_ID,
  companyId: COMPANY_ID,
  name: '비품 신청',
  isActive: true,
  enablePdf: false,
  allowEmployeePdf: false,
  createdAt: new Date('2024-01-01'),
  fields: [baseField],
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제 사용하는 모델/메서드만 정의한다.

const mockPrisma = {
  customRequestType: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  customRequestTypeField: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  approvalRule: {
    count: jest.fn(),
  },
  $transaction: jest.fn(),
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('CustomTypesService', () => {
  let service: CustomTypesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomTypesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<CustomTypesService>(CustomTypesService)
    jest.clearAllMocks()
    // 기본값: 사용 중인 승인 규칙 없음 (삭제 가드 통과)
    mockPrisma.approvalRule.count.mockResolvedValue(0)
  })

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('회사에 속한 커스텀 요청 유형 목록을 fields 포함하여 반환한다', async () => {
      mockPrisma.customRequestType.findMany.mockResolvedValue([baseType])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([baseType])
      // 멀티테넌시: where에 companyId가 포함되어야 한다
      expect(mockPrisma.customRequestType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
    })

    it('fields는 sortOrder 오름차순으로 정렬되어 include 된다', async () => {
      mockPrisma.customRequestType.findMany.mockResolvedValue([])

      await service.findAll(COMPANY_ID)

      expect(mockPrisma.customRequestType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { fields: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { createdAt: 'asc' },
        }),
      )
    })

    it('[MEDIUM 갭] isActive 필터가 없어 비활성(소프트삭제) 유형도 함께 반환한다', async () => {
      // 소프트 삭제된 유형이 조회 결과에 포함되는 현재 동작을 문서화한다.
      const inactiveType = { ...baseType, id: 'type-inactive', isActive: false }
      mockPrisma.customRequestType.findMany.mockResolvedValue([
        baseType,
        inactiveType,
      ])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toHaveLength(2)
      // where 조건에 isActive 필터가 없음을 확인
      const callArg = mockPrisma.customRequestType.findMany.mock.calls[0][0]
      expect(callArg.where).toEqual({ companyId: COMPANY_ID })
      expect(callArg.where).not.toHaveProperty('isActive')
    })
  })

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto: CreateCustomRequestTypeDto = {
      name: '비품 신청',
      isActive: true,
      enablePdf: false,
      allowEmployeePdf: false,
      fields: [
        {
          fieldName: '사유',
          fieldType: 'text',
          isRequired: true,
          options: undefined,
          description: undefined,
          imageUrl: undefined,
        },
      ],
    }

    it('커스텀 요청 유형을 생성하고 companyId를 data에 포함한다', async () => {
      mockPrisma.customRequestType.create.mockResolvedValue(baseType)

      const result = await service.create(COMPANY_ID, dto)

      expect(result).toEqual(baseType)
      // 멀티테넌시: 생성 data에 호출자의 companyId가 포함되어야 한다
      expect(mockPrisma.customRequestType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            name: '비품 신청',
            isActive: true,
            enablePdf: false,
            allowEmployeePdf: false,
          }),
        }),
      )
    })

    it('[MEDIUM 갭] 필드의 sortOrder는 배열 인덱스(0-based)로 할당된다', async () => {
      mockPrisma.customRequestType.create.mockResolvedValue(baseType)

      const multiFieldDto: CreateCustomRequestTypeDto = {
        ...dto,
        fields: [
          { fieldName: '첫째', fieldType: 'text', isRequired: false },
          { fieldName: '둘째', fieldType: 'text', isRequired: false },
          { fieldName: '셋째', fieldType: 'select', isRequired: false },
        ],
      }

      await service.create(COMPANY_ID, multiFieldDto)

      const callArg = mockPrisma.customRequestType.create.mock.calls[0][0]
      const created = callArg.data.fields.create
      expect(created).toHaveLength(3)
      expect(created[0]).toEqual(
        expect.objectContaining({ fieldName: '첫째', sortOrder: 0 }),
      )
      expect(created[1]).toEqual(
        expect.objectContaining({ fieldName: '둘째', sortOrder: 1 }),
      )
      expect(created[2]).toEqual(
        expect.objectContaining({ fieldName: '셋째', sortOrder: 2 }),
      )
    })

    it('options가 undefined이면 Prisma.JsonNull로, 제공되면 그대로 매핑한다', async () => {
      mockPrisma.customRequestType.create.mockResolvedValue(baseType)

      const withOptionsDto: CreateCustomRequestTypeDto = {
        ...dto,
        fields: [
          { fieldName: '무옵션', fieldType: 'text', isRequired: false },
          {
            fieldName: '옵션필드',
            fieldType: 'select',
            isRequired: false,
            options: ['A', 'B'],
          },
        ],
      }

      await service.create(COMPANY_ID, withOptionsDto)

      const created =
        mockPrisma.customRequestType.create.mock.calls[0][0].data.fields.create
      // undefined → Prisma.JsonNull (null 직렬화)
      expect(created[0].options).toBeDefined()
      // 제공된 options는 그대로 보존
      expect(created[1].options).toEqual(['A', 'B'])
    })

    it('description/imageUrl 미제공 시 null로 매핑한다', async () => {
      mockPrisma.customRequestType.create.mockResolvedValue(baseType)

      await service.create(COMPANY_ID, dto)

      const created =
        mockPrisma.customRequestType.create.mock.calls[0][0].data.fields.create
      expect(created[0].description).toBeNull()
      expect(created[0].imageUrl).toBeNull()
    })

    it('빈 fields 배열로도 생성할 수 있다 (현재 최소 1개 필드 검증 없음)', async () => {
      // [MEDIUM 갭] 서비스는 최소 1개 필드를 강제하지 않는다 — 현재 동작 문서화
      mockPrisma.customRequestType.create.mockResolvedValue({
        ...baseType,
        fields: [],
      })

      const emptyDto: CreateCustomRequestTypeDto = { ...dto, fields: [] }
      await service.create(COMPANY_ID, emptyDto)

      const created =
        mockPrisma.customRequestType.create.mock.calls[0][0].data.fields.create
      expect(created).toEqual([])
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    beforeEach(() => {
      // 트랜잭션 콜백을 동일 mockPrisma로 즉시 실행
      mockPrisma.$transaction.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (fn: any) => fn(mockPrisma),
      )
    })

    it('소유 검증 후 메타 필드만 수정한다 (fields 미제공 시 필드 교체 없음)', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.customRequestType.update.mockResolvedValue({
        ...baseType,
        name: '비품 신청(수정)',
      })

      const dto: UpdateCustomRequestTypeDto = { name: '비품 신청(수정)' }
      const result = await service.update(COMPANY_ID, TYPE_ID, dto)

      expect(result.name).toBe('비품 신청(수정)')
      // fields 미제공 → 필드 삭제/생성 호출 없음
      expect(mockPrisma.customRequestTypeField.deleteMany).not.toHaveBeenCalled()
      expect(
        mockPrisma.customRequestTypeField.createMany,
      ).not.toHaveBeenCalled()
      // 변경된 필드만 data에 포함
      expect(mockPrisma.customRequestType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TYPE_ID },
          data: { name: '비품 신청(수정)' },
        }),
      )
    })

    it('소유 검증은 findFirst에 id + companyId 조건으로 수행된다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.customRequestType.update.mockResolvedValue(baseType)

      await service.update(COMPANY_ID, TYPE_ID, { isActive: false })

      // 멀티테넌시: 소유 검증 쿼리에 companyId 포함
      expect(mockPrisma.customRequestType.findFirst).toHaveBeenCalledWith({
        where: { id: TYPE_ID, companyId: COMPANY_ID },
      })
    })

    it('fields 제공 시 전체 교체한다 — deleteMany 후 createMany 호출', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.customRequestType.update.mockResolvedValue(baseType)

      const dto: UpdateCustomRequestTypeDto = {
        fields: [
          { fieldName: '새필드1', fieldType: 'text', isRequired: false },
          { fieldName: '새필드2', fieldType: 'number', isRequired: true },
        ],
      }

      await service.update(COMPANY_ID, TYPE_ID, dto)

      expect(mockPrisma.customRequestTypeField.deleteMany).toHaveBeenCalledTimes(
        1,
      )
      expect(mockPrisma.customRequestTypeField.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            customTypeId: TYPE_ID,
            fieldName: '새필드1',
            sortOrder: 0,
          }),
          expect.objectContaining({
            customTypeId: TYPE_ID,
            fieldName: '새필드2',
            sortOrder: 1,
          }),
        ],
      })
    })

    it('[CRITICAL 멀티테넌시] deleteMany의 where에 customType.companyId 조건이 포함된다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.customRequestType.update.mockResolvedValue(baseType)

      await service.update(COMPANY_ID, TYPE_ID, {
        fields: [{ fieldName: 'x', fieldType: 'text', isRequired: false }],
      })

      // 회사 경계 강제: 타사 동일 UUID 필드 삭제 방지
      expect(mockPrisma.customRequestTypeField.deleteMany).toHaveBeenCalledWith({
        where: {
          customTypeId: TYPE_ID,
          customType: { companyId: COMPANY_ID },
        },
      })
    })

    it('[MEDIUM 갭] 빈 fields 배열 제공 시 전체 삭제만 하고 createMany는 호출하지 않는다', async () => {
      // 모든 필드를 제거하는 동작 (최소 1개 필드 검증 없음) — 현재 동작 문서화
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.customRequestType.update.mockResolvedValue({
        ...baseType,
        fields: [],
      })

      await service.update(COMPANY_ID, TYPE_ID, { fields: [] })

      expect(mockPrisma.customRequestTypeField.deleteMany).toHaveBeenCalledTimes(
        1,
      )
      // 길이 0 → createMany 미호출
      expect(
        mockPrisma.customRequestTypeField.createMany,
      ).not.toHaveBeenCalled()
    })

    it('타 회사 유형이면 NotFoundException을 던지고 트랜잭션을 시작하지 않는다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'other-company-type', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)

      // 소유 검증 실패 시 트랜잭션/수정 진입 금지
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockPrisma.customRequestType.update).not.toHaveBeenCalled()
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('소프트 삭제 — isActive를 false로 변경한다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.approvalRule.count.mockResolvedValue(0)
      mockPrisma.customRequestType.update.mockResolvedValue({
        ...baseType,
        isActive: false,
      })

      const result = await service.remove(COMPANY_ID, TYPE_ID)

      expect(result.isActive).toBe(false)
      expect(mockPrisma.customRequestType.update).toHaveBeenCalledWith({
        where: { id: TYPE_ID },
        data: { isActive: false },
      })
    })

    it('소유 검증은 id + companyId 조건으로 수행된다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      mockPrisma.approvalRule.count.mockResolvedValue(0)
      mockPrisma.customRequestType.update.mockResolvedValue(baseType)

      await service.remove(COMPANY_ID, TYPE_ID)

      // 멀티테넌시: 삭제 전 소유 검증 쿼리에 companyId 포함
      expect(mockPrisma.customRequestType.findFirst).toHaveBeenCalledWith({
        where: { id: TYPE_ID, companyId: COMPANY_ID },
      })
    })

    it('타 회사 유형이면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(null)

      await expect(
        service.remove(COMPANY_ID, 'other-company-type'),
      ).rejects.toThrow(NotFoundException)

      expect(mockPrisma.customRequestType.update).not.toHaveBeenCalled()
    })

    it('[참조무결성] 사용 중인 활성 승인 규칙이 있으면 ForbiddenException(CUSTOM_TYPE_IN_USE)을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.customRequestType.findFirst.mockResolvedValue(baseType)
      // 이 유형을 참조하는 활성 승인 규칙 존재
      mockPrisma.approvalRule.count.mockResolvedValue(2)

      await expect(service.remove(COMPANY_ID, TYPE_ID)).rejects.toThrow(
        ForbiddenException,
      )
      await expect(service.remove(COMPANY_ID, TYPE_ID)).rejects.toMatchObject({
        response: { code: 'CUSTOM_TYPE_IN_USE' },
      })

      // 활성 규칙 카운트 쿼리에 멀티테넌시 조건 포함
      expect(mockPrisma.approvalRule.count).toHaveBeenCalledWith({
        where: { customTypeId: TYPE_ID, companyId: COMPANY_ID, isActive: true },
      })
      // 삭제 차단 — 소프트 삭제 update 미호출
      expect(mockPrisma.customRequestType.update).not.toHaveBeenCalled()
    })
  })
})
