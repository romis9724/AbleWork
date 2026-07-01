import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { EVENTS } from '../../events/domain-events'
import {
  DocStatus,
  StepStatus,
  APPROVAL_FLOW_ROLES,
  DEPT_ROLES,
  ACTED_STEP_STATUSES,
  HistoryAction,
} from './documents.constants'
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  SubmitDocumentDto,
  AddCcStepsDto,
  AddOpinionDto,
  DocumentBoxFilterDto,
  StepInput,
} from './dto/document.dto'
import { DocumentFormsService } from './document-forms.service'
import { DocumentQueryService } from './document-query.service'
import { DocumentStepsService } from './document-steps.service'
import {
  EDITABLE_STATUSES,
  StepRecord,
  assertCanRead,
  assertDrafter,
  assertNotRequestManaged,
  isCompanyAdmin,
} from './documents.helpers'

/**
 * AP — 기안 작성/상신/회수 + 사후 공람·의견 (Goal 12, 16).
 * 문서함 조회는 DocumentQueryService, 결재선 구성·채번·상신 트랜잭션은 DocumentStepsService,
 * 결재 처리(승인/반려/전결 등)는 ApprovalActionsService 담당. (god file 분할 · 항목 24)
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly documentForms: DocumentFormsService,
    private readonly query: DocumentQueryService,
    private readonly steps: DocumentStepsService,
  ) {}

  // ── AP-04-01/02 문서함 목록·상세 (조회는 DocumentQueryService에 위임) ──────────

  findAll(companyId: string, filter: DocumentBoxFilterDto, user: JwtPayload) {
    return this.query.findAll(companyId, filter, user)
  }

  findOne(companyId: string, documentId: string, user: JwtPayload) {
    return this.query.findOne(companyId, documentId, user)
  }

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

    // AP-01-07 양식 접근규칙 — 작성 권한 검증 (규칙 없으면 전체 허용)
    await this.documentForms.assertCanUseForm(companyId, dto.formId, user)

    const resolvedSteps = dto.steps?.length
      ? await this.steps.resolveSteps(companyId, dto.steps)
      : []

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const document = await tx.document.create({
        data: {
          companyId,
          formId: dto.formId,
          categoryId: dto.categoryId ?? null,
          title: dto.title,
          content: dto.content,
          drafterId: user.employeeId,
          status: DocStatus.DRAFT,
        },
      })

      // DRAFT 단계의 steps 보존: ApprovalLine+Step으로 저장(전부 WAITING).
      // 상신 시 삭제 후 재생성되므로 임시 보관용이다.
      if (resolvedSteps.length) {
        await this.steps.createDraftLine(tx, document.id, resolvedSteps)
      }

      return document
    })
  }

  // ── AP-02-02 기안 수정 (DRAFT/RECALLED/REJECTED + 기안자 본인) ───────────────

  async update(companyId: string, documentId: string, dto: UpdateDocumentDto, user: JwtPayload) {
    const document = await this.loadDraftableDocument(companyId, documentId, user)

    const resolvedSteps = dto.steps?.length
      ? await this.steps.resolveSteps(companyId, dto.steps)
      : []

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // steps가 오면 기존 결재선 전체 교체 (DRAFT 보관분 갱신)
      if (dto.steps) {
        await tx.approvalLine.deleteMany({ where: { documentId } })
        if (resolvedSteps.length) {
          await this.steps.createDraftLine(tx, documentId, resolvedSteps)
        }
      }

      return tx.document.update({
        where: { id: document.id },
        data: {
          ...(dto.formId !== undefined && { formId: dto.formId }),
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.content !== undefined && { content: dto.content }),
          ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        },
      })
    })
  }

  // ── AP-02-03 기안 삭제 (DRAFT만, 기안자 본인) ────────────────────────────────

  async remove(companyId: string, documentId: string, user: JwtPayload) {
    const document = await this.findOwnDocument(companyId, documentId)
    assertDrafter(document, user)

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
    if (!isCompanyAdmin(user)) {
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

  // ── AP-05-06 결재 현황 다중 삭제 (GENERAL_ADMIN+, 상신/진행중/반려만) ─────────────
  // 카카오워크 동일: 체크박스 다중선택 + [선택 삭제]. 대상 상태를 PENDING/REJECTED로 제한.
  async bulkForceDelete(companyId: string, ids: string[], user: JwtPayload) {
    if (!isCompanyAdmin(user)) {
      throw new ForbiddenException({
        code: 'DOCUMENT_FORCE_DELETE_FORBIDDEN',
        message: '문서 강제 삭제는 관리자(GENERAL_ADMIN 이상)만 가능합니다.',
      })
    }

    const uniqueIds = Array.from(new Set(ids))
    const docs = await this.prisma.document.findMany({
      where: { id: { in: uniqueIds }, companyId },
      select: { id: true, status: true },
    })
    const docMap = new Map(docs.map((d: { id: string; status: string }) => [d.id, d.status]))

    // HR 요청 연동 문서는 차단 (요청 취소 흐름으로 처리)
    const linkedRequests = await this.prisma.request.findMany({
      where: { documentId: { in: uniqueIds }, companyId },
      select: { documentId: true },
    })
    const linkedSet = new Set(
      linkedRequests.map((r: { documentId: string | null }) => r.documentId),
    )

    const DELETABLE: string[] = [DocStatus.PENDING, DocStatus.REJECTED]
    const deletable: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []

    for (const id of uniqueIds) {
      const status = docMap.get(id)
      if (!status) {
        skipped.push({ id, reason: 'NOT_FOUND' })
      } else if (linkedSet.has(id)) {
        skipped.push({ id, reason: 'LINKED_TO_REQUEST' })
      } else if (!DELETABLE.includes(status)) {
        skipped.push({ id, reason: 'STATUS_NOT_DELETABLE' })
      } else {
        deletable.push(id)
      }
    }

    if (deletable.length) {
      await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (tx: any) => {
        await tx.approvalHistory.deleteMany({ where: { documentId: { in: deletable } } })
        await tx.document.deleteMany({ where: { id: { in: deletable }, companyId } })
      })
    }

    return { deletedCount: deletable.length, deletedIds: deletable, skipped }
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
    assertNotRequestManaged(document)
    assertDrafter(document, user)

    // 임시저장(DRAFT)만 상신 가능. 회수/반려 문서는 재상신 불가 — '복사하여 새 기안'으로 재작성.
    if (!EDITABLE_STATUSES.includes(document.status)) {
      throw new BadRequestException({
        code: 'DOCUMENT_ALREADY_SUBMITTED',
        message: '임시저장 상태의 문서만 상신할 수 있습니다. 회수·반려 문서는 복사하여 새로 작성하세요.',
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

    const { steps, sharedLineId } = await this.steps.resolveSubmitSteps(
      companyId,
      dto,
      existingSteps,
      document.form.defaultLineId,
    )

    // 기안자 본인은 결재(APPROVER) 단계에 지정할 수 없다 (카카오워크 PDF 규칙 · FE 검증과 동일).
    // FE에서만 막으면 API 직접 호출로 우회되므로 상신 시 서버에서도 강제한다.
    if (steps.some((s) => s.role === 'APPROVER' && s.assigneeId === document.drafterId)) {
      throw new BadRequestException({
        code: 'APPROVAL_SELF_NOT_ALLOWED',
        message: '기안자 본인은 결재자로 지정할 수 없습니다.',
      })
    }

    const resolvedSteps = await this.steps.resolveSteps(companyId, steps)

    // docNumber unique 충돌(동시 채번) 시 1회 재시도
    const result = await this.steps
      .runSubmitTransaction(companyId, document, resolvedSteps, sharedLineId, user)
      .catch((error: unknown) => {
        if ((error as { code?: string }).code === 'P2002') {
          return this.steps.runSubmitTransaction(
            companyId,
            document,
            resolvedSteps,
            sharedLineId,
            user,
          )
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
    assertNotRequestManaged(document)
    assertDrafter(document, user)

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

  // ── AP-02-08 공람/참조 사후 추가 (진행중·완료 문서) ──────────────────────────

  /**
   * 진행 중(PENDING) 또는 완료(APPROVED) 문서에 공람자(VIEWER)·참조자(REFERENCE)를
   * 사후 지정한다. 비차단 단계이므로 즉시 확인 가능(status PENDING)으로 추가한다.
   * 권한: 기안자 본인 또는 결재 흐름 참여자(결재/협조 단계 담당자).
   */
  async addCcSteps(companyId: string, documentId: string, dto: AddCcStepsDto, user: JwtPayload) {
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
    assertNotRequestManaged(document)

    if (document.status !== DocStatus.PENDING && document.status !== DocStatus.APPROVED) {
      throw new BadRequestException({
        code: 'DOCUMENT_CC_NOT_ALLOWED',
        message: '진행중 또는 완료된 문서에만 공람·참조를 추가할 수 있습니다.',
      })
    }

    const allSteps: StepRecord[] = document.approvalLines.flatMap(
      (line: { steps: StepRecord[] }) => line.steps,
    )
    const isDrafter = document.drafterId === user.employeeId
    const isParticipant = allSteps.some(
      (s) => APPROVAL_FLOW_ROLES.includes(s.role) && s.assigneeId === user.employeeId,
    )
    if (!isDrafter && !isParticipant) {
      throw new ForbiddenException({
        code: 'DOCUMENT_CC_FORBIDDEN',
        message: '기안자 또는 결재 참여자만 공람·참조를 추가할 수 있습니다.',
      })
    }

    const line = document.approvalLines[0]
    if (!line) {
      throw new BadRequestException({
        code: 'DOCUMENT_NO_APPROVAL_LINE',
        message: '결재선이 없는 문서입니다.',
      })
    }

    // 중복 제거 (이미 동일 역할+담당자로 지정된 대상 제외)
    const existingKeys = new Set(allSteps.map((s) => `${s.role}:${s.assigneeId ?? ''}`))
    const fresh = dto.steps.filter((s) => !existingKeys.has(`${s.role}:${s.assigneeId}`))
    if (fresh.length === 0) {
      throw new BadRequestException({
        code: 'DOCUMENT_CC_DUPLICATE',
        message: '이미 지정된 공람자·참조자입니다.',
      })
    }

    const maxOrder = allSteps.reduce((max, s) => Math.max(max, s.stepOrder), 0)

    await this.prisma.approvalStep.createMany({
      data: fresh.map((s, i) => ({
        lineId: line.id,
        role: s.role,
        assigneeId: s.assigneeId,
        stepOrder: maxOrder + i + 1,
        status: StepStatus.PENDING, // 비차단 — 즉시 확인 가능
      })),
    })

    // 신규 공람·참조 대상에게 알림
    for (const s of fresh) {
      this.events.emit(EVENTS.DOCUMENT_STEP_PENDING, {
        documentId: document.id,
        companyId,
        assigneeId: s.assigneeId,
      })
    }

    return this.query.findOne(companyId, documentId, user)
  }

  // ── 결재 종료/진행 후 사후 의견 등록 ─────────────────────────────────────────

  /**
   * 상신된 문서(DRAFT 제외)에 사후 의견을 남긴다 — 계약 기안 완료 후 코멘트 등.
   * 권한: 기안자 본인 + 결재 관계자(assignee/proxy) + 관리자 (열람 권한과 동일).
   * ApprovalHistory.comment(action=OPINION)로 기록되어 결재 의견 타임라인에 노출된다.
   */
  async addOpinion(companyId: string, documentId: string, dto: AddOpinionDto, user: JwtPayload) {
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
    if (document.status === DocStatus.DRAFT) {
      throw new BadRequestException({
        code: 'DOCUMENT_OPINION_NOT_ALLOWED',
        message: '상신된 문서에만 의견을 남길 수 있습니다.',
      })
    }
    // 기안자/결재 관계자/관리자만 (열람 권한과 동일 규칙)
    assertCanRead(document, user)

    await this.prisma.approvalHistory.create({
      data: {
        documentId,
        actorId: user.employeeId,
        action: HistoryAction.OPINION,
        comment: dto.comment.trim(),
      },
    })

    return this.query.findOne(companyId, documentId, user)
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
    assertNotRequestManaged(document)
    assertDrafter(document, user)

    if (!EDITABLE_STATUSES.includes(document.status)) {
      throw new BadRequestException({
        code: 'DOCUMENT_ALREADY_SUBMITTED',
        message: '상신된 문서는 수정할 수 없습니다.',
      })
    }
    return document
  }
}
