import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import { ApproveRejectDto, BulkApproveDto } from './dto/create-request.dto'
import {
  REQUEST_TYPE_APPROVED_EVENT,
  REQUEST_TYPE_REJECTED_EVENT,
  type RuleWithDetails,
} from './requests.constants'
import {
  getMaxRounds,
  roundRequiredCount,
  assertRequestPending,
  loadRequestInCompany,
  getEmployeeOrgIds,
} from './requests.helpers'
import { RequestEffectsService } from './request-effects.service'

/**
 * 요청 결재 처리 — 승인/거절/강제승인/강제거절/일괄승인 + M-of-N 라운드 판정 (god file 분할 · 항목 24).
 * 최종 승인 시 RequestEffectsService.applyApprovedRequest로 실데이터를 동일 트랜잭션에 반영한다.
 */
@Injectable()
export class RequestApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly effects: RequestEffectsService,
  ) {}

  // ── HR-07-05 승인 ────────────────────────────────────────────────────────────

  async approve(
    companyId: string,
    requestId: string,
    dto: ApproveRejectDto,
    requester: JwtPayload,
  ) {
    const request = await loadRequestInCompany(this.prisma, companyId, requestId)
    assertRequestPending(request)
    await this.assertIsApprover(request, requester)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      // 다결재자/병렬(M-of-N): rule.details의 requiredCount 기반으로 활성 라운드 판정
      const rule = await this.findApplicableRule(tx, companyId, request.type)
      const currentRound = await this.getCurrentRound(tx, requestId, rule)

      // 같은 라운드 중복 승인 방지 (M-of-N에서 한 사람이 정원을 채우는 것 차단)
      const alreadyApproved = await tx.requestApproval.findFirst({
        where: { requestId, round: currentRound, approverId: requester.employeeId, status: 'APPROVED' },
      })
      if (alreadyApproved) {
        throw new BadRequestException({
          code: 'REQUEST_ALREADY_APPROVED',
          message: '이미 이 결재 단계를 승인했습니다.',
        })
      }

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

      // 현재 round의 필수 승인 수(requiredCount) 충족 여부 확인
      const isRoundComplete = await this.isRoundComplete(tx, requestId, currentRound, rule)

      const maxRounds = getMaxRounds(rule)
      const isLastRound = currentRound >= maxRounds

      if (isRoundComplete && isLastRound) {
        // 최종 승인 — request + document 상태 업데이트
        const updatedRequest = await tx.request.update({
          where: { id: requestId },
          data: { status: 'APPROVED' },
        })

        // 승인 결과를 실데이터에 반영 (휴가 잔액 차감, Shift 생성 등) — 동일 트랜잭션 (CLAUDE.md §7)
        await this.effects.applyApprovedRequest(tx, companyId, updatedRequest)

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
    const request = await loadRequestInCompany(this.prisma, companyId, requestId)
    assertRequestPending(request)
    await this.assertIsApprover(request, requester)

    return this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const rule = await this.findApplicableRule(tx, companyId, request.type)
      const currentRound = await this.getCurrentRound(tx, requestId, rule)

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

    const request = await loadRequestInCompany(this.prisma, companyId, requestId)
    assertRequestPending(request)

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
      await this.effects.applyApprovedRequest(tx, companyId, updatedRequest)

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

    const request = await loadRequestInCompany(this.prisma, companyId, requestId)
    assertRequestPending(request)

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
        getEmployeeOrgIds(this.prisma, request.companyId, requester.employeeId),
        getEmployeeOrgIds(this.prisma, request.companyId, request.requesterId),
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

  /**
   * 현재 활성 라운드 = 아직 필수 승인 수(requiredCount)를 못 채운 가장 낮은 라운드.
   * M-of-N/병렬을 지원하려면 "마지막 승인 round + 1"이 아니라 미완료 라운드를 찾아야 한다.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getCurrentRound(tx: any, requestId: string, rule: RuleWithDetails): Promise<number> {
    const maxRounds = getMaxRounds(rule)
    for (let r = 1; r <= maxRounds; r++) {
      const approved = await tx.requestApproval.count({
        where: { requestId, round: r, status: 'APPROVED' },
      })
      if (approved < roundRequiredCount(rule, r)) return r
    }
    return maxRounds
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async findApplicableRule(tx: any, companyId: string, requestType: string) {
    return tx.approvalRule.findFirst({
      where: { companyId, requestType, isActive: true },
      orderBy: { priority: 'desc' },
      include: { details: true },
    })
  }

  /** 라운드 r의 필수 승인 수 (해당 라운드 details의 requiredCount 최대값, 기본 1) */
  private async isRoundComplete(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    requestId: string,
    round: number,
    rule: RuleWithDetails,
  ): Promise<boolean> {
    const approved = await tx.requestApproval.count({
      where: { requestId, round, status: 'APPROVED' },
    })
    return approved >= roundRequiredCount(rule, round)
  }
}
