import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { DocStatus, StepStatus, DEPT_ROLES } from './documents.constants'

export type StepRecord = {
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

export type DocumentRecord = {
  id: string
  companyId: string
  requestId: string | null
  status: string
  drafterId: string
  title: string
  form: { allowPreApproval: boolean }
  approvalLines: Array<{ id: string; steps: StepRecord[] }>
}

export type ActorContext = { isProxy: boolean }

/**
 * 결재 처리 지원층 — 대상 로드(loadActionTarget)·대리인 해석(resolveActor)·상태/역할 검증 (god file 분할 · 항목 24).
 * 모든 결재 액션(approve/reject/view/receive 등)이 공용으로 사용한다.
 */
@Injectable()
export class ApprovalSupportService {
  constructor(private readonly prisma: PrismaService) {}

  async loadActionTarget(
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
  async resolveActor(step: StepRecord, actor: JwtPayload): Promise<ActorContext> {
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

  assertDocumentPending(document: DocumentRecord) {
    if (document.status !== DocStatus.PENDING) {
      throw new BadRequestException({
        code: 'DOCUMENT_NOT_PENDING',
        message: '진행중인 문서만 결재 처리할 수 있습니다.',
      })
    }
  }

  assertStepPending(step: StepRecord) {
    if (step.status !== StepStatus.PENDING) {
      throw new BadRequestException({
        code: 'APPROVAL_STEP_NOT_CURRENT',
        message: '현재 처리 차례인 결재 단계가 아닙니다.',
      })
    }
  }

  assertStepRole(step: StepRecord, roles: string[]) {
    if (!roles.includes(step.role)) {
      throw new BadRequestException({
        code: 'APPROVAL_STEP_ROLE_MISMATCH',
        message: '해당 결재 단계에서 수행할 수 없는 작업입니다.',
      })
    }
  }

  /** @db.Date 비교용 — 오늘 00:00 UTC */
  todayDateOnly(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }
}
