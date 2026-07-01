import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import {
  DocStatus,
  StepRole,
  StepStatus,
  APPROVAL_FLOW_ROLES,
  DEPT_ROLES,
  ACTED_STEP_STATUSES,
} from './documents.constants'
import { DocumentBoxFilterDto } from './dto/document.dto'
import {
  DRAFT_BOX_STATUSES,
  StepRecord,
  assertCanRead,
  buildSearchOr,
  derivePhase,
  deriveCurrentApprover,
  isCompanyAdmin,
  todayDateOnly,
} from './documents.helpers'

/**
 * 전자결재 조회 — 문서함 목록(box별 where 조립) + 문서 상세 (god file 분할 · 항목 24).
 * 쓰기/상신은 DocumentsService·DocumentStepsService 담당.
 */
@Injectable()
export class DocumentQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // ── AP-04-01 문서함 목록 ─────────────────────────────────────────────────────

  async findAll(companyId: string, filter: DocumentBoxFilterDto, user: JwtPayload) {
    const { page, limit, search, searchField } = filter
    const skip = (page - 1) * limit

    const { where, myAssigneeIds } = await this.buildBoxWhere(companyId, filter, user)

    if (search?.trim()) {
      where.OR = buildSearchOr(search.trim(), searchField ?? 'all')
    }

    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          form: { select: { id: true, name: true, category: true } },
          category: { select: { id: true, name: true, abbreviation: true } },
          drafter: { select: { id: true, name: true } },
          approvalLines: {
            select: {
              steps: {
                select: {
                  id: true,
                  role: true,
                  status: true,
                  stepOrder: true,
                  assigneeId: true,
                  assignee: { select: { id: true, name: true } },
                },
                orderBy: { stepOrder: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ])

    const assigneeIdSet = new Set(myAssigneeIds)
    type StepWithAssignee = StepRecord & { assignee?: { id: string; name: string } | null }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = rows.map((doc: any) => {
      const steps: StepWithAssignee[] = doc.approvalLines.flatMap(
        (line: { steps: StepWithAssignee[] }) => line.steps,
      )
      return {
        id: doc.id,
        docNumber: doc.docNumber,
        title: doc.title,
        status: doc.status,
        submittedAt: doc.submittedAt,
        completedAt: doc.completedAt,
        createdAt: doc.createdAt,
        form: doc.form,
        category: doc.category,
        drafter: doc.drafter,
        mySteps: steps.filter((s) => assigneeIdSet.has(s.assigneeId)),
        // 결재 현황용: 상신(미처리)/진행중(일부 승인) 구분 + 현재 결재자
        phase: derivePhase(doc.status, steps),
        currentApprover: deriveCurrentApprover(steps),
      }
    })

    return { items, total, page, limit }
  }

  // ── AP-04-02 문서 상세 ───────────────────────────────────────────────────────

  async findOne(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        form: true,
        category: { select: { id: true, name: true, abbreviation: true } },
        drafter: { select: { id: true, name: true } },
        approvalLines: {
          include: {
            steps: {
              include: {
                assignee: { select: { id: true, name: true } },
                proxy: { select: { id: true, name: true } },
                organization: { select: { id: true, name: true } },
              },
              orderBy: { stepOrder: 'asc' },
            },
          },
        },
        history: {
          include: { actor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        request: { select: { id: true, type: true, status: true } },
      },
    })
    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: '문서를 찾을 수 없습니다.',
      })
    }

    assertCanRead(document, user)

    return document
  }

  // ── 내부: 문서함 where 조립 ──────────────────────────────────────────────────

  private async buildBoxWhere(
    companyId: string,
    filter: DocumentBoxFilterDto,
    user: JwtPayload,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ where: Record<string, any>; myAssigneeIds: string[] }> {
    const me = user.employeeId
    let myAssigneeIds = [me]

    // 참조/공람/수신 박스: 상신 전(DRAFT) 문서는 노출하지 않는다 (기안자 외 유출 방지).
    const stepBoxWhere = (role: string) => ({
      companyId,
      status: { not: DocStatus.DRAFT },
      approvalLines: { some: { steps: { some: { role, assigneeId: me } } } },
    })

    switch (filter.box) {
      case 'draft':
        return {
          where: { companyId, drafterId: me, status: { in: DRAFT_BOX_STATUSES } },
          myAssigneeIds,
        }
      case 'in_progress':
        return {
          where: { companyId, drafterId: me, status: DocStatus.PENDING },
          myAssigneeIds,
        }
      case 'completed':
        return {
          where: {
            companyId,
            drafterId: me,
            status: { in: [DocStatus.APPROVED, DocStatus.REJECTED] },
          },
          myAssigneeIds,
        }
      case 'pending_approval': {
        // 내가 대리인인 principal들의 단계도 포함 (유효한 ProxySettings)
        const today = todayDateOnly()
        const proxies = await this.prisma.proxySettings.findMany({
          where: {
            proxyId: me,
            isActive: true,
            startDate: { lte: today },
            endDate: { gte: today },
          },
          select: { principalId: true },
        })
        myAssigneeIds = [me, ...proxies.map((p: { principalId: string }) => p.principalId)]
        return {
          where: {
            companyId,
            status: DocStatus.PENDING,
            approvalLines: {
              some: {
                steps: {
                  some: {
                    assigneeId: { in: myAssigneeIds },
                    status: StepStatus.PENDING,
                    role: { in: APPROVAL_FLOW_ROLES },
                  },
                },
              },
            },
          },
          myAssigneeIds,
        }
      }
      case 'reference':
        return { where: stepBoxWhere(StepRole.REFERENCE), myAssigneeIds }
      case 'viewer':
        return { where: stepBoxWhere(StepRole.VIEWER), myAssigneeIds }
      case 'receiver':
        return { where: stepBoxWhere(StepRole.RECEIVER), myAssigneeIds }
      case 'dept-docs': {
        // AP-05-04 부서문서함: 내가 부서 담당자인 부서협조/부서수신 문서.
        // 다중 담당자 지원 — 상신 시 해석된 assignee(대표)뿐 아니라 내가 담당자인 부서의 step도 포함.
        const managedOrgs = await this.prisma.organizationDocManager.findMany({
          where: { employeeId: me },
          select: { organizationId: true },
        })
        const managedOrgIds = managedOrgs.map((m: { organizationId: string }) => m.organizationId)
        const stepMatch: Record<string, unknown>[] = [{ assigneeId: me }]
        if (managedOrgIds.length) {
          stepMatch.push({ organizationId: { in: managedOrgIds } })
        }
        return {
          where: {
            companyId,
            status: { not: DocStatus.DRAFT },
            approvalLines: {
              some: { steps: { some: { role: { in: DEPT_ROLES }, OR: stepMatch } } },
            },
          },
          myAssigneeIds,
        }
      }
      case 'status': {
        // AP-05-06 결재 현황 (관리자 — 카카오워크 동일: 상신/진행중/반려만)
        if (!isCompanyAdmin(user)) {
          throw new ForbiddenException({
            code: 'DOCUMENT_STATUS_FORBIDDEN',
            message: '결재 현황은 관리자만 조회할 수 있습니다.',
          })
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: Record<string, any> = { companyId }

        // 액티드 step 유무로 상신(미처리)/진행중(일부 승인) 구분
        const actedSome = {
          some: { steps: { some: { status: { in: ACTED_STEP_STATUSES } } } },
        }
        if (filter.status === 'REJECTED') {
          where.status = DocStatus.REJECTED
        } else if (filter.status === 'SUBMITTED') {
          where.status = DocStatus.PENDING
          where.approvalLines = { none: { steps: { some: { status: { in: ACTED_STEP_STATUSES } } } } }
        } else if (filter.status === 'IN_PROGRESS') {
          where.status = DocStatus.PENDING
          where.approvalLines = actedSome
        } else {
          // 전체: 상신/진행중(PENDING) + 반려(REJECTED)
          where.status = { in: [DocStatus.PENDING, DocStatus.REJECTED] }
        }

        if (filter.formId) where.formId = filter.formId
        if (filter.dateFrom || filter.dateTo) {
          where.submittedAt = {
            ...(filter.dateFrom && { gte: new Date(`${filter.dateFrom}T00:00:00.000Z`) }),
            ...(filter.dateTo && { lte: new Date(`${filter.dateTo}T23:59:59.999Z`) }),
          }
        }
        return { where, myAssigneeIds }
      }
      case 'ledger': {
        if (!isCompanyAdmin(user)) {
          throw new ForbiddenException({
            code: 'DOCUMENT_LEDGER_FORBIDDEN',
            message: '문서대장은 관리자만 조회할 수 있습니다.',
          })
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: Record<string, any> = { companyId }
        if (filter.status) {
          where.status = filter.status
        }
        return { where, myAssigneeIds }
      }
    }
  }
}
