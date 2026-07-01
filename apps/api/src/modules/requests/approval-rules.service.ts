import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateApprovalRuleDto, UpdateApprovalRuleDto } from './dto/create-request.dto'

/**
 * 승인 규칙(ApprovalRule) CRUD (god file 분할 · 항목 24).
 * HR 요청 유형별 결재 규칙·라운드 상세(ApprovalRuleDetail) 관리.
 */
@Injectable()
export class ApprovalRulesService {
  constructor(private readonly prisma: PrismaService) {}

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
}
