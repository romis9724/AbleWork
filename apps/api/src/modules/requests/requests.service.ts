import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import {
  CreateRequestDto,
  CreateApprovalRuleDto,
  UpdateApprovalRuleDto,
  ApproveRejectDto,
  BulkApproveDto,
  RequestFilterDto,
} from './dto/create-request.dto'
import {
  REQUEST_TYPE_CATEGORY_MAP,
  REQUEST_TYPE_REQUESTED_EVENT,
  REQUEST_TYPE_APPROVED_EVENT,
} from './requests.constants'
import {
  assertRequestPending,
  loadRequestInCompany,
  getEmployeeOrgIds,
} from './requests.helpers'
import { RequestEffectsService } from './request-effects.service'
import { ApprovalRulesService } from './approval-rules.service'
import { RequestApprovalService } from './request-approval.service'

/**
 * HR 요청 — 목록/취소/수정/생성 + 부서 승인자 해석 (god file 분할 · 항목 24).
 * 결재 처리는 RequestApprovalService, 승인 효과 반영은 RequestEffectsService,
 * 승인 규칙 CRUD는 ApprovalRulesService에 위임한다.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly effects: RequestEffectsService,
    private readonly rules: ApprovalRulesService,
    private readonly approval: RequestApprovalService,
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
          const orgIds = await getEmployeeOrgIds(this.prisma, companyId, requester.employeeId)
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
    const request = await loadRequestInCompany(this.prisma, companyId, requestId)

    if (request.requesterId !== requester.employeeId) {
      throw new ForbiddenException({
        code: 'REQUEST_CANCEL_FORBIDDEN',
        message: '본인의 요청만 취소할 수 있습니다.',
      })
    }
    assertRequestPending(request)

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

  // ── 요청 수정 (본인의 PENDING 요청 내용 수정) ───────────────────────────────

  async updateRequest(
    companyId: string,
    requestId: string,
    payload: Record<string, unknown>,
    requester: JwtPayload,
  ) {
    const request = await loadRequestInCompany(this.prisma, companyId, requestId)

    if (request.requesterId !== requester.employeeId) {
      throw new ForbiddenException({
        code: 'REQUEST_EDIT_FORBIDDEN',
        message: '본인의 요청만 수정할 수 있습니다.',
      })
    }
    assertRequestPending(request)

    // 유형별 사전 검증을 신규 신청과 동일하게 적용 (잔액·근무유형 등)
    if (request.type === 'LEAVE_CREATE') {
      await this.effects.validateLeaveCreatePayload(companyId, requester.employeeId, payload)
    }
    if (request.type === 'SHIFT_CREATE') {
      await this.effects.validateShiftCreatePayload(companyId, payload)
    }

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const updatedRequest = await tx.request.update({
        where: { id: requestId },
        data: { payload },
      })
      // 전자결재 연동(양식) 문서가 있으면 본문도 동기화
      if (request.documentId) {
        await tx.document.update({
          where: { id: request.documentId },
          data: { content: payload },
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
      await this.effects.validateLeaveCreatePayload(companyId, requesterId, dto.payload)
    }
    // 근무일정 신청은 접수 전에 생성 가능 여부(템플릿/근무유형) 사전 검증 — 승인 단계에서 늦게 실패하지 않도록
    if (dto.type === 'SHIFT_CREATE') {
      await this.effects.validateShiftCreatePayload(companyId, dto.payload)
    }

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // 1. 승인 규칙 조회 (type 매칭, 조직/직위 범위 필터) — Request보다 먼저 결정해 ruleId 스냅샷에 기록
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

      // 2. Request 레코드 생성 (§6.6 #3 적용 규칙 id 스냅샷 — 규칙 변경 소급 방지·감사)
      const request = await tx.request.create({
        data: {
          companyId,
          requesterId,
          type: dto.type,
          payload: dto.payload,
          status: 'PENDING',
          ruleId: applicableRule?.id ?? null,
        },
      })

      // 3. 명시적으로 자동 승인이 설정된 규칙만 자동 승인.
      //    규칙이 아예 없으면 아래의 기본 결재선(승인 필요)으로 진행한다 — 무규칙 자동승인 금지.
      if (applicableRule?.isAutoApprove) {
        const updatedRequest = await tx.request.update({
          where: { id: request.id },
          data: { status: 'APPROVED' },
        })

        // 자동 승인도 실데이터 반영 (잔액 차감/Shift 생성 등) — 동일 트랜잭션 내 원자 처리
        await this.effects.applyApprovedRequest(tx, companyId, updatedRequest)

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
        // DocumentForm 미설정 시 → 문서는 만들지 않되, 부서 승인자(부서 조직관리자)에게 상신 알림을 보낸다.
        const noFormApproverId = await this.resolveDeptApprover(tx, companyId, requesterId)
        await tx.request.update({
          where: { id: request.id },
          data: { status: 'PENDING' },
        })
        const eventName =
          REQUEST_TYPE_REQUESTED_EVENT[dto.type] ?? `${dto.type.toLowerCase()}.requested`
        this.events.emit(eventName, {
          requestId: request.id,
          requesterId,
          companyId,
          assigneeId:
            noFormApproverId && noFormApproverId !== requesterId ? noFormApproverId : undefined,
          payload: dto.payload,
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

      // 부서 승인자 = 요청자 소속 부서의 조직관리자(없으면 상위 부서) — 결재자 미지정 시 1순위 fallback.
      // (전자결재의 부서 결재권자 organization.approverId 와는 별개)
      const deptApproverId = await this.resolveDeptApprover(tx, companyId, requesterId)

      // 1차(round 1) 첫 결재자 — 상신 알림(DM) 수신자로 사용
      let firstRoundAssigneeId: string | null = null

      for (const [round, details] of stepsByRound) {
        let stepOrder = 0
        for (const detail of details) {
          let assigneeId: string | null = null

          if (detail.positionId) {
            // 해당 직위를 가진 GENERAL_ADMIN 이상 직원 중 첫 번째 찾기
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

          // 승인자를 못 찾으면 ① 부서 조직관리자(상위 부서 포함) → ② 회사 관리자 순으로 fallback
          if (!assigneeId && deptApproverId && deptApproverId !== requesterId) {
            assigneeId = deptApproverId
          }
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

          if (round === 1 && firstRoundAssigneeId === null) {
            firstRoundAssigneeId = assigneeId
          }

          await tx.approvalStep.create({
            data: {
              lineId: approvalLine.id,
              role: `APPROVER_R${round}`,
              assigneeId,
              stepOrder: stepOrder++,
              // 같은 라운드에 승인자가 여럿이면 병렬(동시 활성)
              isParallel: details.length > 1,
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
        // 1차 결재자(팀장 등)에게 상신 알림(DM)이 가도록 수신자 지정 — 누락 시 본인에게만 가던 버그 수정
        assigneeId: firstRoundAssigneeId ?? undefined,
        payload: dto.payload,
      })

      return finalRequest
    })
  }

  /**
   * HR 요청(휴가/근무/근태 등)의 부서 승인자 해석 — **전자결재와 무관**.
   * 요청자 소속(대표) 부서에서 **조직관리자(ORG_ADMIN) 우선, 없으면 총괄관리자(GENERAL_ADMIN)** 를 찾고,
   * 그 부서에 둘 다 없으면 상위 부서로 올라가며 탐색한다.
   * (전자결재의 부서 결재권자 organization.approverId 와는 별개 체계)
   */
  private async resolveDeptApprover(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    companyId: string,
    requesterId: string,
  ): Promise<string | null> {
    const primary = await client.employeeOrganization.findFirst({
      where: { employeeId: requesterId, organization: { companyId } },
      orderBy: { isPrimary: 'desc' },
      select: { organizationId: true },
    })
    let orgId: string | null = primary?.organizationId ?? null
    let guard = 0
    while (orgId && guard++ < 20) {
      // 부서 승인자: 같은 부서의 조직관리자(ORG_ADMIN)를 먼저 찾고, 없으면 총괄관리자(GENERAL_ADMIN)도 인정한다.
      // (SUPER_ADMIN 등은 부서 트리에 승인자가 전혀 없을 때 createRequest의 회사 관리자 fallback이 처리)
      for (const level of [AccessLevel.ORG_ADMIN, AccessLevel.GENERAL_ADMIN]) {
        const admin = await client.employee.findFirst({
          where: {
            companyId,
            isActive: true,
            id: { not: requesterId },
            accessLevel: level,
            organizations: { some: { organizationId: orgId } },
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
        if (admin) return admin.id
      }
      const org = await client.organization.findUnique({
        where: { id: orgId },
        select: { parentId: true },
      })
      orgId = org?.parentId ?? null
    }
    return null
  }

  // ── 승인 규칙 CRUD (ApprovalRulesService 위임) ──────────────────────────────

  findApprovalRules(companyId: string) {
    return this.rules.findApprovalRules(companyId)
  }

  createApprovalRule(companyId: string, dto: CreateApprovalRuleDto) {
    return this.rules.createApprovalRule(companyId, dto)
  }

  updateApprovalRule(companyId: string, ruleId: string, dto: UpdateApprovalRuleDto) {
    return this.rules.updateApprovalRule(companyId, ruleId, dto)
  }

  deleteApprovalRule(companyId: string, ruleId: string) {
    return this.rules.deleteApprovalRule(companyId, ruleId)
  }

  // ── 결재 처리 (RequestApprovalService 위임) ──────────────────────────────────

  approve(companyId: string, requestId: string, dto: ApproveRejectDto, requester: JwtPayload) {
    return this.approval.approve(companyId, requestId, dto, requester)
  }

  reject(companyId: string, requestId: string, dto: ApproveRejectDto, requester: JwtPayload) {
    return this.approval.reject(companyId, requestId, dto, requester)
  }

  forceApprove(companyId: string, requestId: string, dto: ApproveRejectDto, requester: JwtPayload) {
    return this.approval.forceApprove(companyId, requestId, dto, requester)
  }

  forceReject(companyId: string, requestId: string, dto: ApproveRejectDto, requester: JwtPayload) {
    return this.approval.forceReject(companyId, requestId, dto, requester)
  }

  bulkApprove(companyId: string, dto: BulkApproveDto, requester: JwtPayload) {
    return this.approval.bulkApprove(companyId, dto, requester)
  }
}
