import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY, ShiftStatus } from '@ablework/shared-constants'
import { EVENTS } from '../../events/domain-events'
import { LeavesService } from '../leaves/leaves.service'
import {
  CreateRequestDto,
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
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

// 상신 시 emit할 이벤트 매핑 (NotificationListener 구독 이름과 일치해야 함)
const REQUEST_TYPE_REQUESTED_EVENT: Record<string, string> = {
  LEAVE_CREATE: EVENTS.LEAVE_REQUESTED,
  LEAVE_MODIFY: EVENTS.LEAVE_REQUESTED,
  LEAVE_DELETE: EVENTS.LEAVE_REQUESTED,
  SHIFT_CREATE: EVENTS.SHIFT_REQUESTED,
  SHIFT_MODIFY: EVENTS.SHIFT_REQUESTED,
  SHIFT_DELETE: EVENTS.SHIFT_REQUESTED,
  ATTENDANCE_EDIT: EVENTS.ATTENDANCE_REQUESTED,
  ATTENDANCE_CREATE: EVENTS.ATTENDANCE_REQUESTED,
  ATTENDANCE_DELETE: EVENTS.ATTENDANCE_REQUESTED,
  DEVICE_CHANGE: EVENTS.DEVICE_CHANGE_REQUESTED,
  OFFSITE_WORK: EVENTS.OFFSITE_WORK_REQUESTED,
  CUSTOM: EVENTS.CUSTOM_REQUESTED,
}

// 승인 완료 후 emit할 이벤트 매핑
const REQUEST_TYPE_APPROVED_EVENT: Record<string, string> = {
  LEAVE_CREATE: EVENTS.LEAVE_APPROVED,
  LEAVE_MODIFY: EVENTS.LEAVE_APPROVED,
  LEAVE_DELETE: EVENTS.LEAVE_APPROVED,
  SHIFT_CREATE: EVENTS.SHIFT_APPROVED,
  SHIFT_MODIFY: EVENTS.SHIFT_APPROVED,
  SHIFT_DELETE: EVENTS.SHIFT_APPROVED,
  ATTENDANCE_EDIT: EVENTS.ATTENDANCE_APPROVED,
  ATTENDANCE_CREATE: EVENTS.ATTENDANCE_APPROVED,
  ATTENDANCE_DELETE: EVENTS.ATTENDANCE_APPROVED,
  DEVICE_CHANGE: EVENTS.DEVICE_CHANGE_APPROVED,
  OFFSITE_WORK: EVENTS.OFFSITE_WORK_APPROVED,
  CUSTOM: EVENTS.CUSTOM_APPROVED,
}

const REQUEST_TYPE_REJECTED_EVENT: Record<string, string> = {
  LEAVE_CREATE: EVENTS.LEAVE_REJECTED,
  LEAVE_MODIFY: EVENTS.LEAVE_REJECTED,
  LEAVE_DELETE: EVENTS.LEAVE_REJECTED,
  SHIFT_CREATE: EVENTS.SHIFT_REJECTED,
  SHIFT_MODIFY: EVENTS.SHIFT_REJECTED,
  SHIFT_DELETE: EVENTS.SHIFT_REJECTED,
  ATTENDANCE_EDIT: EVENTS.ATTENDANCE_REJECTED,
  ATTENDANCE_CREATE: EVENTS.ATTENDANCE_REJECTED,
  ATTENDANCE_DELETE: EVENTS.ATTENDANCE_REJECTED,
  CUSTOM: EVENTS.CUSTOM_REJECTED,
}

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly leavesService: LeavesService,
  ) {}

  // ── HR-07-01 요청 목록 ───────────────────────────────────────────────────────

  async findAll(companyId: string, filter: RequestFilterDto, requester: JwtPayload) {
    const { scope, type, status, allEmployees, page, limit } = filter
    const skip = (page - 1) * limit

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: Record<string, any> = { companyId }

    if (type) {
      where = { ...where, type }
    }

    // allEmployees=true 적용 범위:
    // - GENERAL_ADMIN 이상: 회사 전체 요청
    // - ORG_ADMIN: 자기 소속 조직 구성원의 요청까지
    // - 그 외: 무시하고 본인 것만 조회
    const isCompanyAdmin =
      ACCESS_LEVEL_HIERARCHY[requester.accessLevel] >=
      ACCESS_LEVEL_HIERARCHY[AccessLevel.GENERAL_ADMIN]
    const isOrgAdmin = requester.accessLevel === AccessLevel.ORG_ADMIN
    const includeAllEmployees = allEmployees === true && (isCompanyAdmin || isOrgAdmin)

    switch (scope) {
      case 'mine':
        if (!includeAllEmployees) {
          where = { ...where, requesterId: requester.employeeId }
        } else if (isOrgAdmin) {
          // ORG_ADMIN — requesterId 조건 대신 요청자가 내 소속 조직 구성원인 조건
          const orgIds = await this.getEmployeeOrgIds(companyId, requester.employeeId)
          where = {
            ...where,
            requester: {
              organizations: { some: { organizationId: { in: orgIds } } },
            },
          }
        }
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

    // status 명시 시 scope 기본 status 조건보다 우선 적용 (콤마 구분 다중값 허용)
    const statusList = (status ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (statusList.length === 1) {
      where = { ...where, status: statusList[0] }
    } else if (statusList.length > 1) {
      where = { ...where, status: { in: statusList } }
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
          approvals: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
        },
      }),
      this.prisma.request.count({ where }),
    ])

    // approvals.approverId → 승인자 이름 enrich (RequestApproval에 relation이 없어 별도 조회)
    const approverIds = Array.from(
      new Set(
        items.flatMap((item: { approvals?: Array<{ approverId: string }> }) =>
          (item.approvals ?? []).map((a) => a.approverId),
        ),
      ),
    )
    const approverNameMap = new Map<string, string>()
    if (approverIds.length > 0) {
      const approvers = await this.prisma.employee.findMany({
        where: { id: { in: approverIds }, companyId },
        select: { id: true, name: true },
      })
      for (const approver of approvers) {
        approverNameMap.set(approver.id, approver.name)
      }
    }

    const enrichedItems = items.map(
      (item: { approvals?: Array<{ approverId: string }> }) =>
        item.approvals?.length
          ? {
              ...item,
              approvals: item.approvals.map((a) => ({
                ...a,
                approverName: approverNameMap.get(a.approverId) ?? null,
              })),
            }
          : item,
    )

    return { items: enrichedItems, total, page, limit }
  }

  // ── HR-07-10 요청 취소 (본인의 PENDING 요청만) ──────────────────────────────

  async cancel(companyId: string, requestId: string, requester: JwtPayload) {
    const request = await this.assertRequestBelongsToCompany(companyId, requestId)

    if (request.requesterId !== requester.employeeId) {
      throw new ForbiddenException({
        code: 'REQUEST_CANCEL_FORBIDDEN',
        message: '본인의 요청만 취소할 수 있습니다.',
      })
    }
    this.assertRequestPending(request)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const updatedRequest = await tx.request.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      })

      if (request.documentId) {
        await tx.document.update({
          where: { id: request.documentId },
          data: { status: 'CANCELLED' },
        })
      }

      return updatedRequest
    })
  }

  // ── HR-07-02 요청 생성 ($transaction) ────────────────────────────────────────

  async createRequest(companyId: string, dto: CreateRequestDto, requester: JwtPayload) {
    const requesterId = requester.employeeId

    // 휴가 신청은 접수 전에 잔액/유효기간 사전 검증 (CLAUDE.md §6)
    if (dto.type === 'LEAVE_CREATE') {
      await this.validateLeaveCreatePayload(requesterId, dto.payload)
    }

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
        where: { id: requesterId, companyId },
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

      // 3. 명시적으로 자동 승인이 설정된 규칙만 자동 승인.
      //    규칙이 아예 없으면 아래의 기본 결재선(승인 필요)으로 진행한다 — 무규칙 자동승인 금지.
      if (applicableRule?.isAutoApprove) {
        const updatedRequest = await tx.request.update({
          where: { id: request.id },
          data: { status: 'APPROVED' },
        })

        // 자동 승인도 실데이터 반영 (잔액 차감/Shift 생성 등) — 동일 트랜잭션 내 원자 처리
        await this.applyApprovedRequest(tx, companyId, updatedRequest)

        const eventName =
          REQUEST_TYPE_APPROVED_EVENT[dto.type] ?? `${dto.type.toLowerCase()}.approved`
        this.events.emit(eventName, {
          requestId: request.id,
          requesterId,
          companyId,
          autoApproved: true,
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
      const ruleDetails: Array<{ round: number; approverPositionId: string | null; sortOrder: number }> =
        applicableRule?.details ?? []
      const stepsByRound = new Map<number, { positionId: string | null; sortOrder: number }[]>()
      for (const detail of ruleDetails) {
        const existing = stepsByRound.get(detail.round) ?? []
        existing.push({
          positionId: detail.approverPositionId,
          sortOrder: detail.sortOrder,
        })
        stepsByRound.set(detail.round, existing)
      }

      // 규칙이 없거나 상세 결재선이 비어 있으면 기본 결재선(1차 — 관리자 1명) 적용
      if (stepsByRound.size === 0) {
        stepsByRound.set(1, [{ positionId: null, sortOrder: 0 }])
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

          // 승인자를 못 찾으면 회사 관리자(GENERAL_ADMIN 이상, 본인 제외)로 fallback
          if (!assigneeId) {
            const adminApprover = await tx.employee.findFirst({
              where: {
                companyId,
                isActive: true,
                id: { not: requesterId },
                accessLevel: {
                  in: [AccessLevel.GENERAL_ADMIN, AccessLevel.SUPER_ADMIN],
                },
              },
              orderBy: { createdAt: 'asc' },
              select: { id: true },
            })
            // 자기결재 방지: 본인 외 결재 가능한 관리자가 없으면 요청 자체를 거부한다.
            if (!adminApprover) {
              throw new BadRequestException({
                code: 'REQUEST_NO_APPROVER',
                message: '결재 가능한 관리자가 없습니다. 관리자에게 결재선 설정을 요청하세요.',
              })
            }
            assigneeId = adminApprover.id
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
      const eventName =
        REQUEST_TYPE_REQUESTED_EVENT[dto.type] ?? `${dto.type.toLowerCase()}.requested`
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
      where: { companyId, isActive: true },
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

  // ── HR-07-04b 승인 규칙 수정 ─────────────────────────────────────────────────

  async updateApprovalRule(companyId: string, ruleId: string, dto: UpdateApprovalRuleDto) {
    await this.assertRuleBelongsToCompany(companyId, ruleId)
    const { details, ...ruleData } = dto

    // details 배열이 오면 기존 details를 전체 삭제 후 재생성 (전체 교체 방식)
    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      if (details) {
        await tx.approvalRuleDetail.deleteMany({ where: { ruleId } })
      }

      return tx.approvalRule.update({
        where: { id: ruleId },
        data: {
          ...ruleData,
          scopeOrgIds: ruleData.scopeOrgIds ?? undefined,
          scopePositionIds: ruleData.scopePositionIds ?? undefined,
          ...(details && { details: { create: details } }),
        },
        include: { details: { orderBy: { sortOrder: 'asc' } } },
      })
    })
  }

  // ── HR-07-04c 승인 규칙 삭제 (소프트) ────────────────────────────────────────

  async deleteApprovalRule(companyId: string, ruleId: string) {
    const rule = await this.assertRuleBelongsToCompany(companyId, ruleId)

    // 참조무결성: 이 규칙 유형의 진행 중(PENDING) 요청이 있으면 삭제 차단.
    // 진행 중 결재는 승인 시 규칙을 재참조하므로, 규칙 삭제 시 결재 흐름이 깨질 수 있다.
    const pendingCount = await this.prisma.request.count({
      where: { companyId, type: rule.requestType, status: 'PENDING' },
    })
    if (pendingCount > 0) {
      throw new ForbiddenException({
        code: 'APPROVAL_RULE_IN_USE',
        message: '진행 중인 요청이 있어 승인 규칙을 삭제할 수 없습니다.',
      })
    }

    await this.prisma.approvalRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    })

    return { deleted: true }
  }

  /** 승인 규칙이 해당 회사 소속인지 검증 — 멀티테넌시 */
  private async assertRuleBelongsToCompany(companyId: string, ruleId: string) {
    const rule = await this.prisma.approvalRule.findFirst({
      where: { id: ruleId, companyId },
    })
    if (!rule) {
      throw new NotFoundException({
        code: 'APPROVAL_RULE_NOT_FOUND',
        message: '승인 규칙을 찾을 수 없습니다.',
      })
    }
    return rule
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

        // 승인 결과를 실데이터에 반영 (휴가 잔액 차감, Shift 생성 등) — 동일 트랜잭션 (CLAUDE.md §7)
        await this.applyApprovedRequest(tx, companyId, updatedRequest)

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

      // 강제 승인도 실데이터 반영 — 동일 트랜잭션
      await this.applyApprovedRequest(tx, companyId, updatedRequest)

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

  // ── 승인 → 실데이터 반영 파이프라인 ─────────────────────────────────────────

  /**
   * 최종 승인된 요청을 실데이터에 반영한다 (CLAUDE.md §7 — 승인 $transaction 내 원자 처리).
   * 여기서 던지는 예외는 승인 트랜잭션 전체를 롤백시킨다 (예: 잔액 부족 시 승인 자체가 실패).
   */
  private async applyApprovedRequest(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    request: { id: string; requesterId: string; type: string; payload: unknown },
  ): Promise<void> {
    const payload = (request.payload ?? {}) as Record<string, unknown>
    const employeeId = request.requesterId

    switch (request.type) {
      case 'LEAVE_CREATE':
        await this.applyLeaveCreate(tx, employeeId, payload)
        break
      case 'LEAVE_MODIFY':
        await this.applyLeaveModify(tx, companyId, employeeId, payload)
        break
      case 'LEAVE_DELETE':
        await this.applyLeaveDelete(tx, companyId, employeeId, payload)
        break
      case 'SHIFT_CREATE':
        await this.applyShiftCreate(tx, companyId, employeeId, payload)
        break
      case 'SHIFT_MODIFY':
        await this.applyShiftModify(tx, companyId, employeeId, payload)
        break
      case 'SHIFT_DELETE':
        await this.applyShiftDelete(tx, companyId, employeeId, payload)
        break
      case 'ATTENDANCE_EDIT':
      case 'ATTENDANCE_CREATE':
        await this.applyAttendanceUpsert(tx, companyId, employeeId, payload)
        break
      case 'ATTENDANCE_DELETE':
        await this.applyAttendanceDelete(tx, companyId, employeeId, payload)
        break
      case 'DEVICE_CHANGE':
        await tx.employee.update({
          where: { id: employeeId },
          data: { deviceId: null, deviceBoundAt: null },
        })
        break
      // OFFSITE_WORK / CUSTOM: Phase 1에서는 데이터 반영 없음 (기록·결재만)
      default:
        break
    }
  }

  /** 휴가 신청 접수 전 사전 검증 — 잔액/유효기간 (createRequest에서 호출) */
  private async validateLeaveCreatePayload(
    employeeId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { leaveTypeId, startDate, endDate } = payload as {
      leaveTypeId?: string
      startDate?: string
      endDate?: string
    }
    if (!leaveTypeId || !startDate || !endDate) {
      throw new BadRequestException({
        code: 'REQUEST_PAYLOAD_INVALID',
        message: '휴가 유형과 기간을 입력해 주세요.',
      })
    }

    const leaveType = await this.prisma.leaveType.findFirst({ where: { id: leaveTypeId } })
    if (!leaveType) {
      throw new BadRequestException({
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: '휴가 유형을 찾을 수 없습니다.',
      })
    }
    // 비활성화된(소프트 삭제) 휴가 유형으로는 신규 신청 불가 — 기존 잔액/이력은 보존하되 선택은 차단
    if (!leaveType.isActive) {
      throw new BadRequestException({
        code: 'LEAVE_TYPE_INACTIVE',
        message: '비활성화된 휴가 유형으로는 신청할 수 없습니다.',
      })
    }

    const start = new Date(startDate)
    const daysUsed = this.calcLeaveDaysUsed(startDate, endDate, Number(leaveType.deductionDays))

    await this.leavesService.validateBalance({
      employeeId,
      leaveTypeId,
      daysUsed,
      startDate: start,
      year: start.getFullYear(),
    })
  }

  /** 휴가 차감 일수 계산: 기간 일수(양 끝 포함) × 유형별 차감 단위 */
  private calcLeaveDaysUsed(startDate: string, endDate: string, deductionDays: number): number {
    const MS_PER_DAY = 24 * 60 * 60 * 1000
    const start = new Date(`${startDate.slice(0, 10)}T00:00:00.000Z`)
    const end = new Date(`${endDate.slice(0, 10)}T00:00:00.000Z`)
    const calendarDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1)
    return calendarDays * (deductionDays > 0 ? deductionDays : 1)
  }

  /** LEAVE_CREATE 승인 → Leave 생성 + 잔액 차감 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async applyLeaveCreate(tx: any, employeeId: string, payload: Record<string, unknown>) {
    const { leaveTypeId, startDate, endDate, reason } = payload as {
      leaveTypeId: string
      startDate: string
      endDate: string
      reason?: string
    }

    const leaveType = await tx.leaveType.findFirst({ where: { id: leaveTypeId } })
    if (!leaveType) {
      throw new BadRequestException({
        code: 'LEAVE_TYPE_NOT_FOUND',
        message: '휴가 유형을 찾을 수 없습니다.',
      })
    }

    const daysUsed = this.calcLeaveDaysUsed(startDate, endDate, Number(leaveType.deductionDays))
    const year = new Date(startDate).getFullYear()

    // 잔액 재검증 (신청~승인 사이 잔액 변동 가능) — 부족하면 승인 트랜잭션 롤백
    const balance = await tx.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    })
    if (!balance) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_NOT_FOUND',
        message: '해당 연도에 휴가 잔액이 없습니다.',
      })
    }
    if (Number(balance.remainingDays) < daysUsed) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_INSUFFICIENT',
        message: `잔여 휴가일이 부족합니다. (잔여: ${balance.remainingDays}일, 필요: ${daysUsed}일)`,
      })
    }
    if (balance.expiresAt && balance.expiresAt < new Date(startDate)) {
      throw new BadRequestException({
        code: 'LEAVE_BALANCE_EXPIRED',
        message: '휴가 유효기간이 만료되었습니다.',
      })
    }

    await tx.leave.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        daysUsed,
        status: 'APPROVED',
        reason: (reason as string) ?? null,
      },
    })

    await tx.leaveBalance.update({
      where: { id: balance.id },
      data: {
        usedDays: { increment: daysUsed },
        remainingDays: { decrement: daysUsed },
      },
    })
  }

  /** LEAVE_MODIFY 승인 → 기간 수정 + 잔액 차액 반영 */
  private async applyLeaveModify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { leaveId, startDate, endDate, reason } = payload as {
      leaveId: string
      startDate?: string
      endDate?: string
      reason?: string
    }

    // 소유권 검증: 요청자 본인의 휴가만 수정 가능 (타 직원 레코드 조작 차단)
    const leave = await tx.leave.findFirst({
      where: { id: leaveId, employeeId, employee: { companyId } },
      include: { leaveType: { select: { deductionDays: true } } },
    })
    if (!leave) {
      throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: '휴가를 찾을 수 없습니다.' })
    }

    const newStart = startDate ?? leave.startDate.toISOString()
    const newEnd = endDate ?? leave.endDate.toISOString()
    const newDaysUsed = this.calcLeaveDaysUsed(
      newStart,
      newEnd,
      Number(leave.leaveType.deductionDays),
    )
    const delta = newDaysUsed - Number(leave.daysUsed)

    await tx.leave.update({
      where: { id: leaveId },
      data: {
        startDate: new Date(newStart),
        endDate: new Date(newEnd),
        daysUsed: newDaysUsed,
        ...(reason !== undefined && { reason }),
      },
    })

    if (delta !== 0) {
      const year = leave.startDate.getFullYear()
      await tx.leaveBalance.updateMany({
        where: { employeeId, leaveTypeId: leave.leaveTypeId, year },
        data: {
          usedDays: { increment: delta },
          remainingDays: { decrement: delta },
        },
      })
    }
  }

  /** LEAVE_DELETE 승인 → 휴가 삭제 + 잔액 복원 */
  private async applyLeaveDelete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { leaveId } = payload as { leaveId: string }

    // 소유권 검증: 요청자 본인의 휴가만 삭제 가능
    const leave = await tx.leave.findFirst({
      where: { id: leaveId, employeeId, employee: { companyId } },
    })
    if (!leave) {
      throw new NotFoundException({ code: 'LEAVE_NOT_FOUND', message: '휴가를 찾을 수 없습니다.' })
    }

    await tx.leave.delete({ where: { id: leaveId } })

    const restored = Number(leave.daysUsed)
    await tx.leaveBalance.updateMany({
      where: {
        employeeId: leave.employeeId,
        leaveTypeId: leave.leaveTypeId,
        year: leave.startDate.getFullYear(),
      },
      data: {
        usedDays: { decrement: restored },
        remainingDays: { increment: restored },
      },
    })
  }

  /** SHIFT_CREATE 승인 → Shift 생성 (승인됨 = 확정 상태) */
  private async applyShiftCreate(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { date, templateId, startTime, endTime } = payload as {
      date: string
      templateId?: string
      startTime?: string
      endTime?: string
    }

    // 본조직(또는 첫 소속 조직) 결정
    const employeeOrg = await tx.employeeOrganization.findFirst({
      where: { employeeId, organization: { companyId } },
      orderBy: [{ isPrimary: 'desc' }],
    })
    if (!employeeOrg) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ORGANIZATION_NOT_FOUND',
        message: '직원의 소속 조직이 없어 근무일정을 생성할 수 없습니다.',
      })
    }

    let shiftTypeId: string
    let startAt: Date
    let endAt: Date
    let resolvedTemplateId: string | null = null

    if (templateId) {
      const template = await tx.shiftTemplate.findFirst({
        where: { id: templateId, companyId, isActive: true },
      })
      if (!template) {
        throw new BadRequestException({
          code: 'SHIFT_TEMPLATE_NOT_FOUND',
          message: '근무 템플릿을 찾을 수 없습니다.',
        })
      }
      shiftTypeId = template.shiftTypeId
      resolvedTemplateId = template.id
      startAt = this.combineDateAndTime(date, template.startTime)
      endAt = this.combineDateAndTime(date, template.endTime)
    } else {
      const defaultType = await tx.shiftType.findFirst({
        where: { companyId, isActive: true },
        orderBy: { createdAt: 'asc' },
      })
      if (!defaultType) {
        throw new BadRequestException({
          code: 'SHIFT_TYPE_NOT_FOUND',
          message: '근무일정 유형이 없어 일정을 생성할 수 없습니다.',
        })
      }
      shiftTypeId = defaultType.id
      // 시간 미지정 시 09:00~18:00 기본 (과거 요청 호환)
      startAt = new Date(`${date}T${(startTime ?? '09:00').padStart(5, '0')}:00`)
      endAt = new Date(`${date}T${(endTime ?? '18:00').padStart(5, '0')}:00`)
    }

    // 야간 근무: 종료가 시작보다 이르면 익일 처리
    if (endAt <= startAt) {
      endAt = new Date(endAt.getTime() + 24 * 60 * 60 * 1000)
    }

    await tx.shift.create({
      data: {
        employeeId,
        organizationId: employeeOrg.organizationId,
        shiftTypeId,
        templateId: resolvedTemplateId,
        startAt,
        endAt,
        status: ShiftStatus.CONFIRMED,
        confirmedAt: new Date(),
        createdBy: employeeId,
      },
    })
  }

  /** SHIFT_MODIFY 승인 → Shift 시간 수정 */
  private async applyShiftModify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { shiftId, date, startTime, endTime } = payload as {
      shiftId: string
      date?: string
      startTime?: string
      endTime?: string
    }

    // 소유권 검증: 요청자 본인의 근무일정만 수정 가능
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, employeeId, organization: { companyId } },
    })
    if (!shift) {
      throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: '근무일정을 찾을 수 없습니다.' })
    }

    const baseDate = date ?? shift.startAt.toISOString().slice(0, 10)
    const newStart = startTime ? new Date(`${baseDate}T${startTime}:00`) : shift.startAt
    let newEnd = endTime ? new Date(`${baseDate}T${endTime}:00`) : shift.endAt
    if (newEnd <= newStart) {
      newEnd = new Date(newEnd.getTime() + 24 * 60 * 60 * 1000)
    }

    await tx.shift.update({
      where: { id: shiftId },
      data: { startAt: newStart, endAt: newEnd },
    })
  }

  /** SHIFT_DELETE 승인 → Shift 삭제 */
  private async applyShiftDelete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { shiftId } = payload as { shiftId: string }

    // 소유권 검증: 요청자 본인의 근무일정만 삭제 가능
    const shift = await tx.shift.findFirst({
      where: { id: shiftId, employeeId, organization: { companyId } },
    })
    if (!shift) {
      throw new NotFoundException({ code: 'SHIFT_NOT_FOUND', message: '근무일정을 찾을 수 없습니다.' })
    }

    await tx.shift.delete({ where: { id: shiftId } })
  }

  /** ATTENDANCE_EDIT/CREATE 승인 → 출퇴근 기록 수정(없으면 생성) */
  private async applyAttendanceUpsert(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { attendanceId, date, clockInAt, clockOutAt, note } = payload as {
      attendanceId?: string
      date: string
      clockInAt?: string // 'HH:MM'
      clockOutAt?: string // 'HH:MM'
      note?: string
    }

    const newClockIn = clockInAt ? new Date(`${date}T${clockInAt}:00`) : undefined
    let newClockOut = clockOutAt ? new Date(`${date}T${clockOutAt}:00`) : undefined
    if (newClockIn && newClockOut && newClockOut <= newClockIn) {
      newClockOut = new Date(newClockOut.getTime() + 24 * 60 * 60 * 1000)
    }

    // 대상 기록: attendanceId 지정 시 해당 건, 아니면 해당 날짜의 첫 기록
    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(`${date}T23:59:59.999`)
    const existing = attendanceId
      ? await tx.attendance.findFirst({
          // 소유권 검증: 요청자 본인의 출퇴근 기록만 정정 가능
          where: { id: attendanceId, employeeId, employee: { companyId } },
        })
      : await tx.attendance.findFirst({
          where: {
            employeeId,
            employee: { companyId },
            clockInAt: { gte: dayStart, lte: dayEnd },
          },
          orderBy: { clockInAt: 'asc' },
        })

    if (existing) {
      if (existing.isConfirmed) {
        throw new BadRequestException({
          code: 'ATTENDANCE_ALREADY_CONFIRMED',
          message: '확정된 출퇴근 기록은 정정할 수 없습니다.',
        })
      }
      await tx.attendance.update({
        where: { id: existing.id },
        data: {
          ...(newClockIn && { clockInAt: newClockIn }),
          ...(newClockOut && { clockOutAt: newClockOut }),
          ...(note !== undefined && { note }),
        },
      })
      return
    }

    // 기록이 없으면 신규 생성 (누락 기록 보정)
    if (!newClockIn) {
      throw new BadRequestException({
        code: 'REQUEST_PAYLOAD_INVALID',
        message: '출근 시각이 없어 출퇴근 기록을 생성할 수 없습니다.',
      })
    }
    await tx.attendance.create({
      data: {
        employeeId,
        clockInAt: newClockIn,
        clockOutAt: newClockOut ?? null,
        clockInMethod: 'manual',
        status: 'normal',
        isOncall: false,
        note: note ?? '[요청 승인으로 생성]',
      },
    })
  }

  /** ATTENDANCE_DELETE 승인 → 출퇴근 기록 삭제 */
  private async applyAttendanceDelete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    employeeId: string,
    payload: Record<string, unknown>,
  ) {
    const { attendanceId } = payload as { attendanceId: string }

    // 소유권 검증: 요청자 본인의 출퇴근 기록만 삭제 가능
    const attendance = await tx.attendance.findFirst({
      where: { id: attendanceId, employeeId, employee: { companyId } },
    })
    if (!attendance) {
      throw new NotFoundException({
        code: 'ATTENDANCE_NOT_FOUND',
        message: '출퇴근 기록을 찾을 수 없습니다.',
      })
    }
    if (attendance.isConfirmed) {
      throw new BadRequestException({
        code: 'ATTENDANCE_ALREADY_CONFIRMED',
        message: '확정된 출퇴근 기록은 삭제할 수 없습니다.',
      })
    }

    await tx.attendance.delete({ where: { id: attendanceId } })
  }

  /** Prisma @db.Time(1970-01-01 기준) 값과 날짜 문자열을 합성 */
  private combineDateAndTime(date: string, time: Date): Date {
    const hh = String(time.getUTCHours()).padStart(2, '0')
    const mm = String(time.getUTCMinutes()).padStart(2, '0')
    return new Date(`${date}T${hh}:${mm}:00`)
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

  /**
   * 결재 권한 검증:
   * - SUPER_ADMIN / GENERAL_ADMIN: 무조건 허용
   * - ORG_ADMIN: 요청자(requesterId)가 자신의 소속 조직 구성원이면 허용 (조직 교집합 검사)
   * - 그 외: 해당 문서의 PENDING ApprovalStep assignee일 때만 허용
   */
  private async assertIsApprover(
    request: { id: string; companyId: string; requesterId: string; documentId: string | null },
    requester: JwtPayload,
  ) {
    // 자기결재 방지: 본인이 신청한 요청은 본인이 결재할 수 없다 (관리자 포함).
    if (requester.employeeId === request.requesterId) {
      throw new ForbiddenException({
        code: 'REQUEST_SELF_APPROVAL',
        message: '본인이 신청한 요청은 본인이 결재할 수 없습니다.',
      })
    }

    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return
    }

    // ORG_ADMIN — 같은 조직 구성원의 요청이면 승인/거절 가능
    if (requester.accessLevel === AccessLevel.ORG_ADMIN) {
      const [approverOrgIds, requesterOrgIds] = await Promise.all([
        this.getEmployeeOrgIds(request.companyId, requester.employeeId),
        this.getEmployeeOrgIds(request.companyId, request.requesterId),
      ])
      const approverOrgSet = new Set(approverOrgIds)
      const hasOverlap = requesterOrgIds.some((orgId) => approverOrgSet.has(orgId))
      if (hasOverlap) {
        return
      }
      // 타 조직 요청이면 아래 ApprovalStep assignee 검사로 위임 (지명 결재자는 허용)
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

  /** 직원의 소속 조직 ID 목록 (companyId 조건 포함 — 멀티테넌시) */
  private async getEmployeeOrgIds(companyId: string, employeeId: string): Promise<string[]> {
    const orgs = await this.prisma.employeeOrganization.findMany({
      where: { employeeId, organization: { companyId } },
      select: { organizationId: true },
    })
    return orgs.map((o: { organizationId: string }) => o.organizationId)
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

  private async isRoundComplete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
