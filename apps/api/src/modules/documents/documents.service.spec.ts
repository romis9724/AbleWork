import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { DocumentsService } from './documents.service'
import { DocumentQueryService } from './document-query.service'
import { DocumentStepsService } from './document-steps.service'
import { DocumentFormsService } from './document-forms.service'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const DRAFTER_ID = 'drafter-1'
const DOCUMENT_ID = 'document-1'
const FORM_ID = 'form-1'

const makeUser = (accessLevel: AccessLevel = AccessLevel.EMPLOYEE, employeeId = DRAFTER_ID): JwtPayload => ({
  sub: 'user-1',
  employeeId,
  companyId: COMPANY_ID,
  accessLevel,
})

const APPROVER_STEPS = [
  { role: 'APPROVER' as const, assigneeId: 'approver-1', stepOrder: 0 },
  { role: 'APPROVER' as const, assigneeId: 'approver-2', stepOrder: 1 },
  { role: 'REFERENCE' as const, assigneeId: 'ref-1', stepOrder: 2 },
  { role: 'RECEIVER' as const, assigneeId: 'recv-1', stepOrder: 3 },
]

const makeDocument = (overrides: Record<string, unknown> = {}) => ({
  id: DOCUMENT_ID,
  companyId: COMPANY_ID,
  formId: FORM_ID,
  requestId: null,
  docNumber: null,
  title: '지출 결의서',
  content: {},
  drafterId: DRAFTER_ID,
  status: 'DRAFT',
  submittedAt: null,
  completedAt: null,
  form: { id: FORM_ID, allowReDraft: false, allowPreApproval: false },
  approvalLines: [],
  ...overrides,
})

// ── 모킹 ───────────────────────────────────────────────────────────────────────

