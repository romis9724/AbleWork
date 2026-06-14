import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, ForbiddenException } from '@nestjs/common'
import { DocumentFormsService } from './document-forms.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const FORM_ID = 'form-1'
const RULE_ID = 'rule-1'

const baseForm = {
  id: FORM_ID,
  companyId: COMPANY_ID,
  formOwnerId: null as string | null,
  name: '휴가 신청서',
  category: 'HR',
  fieldsSchema: { fields: [{ key: 'reason', type: 'text' }] },
  sortOrder: 0,
  allowReDraft: false,
  allowPreApproval: false,
  allowZipUpload: false,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

const baseRule = {
  id: RULE_ID,
  companyId: COMPANY_ID,
  formId: FORM_ID,
  pattern: 'HR-{YYYY}-{SEQ:4}',
  currentSeq: 0,
  resetYearly: true,
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제 사용하는 모델/메서드만 정의한다.

const mockPrisma = {
  documentForm: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  documentNumberRule: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  sharedApprovalLine: {
    findFirst: jest.fn(),
  },
  document: {
    count: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('DocumentFormsService', () => {
  let service: DocumentFormsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentFormsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<DocumentFormsService>(DocumentFormsService)
    jest.clearAllMocks()

    // 삭제 가드 기본값: 참조 문서 없음(0) — 정상 케이스가 가드를 통과하도록
    mockPrisma.document.count.mockResolvedValue(0)
  })

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('회사에 속한 활성 양식 목록을 반환한다', async () => {
      mockPrisma.documentForm.findMany.mockResolvedValue([baseForm])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toEqual([baseForm])
    })

    it('멀티테넌시 — companyId 조건과 isActive=true 조건으로만 조회한다', async () => {
      mockPrisma.documentForm.findMany.mockResolvedValue([])

      await service.findAll(COMPANY_ID)

      expect(mockPrisma.documentForm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      )
    })

    it('비활성 양식(isActive=false)은 조회 대상에서 제외한다', async () => {
      mockPrisma.documentForm.findMany.mockResolvedValue([])

      await service.findAll(COMPANY_ID)

      // where 조건에 isActive:true 가 포함되어 비활성 양식이 걸러진다
      const callArg = mockPrisma.documentForm.findMany.mock.calls[0][0]
      expect(callArg.where.isActive).toBe(true)
    })

    it('sortOrder 오름차순 후 name 오름차순으로 정렬한다', async () => {
      mockPrisma.documentForm.findMany.mockResolvedValue([])

      await service.findAll(COMPANY_ID)

      expect(mockPrisma.documentForm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      name: '휴가 신청서',
      category: 'HR',
      fieldsSchema: { fields: [{ key: 'reason', type: 'text' }] },
      sortOrder: 0,
      allowReDraft: false,
      allowPreApproval: false,
    }

    it('양식을 생성하고 companyId를 주입한다', async () => {
      mockPrisma.documentForm.create.mockResolvedValue(baseForm)

      const result = await service.create(COMPANY_ID, dto)

      expect(result).toEqual(baseForm)
      expect(mockPrisma.documentForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            name: '휴가 신청서',
            category: 'HR',
          }),
        }),
      )
    })

    it('DTO 플래그/정렬 값을 그대로 전달한다', async () => {
      mockPrisma.documentForm.create.mockResolvedValue(baseForm)

      await service.create(COMPANY_ID, {
        ...dto,
        sortOrder: 5,
        allowReDraft: true,
        allowPreApproval: true,
      })

      expect(mockPrisma.documentForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sortOrder: 5,
            allowReDraft: true,
            allowPreApproval: true,
          }),
        }),
      )
    })

    it('기본 결재선(defaultLineId)이 자사 공용 결재선이면 저장한다 (AP-01-03)', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue({ id: 'line-1' })
      mockPrisma.documentForm.create.mockResolvedValue(baseForm)

      await service.create(COMPANY_ID, { ...dto, defaultLineId: 'line-1' })

      expect(mockPrisma.sharedApprovalLine.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'line-1', companyId: COMPANY_ID }, select: { id: true } }),
      )
      expect(mockPrisma.documentForm.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ defaultLineId: 'line-1' }) }),
      )
    })

    it('기본 결재선이 타사/미존재면 SHARED_LINE_NOT_FOUND로 거부한다', async () => {
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue(null)

      await expect(
        service.create(COMPANY_ID, { ...dto, defaultLineId: 'other-line' }),
      ).rejects.toMatchObject({ response: { code: 'SHARED_LINE_NOT_FOUND' } })
      expect(mockPrisma.documentForm.create).not.toHaveBeenCalled()
    })

    it('category가 없으면 null로 저장한다', async () => {
      mockPrisma.documentForm.create.mockResolvedValue({ ...baseForm, category: null })

      const { category, ...rest } = dto
      void category
      await service.create(COMPANY_ID, rest)

      expect(mockPrisma.documentForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ category: null }),
        }),
      )
    })

    it('복잡한 fieldsSchema JSON 구조를 그대로 저장한다', async () => {
      mockPrisma.documentForm.create.mockResolvedValue(baseForm)

      const complexSchema = {
        sections: [
          { title: '기본', fields: [{ key: 'a', type: 'text', required: true }] },
          { title: '상세', fields: [{ key: 'b', type: 'number', min: 0 }] },
        ],
      }
      await service.create(COMPANY_ID, { ...dto, fieldsSchema: complexSchema })

      expect(mockPrisma.documentForm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fieldsSchema: complexSchema }),
        }),
      )
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('회사에 속한 양식을 수정한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentForm.update.mockResolvedValue({ ...baseForm, name: '수정됨' })

      const result = await service.update(COMPANY_ID, FORM_ID, { name: '수정됨' })

      expect(result.name).toBe('수정됨')
      expect(mockPrisma.documentForm.update).toHaveBeenCalledWith({
        where: { id: FORM_ID },
        data: { name: '수정됨' },
      })
    })

    it('멀티테넌시 — 소속 검증 시 where에 companyId가 포함된다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentForm.update.mockResolvedValue(baseForm)

      await service.update(COMPANY_ID, FORM_ID, { name: 'x' })

      expect(mockPrisma.documentForm.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: FORM_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('부분 업데이트 — 전달된 필드만 data로 넘긴다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentForm.update.mockResolvedValue(baseForm)

      await service.update(COMPANY_ID, FORM_ID, { sortOrder: 9 })

      expect(mockPrisma.documentForm.update).toHaveBeenCalledWith({
        where: { id: FORM_ID },
        data: { sortOrder: 9 },
      })
    })

    it('fieldsSchema가 제공되면 data에 포함한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentForm.update.mockResolvedValue(baseForm)

      const newSchema = { fields: [{ key: 'updated', type: 'date' }] }
      await service.update(COMPANY_ID, FORM_ID, { fieldsSchema: newSchema })

      expect(mockPrisma.documentForm.update).toHaveBeenCalledWith({
        where: { id: FORM_ID },
        data: expect.objectContaining({ fieldsSchema: newSchema }),
      })
    })

    it('fieldsSchema가 미제공이면 data에서 제외한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentForm.update.mockResolvedValue(baseForm)

      await service.update(COMPANY_ID, FORM_ID, { name: 'no-schema' })

      const callArg = mockPrisma.documentForm.update.mock.calls[0][0]
      expect(callArg.data).not.toHaveProperty('fieldsSchema')
    })

    it('isActive=true를 전달하면 소프트 삭제된 양식을 재활성화한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ ...baseForm, isActive: false })
      mockPrisma.documentForm.update.mockResolvedValue({ ...baseForm, isActive: true })

      const result = await service.update(COMPANY_ID, FORM_ID, { isActive: true })

      expect(result.isActive).toBe(true)
      expect(mockPrisma.documentForm.update).toHaveBeenCalledWith({
        where: { id: FORM_ID },
        data: { isActive: true },
      })
    })

    it('존재하지 않는 formId면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.documentForm.update).not.toHaveBeenCalled()
    })

    it('타 회사 양식 접근 시 NotFoundException을 던진다', async () => {
      // assertFormBelongsToCompany가 companyId 조건으로 조회하므로 null 반환
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(
        service.update(OTHER_COMPANY_ID, FORM_ID, { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.documentForm.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: OTHER_COMPANY_ID }),
        }),
      )
    })
  })

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('소프트 삭제 — isActive를 false로 변경하고 deleted:true를 반환한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.document.count.mockResolvedValue(0) // 참조 문서 없음 — 가드 통과
      mockPrisma.documentForm.update.mockResolvedValue({ ...baseForm, isActive: false })

      const result = await service.remove(COMPANY_ID, FORM_ID)

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.documentForm.update).toHaveBeenCalledWith({
        where: { id: FORM_ID },
        data: { isActive: false },
      })
    })

    it('멀티테넌시 — 소속 검증 시 where에 companyId가 포함된다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.document.count.mockResolvedValue(0) // 참조 문서 없음 — 가드 통과
      mockPrisma.documentForm.update.mockResolvedValue(baseForm)

      await service.remove(COMPANY_ID, FORM_ID)

      expect(mockPrisma.documentForm.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: FORM_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('이 양식으로 작성된 문서가 있으면 ForbiddenException(FORM_IN_USE)을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.document.count.mockResolvedValue(3) // 참조 문서 존재 — 가드 차단

      await expect(service.remove(COMPANY_ID, FORM_ID)).rejects.toThrow(
        ForbiddenException,
      )
      await expect(service.remove(COMPANY_ID, FORM_ID)).rejects.toMatchObject({
        response: { code: 'FORM_IN_USE' },
      })
      expect(mockPrisma.documentForm.update).not.toHaveBeenCalled()
    })

    it('존재하지 않는 formId면 NotFoundException을 던지고 update를 호출하지 않는다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.documentForm.update).not.toHaveBeenCalled()
    })

    it('타 회사 양식 삭제 시 NotFoundException을 던진다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(service.remove(OTHER_COMPANY_ID, FORM_ID)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── getNumberRule ────────────────────────────────────────────────────────────

  describe('getNumberRule', () => {
    it('양식의 채번 규칙 전체 필드를 반환한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(baseRule)

      const result = await service.getNumberRule(COMPANY_ID, FORM_ID)

      expect(result).toEqual(baseRule)
    })

    it('멀티테넌시 — 채번 규칙 조회 where에 companyId와 formId가 포함된다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(baseRule)

      await service.getNumberRule(COMPANY_ID, FORM_ID)

      expect(mockPrisma.documentNumberRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, formId: FORM_ID }),
        }),
      )
    })

    it('규칙이 없으면 null을 반환한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)

      const result = await service.getNumberRule(COMPANY_ID, FORM_ID)

      expect(result).toBeNull()
    })

    it('존재하지 않는 formId면 NotFoundException을 던진다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(service.getNumberRule(COMPANY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.documentNumberRule.findFirst).not.toHaveBeenCalled()
    })

    it('타 회사 양식 규칙 조회 시 NotFoundException을 던진다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(service.getNumberRule(OTHER_COMPANY_ID, FORM_ID)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── upsertNumberRule ─────────────────────────────────────────────────────────

  describe('upsertNumberRule', () => {
    const dto = { pattern: 'HR-{YYYY}-{SEQ:4}', resetYearly: true }

    it('규칙이 없으면 신규 생성한다 (companyId/formId 주입)', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)
      mockPrisma.documentNumberRule.create.mockResolvedValue(baseRule)

      const result = await service.upsertNumberRule(COMPANY_ID, FORM_ID, dto)

      expect(result).toEqual(baseRule)
      expect(mockPrisma.documentNumberRule.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_ID,
          formId: FORM_ID,
          pattern: dto.pattern,
          resetYearly: dto.resetYearly,
        },
      })
      expect(mockPrisma.documentNumberRule.update).not.toHaveBeenCalled()
    })

    it('신규 생성 시 currentSeq는 스키마 기본값(0)에 위임한다 — data에 명시하지 않는다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)
      mockPrisma.documentNumberRule.create.mockResolvedValue(baseRule)

      await service.upsertNumberRule(COMPANY_ID, FORM_ID, dto)

      const callArg = mockPrisma.documentNumberRule.create.mock.calls[0][0]
      expect(callArg.data).not.toHaveProperty('currentSeq')
    })

    it('규칙이 있으면 기존 규칙을 업데이트한다 (pattern/resetYearly만)', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.documentNumberRule.update.mockResolvedValue({
        ...baseRule,
        pattern: 'NEW-{SEQ:3}',
        resetYearly: false,
      })

      const result = await service.upsertNumberRule(COMPANY_ID, FORM_ID, {
        pattern: 'NEW-{SEQ:3}',
        resetYearly: false,
      })

      expect(result.pattern).toBe('NEW-{SEQ:3}')
      expect(mockPrisma.documentNumberRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { pattern: 'NEW-{SEQ:3}', resetYearly: false },
      })
      expect(mockPrisma.documentNumberRule.create).not.toHaveBeenCalled()
    })

    it('업데이트 시 currentSeq를 초기화하지 않는다 (채번 진행 보존)', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue({
        ...baseRule,
        currentSeq: 42,
      })
      mockPrisma.documentNumberRule.update.mockResolvedValue({ ...baseRule, currentSeq: 42 })

      await service.upsertNumberRule(COMPANY_ID, FORM_ID, dto)

      const callArg = mockPrisma.documentNumberRule.update.mock.calls[0][0]
      expect(callArg.data).not.toHaveProperty('currentSeq')
    })

    it('멀티테넌시 — 기존 규칙 조회 where에 companyId와 formId가 포함된다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(baseForm)
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)
      mockPrisma.documentNumberRule.create.mockResolvedValue(baseRule)

      await service.upsertNumberRule(COMPANY_ID, FORM_ID, dto)

      expect(mockPrisma.documentNumberRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID, formId: FORM_ID }),
        }),
      )
    })

    it('존재하지 않는 formId면 NotFoundException을 던진다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(
        service.upsertNumberRule(COMPANY_ID, 'nonexistent', dto),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.documentNumberRule.findFirst).not.toHaveBeenCalled()
    })

    it('타 회사 양식 규칙 upsert 시 NotFoundException을 던진다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(
        service.upsertNumberRule(OTHER_COMPANY_ID, FORM_ID, dto),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.documentNumberRule.create).not.toHaveBeenCalled()
    })
  })
})
