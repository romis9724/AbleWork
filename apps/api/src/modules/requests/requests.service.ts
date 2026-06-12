import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateRequestDto,
  CreateApprovalRuleDto,
  ApproveRejectDto,
  BulkApproveDto,
  RequestFilterDto,
} from './dto/create-request.dto'

// request type → document_forms.category 매핑
const REQUEST_TYPE_CATEGORY_MAP: Record<string, string> = {
  LEAVE_CREATE: 'leave_request',
  LEAVE_MODIFY: 'leave_request',
  LEAVE_DELETE: 'leave_request',
  SHIFT_CREATE: 'shift_change_request',
  SHIFT_MODIFY: 'shift_change_request',
  SHIFT_DELETE: 'shift_change_request',
  ATTENDANCE_EDIT: 'attendance_correction_request',
  ATTENDANCE_CREATE: 'attendance_correction_request',
  ATTENDANCE_DELETE: 'attendance_correction_request',
  DEVICE_CHANGE: 'device_change_request',
  OFFSITE_WORK: 'offsite_work_request',
  CUSTOM: 'custom_request',
}

// 승인 완료 후 emit할 이벤트 매핑
const REQUEST_TYPE_APPROVED_EVENT: Record<string, string> = {
  LEAVE_CREATE: 'leave.approved',
  LEAVE_MODIFY: 'leave.approved',
  LEAVE_DELETE: 'leave.approved',
  SHIFT_CREATE: 'shift.approved',
  SHIFT_MODIFY: 'shift.approved',
  ATTENDANCE_EDIT: 'attendance.approved',
  DEVICE_CHANGE: 'device.change_approved',
}

