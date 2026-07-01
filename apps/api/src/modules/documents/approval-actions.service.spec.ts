import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { ApprovalActionsService } from './approval-actions.service'
import { ApprovalSupportService } from './approval-support.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { AuditService } from '../audit/audit.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const DOCUMENT_ID = 'document-1'

const actor = (employeeId: string): JwtPayload => ({
  sub: 'user-1',
  employeeId,
  companyId: COMPANY_ID,
  accessLevel: AccessLevel.EMPLOYEE,
})

type StepFixture = {
  id: string
  lineId: string
  role: string
  assigneeId: string
  stepOrder: number
  status: string
  isProxy: boolean
  proxyId: string | null
}

const makeStep = (overrides: Partial<StepFixture>): StepFixture => ({
  id: 'step-x',
  lineId: 'line-1',
  role: 'APPROVER',
  assigneeId: 'approver-x',
  stepOrder: 0,
  status: 'WAITING',
  isProxy: false,
  proxyId: null,
  ...overrides,
})

// 3단계 결재 + 수신자 1명 기본 결재선
const makeSteps = (): StepFixture[] => [
  makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' }),
  makeStep({ id: 'step-2', assigneeId: 'approver-2', stepOrder: 1, status: 'PENDING' }),
  makeStep({ id: 'step-3', assigneeId: 'approver-3', stepOrder: 2, status: 'WAITING' }),
  makeStep({ id: 'step-r', role: 'RECEIVER', assigneeId: 'recv-1', stepOrder: 3, status: 'WAITING' }),
]

const makeDocument = (overrides: Record<string, unknown> = {}, steps = makeSteps()) => ({
  id: DOCUMENT_ID,
  companyId: COMPANY_ID,
  requestId: null,
  status: 'PENDING',
  drafterId: 'drafter-1',
  title: '지출 결의서',
  form: { allowReDraft: false, allowPreApproval: false },
  approvalLines: [{ id: 'line-1', steps }],
  ...overrides,
})

// ── 모킹 ───────────────────────────────────────────────────────────────────────