const mockPrisma = {
  document: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  documentForm: {
    findFirst: jest.fn(),
  },
  documentCategory: {
    findFirst: jest.fn(),
  },
  documentNumberRule: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  approvalLine: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  approvalStep: {
    createMany: jest.fn(),
    updateMany: jest.fn(),
  },
  approvalHistory: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  request: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  sharedApprovalLine: {
    findFirst: jest.fn(),
  },
  proxySettings: {
    findMany: jest.fn(),
  },
  employee: {
    count: jest.fn(),
  },
  organization: {
    findMany: jest.fn(),
  },
  organizationDocManager: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockEvents = { emit: jest.fn() }

// 양식 접근규칙 enforcement는 별도 서비스 — 기본 통과로 모킹(접근 거부 테스트에서 개별 override)
const mockDocumentForms = { assertCanUseForm: jest.fn().mockResolvedValue(undefined) }

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('DocumentsService', () => {
  let service: DocumentsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        DocumentQueryService,
        DocumentStepsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: DocumentFormsService, useValue: mockDocumentForms },
      ],
    }).compile()

    service = module.get<DocumentsService>(DocumentsService)
    jest.clearAllMocks()

    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    )
    mockPrisma.employee.count.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length,
    )
    mockPrisma.approvalLine.create.mockResolvedValue({ id: 'line-1' })
    mockPrisma.approvalStep.createMany.mockResolvedValue({ count: 4 })
    mockPrisma.approvalHistory.create.mockResolvedValue({})
  })

  // ── create (DRAFT) ───────────────────────────────────────────────────────────

  describe('create', () => {
    it('양식이 존재하면 DRAFT 문서를 생성하고 steps를 WAITING으로 보관한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID, companyId: COMPANY_ID })
      mockPrisma.document.create.mockResolvedValue(makeDocument())

      const result = await service.create(
        COMPANY_ID,
        { formId: FORM_ID, title: '지출 결의서', content: {}, steps: APPROVER_STEPS },
        makeUser(),
      )

      expect(result.status).toBe('DRAFT')
      expect(mockPrisma.approvalStep.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ role: 'APPROVER', status: 'WAITING' }),
        ]),
      })
    })

    it('타사 양식이면 FORM_NOT_FOUND 404', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(
        service.create(COMPANY_ID, { formId: FORM_ID, title: 't', content: {} }, makeUser()),
      ).rejects.toThrow(NotFoundException)
    })

    it('양식 접근 권한이 없으면 작성이 거부된다 (AP-01-07)', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID, companyId: COMPANY_ID })
      mockDocumentForms.assertCanUseForm.mockRejectedValueOnce(
        new ForbiddenException({ code: 'FORM_ACCESS_DENIED', message: 'x' }),
      )

      await expect(
        service.create(COMPANY_ID, { formId: FORM_ID, title: 't', content: {} }, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'FORM_ACCESS_DENIED' } })
      expect(mockPrisma.document.create).not.toHaveBeenCalled()
    })

    it('타사 직원이 결재선에 포함되면 400', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID })
      mockPrisma.employee.count.mockResolvedValue(1) // 4명 중 1명만 자사

      await expect(
        service.create(
          COMPANY_ID,
          { formId: FORM_ID, title: 't', content: {}, steps: APPROVER_STEPS },
          makeUser(),
        ),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── 부서 단계 해석 (G14 부서협조/부서수신) ───────────────────────────────────

  describe('부서 단계 해석', () => {
    const deptStep = (role: 'DEPT_COLLABORATOR' | 'DEPT_RECEIVER', organizationId = 'org-1') => [
      { role, organizationId, stepOrder: 0 },
    ]

    it('부서협조 단계는 부서 문서담당자(docManagerId)로 assignee를 해석해 저장한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID, companyId: COMPANY_ID })
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', docManagerId: 'mgr-1', approverId: 'lead-1' },
      ])
      mockPrisma.document.create.mockResolvedValue(makeDocument())

      await service.create(
        COMPANY_ID,
        { formId: FORM_ID, title: 't', content: {}, steps: deptStep('DEPT_COLLABORATOR') },
        makeUser(),
      )

      expect(mockPrisma.approvalStep.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            role: 'DEPT_COLLABORATOR',
            assigneeId: 'mgr-1',
            organizationId: 'org-1',
          }),
        ]),
      })
    })

    it('docManagerId가 없으면 팀장(approverId)으로 fallback한다', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID, companyId: COMPANY_ID })
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', docManagerId: null, approverId: 'lead-1' },
      ])
      mockPrisma.document.create.mockResolvedValue(makeDocument())

      await service.create(
        COMPANY_ID,
        { formId: FORM_ID, title: 't', content: {}, steps: deptStep('DEPT_RECEIVER') },
        makeUser(),
      )

      expect(mockPrisma.approvalStep.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ role: 'DEPT_RECEIVER', assigneeId: 'lead-1' }),
        ]),
      })
    })

    it('문서담당자도 팀장도 없으면 DEPT_NO_MANAGER 400', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID, companyId: COMPANY_ID })
      mockPrisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', docManagerId: null, approverId: null },
      ])

      await expect(
        service.create(
          COMPANY_ID,
          { formId: FORM_ID, title: 't', content: {}, steps: deptStep('DEPT_COLLABORATOR') },
          makeUser(),
        ),
      ).rejects.toMatchObject({ response: { code: 'DEPT_NO_MANAGER' } })
    })

    it('타사/비활성 부서면 ORG_NOT_FOUND 400', async () => {
      mockPrisma.documentForm.findFirst.mockResolvedValue({ id: FORM_ID, companyId: COMPANY_ID })
      mockPrisma.organization.findMany.mockResolvedValue([]) // 요청 부서 미존재

      await expect(
        service.create(
          COMPANY_ID,
          { formId: FORM_ID, title: 't', content: {}, steps: deptStep('DEPT_COLLABORATOR', 'org-x') },
          makeUser(),
        ),
      ).rejects.toMatchObject({ response: { code: 'ORG_NOT_FOUND' } })
    })
  })

  // ── submit ───────────────────────────────────────────────────────────────────

  describe('submit', () => {
    beforeEach(() => {
      mockPrisma.document.update.mockImplementation(async ({ data }: { data: object }) => ({
        ...makeDocument(),
        ...data,
      }))
    })

    it('상신: 채번 규칙으로 docNumber를 발급하고 첫 결재단계만 PENDING으로 만든다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument())
      mockPrisma.documentNumberRule.findFirst
        .mockResolvedValueOnce({ id: 'rule-1', pattern: 'HR-{YYYY}-{SEQ:4}', currentSeq: 0, resetYearly: true })
        .mockResolvedValueOnce({ id: 'rule-1', pattern: 'HR-{YYYY}-{SEQ:4}', currentSeq: 1, resetYearly: true })
      mockPrisma.documentNumberRule.update.mockResolvedValue({})

      const result = await service.submit(
        COMPANY_ID,
        DOCUMENT_ID,
        { steps: APPROVER_STEPS },
        makeUser(),
      )

      const year = new Date().getFullYear()
      expect(result.status).toBe('PENDING')
      expect(result.docNumber).toBe(`HR-${year}-0001`)

      const createManyData = mockPrisma.approvalStep.createMany.mock.calls[0][0].data
      expect(createManyData).toEqual([
        expect.objectContaining({ role: 'APPROVER', stepOrder: 0, status: 'PENDING' }),
        expect.objectContaining({ role: 'APPROVER', stepOrder: 1, status: 'WAITING' }),
        expect.objectContaining({ role: 'REFERENCE', stepOrder: 2, status: 'PENDING' }),
        expect.objectContaining({ role: 'RECEIVER', stepOrder: 3, status: 'WAITING' }),
      ])

      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'SUBMIT' }),
      })
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.submitted',
        expect.objectContaining({ documentId: DOCUMENT_ID, companyId: COMPANY_ID }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.step_pending',
        expect.objectContaining({ assigneeId: 'approver-1' }),
      )
    })

    it('채번 규칙이 없으면 기본 DOC-{연도}-{seq} 패턴으로 발급한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument())
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)
      mockPrisma.document.count.mockResolvedValue(7)

      const result = await service.submit(
        COMPANY_ID,
        DOCUMENT_ID,
        { steps: APPROVER_STEPS },
        makeUser(),
      )

      expect(result.docNumber).toBe(`DOC-${new Date().getFullYear()}-0008`)
    })

    it('문서성격 채번: {CATEGORY}-{ABBR}-{YY}-{SEQ:4} → 사업-지출기안-26-0001', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ categoryId: 'dcat-1' }))
      mockPrisma.documentNumberRule.findFirst
        .mockResolvedValueOnce({ id: 'rule-1', pattern: '{CATEGORY}-{ABBR}-{YY}-{SEQ:4}', currentSeq: 0, resetYearly: true })
        .mockResolvedValueOnce({ id: 'rule-1', pattern: '{CATEGORY}-{ABBR}-{YY}-{SEQ:4}', currentSeq: 1, resetYearly: true })
      mockPrisma.documentNumberRule.update.mockResolvedValue({})
      // 양식 약어·문서성격 약어 조회
      mockPrisma.documentForm.findFirst.mockResolvedValue({ abbreviation: '지출기안' })
      mockPrisma.documentCategory.findFirst.mockResolvedValue({ abbreviation: '사업' })

      const result = await service.submit(
        COMPANY_ID,
        DOCUMENT_ID,
        { steps: APPROVER_STEPS },
        makeUser(),
      )

      const yy = String(new Date().getFullYear()).slice(-2)
      expect(result.docNumber).toBe(`사업-지출기안-${yy}-0001`)
      // 문서성격 약어 조회는 companyId 스코프로 수행
      expect(mockPrisma.documentCategory.findFirst).toHaveBeenCalledWith({
        where: { id: 'dcat-1', companyId: COMPANY_ID },
        select: { abbreviation: true },
      })
    })

    it('문서성격 미지정(categoryId null)이면 {CATEGORY}는 빈 문자열로 치환된다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ categoryId: null }))
      mockPrisma.documentNumberRule.findFirst
        .mockResolvedValueOnce({ id: 'rule-1', pattern: '{CATEGORY}{ABBR}-{SEQ:3}', currentSeq: 0, resetYearly: false })
        .mockResolvedValueOnce({ id: 'rule-1', pattern: '{CATEGORY}{ABBR}-{SEQ:3}', currentSeq: 1, resetYearly: false })
      mockPrisma.documentNumberRule.update.mockResolvedValue({})
      mockPrisma.documentForm.findFirst.mockResolvedValue({ abbreviation: 'EXP' })

      const result = await service.submit(
        COMPANY_ID,
        DOCUMENT_ID,
        { steps: APPROVER_STEPS },
        makeUser(),
      )

      expect(result.docNumber).toBe('EXP-001')
      // categoryId가 없으면 문서성격 약어 조회를 하지 않는다
      expect(mockPrisma.documentCategory.findFirst).not.toHaveBeenCalled()
    })

    it('REJECTED(반려) 문서는 재상신할 수 없다 — 복사하여 새 기안', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({ status: 'REJECTED', form: { id: FORM_ID, allowReDraft: true } }),
      )

      await expect(
        service.submit(COMPANY_ID, DOCUMENT_ID, { steps: APPROVER_STEPS }, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_ALREADY_SUBMITTED' } })
    })

    it('RECALLED(회수) 문서도 재상신할 수 없다 — 복사하여 새 기안', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ status: 'RECALLED' }))

      await expect(
        service.submit(COMPANY_ID, DOCUMENT_ID, { steps: APPROVER_STEPS }, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_ALREADY_SUBMITTED' } })
    })

    it('이미 PENDING이면 DOCUMENT_ALREADY_SUBMITTED 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ status: 'PENDING' }))

      await expect(
        service.submit(COMPANY_ID, DOCUMENT_ID, {}, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_ALREADY_SUBMITTED' } })
    })

    it('결재(APPROVER/AGREEMENT) 단계가 없으면 APPROVAL_LINE_EMPTY 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument())

      await expect(
        service.submit(
          COMPANY_ID,
          DOCUMENT_ID,
          { steps: [{ role: 'VIEWER', assigneeId: 'v-1', stepOrder: 0 }] },
          makeUser(),
        ),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_LINE_EMPTY' } })
    })

    it('sharedLineId 지정 시 공용 결재선 steps를 복사한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument())
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue({
        id: 'shared-1',
        companyId: COMPANY_ID,
        steps: [
          { role: 'APPROVER', assigneeId: '11111111-1111-1111-1111-111111111111', stepOrder: 0 },
        ],
      })
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)
      mockPrisma.document.count.mockResolvedValue(0)

      await service.submit(COMPANY_ID, DOCUMENT_ID, { sharedLineId: 'shared-1' }, makeUser())

      expect(mockPrisma.approvalLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isShared: true, sharedLineRefId: 'shared-1' }),
      })
    })

    it('결재선 미지정 시 양식 기본 결재선(defaultLineId)을 적용한다 (AP-01-03)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({
          form: { id: FORM_ID, allowReDraft: false, allowPreApproval: false, defaultLineId: 'def-line' },
        }),
      )
      mockPrisma.sharedApprovalLine.findFirst.mockResolvedValue({
        id: 'def-line',
        companyId: COMPANY_ID,
        steps: [{ role: 'APPROVER', assigneeId: 'approver-1', stepOrder: 0 }],
      })
      mockPrisma.documentNumberRule.findFirst.mockResolvedValue(null)
      mockPrisma.document.count.mockResolvedValue(0)

      // dto.steps/sharedLineId 없이, DRAFT 보관 steps도 없음(approvalLines: [])
      await service.submit(COMPANY_ID, DOCUMENT_ID, {}, makeUser())

      expect(mockPrisma.sharedApprovalLine.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'def-line', companyId: COMPANY_ID } }),
      )
      expect(mockPrisma.approvalLine.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ isShared: true, sharedLineRefId: 'def-line' }),
      })
    })

    it('기안자 본인이 아니면 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument())

      await expect(
        service.submit(COMPANY_ID, DOCUMENT_ID, {}, makeUser(AccessLevel.EMPLOYEE, 'other-1')),
      ).rejects.toThrow(ForbiddenException)
    })

    it('타사 문서는 404', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null)

      await expect(service.submit(COMPANY_ID, DOCUMENT_ID, {}, makeUser())).rejects.toThrow(
        NotFoundException,
      )
    })

    it('HR 요청 연동 문서는 DOCUMENT_MANAGED_BY_REQUEST 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ requestId: 'req-1' }))

      await expect(
        service.submit(COMPANY_ID, DOCUMENT_ID, {}, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_MANAGED_BY_REQUEST' } })
    })
  })

  // ── recall ───────────────────────────────────────────────────────────────────

  describe('recall', () => {
    it('결재 처리된 단계가 없으면 RECALLED로 전환한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({
          status: 'PENDING',
          approvalLines: [
            { steps: [{ status: 'PENDING' }, { status: 'WAITING' }] },
          ],
        }),
      )
      mockPrisma.document.update.mockResolvedValue(makeDocument({ status: 'RECALLED' }))

      const result = await service.recall(COMPANY_ID, DOCUMENT_ID, makeUser())

      expect(result.status).toBe('RECALLED')
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'RECALL' }),
      })
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.recalled',
        expect.objectContaining({ documentId: DOCUMENT_ID }),
      )
    })

    it('이미 결재(승인) 처리된 단계가 있으면 DOCUMENT_CANNOT_RECALL 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({
          status: 'PENDING',
          approvalLines: [
            { steps: [{ status: 'APPROVED' }, { status: 'PENDING' }] },
          ],
        }),
      )

      await expect(
        service.recall(COMPANY_ID, DOCUMENT_ID, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_CANNOT_RECALL' } })
    })

    it('PENDING이 아닌 문서는 회수 불가', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({ status: 'DRAFT', approvalLines: [] }),
      )

      await expect(service.recall(COMPANY_ID, DOCUMENT_ID, makeUser())).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('DRAFT가 아니면 DOCUMENT_NOT_DRAFT 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ status: 'PENDING' }))

      await expect(
        service.remove(COMPANY_ID, DOCUMENT_ID, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_DRAFT' } })
    })

    it('DRAFT면 결재선과 함께 삭제한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument())
      mockPrisma.document.delete.mockResolvedValue({})

      const result = await service.remove(COMPANY_ID, DOCUMENT_ID, makeUser())

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.approvalLine.deleteMany).toHaveBeenCalled()
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: DOCUMENT_ID } })
    })
  })

  // ── AP-05-06 관리자 강제 삭제 ────────────────────────────────────────────────
  describe('forceDelete', () => {
    it('관리자가 아니면 DOCUMENT_FORCE_DELETE_FORBIDDEN 403', async () => {
      await expect(
        service.forceDelete(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.EMPLOYEE)),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_FORCE_DELETE_FORBIDDEN' } })
      expect(mockPrisma.document.findFirst).not.toHaveBeenCalled()
    })

    it('존재하지 않는 문서면 DOCUMENT_NOT_FOUND', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null)

      await expect(
        service.forceDelete(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.GENERAL_ADMIN)),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_FOUND' } })
    })

    it('HR 요청과 연결된 문서는 DOCUMENT_LINKED_TO_REQUEST로 차단(삭제 안 함)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ status: 'PENDING' }))
      mockPrisma.request.findFirst.mockResolvedValue({ id: 'req-1' })

      await expect(
        service.forceDelete(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.GENERAL_ADMIN)),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_LINKED_TO_REQUEST' } })
      expect(mockPrisma.document.delete).not.toHaveBeenCalled()
    })

    it('연결 요청이 없으면 이력 삭제 후 문서를 강제 삭제한다(임의 상태)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ status: 'PENDING' }))
      mockPrisma.request.findFirst.mockResolvedValue(null)
      mockPrisma.approvalHistory.deleteMany.mockResolvedValue({ count: 2 })
      mockPrisma.document.delete.mockResolvedValue({})

      const result = await service.forceDelete(
        COMPANY_ID,
        DOCUMENT_ID,
        makeUser(AccessLevel.GENERAL_ADMIN),
      )

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.approvalHistory.deleteMany).toHaveBeenCalledWith({ where: { documentId: DOCUMENT_ID } })
      expect(mockPrisma.document.delete).toHaveBeenCalledWith({ where: { id: DOCUMENT_ID } })
    })
  })

  // ── addOpinion (결재 후 사후 의견) ───────────────────────────────────────────

  describe('addOpinion', () => {
    it('상신된 문서에 사후 의견을 OPINION 이력으로 기록한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({ status: 'APPROVED', approvalLines: [] }),
      )
      mockPrisma.approvalHistory.create.mockResolvedValue({})

      await service.addOpinion(
        COMPANY_ID,
        DOCUMENT_ID,
        { comment: '최종 날인본 첨부합니다.' },
        makeUser(),
      )

      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: {
          documentId: DOCUMENT_ID,
          actorId: DRAFTER_ID,
          action: 'OPINION',
          comment: '최종 날인본 첨부합니다.',
        },
      })
    })

    it('DRAFT 문서면 DOCUMENT_OPINION_NOT_ALLOWED', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeDocument({ status: 'DRAFT' }))
      await expect(
        service.addOpinion(COMPANY_ID, DOCUMENT_ID, { comment: 'x' }, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_OPINION_NOT_ALLOWED' } })
      expect(mockPrisma.approvalHistory.create).not.toHaveBeenCalled()
    })

    it('기안자/관계자/관리자가 아니면 의견 등록을 거부한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({
          status: 'APPROVED',
          approvalLines: [{ steps: [{ assigneeId: 'approver-1', proxyId: null }] }],
        }),
      )
      await expect(
        service.addOpinion(
          COMPANY_ID,
          DOCUMENT_ID,
          { comment: 'x' },
          makeUser(AccessLevel.EMPLOYEE, 'stranger'),
        ),
      ).rejects.toThrow(ForbiddenException)
      expect(mockPrisma.approvalHistory.create).not.toHaveBeenCalled()
    })
  })

  // ── findAll (문서함) ─────────────────────────────────────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      mockPrisma.document.findMany.mockResolvedValue([])
      mockPrisma.document.count.mockResolvedValue(0)
    })

    it('draft 박스: 본인의 DRAFT/RECALLED/REJECTED 문서만 조회한다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'draft', page: 1, limit: 20 },
        makeUser(),
      )

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: COMPANY_ID,
            drafterId: DRAFTER_ID,
            status: { in: ['DRAFT', 'RECALLED', 'REJECTED'] },
          }),
        }),
      )
    })

    it('탭별 검색: searchField=drafter면 기안자명(contains)으로만 검색한다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'completed', page: 1, limit: 20, search: '홍길동', searchField: 'drafter' },
        makeUser(),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.OR).toEqual([{ drafter: { name: { contains: '홍길동' } } }])
    })

    it('탭별 검색: searchField=form이면 양식명(contains)으로만 검색한다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'completed', page: 1, limit: 20, search: '지출', searchField: 'form' },
        makeUser(),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.OR).toEqual([{ form: { name: { contains: '지출' } } }])
    })

    it('탭별 검색: searchField 미지정(all)이면 제목·문서번호·양식·기안자를 모두 검색한다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'completed', page: 1, limit: 20, search: '계약' },
        makeUser(),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.OR).toEqual([
        { title: { contains: '계약' } },
        { docNumber: { contains: '계약' } },
        { form: { name: { contains: '계약' } } },
        { drafter: { name: { contains: '계약' } } },
      ])
    })

    it('pending_approval 박스: 대리인인 principal의 단계도 포함한다', async () => {
      mockPrisma.proxySettings.findMany.mockResolvedValue([{ principalId: 'principal-1' }])

      await service.findAll(
        COMPANY_ID,
        { box: 'pending_approval', page: 1, limit: 20 },
        makeUser(),
      )

      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.approvalLines.some.steps.some.assigneeId).toEqual({
        in: [DRAFTER_ID, 'principal-1'],
      })
      expect(where.status).toBe('PENDING')
    })

    it('reference 박스: 상신 전(DRAFT) 문서는 제외한다 (L2)', async () => {
      await service.findAll(COMPANY_ID, { box: 'reference', page: 1, limit: 20 }, makeUser())

      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.status).toEqual({ not: 'DRAFT' })
      expect(where.approvalLines.some.steps.some).toEqual({ role: 'REFERENCE', assigneeId: DRAFTER_ID })
    })

    it('dept-docs 박스: 내가 담당자(assignee 또는 담당 부서)인 부서협조/부서수신 문서를 조회한다', async () => {
      mockPrisma.organizationDocManager.findMany.mockResolvedValue([{ organizationId: 'org-7' }])
      await service.findAll(COMPANY_ID, { box: 'dept-docs', page: 1, limit: 20 }, makeUser())

      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      const stepSome = where.approvalLines.some.steps.some
      expect(stepSome.role).toEqual({ in: ['DEPT_COLLABORATOR', 'DEPT_RECEIVER'] })
      expect(stepSome.OR).toEqual([
        { assigneeId: DRAFTER_ID },
        { organizationId: { in: ['org-7'] } },
      ])
    })

    it('dept-docs 박스: 담당 부서가 없으면 assignee 매칭만 사용한다', async () => {
      mockPrisma.organizationDocManager.findMany.mockResolvedValue([])
      await service.findAll(COMPANY_ID, { box: 'dept-docs', page: 1, limit: 20 }, makeUser())

      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.approvalLines.some.steps.some.OR).toEqual([{ assigneeId: DRAFTER_ID }])
    })

    it('ledger 박스: GENERAL_ADMIN 미만은 403', async () => {
      await expect(
        service.findAll(COMPANY_ID, { box: 'ledger', page: 1, limit: 20 }, makeUser()),
      ).rejects.toThrow(ForbiddenException)
    })

    it('ledger 박스: GENERAL_ADMIN은 회사 전체를 조회한다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'ledger', page: 1, limit: 20 },
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
    })
  })

  // ── 결재 현황 (status 박스 / 다중 삭제) ──────────────────────────────────────

  describe('결재 현황 (status 박스)', () => {
    beforeEach(() => {
      mockPrisma.document.findMany.mockResolvedValue([])
      mockPrisma.document.count.mockResolvedValue(0)
    })

    it('GENERAL_ADMIN 미만은 403', async () => {
      await expect(
        service.findAll(COMPANY_ID, { box: 'status', page: 1, limit: 20 }, makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_STATUS_FORBIDDEN' } })
    })

    it('상태 미지정: PENDING/REJECTED만 조회한다 (상신/진행중/반려)', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'status', page: 1, limit: 20 },
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.status).toEqual({ in: ['PENDING', 'REJECTED'] })
    })

    it('SUBMITTED: PENDING + 액티드 step 없음(none) 조건을 건다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'status', status: 'SUBMITTED', page: 1, limit: 20 },
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.status).toBe('PENDING')
      expect(where.approvalLines.none.steps.some.status.in).toEqual(
        expect.arrayContaining(['APPROVED', 'PROXY_APPROVED', 'PRE_APPROVED']),
      )
    })

    it('IN_PROGRESS: PENDING + 액티드 step 있음(some) 조건을 건다', async () => {
      await service.findAll(
        COMPANY_ID,
        { box: 'status', status: 'IN_PROGRESS', page: 1, limit: 20 },
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.status).toBe('PENDING')
      expect(where.approvalLines.some.steps.some.status.in).toEqual(
        expect.arrayContaining(['APPROVED', 'PROXY_APPROVED', 'PRE_APPROVED']),
      )
    })

    it('formId·상신일 기간 필터를 where에 반영한다', async () => {
      await service.findAll(
        COMPANY_ID,
        {
          box: 'status',
          status: 'REJECTED',
          formId: 'form-x',
          dateFrom: '2026-06-01',
          dateTo: '2026-06-14',
          page: 1,
          limit: 20,
        },
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )
      const where = mockPrisma.document.findMany.mock.calls[0][0].where
      expect(where.status).toBe('REJECTED')
      expect(where.formId).toBe('form-x')
      expect(where.submittedAt.gte).toEqual(new Date('2026-06-01T00:00:00.000Z'))
      expect(where.submittedAt.lte).toEqual(new Date('2026-06-14T23:59:59.999Z'))
    })

    it('항목 매핑: phase(상신/진행중)와 현재 결재자를 파생한다', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'd1',
          docNumber: 'DOC-1',
          title: '미처리',
          status: 'PENDING',
          submittedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
          form: { id: FORM_ID, name: '지출' },
          drafter: { id: DRAFTER_ID, name: '기안자' },
          approvalLines: [
            {
              steps: [
                {
                  id: 's1',
                  role: 'APPROVER',
                  status: 'PENDING',
                  stepOrder: 0,
                  assigneeId: 'a1',
                  assignee: { id: 'a1', name: '결재자A' },
                },
              ],
            },
          ],
        },
        {
          id: 'd2',
          docNumber: 'DOC-2',
          title: '일부승인',
          status: 'PENDING',
          submittedAt: new Date(),
          completedAt: null,
          createdAt: new Date(),
          form: { id: FORM_ID, name: '지출' },
          drafter: { id: DRAFTER_ID, name: '기안자' },
          approvalLines: [
            {
              steps: [
                {
                  id: 's1',
                  role: 'APPROVER',
                  status: 'APPROVED',
                  stepOrder: 0,
                  assigneeId: 'a1',
                  assignee: { id: 'a1', name: '결재자A' },
                },
                {
                  id: 's2',
                  role: 'APPROVER',
                  status: 'PENDING',
                  stepOrder: 1,
                  assigneeId: 'a2',
                  assignee: { id: 'a2', name: '결재자B' },
                },
              ],
            },
          ],
        },
      ])
      mockPrisma.document.count.mockResolvedValue(2)

      const result = await service.findAll(
        COMPANY_ID,
        { box: 'status', page: 1, limit: 20 },
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )

      expect(result.items[0]).toMatchObject({
        phase: 'SUBMITTED',
        currentApprover: { id: 'a1', name: '결재자A' },
      })
      expect(result.items[1]).toMatchObject({
        phase: 'IN_PROGRESS',
        currentApprover: { id: 'a2', name: '결재자B' },
      })
    })
  })

  describe('bulkForceDelete', () => {
    it('GENERAL_ADMIN 미만은 403', async () => {
      await expect(
        service.bulkForceDelete(COMPANY_ID, ['d1'], makeUser()),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_FORCE_DELETE_FORBIDDEN' } })
    })

    it('PENDING/REJECTED만 삭제하고 그 외 상태·HR연동·미존재는 skipped로 분류한다', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        { id: 'd-pending', status: 'PENDING' },
        { id: 'd-rejected', status: 'REJECTED' },
        { id: 'd-approved', status: 'APPROVED' },
        { id: 'd-linked', status: 'PENDING' },
      ])
      mockPrisma.request.findMany.mockResolvedValue([{ documentId: 'd-linked' }])
      mockPrisma.document.deleteMany.mockResolvedValue({ count: 2 })
      mockPrisma.approvalHistory.deleteMany.mockResolvedValue({ count: 0 })

      const result = await service.bulkForceDelete(
        COMPANY_ID,
        ['d-pending', 'd-rejected', 'd-approved', 'd-linked', 'd-missing'],
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )

      expect(result.deletedCount).toBe(2)
      expect(result.deletedIds).toEqual(expect.arrayContaining(['d-pending', 'd-rejected']))
      const reasons = Object.fromEntries(result.skipped.map((s) => [s.id, s.reason]))
      expect(reasons).toEqual({
        'd-approved': 'STATUS_NOT_DELETABLE',
        'd-linked': 'LINKED_TO_REQUEST',
        'd-missing': 'NOT_FOUND',
      })
      expect(mockPrisma.document.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: expect.arrayContaining(['d-pending', 'd-rejected']) }, companyId: COMPANY_ID },
      })
    })

    it('삭제 대상이 없으면 트랜잭션을 실행하지 않는다', async () => {
      mockPrisma.document.findMany.mockResolvedValue([{ id: 'd-approved', status: 'APPROVED' }])
      mockPrisma.request.findMany.mockResolvedValue([])

      const result = await service.bulkForceDelete(
        COMPANY_ID,
        ['d-approved'],
        makeUser(AccessLevel.GENERAL_ADMIN, 'admin-1'),
      )

      expect(result.deletedCount).toBe(0)
      expect(mockPrisma.document.deleteMany).not.toHaveBeenCalled()
    })
  })

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('결재 관계자가 아닌 일반 직원은 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({
          approvalLines: [{ steps: [{ assigneeId: 'approver-1', proxyId: null }] }],
          history: [],
        }),
      )

      await expect(
        service.findOne(COMPANY_ID, DOCUMENT_ID, makeUser(AccessLevel.EMPLOYEE, 'stranger-1')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_ACCESS_FORBIDDEN' } })
    })

    it('결재 단계 담당자는 열람할 수 있다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeDocument({
          approvalLines: [{ steps: [{ assigneeId: 'approver-1', proxyId: null }] }],
          history: [],
        }),
      )

      const result = await service.findOne(
        COMPANY_ID,
        DOCUMENT_ID,
        makeUser(AccessLevel.EMPLOYEE, 'approver-1'),
      )

      expect(result.id).toBe(DOCUMENT_ID)
    })
  })

  // ── AP-02-08 공람/참조 사후 추가 ───────────────────────────────────────────────
  describe('addCcSteps', () => {
    const makeApprovedDoc = (overrides: Record<string, unknown> = {}) =>
      makeDocument({
        status: 'APPROVED',
        approvalLines: [
          {
            id: 'line-1',
            steps: [
              { role: 'APPROVER', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' },
            ],
          },
        ],
        ...overrides,
      })

    it('기안자가 진행/완료 문서에 공람자(VIEWER)를 추가하면 PENDING 단계로 append된다', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeApprovedDoc({ drafter: { id: DRAFTER_ID, name: '기안자' }, history: [] }))

      await service.addCcSteps(
        COMPANY_ID,
        DOCUMENT_ID,
        { steps: [{ role: 'VIEWER', assigneeId: 'viewer-1' }] },
        makeUser(AccessLevel.EMPLOYEE, DRAFTER_ID),
      )

      expect(mockPrisma.approvalStep.createMany).toHaveBeenCalledWith({
        data: [
          { lineId: 'line-1', role: 'VIEWER', assigneeId: 'viewer-1', stepOrder: 1, status: 'PENDING' },
        ],
      })
    })

    it('DRAFT 문서에는 추가할 수 없다 (DOCUMENT_CC_NOT_ALLOWED)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeApprovedDoc({ status: 'DRAFT' }))

      await expect(
        service.addCcSteps(
          COMPANY_ID,
          DOCUMENT_ID,
          { steps: [{ role: 'VIEWER', assigneeId: 'viewer-1' }] },
          makeUser(AccessLevel.EMPLOYEE, DRAFTER_ID),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockPrisma.approvalStep.createMany).not.toHaveBeenCalled()
    })

    it('기안자도 결재 참여자도 아니면 거부된다 (DOCUMENT_CC_FORBIDDEN)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(makeApprovedDoc())

      await expect(
        service.addCcSteps(
          COMPANY_ID,
          DOCUMENT_ID,
          { steps: [{ role: 'REFERENCE', assigneeId: 'ref-9' }] },
          makeUser(AccessLevel.EMPLOYEE, 'stranger-1'),
        ),
      ).rejects.toThrow(ForbiddenException)
    })

    it('이미 지정된 대상은 중복 추가되지 않는다 (DOCUMENT_CC_DUPLICATE)', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(
        makeApprovedDoc({
          approvalLines: [
            {
              id: 'line-1',
              steps: [
                { role: 'APPROVER', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' },
                { role: 'VIEWER', assigneeId: 'viewer-1', stepOrder: 1, status: 'PENDING' },
              ],
            },
          ],
        }),
      )

      await expect(
        service.addCcSteps(
          COMPANY_ID,
          DOCUMENT_ID,
          { steps: [{ role: 'VIEWER', assigneeId: 'viewer-1' }] },
          makeUser(AccessLevel.EMPLOYEE, DRAFTER_ID),
        ),
      ).rejects.toThrow(BadRequestException)
      expect(mockPrisma.approvalStep.createMany).not.toHaveBeenCalled()
    })

    it('존재하지 않는 문서는 404', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null)

      await expect(
        service.addCcSteps(
          COMPANY_ID,
          DOCUMENT_ID,
          { steps: [{ role: 'VIEWER', assigneeId: 'viewer-1' }] },
          makeUser(AccessLevel.EMPLOYEE, DRAFTER_ID),
        ),
      ).rejects.toThrow(NotFoundException)
    })
  })
})
