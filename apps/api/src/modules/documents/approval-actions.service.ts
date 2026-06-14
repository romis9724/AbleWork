import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { EVENTS } from '../../events/domain-events'
import {
  DocStatus,
  StepRole,
  StepStatus,
  APPROVAL_FLOW_ROLES,
  RECEIVER_ROLES,
  CANCEL_ON_REJECT_ROLES,
  DEPT_ROLES,
  HistoryAction,
} from './documents.constants'
import { ApprovalCommentDto } from './dto/document.dto'

type StepRecord = {
  id: string
  lineId: string
  role: string
  assigneeId: string
  organizationId: string | null
  stepOrder: number
  status: string
  isProxy: boolean
  proxyId: string | null
}

type DocumentRecord = {
  id: string
  companyId: string
  requestId: string | null
  status: string
  drafterId: string
  title: string
  form: { allowPreApproval: boolean }
  approvalLines: Array<{ id: string; steps: StepRecord[] }>
}

type ActorContext = { isProxy: boolean }

/**
 * AP — 결재 처리: 승인/반려/전결/전단계반려/결재취소/협조/확인/수신 (Goal 13, 14)
 *
 * HR 요청(requestId 연결) 문서는 /requests 승인 플로우에서만 처리한다 —
 * 여기서는 400 DOCUMENT_MANAGED_BY_REQUEST로 거부 (이중 처리 방지).
 */