const mockPrisma = {
  document: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  approvalStep: {
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  approvalHistory: {
    create: jest.fn(),
  },
  proxySettings: {
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockEvents = { emit: jest.fn() }
const mockSettings = { get: jest.fn().mockResolvedValue(true) }

describe('ApprovalActionsService', () => {
  let service: ApprovalActionsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalActionsService,
        ApprovalSupportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: CompanySettingsService, useValue: mockSettings },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile()

    service = module.get<ApprovalActionsService>(ApprovalActionsService)
    jest.clearAllMocks()
    mockSettings.get.mockResolvedValue(true)

    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
    )
    mockPrisma.approvalStep.update.mockResolvedValue({})
    mockPrisma.approvalStep.updateMany.mockResolvedValue({ count: 0 })
    mockPrisma.approvalHistory.create.mockResolvedValue({})
    mockPrisma.document.update.mockImplementation(async ({ data }: { data: object }) => ({
      id: DOCUMENT_ID,
      ...data,
    }))
  })

  // ── approve ──────────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('중간 단계 승인: 다음 결재 단계를 PENDING으로 만들고 step_pending을 emit한다', async () => {
      const doc = makeDocument()
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(doc) // loadActionTarget
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' }) // progressFlow 재조회

      await service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2'))

      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ status: 'APPROVED', isProxy: false }),
        }),
      )
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-3' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      )
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'APPROVE' }),
      })
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.step_pending',
        expect.objectContaining({ assigneeId: 'approver-3' }),
      )
    })

    it('마지막 단계 승인: 문서 APPROVED + RECEIVER 단계 활성화 + document.approved emit', async () => {
      // step-3까지 승인 완료, 마지막 결재자 approver-3 차례
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' }),
        makeStep({ id: 'step-2', assigneeId: 'approver-2', stepOrder: 1, status: 'APPROVED' }),
        makeStep({ id: 'step-3', assigneeId: 'approver-3', stepOrder: 2, status: 'PENDING' }),
        makeStep({ id: 'step-r', role: 'RECEIVER', assigneeId: 'recv-1', stepOrder: 3, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({}, steps))

      const result = await service.approve(
        COMPANY_ID, DOCUMENT_ID, 'step-3', {}, actor('approver-3'),
      )

      expect(result.status).toBe('APPROVED')
      expect(mockPrisma.approvalStep.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          role: { in: ['RECEIVER', 'DEPT_RECEIVER'] },
          status: 'WAITING',
        }),
        data: { status: 'PENDING' },
      })
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.approved',
        expect.objectContaining({ documentId: DOCUMENT_ID }),
      )
    })

    it('PENDING이 아닌 단계 승인 시도 → APPROVAL_STEP_NOT_CURRENT 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.approve(COMPANY_ID, DOCUMENT_ID, 'step-3', {}, actor('approver-3')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_STEP_NOT_CURRENT' } })
    })

    it('담당자도 대리인도 아니면 APPROVAL_STEP_NOT_ASSIGNEE 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())
      mockPrisma.proxySettings.findFirst.mockResolvedValue(null)

      await expect(
        service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('stranger-1')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_STEP_NOT_ASSIGNEE' } })
    })

    it('HR 요청 연동 문서는 DOCUMENT_MANAGED_BY_REQUEST 400으로 거부한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({ requestId: 'req-1' }))

      await expect(
        service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_MANAGED_BY_REQUEST' } })
    })

    it('타사 문서는 404', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(null)

      await expect(
        service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── 대결 (ProxySettings) ─────────────────────────────────────────────────────

  describe('대결', () => {
    it('유효한 ProxySettings 보유 대리인은 PROXY_APPROVED로 처리된다', async () => {
      const today = new Date()
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(makeDocument())
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' })
      mockPrisma.proxySettings.findFirst.mockResolvedValue({
        principalId: 'approver-2',
        proxyId: 'deputy-1',
        isActive: true,
        startDate: new Date(today.getTime() - 86400000),
        endDate: new Date(today.getTime() + 86400000),
      })

      await service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('deputy-1'))

      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({
            status: 'PROXY_APPROVED',
            isProxy: true,
            proxyId: 'deputy-1',
          }),
        }),
      )
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'PROXY_APPROVE' }),
      })
    })

    it('기간이 지난 ProxySettings면 APPROVAL_PROXY_EXPIRED 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())
      mockPrisma.proxySettings.findFirst.mockResolvedValue({
        principalId: 'approver-2',
        proxyId: 'deputy-1',
        isActive: true,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      })

      await expect(
        service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('deputy-1')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_PROXY_EXPIRED' } })
    })
  })

  // ── reject ───────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('반려: 문서 REJECTED, 남은 결재·수신 단계 CANCELLED', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      const result = await service.reject(
        COMPANY_ID, DOCUMENT_ID, 'step-2', { comment: '예산 초과' }, actor('approver-2'),
      )

      expect(result.status).toBe('REJECTED')
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ status: 'REJECTED', comment: '예산 초과' }),
        }),
      )
      expect(mockPrisma.approvalStep.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['WAITING', 'PENDING'] },
          }),
          data: { status: 'CANCELLED' },
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.rejected',
        expect.objectContaining({ documentId: DOCUMENT_ID }),
      )
    })
  })

  // ── pre-approve (전결) ───────────────────────────────────────────────────────

  describe('preApprove', () => {
    it('전결: 이후 결재 단계 SKIPPED + 문서 즉시 APPROVED + RECEIVER 활성화', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(
        makeDocument({ form: { allowReDraft: false, allowPreApproval: true } }),
      )

      const result = await service.preApprove(
        COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2'),
      )

      expect(result.status).toBe('APPROVED')
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ status: 'PRE_APPROVED' }),
        }),
      )
      // 이후 결재 단계 SKIPPED (부서협조 포함 — 전결은 남은 흐름 전체를 건너뜀)
      expect(mockPrisma.approvalStep.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { in: ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR'] },
          }),
          data: { status: 'SKIPPED' },
        }),
      )
      // RECEIVER 활성화 (RECEIVER + 부서수신)
      expect(mockPrisma.approvalStep.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: { in: ['RECEIVER', 'DEPT_RECEIVER'] } }),
          data: { status: 'PENDING' },
        }),
      )
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'PRE_APPROVE' }),
      })
    })

    it('form.allowPreApproval=false면 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.preApprove(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_PRE_APPROVAL_NOT_ALLOWED' } })
    })
  })

  // ── return-prev (전단계 반려) ────────────────────────────────────────────────

  describe('returnToPrevious', () => {
    it('전단계 반려: 현재 RETURNED, 직전 결재자 PENDING 복원', async () => {
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(makeDocument())
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' })

      await service.returnToPrevious(
        COMPANY_ID, DOCUMENT_ID, 'step-2', { comment: '재검토 요망' }, actor('approver-2'),
      )

      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ status: 'RETURNED' }),
        }),
      )
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({ status: 'PENDING', actedAt: null, comment: null }),
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.step_pending',
        expect.objectContaining({ assigneeId: 'approver-1' }),
      )
    })

    it('회사 정책상 전단계 반려 비활성 시 APPROVAL_PREV_REJECT_DISABLED 400', async () => {
      mockSettings.get.mockResolvedValue(false)
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.returnToPrevious(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_PREV_REJECT_DISABLED' } })
      expect(mockPrisma.approvalStep.update).not.toHaveBeenCalled()
    })

    it('첫 결재 단계면 APPROVAL_STEP_NO_PREVIOUS 400', async () => {
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'PENDING' }),
        makeStep({ id: 'step-2', assigneeId: 'approver-2', stepOrder: 1, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({}, steps))

      await expect(
        service.returnToPrevious(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('approver-1')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_STEP_NO_PREVIOUS' } })
    })

    it('전단계 반려 후 직전 결재자 재승인 시 RETURNED 단계가 다시 PENDING이 된다', async () => {
      // step-1이 PENDING으로 복원, step-2가 RETURNED 상태인 시나리오
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'PENDING' }),
        makeStep({ id: 'step-2', assigneeId: 'approver-2', stepOrder: 1, status: 'RETURNED' }),
        makeStep({ id: 'step-3', assigneeId: 'approver-3', stepOrder: 2, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(makeDocument({}, steps))
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' })

      await service.approve(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('approver-1'))

      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      )
    })
  })

  // ── cancel-approval (결재취소) ───────────────────────────────────────────────

  describe('cancelApproval', () => {
    it('다음 결재자 처리 전이면 본인 단계 PENDING 복원 + 다음 단계 WAITING', async () => {
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(makeDocument())
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' })

      await service.cancelApproval(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('approver-1'))

      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({ status: 'PENDING', actedAt: null }),
        }),
      )
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: { status: 'WAITING' },
        }),
      )
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'CANCEL_APPROVAL' }),
      })
    })

    it('이후 단계가 이미 처리됐으면 DOCUMENT_CANNOT_CANCEL 400', async () => {
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' }),
        makeStep({ id: 'step-2', assigneeId: 'approver-2', stepOrder: 1, status: 'APPROVED' }),
        makeStep({ id: 'step-3', assigneeId: 'approver-3', stepOrder: 2, status: 'PENDING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({}, steps))

      await expect(
        service.cancelApproval(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('approver-1')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_CANNOT_CANCEL' } })
    })

    it('문서가 이미 APPROVED면 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({ status: 'APPROVED' }))

      await expect(
        service.cancelApproval(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('approver-1')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_CANNOT_CANCEL' } })
    })

    it('본인이 처리한 단계가 아니면 403', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.cancelApproval(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('approver-2')),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ── agree / view / receive ───────────────────────────────────────────────────

  describe('agree / view / receive', () => {
    it('협조 승인: AGREEMENT 단계를 승인과 동일하게 진행한다', async () => {
      const steps = [
        makeStep({ id: 'step-1', role: 'AGREEMENT', assigneeId: 'agree-1', stepOrder: 0, status: 'PENDING' }),
        makeStep({ id: 'step-2', assigneeId: 'approver-2', stepOrder: 1, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(makeDocument({}, steps))
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' })

      await service.agree(COMPANY_ID, DOCUMENT_ID, 'step-1', {}, actor('agree-1'))

      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'AGREE' }),
      })
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      )
    })

    it('APPROVER 단계에 agree 시도 → APPROVAL_STEP_ROLE_MISMATCH 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.agree(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_STEP_ROLE_MISMATCH' } })
    })

    it('참조 확인: VIEWED 처리되고 문서 흐름에 영향 없다', async () => {
      const steps = [
        makeStep({ id: 'step-ref', role: 'REFERENCE', assigneeId: 'ref-1', stepOrder: 0, status: 'PENDING' }),
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 1, status: 'PENDING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({}, steps))
      mockPrisma.approvalStep.update.mockResolvedValue({ id: 'step-ref', status: 'VIEWED' })

      const result = await service.view(COMPANY_ID, DOCUMENT_ID, 'step-ref', {}, actor('ref-1'))

      expect(result.status).toBe('VIEWED')
      expect(mockPrisma.document.update).not.toHaveBeenCalled()
    })

    it('수신 처리: 문서가 APPROVED가 아니면 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.receive(COMPANY_ID, DOCUMENT_ID, 'step-r', {}, actor('recv-1')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_APPROVED' } })
    })

    it('수신 처리: APPROVED 문서의 RECEIVER PENDING 단계를 RECEIVED로 처리한다', async () => {
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' }),
        makeStep({ id: 'step-r', role: 'RECEIVER', assigneeId: 'recv-1', stepOrder: 1, status: 'PENDING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(
        makeDocument({ status: 'APPROVED' }, steps),
      )
      mockPrisma.approvalStep.update.mockResolvedValue({ id: 'step-r', status: 'RECEIVED' })

      const result = await service.receive(COMPANY_ID, DOCUMENT_ID, 'step-r', {}, actor('recv-1'))

      expect(result.status).toBe('RECEIVED')
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'RECEIVE' }),
      })
    })
  })

  // ── 부서협조 / 부서수신 (G14) ───────────────────────────────────────────────

  describe('부서협조 (deptCollab)', () => {
    it('부서협조 완료: DEPT_COLLABORATOR 단계를 APPROVED 처리하고 다음 결재 단계를 활성화한다', async () => {
      const steps = [
        makeStep({
          id: 'step-dc',
          role: 'DEPT_COLLABORATOR',
          assigneeId: 'dept-mgr-1', // 상신 시 부서 문서담당자로 해석된 assignee
          stepOrder: 0,
          status: 'PENDING',
        }),
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 1, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst
        .mockResolvedValueOnce(makeDocument({}, steps))
        .mockResolvedValue({ id: DOCUMENT_ID, status: 'PENDING' })

      await service.deptCollab(COMPANY_ID, DOCUMENT_ID, 'step-dc', {}, actor('dept-mgr-1'))

      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-dc' },
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'DEPT_COLLAB' }),
      })
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-1' },
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.step_pending',
        expect.objectContaining({ assigneeId: 'approver-1' }),
      )
    })

    it('부서협조 반려는 /reject로 처리된다 (DEPT_COLLABORATOR도 흐름 role)', async () => {
      const steps = [
        makeStep({
          id: 'step-dc',
          role: 'DEPT_COLLABORATOR',
          assigneeId: 'dept-mgr-1',
          stepOrder: 0,
          status: 'PENDING',
        }),
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 1, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({}, steps))

      const result = await service.reject(
        COMPANY_ID, DOCUMENT_ID, 'step-dc', { comment: '부서 검토 불가' }, actor('dept-mgr-1'),
      )

      expect(result.status).toBe('REJECTED')
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.rejected',
        expect.objectContaining({ documentId: DOCUMENT_ID }),
      )
    })

    it('APPROVER 단계에 deptCollab 시도 → APPROVAL_STEP_ROLE_MISMATCH 400', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument())

      await expect(
        service.deptCollab(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_STEP_ROLE_MISMATCH' } })
    })
  })

  describe('부서수신 (receive / bounce)', () => {
    const makeApprovedWithDeptReceiver = (status = 'PENDING') =>
      makeDocument({ status: 'APPROVED' }, [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' }),
        makeStep({
          id: 'step-dr',
          role: 'DEPT_RECEIVER',
          assigneeId: 'dept-mgr-2',
          stepOrder: 1,
          status,
        }),
      ])

    it('부서수신 수신확인: DEPT_RECEIVER PENDING 단계를 RECEIVED로 처리한다', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeApprovedWithDeptReceiver())
      mockPrisma.approvalStep.update.mockResolvedValue({ id: 'step-dr', status: 'RECEIVED' })

      const result = await service.receive(COMPANY_ID, DOCUMENT_ID, 'step-dr', {}, actor('dept-mgr-2'))

      expect(result.status).toBe('RECEIVED')
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'RECEIVE' }),
      })
    })

    it('부서수신 반송: BOUNCED 처리 + document.bounced emit (문서 상태 유지)', async () => {
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeApprovedWithDeptReceiver())
      mockPrisma.approvalStep.update.mockResolvedValue({ id: 'step-dr', status: 'BOUNCED' })

      const result = await service.bounce(
        COMPANY_ID, DOCUMENT_ID, 'step-dr', { comment: '담당 부서 아님' }, actor('dept-mgr-2'),
      )

      expect(result.status).toBe('BOUNCED')
      expect(mockPrisma.approvalStep.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-dr' },
          data: expect.objectContaining({ status: 'BOUNCED', comment: '담당 부서 아님' }),
        }),
      )
      expect(mockPrisma.approvalHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'BOUNCE' }),
      })
      expect(mockPrisma.document.update).not.toHaveBeenCalled() // 문서 상태 변경 없음
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'document.bounced',
        expect.objectContaining({ documentId: DOCUMENT_ID, drafterId: 'drafter-1' }),
      )
    })

    it('미승인 문서 반송 시도 → DOCUMENT_NOT_APPROVED 400', async () => {
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'PENDING' }),
        makeStep({ id: 'step-dr', role: 'DEPT_RECEIVER', assigneeId: 'dept-mgr-2', stepOrder: 1, status: 'WAITING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({}, steps))

      await expect(
        service.bounce(COMPANY_ID, DOCUMENT_ID, 'step-dr', {}, actor('dept-mgr-2')),
      ).rejects.toMatchObject({ response: { code: 'DOCUMENT_NOT_APPROVED' } })
    })

    it('일반 RECEIVER 단계에 bounce 시도 → APPROVAL_STEP_ROLE_MISMATCH 400', async () => {
      const steps = [
        makeStep({ id: 'step-1', assigneeId: 'approver-1', stepOrder: 0, status: 'APPROVED' }),
        makeStep({ id: 'step-r', role: 'RECEIVER', assigneeId: 'recv-1', stepOrder: 1, status: 'PENDING' }),
      ]
      mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({ status: 'APPROVED' }, steps))

      await expect(
        service.bounce(COMPANY_ID, DOCUMENT_ID, 'step-r', {}, actor('recv-1')),
      ).rejects.toMatchObject({ response: { code: 'APPROVAL_STEP_ROLE_MISMATCH' } })
    })
  })

  // ── 문서 상태 가드 ───────────────────────────────────────────────────────────

  it('PENDING이 아닌 문서에 approve 시도 → DOCUMENT_NOT_PENDING 400', async () => {
    mockPrisma.document.findFirst.mockResolvedValueOnce(makeDocument({ status: 'DRAFT' }))

    await expect(
      service.approve(COMPANY_ID, DOCUMENT_ID, 'step-2', {}, actor('approver-2')),
    ).rejects.toThrow(BadRequestException)
  })
})