const REQUEST_TYPE_REJECTED_EVENT: Record<string, string> = {
  LEAVE_CREATE: 'leave.rejected',
  LEAVE_MODIFY: 'leave.rejected',
  LEAVE_DELETE: 'leave.rejected',
  SHIFT_CREATE: 'shift.rejected',
  SHIFT_MODIFY: 'shift.rejected',
  ATTENDANCE_EDIT: 'attendance.rejected',
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── HR-07-01 요청 목록 ───────────────────────────────────────────────────────

  async findAll(companyId: string, filter: RequestFilterDto, requester: JwtPayload) {
    const { scope, type, page, limit } = filter
    const skip = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: Record<string, any> = { companyId }

    if (type) {
      where = { ...where, type }
    }

    switch (scope) {
      case 'mine':
        where = { ...where, requesterId: requester.employeeId }
        break

      case 'pending_approval':
        // 현재 사용자가 승인자인 PENDING 요청
        where = {
          ...where,
          status: 'PENDING',
          document: {
            approvalLines: {
              some: {
                steps: {
                  some: {
                    assigneeId: requester.employeeId,
                    status: 'PENDING',
                  },
                },
              },
            },
          },
        }
        break

      case 'completed':
        where = {
          ...where,
          status: { in: ['APPROVED', 'REJECTED'] },
          requesterId: requester.employeeId,
        }
        break

      case 'referenced':
        // 참조자로 지정된 결재선을 가진 문서의 요청
        where = {
          ...where,
          document: {
            approvalLines: {
              some: {
                steps: {
                  some: {
                    role: 'REFERENCE',
                    assigneeId: requester.employeeId,
                  },
                },
              },
            },
          },
        }
        break
    }

    const [items, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, name: true } },
          document: {
            select: {
              id: true,
              docNumber: true,
              status: true,
              title: true,
              submittedAt: true,
            },
          },
          approvals: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.request.count({ where }),
    ])

    return { items, total, page, limit }
  }

  // ── HR-07-02 요청 생성 ($transaction) ────────────────────────────────────────

  async createRequest(companyId: string, dto: CreateRequestDto, requester: JwtPayload) {
    const requesterId = requester.employeeId

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // 1. Request 레코드 생성
      const request = await tx.request.create({
        data: {
          companyId,
          requesterId,
          type: dto.type,
          payload: dto.payload,
          status: 'PENDING',
        },
      })

      // 2. 승인 규칙 조회 (type 매칭, 조직/직무 범위 필터)
      const requesterEmployee = await tx.employee.findFirst({
        where: { id: requesterId },
        include: {
          organizations: { select: { organizationId: true } },
          positions: { select: { positionId: true } },
        },
      })

      if (!requesterEmployee) {
        throw new NotFoundException({
          code: 'EMPLOYEE_NOT_FOUND',
          message: '요청자 정보를 찾을 수 없습니다.',
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requesterOrgIds = requesterEmployee.organizations.map((o: any) => o.organizationId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requesterPositionIds = requesterEmployee.positions.map((p: any) => p.positionId)

      const allRules = await tx.approvalRule.findMany({
        where: {
          companyId,
          requestType: dto.type,
          isActive: true,
          ...(dto.customTypeId && { customTypeId: dto.customTypeId }),
        },
        orderBy: { priority: 'desc' },
        include: { details: { orderBy: { sortOrder: 'asc' } } },
      })

      // 범위 필터링: scopeOrgIds / scopePositionIds가 설정된 경우 교집합 확인
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applicableRule = allRules.find((rule: any) => {
        const orgScope = rule.scopeOrgIds as string[] | null
        const posScope = rule.scopePositionIds as string[] | null

        const orgMatch =
          !orgScope || orgScope.length === 0 || requesterOrgIds.some((id: string) => orgScope.includes(id))
        const posMatch =
          !posScope ||
          posScope.length === 0 ||
          requesterPositionIds.some((id: string) => posScope.includes(id))

        return orgMatch && posMatch
      })

      // 3. 규칙 없으면 자동 승인
      if (!applicableRule || applicableRule.isAutoApprove) {
        const updatedRequest = await tx.request.update({
          where: { id: request.id },
          data: { status: 'APPROVED' },
        })

        const eventName = `${dto.type.toLowerCase()}.auto_approved`
        this.events.emit(eventName, {
          requestId: request.id,
          requesterId,
          companyId,
          payload: dto.payload,
        })

        return updatedRequest
      }

      // 4. DocumentForm 조회 (category = request_type 매핑)
      // Phase 1: 양식이 없으면 요청을 PENDING 상태로만 생성 (전자결재 연동은 Phase 2)
      const category = REQUEST_TYPE_CATEGORY_MAP[dto.type] ?? dto.type.toLowerCase()
      const form = await tx.documentForm.findFirst({
        where: { companyId, category, isActive: true },
        orderBy: { sortOrder: 'asc' },
      })

      if (!form) {
        // DocumentForm 미설정 시 → 요청만 생성하고 관리자가 수동 처리
        await tx.request.update({
          where: { id: request.id },
          data: { status: 'PENDING' },
        })
        return request
      }

      // 5. Document 레코드 생성
      const title = `[${dto.type}] ${requesterEmployee.name} 요청`
      const document = await tx.document.create({
        data: {
          companyId,
          formId: form.id,
          title,
          content: dto.payload,
          drafterId: requesterId,
          status: 'PENDING',
          submittedAt: new Date(),
        },
      })

      // 6. ApprovalLine + ApprovalStep 생성
      // 단일 결재선 생성
      const approvalLine = await tx.approvalLine.create({
        data: {
          documentId: document.id,
          name: '기본 결재선',
          isShared: false,
        },
      })

      // round별 승인자 결정: ApprovalRuleDetail에서 approverPositionId 기준 직원 조회
      const stepsByRound = new Map<number, { positionId: string | null; sortOrder: number }[]>()
      for (const detail of applicableRule.details) {
        const existing = stepsByRound.get(detail.round) ?? []
        existing.push({
          positionId: detail.approverPositionId,
          sortOrder: detail.sortOrder,
        })
        stepsByRound.set(detail.round, existing)
      }

      for (const [round, details] of stepsByRound) {
        let stepOrder = 0
        for (const detail of details) {
          let assigneeId: string | null = null

          if (detail.positionId) {
            // 해당 직무를 가진 GENERAL_ADMIN 이상 직원 중 첫 번째 찾기
            const approverEmployee = await tx.employee.findFirst({
              where: {
                companyId,
                isActive: true,
                positions: { some: { positionId: detail.positionId } },
                accessLevel: {
                  in: [AccessLevel.GENERAL_ADMIN, AccessLevel.SUPER_ADMIN],
                },
              },
              select: { id: true },
            })
            assigneeId = approverEmployee?.id ?? null
          }

          // 승인자를 못 찾으면 회사 SUPER_ADMIN으로 fallback
          if (!assigneeId) {
            const superAdmin = await tx.employee.findFirst({
              where: {
                companyId,
                isActive: true,
                accessLevel: AccessLevel.SUPER_ADMIN,
              },
              select: { id: true },
            })
            assigneeId = superAdmin?.id ?? requesterId
          }

          await tx.approvalStep.create({
            data: {
              lineId: approvalLine.id,
              role: `APPROVER_R${round}`,
              assigneeId,
              stepOrder: stepOrder++,
              isParallel: false,
              status: round === 1 ? 'PENDING' : 'WAITING',
            },
          })
        }
      }

      // 7. request.documentId 업데이트
      const finalRequest = await tx.request.update({
        where: { id: request.id },
        data: { documentId: document.id },
      })

      // 8. 이벤트 emit
      const eventName = `${dto.type.toLowerCase()}.requested`
      this.events.emit(eventName, {
        requestId: request.id,
        documentId: document.id,
        requesterId,
        companyId,
        payload: dto.payload,
      })

      return finalRequest
    })
  }

  // ── HR-07-03 승인 규칙 목록 ──────────────────────────────────────────────────

  async findApprovalRules(companyId: string) {
    return this.prisma.approvalRule.findMany({
      where: { companyId },
      orderBy: [{ requestType: 'asc' }, { priority: 'desc' }],
      include: {
        details: { orderBy: { sortOrder: 'asc' } },
        customType: { select: { id: true, name: true } },
      },
    })
  }

  // ── HR-07-04 승인 규칙 생성 ──────────────────────────────────────────────────

  async createApprovalRule(companyId: string, dto: CreateApprovalRuleDto) {
    const { details, ...ruleData } = dto

    return this.prisma.approvalRule.create({
      data: {
        companyId,
        ...ruleData,
        scopeOrgIds: ruleData.scopeOrgIds ?? undefined,
        scopePositionIds: ruleData.scopePositionIds ?? undefined,
        details: { create: details },
      },
      include: { details: true },
    })
  }

  // ── HR-07-05 승인 ────────────────────────────────────────────────────────────

  async approve(
    companyId: string,
    requestId: string,
    dto: ApproveRejectDto,
    requester: JwtPayload,
  ) {
    const request = await this.assertRequestBelongsToCompany(companyId, requestId)
    this.assertRequestPending(request)
    await this.assertIsApprover(request, requester)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const currentRound = await this.getCurrentRound(tx, requestId)

      await tx.requestApproval.create({
        data: {
          requestId,
          round: currentRound,
          approverId: requester.employeeId,
          status: 'APPROVED',
          comment: dto.comment,
          actedAt: new Date(),
        },
      })

      // 현재 round의 모든 필수 승인 완료 여부 확인
      const rule = await this.findApplicableRule(tx, companyId, request.type)
      const isRoundComplete = await this.isRoundComplete(tx, requestId, currentRound, rule)

      const maxRounds = rule?.maxApprovalRounds ?? 1
      const isLastRound = currentRound >= maxRounds

      if (isRoundComplete && isLastRound) {
        // 최종 승인 — request + document 상태 업데이트
        const updatedRequest = await tx.request.update({
          where: { id: requestId },
          data: { status: 'APPROVED' },
        })

        if (request.documentId) {
          await tx.document.update({
            where: { id: request.documentId },
            data: { status: 'APPROVED', completedAt: new Date() },
          })
          // 다음 round WAITING 스텝 활성화 불필요 — 마지막 round
        }

        const eventName = REQUEST_TYPE_APPROVED_EVENT[request.type] ?? `${request.type.toLowerCase()}.approved`
        this.events.emit(eventName, {
          requestId,
          requesterId: request.requesterId,
          companyId,
          payload: request.payload,
        })

        return updatedRequest
      }

      if (isRoundComplete && !isLastRound) {
        // 다음 round로 진행 — 다음 round 스텝 활성화
        if (request.documentId) {
          await tx.approvalStep.updateMany({
            where: {
              line: { documentId: request.documentId },
              role: `APPROVER_R${currentRound + 1}`,
              status: 'WAITING',
            },
            data: { status: 'PENDING' },
          })
        }
      }

      return this.prisma.request.findFirst({ where: { id: requestId } })
    })
  }

  // ── HR-07-06 거절 ────────────────────────────────────────────────────────────

  async reject(
    companyId: string,
    requestId: string,
    dto: ApproveRejectDto,
    requester: JwtPayload,
  ) {
    const request = await this.assertRequestBelongsToCompany(companyId, requestId)
    this.assertRequestPending(request)
    await this.assertIsApprover(request, requester)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const currentRound = await this.getCurrentRound(tx, requestId)

      await tx.requestApproval.create({
        data: {
          requestId,
          round: currentRound,
          approverId: requester.employeeId,
          status: 'REJECTED',
          comment: dto.comment,
          actedAt: new Date(),
        },
      })

      const updatedRequest = await tx.request.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
      })

      if (request.documentId) {
        await tx.document.update({
          where: { id: request.documentId },
          data: { status: 'REJECTED', completedAt: new Date() },
        })
      }

      const eventName = REQUEST_TYPE_REJECTED_EVENT[request.type] ?? `${request.type.toLowerCase()}.rejected`
      this.events.emit(eventName, {
        requestId,
        requesterId: request.requesterId,
        companyId,
        payload: request.payload,
      })

      return updatedRequest
    })
  }

  // ── HR-07-07 강제 승인 (SUPER_ADMIN) ────────────────────────────────────────

  async forceApprove(
    companyId: string,
    requestId: string,
    dto: ApproveRejectDto,
    requester: JwtPayload,
  ) {
    if (requester.accessLevel !== AccessLevel.SUPER_ADMIN) {
      throw new ForbiddenException('강제 승인은 SUPER_ADMIN만 가능합니다.')
    }

    const request = await this.assertRequestBelongsToCompany(companyId, requestId)
    this.assertRequestPending(request)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.requestApproval.create({
        data: {
          requestId,
          round: 0,
          approverId: requester.employeeId,
          status: 'FORCE_APPROVED',
          comment: dto.comment ?? '[강제 승인]',
          actedAt: new Date(),
        },
      })

      const updatedRequest = await tx.request.update({
        where: { id: requestId },
        data: { status: 'APPROVED' },
      })

      if (request.documentId) {
        await tx.document.update({
          where: { id: request.documentId },
          data: { status: 'APPROVED', completedAt: new Date() },
        })
      }

      const eventName = REQUEST_TYPE_APPROVED_EVENT[request.type] ?? `${request.type.toLowerCase()}.approved`
      this.events.emit(eventName, {
        requestId,
        requesterId: request.requesterId,
        companyId,
        forced: true,
        payload: request.payload,
      })

      return updatedRequest
    })
  }

  // ── HR-07-08 강제 거절 (SUPER_ADMIN) ────────────────────────────────────────

  async forceReject(
    companyId: string,
    requestId: string,
    dto: ApproveRejectDto,
    requester: JwtPayload,
  ) {
    if (requester.accessLevel !== AccessLevel.SUPER_ADMIN) {
      throw new ForbiddenException('강제 거절은 SUPER_ADMIN만 가능합니다.')
    }

    const request = await this.assertRequestBelongsToCompany(companyId, requestId)
    this.assertRequestPending(request)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.requestApproval.create({
        data: {
          requestId,
          round: 0,
          approverId: requester.employeeId,
          status: 'FORCE_REJECTED',
          comment: dto.comment ?? '[강제 거절]',
          actedAt: new Date(),
        },
      })

      const updatedRequest = await tx.request.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
      })

      if (request.documentId) {
        await tx.document.update({
          where: { id: request.documentId },
          data: { status: 'REJECTED', completedAt: new Date() },
        })
      }

      const eventName = REQUEST_TYPE_REJECTED_EVENT[request.type] ?? `${request.type.toLowerCase()}.rejected`
      this.events.emit(eventName, {
        requestId,
        requesterId: request.requesterId,
        companyId,
        forced: true,
        payload: request.payload,
      })

      return updatedRequest
    })
  }

  // ── HR-07-09 일괄 승인 ───────────────────────────────────────────────────────

  async bulkApprove(companyId: string, dto: BulkApproveDto, requester: JwtPayload) {
    const results: Array<{ requestId: string; success: boolean; error?: string }> = []

    for (const requestId of dto.requestIds) {
      try {
        await this.approve(companyId, requestId, { comment: dto.comment }, requester)
        results.push({ requestId, success: true })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '알 수 없는 오류'
        results.push({ requestId, success: false, error: message })
      }
    }

    return { results }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

  private async assertRequestBelongsToCompany(companyId: string, requestId: string) {
    const request = await this.prisma.request.findFirst({
      where: { id: requestId, companyId },
    })
    if (!request) {
      throw new NotFoundException({
        code: 'REQUEST_NOT_FOUND',
        message: '요청을 찾을 수 없습니다.',
      })
    }
    return request
  }

  private assertRequestPending(request: { status: string }) {
    if (request.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'REQUEST_NOT_PENDING',
        message: '이미 처리된 요청입니다.',
      })
    }
  }

  private async assertIsApprover(
    request: { id: string; documentId: string | null },
    requester: JwtPayload,
  ) {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return
    }

    if (!request.documentId) {
      throw new ForbiddenException('결재 권한이 없습니다.')
    }

    const step = await this.prisma.approvalStep.findFirst({
      where: {
        line: { documentId: request.documentId },
        assigneeId: requester.employeeId,
        status: 'PENDING',
      },
    })

    if (!step) {
      throw new ForbiddenException('결재 권한이 없습니다.')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getCurrentRound(tx: any, requestId: string): Promise<number> {
    const lastApproval = await tx.requestApproval.findFirst({
      where: { requestId },
      orderBy: { round: 'desc' },
    })
    return lastApproval ? lastApproval.round + 1 : 1
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async findApplicableRule(tx: any, companyId: string, requestType: string) {
    return tx.approvalRule.findFirst({
      where: { companyId, requestType, isActive: true },
      orderBy: { priority: 'desc' },
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async isRoundComplete(
    tx: any,
    requestId: string,
    round: number,
    rule: { maxApprovalRounds: number } | null,
  ): Promise<boolean> {
    const approvals = await tx.requestApproval.findMany({
      where: { requestId, round, status: 'APPROVED' },
    })
    const requiredCount = rule ? 1 : 1 // 단순화: 1명 승인으로 round 완료 처리
    return approvals.length >= requiredCount
  }
}