@Injectable()
export class ApprovalActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly settings: CompanySettingsService,
  ) {}

  // ── AP-03-01 승인 ────────────────────────────────────────────────────────────

  async approve(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    return this.approveFlowStep(companyId, documentId, stepId, dto, actor, StepRole.APPROVER)
  }

  // ── AP-03-06 협조 승인 (approve와 동일 진행 로직 공유) ───────────────────────

  async agree(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    return this.approveFlowStep(companyId, documentId, stepId, dto, actor, StepRole.AGREEMENT)
  }

  // ── AP-04-02 부서협조 완료 (AGREEMENT처럼 흐름에 합류, 부서 담당자 단일 결정) ──

  async deptCollab(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    return this.approveFlowStep(
      companyId,
      documentId,
      stepId,
      dto,
      actor,
      StepRole.DEPT_COLLABORATOR,
    )
  }

  private async approveFlowStep(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
    expectedRole: string,
  ) {
    const { document, step, steps } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertDocumentPending(document)
    this.assertStepRole(step, [expectedRole])
    this.assertStepPending(step)
    const ctx = await this.resolveActor(step, actor)

    const stepStatus = ctx.isProxy ? StepStatus.PROXY_APPROVED : StepStatus.APPROVED
    const action = ctx.isProxy
      ? HistoryAction.PROXY_APPROVE
      : expectedRole === StepRole.AGREEMENT
        ? HistoryAction.AGREE
        : expectedRole === StepRole.DEPT_COLLABORATOR
          ? HistoryAction.DEPT_COLLAB
          : HistoryAction.APPROVE

    const result = await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: stepStatus,
          comment: dto.comment ?? null,
          actedAt: new Date(),
          isProxy: ctx.isProxy,
          proxyId: ctx.isProxy ? actor.employeeId : null,
        },
      })

      const progressed = await this.progressFlow(tx, document, steps, step)

      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action,
          comment: dto.comment ?? null,
        },
      })

      return progressed
    })

    this.emitProgressEvents(companyId, document, result)
    return result.document
  }

  // ── AP-03-02 반려 ────────────────────────────────────────────────────────────

  async reject(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertDocumentPending(document)
    this.assertStepRole(step, APPROVAL_FLOW_ROLES)
    this.assertStepPending(step)
    const ctx = await this.resolveActor(step, actor)

    const updated = await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.REJECTED,
          comment: dto.comment ?? null,
          actedAt: new Date(),
          isProxy: ctx.isProxy,
          proxyId: ctx.isProxy ? actor.employeeId : null,
        },
      })

      // 남은 결재·수신 단계 CANCELLED (REFERENCE/VIEWER는 열람 가능하도록 유지)
      await tx.approvalStep.updateMany({
        where: {
          line: { documentId: document.id },
          id: { not: step.id },
          role: { in: CANCEL_ON_REJECT_ROLES },
          status: { in: [StepStatus.WAITING, StepStatus.PENDING] },
        },
        data: { status: StepStatus.CANCELLED },
      })

      const doc = await tx.document.update({
        where: { id: document.id },
        data: { status: DocStatus.REJECTED, completedAt: new Date() },
      })

      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.REJECT,
          comment: dto.comment ?? null,
        },
      })

      return doc
    })

    this.events.emit(EVENTS.DOCUMENT_REJECTED, {
      documentId: document.id,
      companyId,
      drafterId: document.drafterId,
      title: document.title,
    })

    return updated
  }

  // ── AP-03-03 전결 (이후 단계 SKIPPED 후 즉시 APPROVED) ──────────────────────

  async preApprove(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertDocumentPending(document)
    this.assertStepRole(step, [StepRole.APPROVER])
    this.assertStepPending(step)

    if (!document.form.allowPreApproval) {
      throw new BadRequestException({
        code: 'DOCUMENT_PRE_APPROVAL_NOT_ALLOWED',
        message: '이 양식은 전결을 허용하지 않습니다.',
      })
    }
    const ctx = await this.resolveActor(step, actor)

    const updated = await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.PRE_APPROVED,
          comment: dto.comment ?? null,
          actedAt: new Date(),
          isProxy: ctx.isProxy,
          proxyId: ctx.isProxy ? actor.employeeId : null,
        },
      })

      // 이후 모든 결재 단계 SKIPPED
      await tx.approvalStep.updateMany({
        where: {
          line: { documentId: document.id },
          role: { in: APPROVAL_FLOW_ROLES },
          status: { in: [StepStatus.WAITING, StepStatus.RETURNED] },
        },
        data: { status: StepStatus.SKIPPED },
      })

      const doc = await this.finalizeApproval(tx, document.id)

      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.PRE_APPROVE,
          comment: dto.comment ?? null,
        },
      })

      return doc
    })

    this.events.emit(EVENTS.DOCUMENT_APPROVED, {
      documentId: document.id,
      companyId,
      drafterId: document.drafterId,
      title: document.title,
    })

    return updated
  }

  // ── AP-03-04 전단계 반려 (직전 결재자에게 결재권 반환) ───────────────────────

  async returnToPrevious(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step, steps } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertDocumentPending(document)
    this.assertStepRole(step, APPROVAL_FLOW_ROLES)
    this.assertStepPending(step)
    await this.resolveActor(step, actor)

    // AP 정책: 회사 설정에서 전단계 반려를 비활성화하면 차단
    const allowed = await this.settings.get<boolean>(
      companyId,
      'approval',
      'enable_prev_step_reject',
      true,
    )
    if (!allowed) {
      throw new BadRequestException({
        code: 'APPROVAL_PREV_REJECT_DISABLED',
        message: '회사 정책상 전단계 반려가 비활성화되어 있습니다.',
      })
    }

    // 직전 결재 단계: stepOrder가 바로 아래이고 결재 처리(APPROVED류)된 단계
    const previous = steps
      .filter(
        (s) =>
          APPROVAL_FLOW_ROLES.includes(s.role) &&
          s.stepOrder < step.stepOrder &&
          ([StepStatus.APPROVED, StepStatus.PROXY_APPROVED] as string[]).includes(s.status),
      )
      .sort((a, b) => b.stepOrder - a.stepOrder)[0]

    if (!previous) {
      throw new BadRequestException({
        code: 'APPROVAL_STEP_NO_PREVIOUS',
        message: '첫 결재 단계는 전단계 반려할 수 없습니다.',
      })
    }

    await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // 현재 단계 → RETURNED (이후 진행 시 다시 PENDING으로 활성화됨)
      await tx.approvalStep.update({
        where: { id: step.id },
        data: { status: StepStatus.RETURNED, comment: dto.comment ?? null, actedAt: new Date() },
      })

      // 직전 단계 PENDING 복원 (actedAt/comment/대결 정보 초기화)
      await tx.approvalStep.update({
        where: { id: previous.id },
        data: {
          status: StepStatus.PENDING,
          comment: null,
          actedAt: null,
          isProxy: false,
          proxyId: null,
        },
      })

      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.RETURN_PREV,
          comment: dto.comment ?? null,
        },
      })
    })

    this.events.emit(EVENTS.DOCUMENT_STEP_PENDING, {
      documentId: document.id,
      companyId,
      assigneeId: previous.assigneeId,
    })

    return this.prisma.document.findFirst({ where: { id: document.id, companyId } })
  }

  // ── AP-03-05 결재취소 (다음 결재자 처리 전만) ────────────────────────────────

  async cancelApproval(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step, steps } = await this.loadActionTarget(companyId, documentId, stepId)

    if (document.status !== DocStatus.PENDING) {
      throw new BadRequestException({
        code: 'DOCUMENT_CANNOT_CANCEL',
        message: '최종 처리된 문서는 결재취소할 수 없습니다.',
      })
    }
    if (!([StepStatus.APPROVED, StepStatus.PROXY_APPROVED] as string[]).includes(step.status)) {
      throw new BadRequestException({
        code: 'APPROVAL_STEP_NOT_CURRENT',
        message: '승인 처리한 단계만 결재취소할 수 있습니다.',
      })
    }
    // 본인이 처리한 단계만 (대결 처리한 대리인 포함)
    const isOwnAction =
      step.assigneeId === actor.employeeId || (step.isProxy && step.proxyId === actor.employeeId)
    if (!isOwnAction) {
      throw new ForbiddenException({
        code: 'APPROVAL_STEP_NOT_ASSIGNEE',
        message: '본인이 처리한 결재만 취소할 수 있습니다.',
      })
    }

    // 이후 결재 단계가 이미 처리됐으면 취소 불가
    const laterFlowSteps = steps.filter(
      (s) => APPROVAL_FLOW_ROLES.includes(s.role) && s.stepOrder > step.stepOrder,
    )
    const hasActedLater = laterFlowSteps.some(
      (s) => !([StepStatus.WAITING, StepStatus.PENDING] as string[]).includes(s.status),
    )
    if (hasActedLater) {
      throw new BadRequestException({
        code: 'DOCUMENT_CANNOT_CANCEL',
        message: '다음 결재자가 이미 처리하여 결재취소할 수 없습니다.',
      })
    }

    const currentPendingNext = laterFlowSteps
      .filter((s) => s.status === StepStatus.PENDING)
      .sort((a, b) => a.stepOrder - b.stepOrder)[0]

    await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // 본인 단계 PENDING 복원
      await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.PENDING,
          comment: null,
          actedAt: null,
          isProxy: false,
          proxyId: null,
        },
      })

      // 다음 단계는 다시 WAITING으로
      if (currentPendingNext) {
        await tx.approvalStep.update({
          where: { id: currentPendingNext.id },
          data: { status: StepStatus.WAITING },
        })
      }

      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.CANCEL_APPROVAL,
          comment: dto.comment ?? null,
        },
      })
    })

    return this.prisma.document.findFirst({ where: { id: document.id, companyId } })
  }

  // ── AP-03-07 참조/공람 확인 (비차단) ─────────────────────────────────────────

  async view(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertStepRole(step, [StepRole.REFERENCE, StepRole.VIEWER])
    this.assertStepPending(step)
    const ctx = await this.resolveActor(step, actor)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const updated = await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.VIEWED,
          comment: dto.comment ?? null,
          actedAt: new Date(),
          isProxy: ctx.isProxy,
          proxyId: ctx.isProxy ? actor.employeeId : null,
        },
      })
      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.VIEW,
          comment: dto.comment ?? null,
        },
      })
      return updated
    })
  }

  // ── AP-03-08 수신 처리 (문서 APPROVED 이후) ──────────────────────────────────

  async receive(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertStepRole(step, RECEIVER_ROLES) // RECEIVER + 부서수신(DEPT_RECEIVER)

    if (document.status !== DocStatus.APPROVED) {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_APPROVED',
        message: '결재 완료된 문서만 수신 처리할 수 있습니다.',
      })
    }
    this.assertStepPending(step)
    const ctx = await this.resolveActor(step, actor)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const updated = await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.RECEIVED,
          comment: dto.comment ?? null,
          actedAt: new Date(),
          isProxy: ctx.isProxy,
          proxyId: ctx.isProxy ? actor.employeeId : null,
        },
      })
      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.RECEIVE,
          comment: dto.comment ?? null,
        },
      })
      return updated
    })
  }

  // ── AP-04-06 부서수신 반송 (문서 APPROVED 이후, 기안자에게 반환 통지) ──────────
  // 부서 문서담당자가 수신 거부 — 문서 상태는 그대로 두고 단계를 BOUNCED 처리한다.

  async bounce(
    companyId: string,
    documentId: string,
    stepId: string,
    dto: ApprovalCommentDto,
    actor: JwtPayload,
  ) {
    const { document, step } = await this.loadActionTarget(companyId, documentId, stepId)
    this.assertStepRole(step, [StepRole.DEPT_RECEIVER])

    if (document.status !== DocStatus.APPROVED) {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_APPROVED',
        message: '결재 완료된 문서만 반송할 수 있습니다.',
      })
    }
    this.assertStepPending(step)
    const ctx = await this.resolveActor(step, actor)

    const updated = await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const s = await tx.approvalStep.update({
        where: { id: step.id },
        data: {
          status: StepStatus.BOUNCED,
          comment: dto.comment ?? null,
          actedAt: new Date(),
          isProxy: ctx.isProxy,
          proxyId: ctx.isProxy ? actor.employeeId : null,
        },
      })
      await tx.approvalHistory.create({
        data: {
          documentId: document.id,
          stepId: step.id,
          actorId: actor.employeeId,
          action: HistoryAction.BOUNCE,
          comment: dto.comment ?? null,
        },
      })
      return s
    })

    this.events.emit(EVENTS.DOCUMENT_BOUNCED, {
      documentId: document.id,
      companyId,
      drafterId: document.drafterId,
      title: document.title,
    })

    return updated
  }

  // ── 내부: 결재 진행 공통 로직 ────────────────────────────────────────────────

  /**
   * 승인/협조 승인 후 진행: 다음 결재 단계(WAITING/RETURNED 최소 stepOrder)를
   * PENDING으로 활성화하고, 없으면 최종 승인 처리한다.
   */
  private async progressFlow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    document: DocumentRecord,
    steps: StepRecord[],
    currentStep: StepRecord,
  ) {
    // RETURNED 단계도 다음 후보에 포함 — 전단계 반려 후 재승인 시 반려했던 단계로 복귀
    const next = steps
      .filter(
        (s) =>
          s.id !== currentStep.id &&
          APPROVAL_FLOW_ROLES.includes(s.role) &&
          ([StepStatus.WAITING, StepStatus.RETURNED] as string[]).includes(s.status),
      )
      .sort((a, b) => a.stepOrder - b.stepOrder)[0]

    if (next) {
      await tx.approvalStep.update({
        where: { id: next.id },
        data: { status: StepStatus.PENDING, comment: null, actedAt: null },
      })
      const doc = await tx.document.findFirst({ where: { id: document.id } })
      return { document: doc, finalApproved: false, nextAssigneeId: next.assigneeId }
    }

    const doc = await this.finalizeApproval(tx, document.id)
    return { document: doc, finalApproved: true, nextAssigneeId: null }
  }

  /** 최종 승인: 문서 APPROVED + 수신(RECEIVER/부서수신) 단계 활성화 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async finalizeApproval(tx: any, documentId: string) {
    await tx.approvalStep.updateMany({
      where: {
        line: { documentId },
        role: { in: RECEIVER_ROLES },
        status: StepStatus.WAITING,
      },
      data: { status: StepStatus.PENDING },
    })

    return tx.document.update({
      where: { id: documentId },
      data: { status: DocStatus.APPROVED, completedAt: new Date() },
    })
  }

  private emitProgressEvents(
    companyId: string,
    document: DocumentRecord,
    result: { finalApproved: boolean; nextAssigneeId: string | null },
  ) {
    if (result.finalApproved) {
      this.events.emit(EVENTS.DOCUMENT_APPROVED, {
        documentId: document.id,
        companyId,
        drafterId: document.drafterId,
        title: document.title,
      })
      return
    }
    if (result.nextAssigneeId) {
      this.events.emit(EVENTS.DOCUMENT_STEP_PENDING, {
        documentId: document.id,
        companyId,
        assigneeId: result.nextAssigneeId,
      })
    }
  }

  // ── 내부: 대상 로드 / 권한 / 상태 검증 ───────────────────────────────────────

  private async loadActionTarget(
    companyId: string,
    documentId: string,
    stepId: string,
  ): Promise<{ document: DocumentRecord; step: StepRecord; steps: StepRecord[] }> {
    const document = (await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: {
        form: true,
        approvalLines: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    })) as DocumentRecord | null

    if (!document) {
      throw new NotFoundException({
        code: 'DOCUMENT_NOT_FOUND',
        message: '문서를 찾을 수 없습니다.',
      })
    }
    // HR 요청 문서는 /requests 승인 플로우 사용 — 이중 처리 방지
    if (document.requestId) {
      throw new BadRequestException({
        code: 'DOCUMENT_MANAGED_BY_REQUEST',
        message: 'HR 요청과 연동된 문서는 요청 관리에서 처리해 주세요.',
      })
    }

    const steps = document.approvalLines.flatMap((line) => line.steps)
    const step = steps.find((s) => s.id === stepId)
    if (!step) {
      throw new NotFoundException({
        code: 'APPROVAL_STEP_NOT_FOUND',
        message: '결재 단계를 찾을 수 없습니다.',
      })
    }

    return { document, step, steps }
  }

  /**
   * 행위자 권한: 해당 step의 assignee 본인이거나,
   * 유효한 ProxySettings(principal=assignee, 오늘이 기간 내, isActive)를 보유한 대리인.
   */
  private async resolveActor(step: StepRecord, actor: JwtPayload): Promise<ActorContext> {
    if (step.assigneeId === actor.employeeId) {
      return { isProxy: false }
    }

    // 부서 step(부서협조/부서수신): 해당 부서 문서담당자(다중) 누구나 처리 가능
    if (DEPT_ROLES.includes(step.role) && step.organizationId) {
      const isManager = await this.prisma.organizationDocManager.findFirst({
        where: { organizationId: step.organizationId, employeeId: actor.employeeId },
        select: { id: true },
      })
      if (isManager) {
        return { isProxy: false }
      }
    }

    const setting = await this.prisma.proxySettings.findFirst({
      where: { principalId: step.assigneeId, proxyId: actor.employeeId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!setting) {
      throw new ForbiddenException({
        code: 'APPROVAL_STEP_NOT_ASSIGNEE',
        message: '해당 결재 단계의 처리 권한이 없습니다.',
      })
    }

    const today = this.todayDateOnly()
    if (setting.startDate > today || setting.endDate < today) {
      throw new ForbiddenException({
        code: 'APPROVAL_PROXY_EXPIRED',
        message: '대리결재 기간이 아닙니다.',
      })
    }

    return { isProxy: true }
  }

  private assertDocumentPending(document: DocumentRecord) {
    if (document.status !== DocStatus.PENDING) {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_PENDING',
        message: '진행중인 문서만 결재 처리할 수 있습니다.',
      })
    }
  }

  private assertStepPending(step: StepRecord) {
    if (step.status !== StepStatus.PENDING) {
      throw new BadRequestException({
        code: 'APPROVAL_STEP_NOT_CURRENT',
        message: '현재 처리 차례인 결재 단계가 아닙니다.',
      })
    }
  }

  private assertStepRole(step: StepRecord, roles: string[]) {
    if (!roles.includes(step.role)) {
      throw new BadRequestException({
        code: 'APPROVAL_STEP_ROLE_MISMATCH',
        message: '해당 결재 단계에서 수행할 수 없는 작업입니다.',
      })
    }
  }

  /** @db.Date 비교용 — 오늘 00:00 UTC */
  private todayDateOnly(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }
}
