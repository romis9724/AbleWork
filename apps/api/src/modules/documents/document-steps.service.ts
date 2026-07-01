import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import {
  DocStatus,
  APPROVAL_FLOW_ROLES,
  DEPT_ROLES,
  StepStatus,
  HistoryAction,
} from './documents.constants'
import { SubmitDocumentDto, StepInput, StepInputSchema } from './dto/document.dto'
import { ResolvedStep, initialStepStatus, renderDocNumber } from './documents.helpers'

/**
 * 결재선 구성·상신 트랜잭션·문서번호 채번 (god file 분할 · 항목 24).
 * 결재 단계 검증/해석(resolveSteps)은 기안 작성(DRAFT)·상신 양쪽에서 공용.
 */
@Injectable()
export class DocumentStepsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 상신 트랜잭션 ────────────────────────────────────────────────────────────

  async runSubmitTransaction(
    companyId: string,
    document: { id: string; formId: string; docNumber: string | null; categoryId: string | null },
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
          status: initialStepStatus(s, firstFlowOrder),
        })),
      })

      // ③ 문서번호 채번 (없을 때만 — 재상신 시 기존 번호 유지)
      const docNumber =
        document.docNumber ??
        (await this.issueDocNumber(tx, companyId, document.formId, document.categoryId))

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

  /** 공용 결재선 id로 steps 로드 (자사 소속 + 구성 검증) */
  private async loadSharedLineSteps(companyId: string, lineId: string): Promise<StepInput[]> {
    const sharedLine = await this.prisma.sharedApprovalLine.findFirst({
      where: { id: lineId, companyId },
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
    return parsed.data
  }

  /**
   * 상신 결재선 결정 우선순위: dto.steps > dto.sharedLineId > DRAFT 보관 steps > 양식 기본 결재선(AP-01-03).
   */
  async resolveSubmitSteps(
    companyId: string,
    dto: SubmitDocumentDto,
    existingSteps: StepInput[],
    formDefaultLineId?: string | null,
  ): Promise<{ steps: StepInput[]; sharedLineId?: string }> {
    let steps: StepInput[] | undefined = dto.steps?.length ? dto.steps : undefined
    let sharedLineId: string | undefined

    if (!steps && dto.sharedLineId) {
      steps = await this.loadSharedLineSteps(companyId, dto.sharedLineId)
      sharedLineId = dto.sharedLineId
    }

    if (!steps?.length && existingSteps.length) {
      steps = existingSteps
    }

    // 양식별 기본 결재선 — 명시 결재선·DRAFT 보관분이 모두 없을 때 최종 fallback
    if (!steps?.length && formDefaultLineId) {
      steps = await this.loadSharedLineSteps(companyId, formDefaultLineId)
      sharedLineId = formDefaultLineId
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

  // ── 문서번호 채번 ────────────────────────────────────────────────────────────

  /**
   * 채번 규칙(DocumentNumberRule) 기반 문서번호 발급.
   * - currentSeq를 increment 후 재조회 (동시성: docNumber unique + 호출부 1회 재시도)
   * - resetYearly: 올해 발급된 번호가 없으면 시퀀스를 0으로 리셋 (pattern에 연도 포함 가정)
   * - 규칙이 없으면 기본 'DOC-{YYYY}-{SEQ:4}' 패턴
   */
  private async issueDocNumber(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    companyId: string,
    formId: string,
    categoryId: string | null,
  ): Promise<string> {
    const now = new Date()
    const year = now.getFullYear()

    const rule = await tx.documentNumberRule.findFirst({ where: { companyId, formId } })
    // {ABBR} 토큰 치환용 — 양식 약어 (없으면 빈 문자열)
    const form = await tx.documentForm.findFirst({
      where: { id: formId, companyId },
      select: { abbreviation: true },
    })
    const abbr = form?.abbreviation ?? ''
    // {CATEGORY} 토큰 치환용 — 문서성격 약어 (기안 시 선택, 없으면 빈 문자열)
    let categoryAbbr = ''
    if (categoryId) {
      const category = await tx.documentCategory.findFirst({
        where: { id: categoryId, companyId },
        select: { abbreviation: true },
      })
      categoryAbbr = category?.abbreviation ?? ''
    }

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

    return renderDocNumber(rule.pattern, now, updatedRule.currentSeq, abbr, categoryAbbr)
  }

  // ── 결재선 구성 (DRAFT 보관 + 부서 단계 담당자 해석) ──────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createDraftLine(tx: any, documentId: string, steps: ResolvedStep[]) {
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
  async resolveSteps(companyId: string, steps: StepInput[]): Promise<ResolvedStep[]> {
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
    const orgMap = new Map<
      string,
      { primaryManagerId: string | null; docManagerId: string | null; approverId: string | null }
    >()
    if (deptOrgIds.length) {
      const orgs = await this.prisma.organization.findMany({
        where: { id: { in: deptOrgIds }, companyId, isActive: true },
        select: {
          id: true,
          docManagerId: true,
          approverId: true,
          // 다중 문서담당자 — sortOrder 최소(대표)를 1차 assignee로 사용
          docManagers: { orderBy: { sortOrder: 'asc' }, select: { employeeId: true } },
        },
      })
      if (orgs.length !== deptOrgIds.length) {
        throw new BadRequestException({
          code: 'ORG_NOT_FOUND',
          message: '결재선에 자사 부서가 아닌 부서가 포함되어 있습니다.',
        })
      }
      for (const org of orgs) {
        orgMap.set(org.id, {
          primaryManagerId: org.docManagers?.[0]?.employeeId ?? null,
          docManagerId: org.docManagerId,
          approverId: org.approverId,
        })
      }
    }

    // ③ 해석 — 부서 step assignee = 대표 문서담당자(다중) ?? 단일 docManagerId(레거시) ?? 팀장
    return steps.map((s) => {
      if (DEPT_ROLES.includes(s.role)) {
        const org = orgMap.get(s.organizationId as string)
        const assignee = org?.primaryManagerId ?? org?.docManagerId ?? org?.approverId
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
}
