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
import { EVENTS } from '../../events/domain-events'
import {
  DocStatus,
  StepRole,
  StepStatus,
  APPROVAL_FLOW_ROLES,
  RECEIVER_ROLES,
  DEPT_ROLES,
  ACTED_STEP_STATUSES,
  HistoryAction,
} from './documents.constants'
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  SubmitDocumentDto,
  DocumentBoxFilterDto,
  StepInput,
  StepInputSchema,
} from './dto/document.dto'
import { z } from 'zod'

/** DRAFT/RECALLED/REJECTED — 기안자가 수정·재상신할 수 있는 상태 */
const EDITABLE_STATUSES: string[] = [DocStatus.DRAFT, DocStatus.RECALLED, DocStatus.REJECTED]

type StepRecord = {
  id: string
  role: string
  assigneeId: string
  organizationId?: string | null
  stepOrder: number
  status: string
}

/** assigneeId가 확정된 결재 단계 (부서 단계는 부서 문서담당자로 해석 완료) */
type ResolvedStep = {
  role: string
  assigneeId: string
  organizationId: string | null
  stepOrder: number
}

/**
 * AP — 기안 작성/상신/회수 + 문서함 조회 (Goal 12, 16)
 * 결재 처리(승인/반려/전결 등)는 ApprovalActionsService 담당.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── AP-02-01 기안 작성 (DRAFT 저장) ─────────────────────────────────────────

  async create(companyId: string, dto: CreateDocumentDto, user: JwtPayload) {
    const form = await this.prisma.documentForm.findFirst({
      where: { id: dto.formId, companyId, isActive: true },
    })
    if (!form) {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: '기안 양식을 찾을 수 없습니다.',
      })
    }

    const resolvedSteps = dto.steps?.length
      ? await this.resolveSteps(companyId, dto.steps)
      : []

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const document = await tx.document.create({
        data: {
          companyId,
          formId: dto.formId,
          title: dto.title,
          content: dto.content,
          drafterId: user.employeeId,
          status: DocStatus.DRAFT,
        },
      })

      // DRAFT 단계의 steps 보존: ApprovalLine+Step으로 저장(전부 WAITING).
      // 상신 시 삭제 후 재생성되므로 임시 보관용이다.
      if (resolvedSteps.length) {
        await this.createDraftLine(tx, document.id, resolvedSteps)
      }

      return document
    })
  }

  // ── AP-02-02 기안 수정 (DRAFT/RECALLED/REJECTED + 기안자 본인) ───────────────

  async update(companyId: string, documentId: string, dto: UpdateDocumentDto, user: JwtPayload) {
    const document = await this.loadDraftableDocument(companyId, documentId, user)

    const resolvedSteps = dto.steps?.length
      ? await this.resolveSteps(companyId, dto.steps)
      : []

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // steps가 오면 기존 결재선 전체 교체 (DRAFT 보관분 갱신)
      if (dto.steps) {
        await tx.approvalLine.deleteMany({ where: { documentId } })
        if (resolvedSteps.length) {
          await this.createDraftLine(tx, documentId, resolvedSteps)
        }
      }

      return tx.document.update({
        where: { id: document.id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.content !== undefined && { content: dto.content }),
        },
      })
    })
  }

  // ── AP-02-03 기안 삭제 (DRAFT만, 기안자 본인) ────────────────────────────────

  async remove(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.findOwnDocument(companyId, documentId)
    this.assertDrafter(document, user)

    if (document.status !== DocStatus.DRAFT) {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_DRAFT',
        message: '임시저장 상태의 문서만 삭제할 수 있습니다.',
      })
    }

    await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.approvalLine.deleteMany({ where: { documentId } })
      await tx.document.delete({ where: { id: documentId } })
    })

    return { deleted: true }
  }

  // ── AP-05-06 관리자 강제 삭제 (GENERAL_ADMIN+, 임의 상태) ─────────────────────
  // 결재 현황에서 오류/중단된 문서를 관리자가 제거. 상태·기안자 제한 없음.
  async forceDelete(companyId: string, documentId: string, user: JwtPayload) {
    if (!this.isCompanyAdmin(user)) {
      throw new ForbiddenException({
        code: 'DOCUMENT_FORCE_DELETE_FORBIDDEN',
        message: '문서 강제 삭제는 관리자(GENERAL_ADMIN 이상)만 가능합니다.',
      })
    }

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
    })
    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: '문서를 찾을 수 없습니다.',
      })
    }

    // HR 요청과 연결된 문서는 삭제 시 request.documentId가 끊겨(SetNull) 요청 워크플로가 깨진다.
    // 이 경우 요청 취소 흐름으로 처리하도록 강제 삭제를 차단한다.
    const linkedRequest = await this.prisma.request.findFirst({
      where: { documentId, companyId },
      select: { id: true },
    })
    if (linkedRequest) {
      throw new BadRequestException({
        code: 'DOCUMENT_LINKED_TO_REQUEST',
        message: 'HR 요청과 연결된 문서는 강제 삭제할 수 없습니다. 해당 요청을 취소해 주세요.',
      })
    }

    await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // ApprovalHistory는 onDelete 미지정(Restrict)이라 먼저 삭제. approvalLines→steps는 Cascade.
      await tx.approvalHistory.deleteMany({ where: { documentId } })
      await tx.document.delete({ where: { id: documentId } })
    })

    return { deleted: true }
  }

  // ── AP-02-04 상신 / 재상신 ───────────────────────────────────────────────────

  async submit(companyId: string, documentId: string, dto: SubmitDocumentDto, user: JwtPayload) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        form: true,
        approvalLines: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    })
    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: '문서를 찾을 수 없습니다.',
      })
    }
    this.assertNotRequestManaged(document)
    this.assertDrafter(document, user)

    if (!EDITABLE_STATUSES.includes(document.status)) {
      throw new BadRequestException({
        code: 'DOCUMENT_ALREADY_SUBMITTED',
        message: '이미 상신된 문서입니다.',
      })
    }
    // REJECTED 재상신만 allowReDraft 필요 (RECALLED 재상신은 항상 허용)
    if (document.status === DocStatus.REJECTED && !document.form.allowReDraft) {
      throw new BadRequestException({
        code: 'DOCUMENT_REDRAFT_NOT_ALLOWED',
        message: '이 양식은 반려 문서의 재기안을 허용하지 않습니다.',
      })
    }

    const existingSteps: StepInput[] = document.approvalLines
      .flatMap((line: { steps: StepRecord[] }) => line.steps)
      .map((s: StepRecord) => ({
        role: s.role as StepInput['role'],
        // 부서 단계는 organizationId만 보존하고 상신 시 현재 부서 담당자로 재해석한다.
        ...(DEPT_ROLES.includes(s.role)
          ? { organizationId: s.organizationId ?? undefined }
          : { assigneeId: s.assigneeId }),
        stepOrder: s.stepOrder,
      }))

    const { steps, sharedLineId } = await this.resolveSubmitSteps(companyId, dto, existingSteps)
    const resolvedSteps = await this.resolveSteps(companyId, steps)

    // docNumber unique 충돌(동시 채번) 시 1회 재시도
    const result = await this.runSubmitTransaction(
      companyId,
      document,
      resolvedSteps,
      sharedLineId,
      user,
    )
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === 'P2002') {
          return this.runSubmitTransaction(companyId, document, resolvedSteps, sharedLineId, user)
        }
        throw error
      })

    this.events.emit(EVENTS.DOCUMENT_SUBMITTED, {
      documentId: document.id,
      companyId,
      drafterId: document.drafterId,
      title: document.title,
    })
    if (result.firstAssigneeId) {
      this.events.emit(EVENTS.DOCUMENT_STEP_PENDING, {
        documentId: document.id,
        companyId,
        assigneeId: result.firstAssigneeId,
      })
    }

    return result.document
  }

  // ── AP-02-05 회수 (기안자 본인, 결재 처리 전만) ──────────────────────────────

  async recall(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: { approvalLines: { include: { steps: true } } },
    })
    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: '문서를 찾을 수 없습니다.',
      })
    }
    this.assertNotRequestManaged(document)
    this.assertDrafter(document, user)

    if (document.status !== DocStatus.PENDING) {
      throw new BadRequestException({
        code: 'DOCUMENT_CANNOT_RECALL',
        message: '진행중인 문서만 회수할 수 있습니다.',
      })
    }

    const hasActedStep = document.approvalLines
      .flatMap((line: { steps: StepRecord[] }) => line.steps)
      .some((s: StepRecord) => ACTED_STEP_STATUSES.includes(s.status))
    if (hasActedStep) {
      throw new BadRequestException({
        code: 'DOCUMENT_CANNOT_RECALL',
        message: '결재가 진행된 문서는 회수할 수 없습니다.',
      })
    }

    const updated = await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const doc = await tx.document.update({
        where: { id: documentId },
        data: { status: DocStatus.RECALLED },
      })
      await tx.approvalHistory.create({
        data: {
          documentId,
          actorId: user.employeeId,
          action: HistoryAction.RECALL,
        },
      })
      return doc
    })

    this.events.emit(EVENTS.DOCUMENT_RECALLED, {
      documentId,
      companyId,
      drafterId: document.drafterId,
      title: document.title,
    })

    return updated
  }

  // ── AP-04-01 문서함 목록 ─────────────────────────────────────────────────────

  async findAll(companyId: string, filter: DocumentBoxFilterDto, user: JwtPayload) {
    const { page, limit, search } = filter
    const skip = (page - 1) * limit

    const { where, myAssigneeIds } = await this.buildBoxWhere(companyId, filter, user)

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { docNumber: { contains: search } },
      ]
    }

    const [rows, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          form: { select: { id: true, name: true, category: true } },
          drafter: { select: { id: true, name: true } },
          approvalLines: {
            select: {
              steps: {
                select: { id: true, role: true, status: true, stepOrder: true, assigneeId: true },
                orderBy: { stepOrder: 'asc' },
              },
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
    ])

    const assigneeIdSet = new Set(myAssigneeIds)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = rows.map((doc: any) => {
      const steps: StepRecord[] = doc.approvalLines.flatMap(
        (line: { steps: StepRecord[] }) => line.steps,
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
        drafter: doc.drafter,
        mySteps: steps.filter((s) => assigneeIdSet.has(s.assigneeId)),
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

    this.assertCanRead(document, user)

    return document
  }

  // ── 내부: 상신 트랜잭션 ──────────────────────────────────────────────────────

  private async runSubmitTransaction(
    companyId: string,
    document: { id: string; formId: string; docNumber: string | null },
    steps: ResolvedStep[],
    sharedLineId: string | undefined,
    user: JwtPayload,
  ) {
    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // ① 기존 결재선 삭제 후 재생성 (재상신 포함 — 이전 상신 이력은 history에 보존)
      await tx.approvalLine.deleteMany({ where: { documentId: document.id } })

      const line = await tx.approvalLine.create({
        data: {
          documentId: document.id,
          name: '결재선',
          isShared: Boolean(sharedLineId),
          sharedLineRefId: sharedLineId ?? null,
        },
      })

      // ② 단계 상태 결정: 첫 결재(APPROVER/AGREEMENT) 단계만 PENDING,
      //    나머지 결재 WAITING / REFERENCE·VIEWER 즉시 PENDING(비차단) / RECEIVER WAITING
      const flowSteps = steps
        .filter((s) => APPROVAL_FLOW_ROLES.includes(s.role))
        .sort((a, b) => a.stepOrder - b.stepOrder)
      const firstFlowOrder = flowSteps[0]?.stepOrder

      await tx.approvalStep.createMany({
        data: steps.map((s) => ({
          lineId: line.id,
          role: s.role,
          assigneeId: s.assigneeId,
          organizationId: s.organizationId,
          stepOrder: s.stepOrder,
          status: this.initialStepStatus(s, firstFlowOrder),
        })),
      })

      // ③ 문서번호 채번 (없을 때만 — 재상신 시 기존 번호 유지)
      const docNumber =
        document.docNumber ?? (await this.issueDocNumber(tx, companyId, document.formId))

      // ④⑤ 상태 전이
      const updated = await tx.document.update({
        where: { id: document.id },
        data: { status: DocStatus.PENDING, submittedAt: new Date(), docNumber },
      })

      // ⑥ 감사 이력
      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          actorId: user.employeeId,
          action: HistoryAction.SUBMIT,
        },
      })

      return { document: updated, firstAssigneeId: flowSteps[0]?.assigneeId ?? null }
    })
  }

  private initialStepStatus(step: ResolvedStep, firstFlowOrder: number | undefined): string {
    if (APPROVAL_FLOW_ROLES.includes(step.role)) {
      return step.stepOrder === firstFlowOrder ? StepStatus.PENDING : StepStatus.WAITING
    }
    if (RECEIVER_ROLES.includes(step.role)) {
      return StepStatus.WAITING // 최종 승인 후 활성화 (RECEIVER + 부서수신)
    }
    return StepStatus.PENDING // REFERENCE/VIEWER — 즉시 확인 가능(비차단)
  }

  /** 상신 결재선 결정 우선순위: dto.steps > sharedLineId > DRAFT 보관 steps */
  private async resolveSubmitSteps(
    companyId: string,
    dto: SubmitDocumentDto,
    existingSteps: StepInput[],
  ): Promise<{ steps: StepInput[]; sharedLineId?: string }> {
    let steps: StepInput[] | undefined = dto.steps?.length ? dto.steps : undefined
    let sharedLineId: string | undefined

    if (!steps && dto.sharedLineId) {
      const sharedLine = await this.prisma.sharedApprovalLine.findFirst({
        where: { id: dto.sharedLineId, companyId },
      })
      if (!sharedLine) {
        throw new NotFoundException({
          code: 'SHARED_LINE_NOT_FOUND',
          message: '공용 결재선을 찾을 수 없습니다.',
        })
      }
      const parsed = z.array(StepInputSchema).safeParse(sharedLine.steps)
      if (!parsed.success) {
        throw new BadRequestException({
          code: 'SHARED_LINE_INVALID',
          message: '공용 결재선의 단계 구성이 올바르지 않습니다.',
        })
      }
      steps = parsed.data
      sharedLineId = sharedLine.id
    }

    if (!steps?.length) {
      steps = existingSteps
    }

    const hasApprover = steps.some((s) => APPROVAL_FLOW_ROLES.includes(s.role))
    if (!steps.length || !hasApprover) {
      throw new BadRequestException({
        code: 'APPROVAL_LINE_EMPTY',
        message: '결재(승인/협조) 단계를 하나 이상 지정해야 합니다.',
      })
    }

    return { steps, sharedLineId }
  }

  // ── 내부: 문서번호 채번 ──────────────────────────────────────────────────────

  /**
   * 채번 규칙(DocumentNumberRule) 기반 문서번호 발급.
   * - currentSeq를 increment 후 재조회 (동시성: docNumber unique + 호출부 1회 재시도)
   * - resetYearly: 올해 발급된 번호가 없으면 시퀀스를 0으로 리셋 (pattern에 연도 포함 가정)
   * - 규칙이 없으면 기본 'DOC-{YYYY}-{SEQ:4}' 패턴
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async issueDocNumber(tx: any, companyId: string, formId: string): Promise<string> {
    const now = new Date()
    const year = now.getFullYear()

    const rule = await tx.documentNumberRule.findFirst({ where: { companyId, formId } })

    if (!rule) {
      const prefix = `DOC-${year}-`
      const count = await tx.document.count({
        where: { companyId, docNumber: { startsWith: prefix } },
      })
      return `${prefix}${String(count + 1).padStart(4, '0')}`
    }

    if (rule.resetYearly && rule.currentSeq > 0) {
      const yearStart = new Date(year, 0, 1)
      const issuedThisYear = await tx.document.findFirst({
        where: {
          companyId,
          formId,
          docNumber: { not: null },
          submittedAt: { gte: yearStart },
        },
        select: { id: true },
      })
      if (!issuedThisYear) {
        await tx.documentNumberRule.update({
          where: { id: rule.id },
          data: { currentSeq: 0 },
        })
      }
    }

    await tx.documentNumberRule.update({
      where: { id: rule.id },
      data: { currentSeq: { increment: 1 } },
    })
    const updatedRule = await tx.documentNumberRule.findFirst({ where: { id: rule.id } })

    return this.renderDocNumber(rule.pattern, now, updatedRule.currentSeq)
  }

  /** pattern 토큰 치환: {YYYY}, {MM}, {SEQ:n}(0패딩 n자리, n 생략 시 패딩 없음) */
  private renderDocNumber(pattern: string, date: Date, seq: number): string {
    return pattern
      .replace(/\{YYYY\}/g, String(date.getFullYear()))
      .replace(/\{MM\}/g, String(date.getMonth() + 1).padStart(2, '0'))
      .replace(/\{SEQ(?::(\d+))?\}/g, (_match, width?: string) =>
        width ? String(seq).padStart(Number(width), '0') : String(seq),
      )
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

    const stepBoxWhere = (role: string) => ({
      companyId,
      approvalLines: { some: { steps: { some: { role, assigneeId: me } } } },
    })

    switch (filter.box) {
      case 'draft':
        return {
          where: { companyId, drafterId: me, status: { in: EDITABLE_STATUSES } },
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
        const today = this.todayDateOnly()
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
      case 'dept-docs':
        // AP-05-04 부서문서함: 내가 부서 담당자(상신 시 해석된 assignee)인 부서협조/부서수신 문서
        return {
          where: {
            companyId,
            approvalLines: {
              some: { steps: { some: { role: { in: DEPT_ROLES }, assigneeId: me } } },
            },
          },
          myAssigneeIds,
        }
      case 'ledger': {
        if (!this.isCompanyAdmin(user)) {
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

  // ── 내부: 공통 헬퍼 ──────────────────────────────────────────────────────────

  private async findOwnDocument(companyId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
    })
    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: '문서를 찾을 수 없습니다.',
      })
    }
    return document
  }

  private async loadDraftableDocument(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.findOwnDocument(companyId, documentId)
    this.assertNotRequestManaged(document)
    this.assertDrafter(document, user)

    if (!EDITABLE_STATUSES.includes(document.status)) {
      throw new BadRequestException({
        code: 'DOCUMENT_ALREADY_SUBMITTED',
        message: '상신된 문서는 수정할 수 없습니다.',
      })
    }
    return document
  }

  private assertDrafter(document: { drafterId: string }, user: JwtPayload) {
    if (document.drafterId !== user.employeeId) {
      throw new ForbiddenException({
        code: 'DOCUMENT_NOT_DRAFTER',
        message: '기안자 본인만 처리할 수 있습니다.',
      })
    }
  }

  /** HR 요청 연동 문서는 /requests 승인 플로우에서만 처리 (이중 처리 방지) */
  private assertNotRequestManaged(document: { requestId: string | null }) {
    if (document.requestId) {
      throw new BadRequestException({
        code: 'DOCUMENT_MANAGED_BY_REQUEST',
        message: 'HR 요청과 연동된 문서는 요청 관리에서 처리해 주세요.',
      })
    }
  }

  private assertCanRead(
    document: {
      drafterId: string
      approvalLines: Array<{ steps: Array<{ assigneeId: string; proxyId?: string | null }> }>
    },
    user: JwtPayload,
  ) {
    if (this.isCompanyAdmin(user)) return
    if (document.drafterId === user.employeeId) return

    const isParticipant = document.approvalLines
      .flatMap((line) => line.steps)
      .some((s) => s.assigneeId === user.employeeId || s.proxyId === user.employeeId)
    if (!isParticipant) {
      throw new ForbiddenException({
        code: 'DOCUMENT_ACCESS_FORBIDDEN',
        message: '문서를 열람할 권한이 없습니다.',
      })
    }
  }

  private isCompanyAdmin(user: JwtPayload): boolean {
    return (
      ACCESS_LEVEL_HIERARCHY[user.accessLevel] >=
      ACCESS_LEVEL_HIERARCHY[AccessLevel.GENERAL_ADMIN]
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createDraftLine(tx: any, documentId: string, steps: ResolvedStep[]) {
    const line = await tx.approvalLine.create({
      data: { documentId, name: '결재선', isShared: false },
    })
    await tx.approvalStep.createMany({
      data: steps.map((s) => ({
        lineId: line.id,
        role: s.role,
        assigneeId: s.assigneeId,
        organizationId: s.organizationId,
        stepOrder: s.stepOrder,
        status: StepStatus.WAITING, // DRAFT 보관용 — 상신 시 상태 재계산
      })),
    })
  }

  /**
   * 결재 단계 검증 + 부서 단계 담당자 해석.
   * - 개인 단계: assigneeId가 자사 소속인지 일괄 검증.
   * - 부서 단계(DEPT_*): 대상 부서가 자사 소속인지 확인하고 assignee를 부서 문서담당자
   *   (docManagerId, 없으면 팀장 approverId)로 해석한다. 둘 다 없으면 거부.
   */
  private async resolveSteps(companyId: string, steps: StepInput[]): Promise<ResolvedStep[]> {
    // ① 개인 단계 assignee 자사 소속 일괄 검증
    const personalIds = Array.from(
      new Set(
        steps
          .filter((s) => !DEPT_ROLES.includes(s.role) && s.assigneeId)
          .map((s) => s.assigneeId as string),
      ),
    )
    if (personalIds.length) {
      const count = await this.prisma.employee.count({
        where: { id: { in: personalIds }, companyId },
      })
      if (count !== personalIds.length) {
        throw new BadRequestException({
          code: 'EMPLOYEE_NOT_FOUND',
          message: '결재선에 자사 소속이 아닌 직원이 포함되어 있습니다.',
        })
      }
    }

    // ② 부서 단계 대상 부서 조회 (자사 소속 + 담당자 해석)
    const deptOrgIds = Array.from(
      new Set(
        steps
          .filter((s) => DEPT_ROLES.includes(s.role) && s.organizationId)
          .map((s) => s.organizationId as string),
      ),
    )
    const orgMap = new Map<string, { docManagerId: string | null; approverId: string | null }>()
    if (deptOrgIds.length) {
      const orgs = await this.prisma.organization.findMany({
        where: { id: { in: deptOrgIds }, companyId, isActive: true },
        select: { id: true, docManagerId: true, approverId: true },
      })
      if (orgs.length !== deptOrgIds.length) {
        throw new BadRequestException({
          code: 'ORG_NOT_FOUND',
          message: '결재선에 자사 부서가 아닌 부서가 포함되어 있습니다.',
        })
      }
      for (const org of orgs) {
        orgMap.set(org.id, { docManagerId: org.docManagerId, approverId: org.approverId })
      }
    }

    // ③ 해석
    return steps.map((s) => {
      if (DEPT_ROLES.includes(s.role)) {
        const org = orgMap.get(s.organizationId as string)
        const assignee = org?.docManagerId ?? org?.approverId
        if (!assignee) {
          throw new BadRequestException({
            code: 'DEPT_NO_MANAGER',
            message: '대상 부서에 문서담당자(또는 팀장)가 지정되지 않았습니다.',
          })
        }
        return {
          role: s.role,
          assigneeId: assignee,
          organizationId: s.organizationId as string,
          stepOrder: s.stepOrder,
        }
      }
      return {
        role: s.role,
        assigneeId: s.assigneeId as string,
        organizationId: null,
        stepOrder: s.stepOrder,
      }
    })
  }

  /** @db.Date 비교용 — 오늘 00:00 UTC */
  private todayDateOnly(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }
}
