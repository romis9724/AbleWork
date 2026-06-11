import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { RequestsService } from './requests.service'
import { PrismaService } from '../../prisma/prisma.service'
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
  type: 'LEAVE',
  payload: { leaveTypeId: 'lt-1', daysUsed: 1 },
  status: 'PENDING',
  documentId: DOCUMENT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const baseApprovalRule = {
  id: 'rule-1',
  companyId: COMPANY_ID,
  name: '연차 승인 규칙',
  requestType: 'LEAVE',
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
  },
  $transaction: jest.fn(),
}

const mockEvents = { emit: jest.fn() }

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('RequestsService', () => {
  let service: RequestsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile()

    service = module.get<RequestsService>(RequestsService)
    jest.clearAllMocks()
  })

  // ── createRequest ────────────────────────────────────────────────────────────

  describe('createRequest', () => {
    it('승인 규칙 없으면 자동 승인 처리되고 이벤트를 emit한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE' as const, payload: { leaveTypeId: 'lt-1', daysUsed: 1 } }

      const createdRequest = { ...basePendingRequest, documentId: null }
      const autoApprovedRequest = { ...createdRequest, status: 'APPROVED' }

      // $transaction 콜백을 실행하도록 mock
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
      // 승인 규칙 없음
      mockPrisma.approvalRule.findMany.mockResolvedValue([])
      mockPrisma.request.update.mockResolvedValue(autoApprovedRequest)

      const result = await service.createRequest(COMPANY_ID, dto, requester)

      expect(mockPrisma.request.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            requesterId: EMPLOYEE_ID,
            type: 'LEAVE',
            status: 'PENDING',
          }),
        }),
      )
      expect(result.status).toBe('APPROVED')
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.auto_approved',
        expect.objectContaining({ requestId: REQUEST_ID }),
      )
    })

    it('승인 규칙 있으면 Document + ApprovalLine + ApprovalStep을 생성하고 이벤트를 emit한다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE' as const, payload: { leaveTypeId: 'lt-1', daysUsed: 1 } }

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

    it('DocumentForm이 없으면 BadRequestException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.EMPLOYEE)
      const dto = { type: 'LEAVE' as const, payload: {} }

      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          return callback(mockPrisma)
        },
      )

      mockPrisma.request.create.mockResolvedValue(basePendingRequest)
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: EMPLOYEE_ID,
        companyId: COMPANY_ID,
        name: '홍길동',
        organizations: [],
        positions: [],
      })
      mockPrisma.approvalRule.findMany.mockResolvedValue([baseApprovalRule])
      mockPrisma.documentForm.findFirst.mockResolvedValue(null)

      await expect(service.createRequest(COMPANY_ID, dto, requester)).rejects.toThrow(
        BadRequestException,
      )
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

  // ── findAll ──────────────────────────────────────────────────────────────────

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
  })
})
