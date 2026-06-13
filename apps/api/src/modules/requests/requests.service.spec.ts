import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { RequestsService } from './requests.service'
import { PrismaService } from '../../prisma/prisma.service'
import { LeavesService } from '../leaves/leaves.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const EMPLOYEE_ID = 'employee-1'
const APPROVER_ID = 'approver-1'
const REQUEST_ID = 'request-1'
const DOCUMENT_ID = 'document-1'

const makeRequester = (
  accessLevel: AccessLevel,
  employeeId = EMPLOYEE_ID,
): JwtPayload => ({
  sub: 'user-1',
  employeeId,
  companyId: COMPANY_ID,
  accessLevel,
})

const makeApprover = (): JwtPayload => makeRequester(AccessLevel.GENERAL_ADMIN, APPROVER_ID)
const makeSuperAdmin = (): JwtPayload => makeRequester(AccessLevel.SUPER_ADMIN, 'super-1')

const basePendingRequest = {
  id: REQUEST_ID,
  companyId: COMPANY_ID,
  requesterId: EMPLOYEE_ID,
  type: 'LEAVE_CREATE',
  payload: { leaveTypeId: 'lt-1', startDate: '2026-06-15', endDate: '2026-06-15' },
  status: 'PENDING',
  documentId: DOCUMENT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const baseApprovalRule = {
  id: 'rule-1',
  companyId: COMPANY_ID,
  name: '연차 승인 규칙',
  requestType: 'LEAVE_CREATE',
  maxApprovalRounds: 1,
  isAutoApprove: false,
  priority: 0,
  scopeOrgIds: null,
  scopePositionIds: null,
  isActive: true,
  details: [],
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────

const mockPrisma = {
  request: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  requestApproval: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  approvalRule: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  approvalRuleDetail: {
    deleteMany: jest.fn(),
  },
  approvalLine: {
    create: jest.fn(),
  },
  approvalStep: {
    create: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  document: {
    create: jest.fn(),
    update: jest.fn(),
  },
  documentForm: {
    findFirst: jest.fn(),
  },
  employee: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  leaveType: {
    findFirst: jest.fn(),
  },
  leaveBalance: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  leave: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  employeeOrganization: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  shift: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  shiftTemplate: {
    findFirst: jest.fn(),
  },
  shiftType: {
    findFirst: jest.fn(),
  },
  attendance: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockEvents = { emit: jest.fn() }

const mockLeavesService = { validateBalance: jest.fn() }

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('RequestsService', () => {
  let service: RequestsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: LeavesService, useValue: mockLeavesService },
      ],
    }).compile()

    service = module.get<RequestsService>(RequestsService)
    jest.clearAllMocks()

    // LEAVE_CREATE 적용 파이프라인 기본 mock: 잔액 충분
    mockLeavesService.validateBalance.mockResolvedValue(undefined)
    mockPrisma.leaveType.findFirst.mockResolvedValue({
      id: 'lt-1',
      groupId: 'lg-1',
      deductionDays: 1,
      isActive: true,
    })
    mockPrisma.leaveBalance.findUnique.mockResolvedValue({
      id: 'bal-1',
      employeeId: EMPLOYEE_ID,
      leaveTypeId: 'lt-1',
      year: new Date().getFullYear(),
      remainingDays: 10,
      usedDays: 0,
      expiresAt: null,
    })
    mockPrisma.leave.create.mockResolvedValue({ id: 'leave-1' })
    mockPrisma.leaveBalance.update.mockResolvedValue({})
  })

  // ── createRequest ────────────────────────────────────────────────────────────

  describe('createRequest', () => {
    it('승인 규칙이 없으면 자동승인하지 않고 기본 결재선으로 PENDING 문서를 생성한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE_CREATE' as const, payload: { leaveTypeId: 'lt-1', startDate: '2026-06-15', endDate: '2026-06-15' } }

      const createdRequest = { ...basePendingRequest, documentId: null }

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )

      mockPrisma.request.create.mockResolvedValue(createdRequest)
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: EMPLOYEE_ID,
        companyId: COMPANY_ID,
        name: '홍길동',
        organizations: [{ organizationId: 'org-1' }],
        positions: [],
      })
      // 승인 규칙 없음 → 기본 결재선
      mockPrisma.approvalRule.findMany.mockResolvedValue([])
      mockPrisma.documentForm.findFirst.mockResolvedValue({
        id: 'form-1',
        companyId: COMPANY_ID,
        category: 'leave_request',
      })
      mockPrisma.document.create.mockResolvedValue({ id: DOCUMENT_ID, companyId: COMPANY_ID })
      mockPrisma.approvalLine.create.mockResolvedValue({ id: 'line-1', documentId: DOCUMENT_ID })
      mockPrisma.approvalStep.create.mockResolvedValue({})
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest })

      const result = await service.createRequest(COMPANY_ID, dto, requester)

      expect(result.status).toBe('PENDING')
      expect(mockPrisma.document.create).toHaveBeenCalled()
      expect(mockPrisma.approvalStep.create).toHaveBeenCalled()
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.requested',
        expect.objectContaining({ requestId: REQUEST_ID }),
      )
    })

    it('isAutoApprove 규칙이면 자동 승인되고 leave.approved 이벤트를 emit한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE_CREATE' as const, payload: { leaveTypeId: 'lt-1', startDate: '2026-06-15', endDate: '2026-06-15' } }

      const createdRequest = { ...basePendingRequest, documentId: null }

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )

      mockPrisma.request.create.mockResolvedValue(createdRequest)
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: EMPLOYEE_ID,
        companyId: COMPANY_ID,
        name: '홍길동',
        organizations: [{ organizationId: 'org-1' }],
        positions: [],
      })
      mockPrisma.approvalRule.findMany.mockResolvedValue([
        { ...baseApprovalRule, isAutoApprove: true },
      ])
      mockPrisma.request.update.mockResolvedValue({ ...createdRequest, status: 'APPROVED' })

      const result = await service.createRequest(COMPANY_ID, dto, requester)

      expect(result.status).toBe('APPROVED')
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.approved',
        expect.objectContaining({ requestId: REQUEST_ID, autoApproved: true }),
      )
    })

    it('승인 규칙 있으면 Document + ApprovalLine + ApprovalStep을 생성하고 이벤트를 emit한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE_CREATE' as const, payload: { leaveTypeId: 'lt-1', startDate: '2026-06-15', endDate: '2026-06-15' } }

      const createdRequest = { ...basePendingRequest, documentId: null }
      const createdDocument = { id: DOCUMENT_ID, companyId: COMPANY_ID }
      const createdLine = { id: 'line-1', documentId: DOCUMENT_ID }
      const finalRequest = { ...basePendingRequest }

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )

      mockPrisma.request.create.mockResolvedValue(createdRequest)
      mockPrisma.employee.findFirst.mockResolvedValueOnce({
        id: EMPLOYEE_ID,
        companyId: COMPANY_ID,
        name: '홍길동',
        organizations: [{ organizationId: 'org-1' }],
        positions: [],
      })
      mockPrisma.approvalRule.findMany.mockResolvedValue([baseApprovalRule])
      mockPrisma.documentForm.findFirst.mockResolvedValue({
        id: 'form-1',
        companyId: COMPANY_ID,
        category: 'leave_request',
      })
      mockPrisma.document.create.mockResolvedValue(createdDocument)
      mockPrisma.approvalLine.create.mockResolvedValue(createdLine)
      mockPrisma.request.update.mockResolvedValue(finalRequest)

      const result = await service.createRequest(COMPANY_ID, dto, requester)

      expect(mockPrisma.document.create).toHaveBeenCalled()
      expect(mockPrisma.approvalLine.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documentId: DOCUMENT_ID }),
        }),
      )
      expect(mockPrisma.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({ documentId: DOCUMENT_ID }),
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.requested',
        expect.objectContaining({ requestId: REQUEST_ID }),
      )
      expect(result).toEqual(finalRequest)
    })

    it('DocumentForm이 없으면 Document 없이 PENDING 요청만 생성된다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'CUSTOM' as const, payload: {} }

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )

      mockPrisma.request.create.mockResolvedValue({ ...basePendingRequest, documentId: null })
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: EMPLOYEE_ID,
        companyId: COMPANY_ID,
        name: '홍길동',
        organizations: [],
        positions: [],
      })
      mockPrisma.approvalRule.findMany.mockResolvedValue([baseApprovalRule])
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, documentId: null })

      const result = await service.createRequest(COMPANY_ID, dto, requester)

      expect(result.status).toBe('PENDING')
      expect(mockPrisma.document.create).not.toHaveBeenCalled()
    })

    it('비활성화된 휴가 유형으로 신청하면 LEAVE_TYPE_INACTIVE로 차단한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE_CREATE' as const, payload: { leaveTypeId: 'lt-1', startDate: '2026-06-15', endDate: '2026-06-15' } }

      // 유형은 존재하나 isActive=false → 신규 신청 차단(잔액·요청 생성 단계 진입 전)
      mockPrisma.leaveType.findFirst.mockResolvedValue({
        id: 'lt-1',
        groupId: 'lg-1',
        deductionDays: 1,
        isActive: false,
      })

      await expect(service.createRequest(COMPANY_ID, dto, requester)).rejects.toMatchObject({
        response: { code: 'LEAVE_TYPE_INACTIVE' },
      })
      expect(mockLeavesService.validateBalance).not.toHaveBeenCalled()
      expect(mockPrisma.request.create).not.toHaveBeenCalled()
    })
  })

  // ── approve ──────────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('마지막 round 승인 시 request.status가 APPROVED로 변경되고 이벤트를 emit한다', async () => {
      const requester = makeApprover()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      // GENERAL_ADMIN이므로 assertIsApprover 통과
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )
      mockPrisma.requestApproval.findFirst.mockResolvedValue(null) // round = 1
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.requestApproval.findMany.mockResolvedValue([{ status: 'APPROVED' }])
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'APPROVED' })
      mockPrisma.document.update.mockResolvedValue({})

      await service.approve(COMPANY_ID, REQUEST_ID, {}, requester)

      expect(mockPrisma.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DOCUMENT_ID },
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.approved',
        expect.objectContaining({ requestId: REQUEST_ID }),
      )
    })

    it('PENDING이 아닌 요청은 BadRequestException을 던진다', async () => {
      const requester = makeApprover()
      mockPrisma.request.findFirst.mockResolvedValue({
        ...basePendingRequest,
        status: 'APPROVED',
      })

      await expect(service.approve(COMPANY_ID, REQUEST_ID, {}, requester)).rejects.toThrow(
        BadRequestException,
      )
    })

    it('존재하지 않는 요청이면 NotFoundException을 던진다', async () => {
      const requester = makeApprover()
      mockPrisma.request.findFirst.mockResolvedValue(null)

      await expect(service.approve(COMPANY_ID, REQUEST_ID, {}, requester)).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── ORG_ADMIN 조직 스코프 (CLAUDE.md 필수 통합 테스트: 타 조직 접근 → 403) ──

  describe('approve — ORG_ADMIN 조직 스코프', () => {
    const ORG_ADMIN_ID = 'org-admin-1'
    const makeOrgAdmin = (): JwtPayload => makeRequester(AccessLevel.ORG_ADMIN, ORG_ADMIN_ID)

    /** employeeId별 소속 조직 mock 설정 */
    const mockOrgMembership = (membership: Record<string, string[]>) => {
      mockPrisma.employeeOrganization.findMany.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ where }: any) =>
          Promise.resolve(
            (membership[where.employeeId] ?? []).map((organizationId) => ({ organizationId })),
          ),
      )
    }

    it('ORG_ADMIN이 같은 조직 구성원의 요청을 승인하면 성공한다', async () => {
      const orgAdmin = makeOrgAdmin()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      // 조직 교집합 존재: ORG_ADMIN(org-1), 요청자(org-1)
      mockOrgMembership({ [ORG_ADMIN_ID]: ['org-1'], [EMPLOYEE_ID]: ['org-1'] })

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
      )
      mockPrisma.requestApproval.findFirst.mockResolvedValue(null) // round = 1
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.requestApproval.findMany.mockResolvedValue([{ status: 'APPROVED' }])
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'APPROVED' })
      mockPrisma.document.update.mockResolvedValue({})

      await service.approve(COMPANY_ID, REQUEST_ID, {}, orgAdmin)

      expect(mockPrisma.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
      // ApprovalStep assignee 검사 없이 조직 교집합만으로 통과
      expect(mockPrisma.approvalStep.findFirst).not.toHaveBeenCalled()
    })

    it('ORG_ADMIN이 타 조직 요청을 승인하면 ForbiddenException(403)을 던진다', async () => {
      const orgAdmin = makeOrgAdmin()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      // 조직 교집합 없음: ORG_ADMIN(org-1), 요청자(org-2)
      mockOrgMembership({ [ORG_ADMIN_ID]: ['org-1'], [EMPLOYEE_ID]: ['org-2'] })
      // 지명 결재자(ApprovalStep assignee)도 아님
      mockPrisma.approvalStep.findFirst.mockResolvedValue(null)

      await expect(service.approve(COMPANY_ID, REQUEST_ID, {}, orgAdmin)).rejects.toThrow(
        ForbiddenException,
      )
      expect(mockPrisma.request.update).not.toHaveBeenCalled()
    })

    it('ORG_ADMIN이 타 조직 요청이라도 ApprovalStep 지명 결재자면 승인할 수 있다', async () => {
      const orgAdmin = makeOrgAdmin()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      mockOrgMembership({ [ORG_ADMIN_ID]: ['org-1'], [EMPLOYEE_ID]: ['org-2'] })
      // 지명 결재자
      mockPrisma.approvalStep.findFirst.mockResolvedValue({ id: 'step-1', status: 'PENDING' })

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
      )
      mockPrisma.requestApproval.findFirst.mockResolvedValue(null)
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.requestApproval.findMany.mockResolvedValue([{ status: 'APPROVED' }])
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'APPROVED' })
      mockPrisma.document.update.mockResolvedValue({})

      await service.approve(COMPANY_ID, REQUEST_ID, {}, orgAdmin)

      expect(mockPrisma.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      )
    })

    it('ORG_ADMIN이 타 조직 요청을 거절해도 ForbiddenException(403)을 던진다', async () => {
      const orgAdmin = makeOrgAdmin()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      mockOrgMembership({ [ORG_ADMIN_ID]: ['org-1'], [EMPLOYEE_ID]: ['org-2'] })
      mockPrisma.approvalStep.findFirst.mockResolvedValue(null)

      await expect(
        service.reject(COMPANY_ID, REQUEST_ID, { comment: 'x' }, orgAdmin),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ── reject ───────────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('거절 시 request.status가 REJECTED로 변경되고 이벤트를 emit한다', async () => {
      const requester = makeApprover()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )
      mockPrisma.requestApproval.findFirst.mockResolvedValue(null)
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'REJECTED' })
      mockPrisma.document.update.mockResolvedValue({})

      await service.reject(COMPANY_ID, REQUEST_ID, { comment: '사유 없음' }, requester)

      expect(mockPrisma.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({ status: 'REJECTED' }),
        }),
      )
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.rejected',
        expect.objectContaining({ requestId: REQUEST_ID }),
      )
    })
  })

  // ── forceApprove ─────────────────────────────────────────────────────────────

  describe('forceApprove', () => {
    it('SUPER_ADMIN이 강제 승인하면 APPROVED 상태로 변경된다', async () => {
      const superAdmin = makeSuperAdmin()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'APPROVED' })
      mockPrisma.document.update.mockResolvedValue({})

      const result = await service.forceApprove(COMPANY_ID, REQUEST_ID, {}, superAdmin)

      expect(result.status).toBe('APPROVED')
      expect(mockPrisma.requestApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FORCE_APPROVED' }),
        }),
      )
    })

    it('SUPER_ADMIN이 아니면 ForbiddenException을 던진다', async () => {
      const generalAdmin = makeApprover()
      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)

      await expect(
        service.forceApprove(COMPANY_ID, REQUEST_ID, {}, generalAdmin),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ── forceReject ──────────────────────────────────────────────────────────────

  describe('forceReject', () => {
    it('SUPER_ADMIN이 강제 거절하면 REJECTED 상태로 변경된다', async () => {
      const superAdmin = makeSuperAdmin()

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'REJECTED' })
      mockPrisma.document.update.mockResolvedValue({})

      const result = await service.forceReject(COMPANY_ID, REQUEST_ID, { comment: '강제 거절' }, superAdmin)

      expect(result.status).toBe('REJECTED')
      expect(mockPrisma.requestApproval.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FORCE_REJECTED' }),
        }),
      )
    })

    it('SUPER_ADMIN이 아니면 ForbiddenException을 던진다', async () => {
      const employee = makeRequester(AccessLevel.EMPLOYEE)

      await expect(
        service.forceReject(COMPANY_ID, REQUEST_ID, {}, employee),
      ).rejects.toThrow(ForbiddenException)
    })
  })

  // ── bulkApprove ──────────────────────────────────────────────────────────────

  describe('bulkApprove', () => {
    it('성공한 항목과 실패한 항목을 모두 결과에 포함한다', async () => {
      const requester = makeApprover()

      // 첫 번째 요청: 성공 (PENDING)
      // 두 번째 요청: 실패 (NOT_PENDING)
      mockPrisma.request.findFirst
        .mockResolvedValueOnce(basePendingRequest)
        .mockResolvedValueOnce({ ...basePendingRequest, id: 'request-2', status: 'APPROVED' })

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )
      mockPrisma.requestApproval.findFirst.mockResolvedValue(null)
      mockPrisma.requestApproval.create.mockResolvedValue({})
      mockPrisma.requestApproval.findMany.mockResolvedValue([{ status: 'APPROVED' }])
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.request.update.mockResolvedValue({ ...basePendingRequest, status: 'APPROVED' })
      mockPrisma.document.update.mockResolvedValue({})

      const result = await service.bulkApprove(
        COMPANY_ID,
        { requestIds: [REQUEST_ID, 'request-2'] },
        requester,
      )

      expect(result.results).toHaveLength(2)
      expect(result.results[0]).toEqual({ requestId: REQUEST_ID, success: true })
      expect(result.results[1].success).toBe(false)
      expect(result.results[1].error).toBeDefined()
    })
  })

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('본인의 PENDING 요청을 취소하면 CANCELLED가 되고 document도 CANCELLED 처리된다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
      )
      mockPrisma.request.update.mockResolvedValue({
        ...basePendingRequest,
        status: 'CANCELLED',
      })
      mockPrisma.document.update.mockResolvedValue({})

      const result = await service.cancel(COMPANY_ID, REQUEST_ID, requester)

      expect(result.status).toBe('CANCELLED')
      expect(mockPrisma.request.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: { status: 'CANCELLED' },
        }),
      )
      expect(mockPrisma.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DOCUMENT_ID },
          data: { status: 'CANCELLED' },
        }),
      )
    })

    it('타인의 요청을 취소하면 ForbiddenException을 던진다', async () => {
      const otherEmployee = makeRequester(AccessLevel.EMPLOYEE, 'employee-2')

      mockPrisma.request.findFirst.mockResolvedValue(basePendingRequest)

      await expect(service.cancel(COMPANY_ID, REQUEST_ID, otherEmployee)).rejects.toThrow(
        ForbiddenException,
      )
      expect(mockPrisma.request.update).not.toHaveBeenCalled()
    })

    it('PENDING이 아닌 요청은 BadRequestException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      mockPrisma.request.findFirst.mockResolvedValue({
        ...basePendingRequest,
        status: 'APPROVED',
      })

      await expect(service.cancel(COMPANY_ID, REQUEST_ID, requester)).rejects.toThrow(
        BadRequestException,
      )
    })
  })

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('updateApprovalRule', () => {
    it('규칙 필드를 부분 수정한다 (details 미포함 시 details는 건드리지 않음)', async () => {
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
      )
      mockPrisma.approvalRule.update.mockResolvedValue({
        ...baseApprovalRule,
        name: '수정된 규칙',
      })

      const result = await service.updateApprovalRule(COMPANY_ID, 'rule-1', {
        name: '수정된 규칙',
      })

      expect(result.name).toBe('수정된 규칙')
      expect(mockPrisma.approvalRuleDetail.deleteMany).not.toHaveBeenCalled()
      expect(mockPrisma.approvalRule.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rule-1' } }),
      )
    })

    it('details 배열이 오면 기존 details를 삭제하고 재생성한다', async () => {
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => callback(mockPrisma),
      )
      mockPrisma.approvalRule.update.mockResolvedValue(baseApprovalRule)

      await service.updateApprovalRule(COMPANY_ID, 'rule-1', {
        details: [{ round: 1, requiredCount: 1, isForbidden: false, sortOrder: 0 }],
      })

      expect(mockPrisma.approvalRuleDetail.deleteMany).toHaveBeenCalledWith({
        where: { ruleId: 'rule-1' },
      })
    })

    it('타 회사 규칙이면 NotFoundException을 던진다', async () => {
      mockPrisma.approvalRule.findFirst.mockResolvedValue(null)

      await expect(
        service.updateApprovalRule('other-company', 'rule-1', { name: 'x' }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.approvalRule.update).not.toHaveBeenCalled()
    })
  })

  describe('deleteApprovalRule', () => {
    it('규칙을 소프트 삭제(isActive=false)한다', async () => {
      mockPrisma.approvalRule.findFirst.mockResolvedValue(baseApprovalRule)
      mockPrisma.approvalRule.update.mockResolvedValue({
        ...baseApprovalRule,
        isActive: false,
      })

      const result = await service.deleteApprovalRule(COMPANY_ID, 'rule-1')

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.approvalRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { isActive: false },
      })
    })

    it('타 회사 규칙이면 NotFoundException을 던진다', async () => {
      mockPrisma.approvalRule.findFirst.mockResolvedValue(null)

      await expect(service.deleteApprovalRule('other-company', 'rule-1')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.approvalRule.update).not.toHaveBeenCalled()
    })
  })

  describe('findAll', () => {
    it('mine 스코프로 내 요청 목록을 반환한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      mockPrisma.request.findMany.mockResolvedValue([basePendingRequest])
      mockPrisma.request.count.mockResolvedValue(1)

      const result = await service.findAll(
        COMPANY_ID,
        { scope: 'mine', page: 1, limit: 20 },
        requester,
      )

      expect(result.items).toEqual([basePendingRequest])
      expect(result.total).toBe(1)
      expect(mockPrisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ requesterId: EMPLOYEE_ID }),
        }),
      )
    })

    it('pending_approval 스코프로 승인 대기 목록을 반환한다', async () => {
      const requester = makeApprover()
      mockPrisma.request.findMany.mockResolvedValue([])
      mockPrisma.request.count.mockResolvedValue(0)

      await service.findAll(COMPANY_ID, { scope: 'pending_approval', page: 1, limit: 20 }, requester)

      expect(mockPrisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      )
    })

    it('allEmployees=true + ORG_ADMIN이면 requesterId 대신 내 조직 구성원 조건으로 조회한다', async () => {
      const orgAdmin = makeRequester(AccessLevel.ORG_ADMIN, 'org-admin-1')
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
        { organizationId: 'org-2' },
      ])
      mockPrisma.request.findMany.mockResolvedValue([])
      mockPrisma.request.count.mockResolvedValue(0)

      await service.findAll(
        COMPANY_ID,
        { scope: 'mine', allEmployees: true, page: 1, limit: 20 },
        orgAdmin,
      )

      const whereArg = mockPrisma.request.findMany.mock.calls[0][0].where
      expect(whereArg.requesterId).toBeUndefined()
      expect(whereArg.requester).toEqual({
        organizations: { some: { organizationId: { in: ['org-1', 'org-2'] } } },
      })
    })

    it('allEmployees=true라도 EMPLOYEE는 무시되고 본인 요청만 조회한다', async () => {
      const employee = makeRequester(AccessLevel.EMPLOYEE)
      mockPrisma.request.findMany.mockResolvedValue([])
      mockPrisma.request.count.mockResolvedValue(0)

      await service.findAll(
        COMPANY_ID,
        { scope: 'mine', allEmployees: true, page: 1, limit: 20 },
        employee,
      )

      expect(mockPrisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ requesterId: EMPLOYEE_ID }),
        }),
      )
    })

    it('allEmployees=true + GENERAL_ADMIN이면 회사 전체 요청을 조회한다 (requester 조건 없음)', async () => {
      const generalAdmin = makeApprover()
      mockPrisma.request.findMany.mockResolvedValue([])
      mockPrisma.request.count.mockResolvedValue(0)

      await service.findAll(
        COMPANY_ID,
        { scope: 'mine', allEmployees: true, page: 1, limit: 20 },
        generalAdmin,
      )

      const whereArg = mockPrisma.request.findMany.mock.calls[0][0].where
      expect(whereArg.requesterId).toBeUndefined()
      expect(whereArg.requester).toBeUndefined()
      expect(whereArg.companyId).toBe(COMPANY_ID)
    })
  })
})
