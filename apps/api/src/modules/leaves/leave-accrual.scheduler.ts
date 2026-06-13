import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { LeavesService } from './leaves.service'

/**
 * 휴가 자동 발생 + 만료 처리 스케줄러.
 *
 * 매일 01:00 실행:
 * 1. 모든 활성 회사의 활성 발생 규칙(LeaveAccrualRule)에 대해 runAccrualRule 실행 (전 직원, 당해 연도)
 *    - runAccrualRule 내부의 목표값 set 방식 덕분에 매일 실행해도 멱등이며,
 *      월 기준 규칙은 새 달이 경과할 때마다 1개월분씩 추가 발생한다.
 * 2. 만료 잔액 처리: expiresAt < 오늘 인 잔액의 remainingDays를 0으로 (usedDays는 유지, 잔여분 소멸)
 */
@Injectable()
export class LeaveAccrualScheduler {
  private readonly logger = new Logger(LeaveAccrualScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly leavesService: LeavesService,
  ) {}

  // 매일 01:00에 실행
  @Cron('0 1 * * *')
  async handleDailyAccrual(): Promise<void> {
    this.logger.log('휴가 자동 발생 스케줄 시작')
    await this.runActiveAccrualRules()
    await this.expireOverdueBalances()
    this.logger.log('휴가 자동 발생 스케줄 완료')
  }

  /** 모든 활성 회사의 활성 발생 규칙 실행 (전 직원 대상, 당해 연도) */
  private async runActiveAccrualRules(): Promise<void> {
    const year = new Date().getFullYear()

    const rules = await this.prisma.leaveAccrualRule.findMany({
      where: { isActive: true, company: { isActive: true } },
      select: { id: true, companyId: true, name: true },
    })

    if (rules.length === 0) {
      this.logger.log('처리할 활성 발생 규칙이 없습니다.')
      return
    }

    for (const rule of rules) {
      try {
        const result = await this.leavesService.runAccrualRule(
          rule.companyId,
          rule.id,
          { year },
        )
        if (result.processed > 0) {
          this.logger.log(
            `발생 규칙 실행: ${rule.name} (${rule.id}) — ${result.processed}명 적용`,
          )
        }
      } catch (error: unknown) {
        // 한 규칙의 실패가 다른 규칙 실행을 막지 않도록 개별 처리
        this.logger.error(
          `발생 규칙 실행 실패: ${rule.name} (${rule.id})`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }
  }

  /**
   * 만료 잔액 처리 — expiresAt이 오늘 이전인 잔액의 remainingDays를 0으로.
   * usedDays/accruedDays는 유지되므로 (accruedDays - usedDays - remainingDays)가 소멸분이 된다.
   * remainingDays > 0 조건으로 이미 처리된 잔액은 건너뛰어 멱등이다.
   * (시스템 크론 — 전 회사 잔액 대상이므로 companyId 조건 없이 전역 실행)
   */
  private async expireOverdueBalances(): Promise<void> {
    const now = new Date()
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    )

    const result = await this.prisma.leaveBalance.updateMany({
      where: { expiresAt: { lt: todayStart }, remainingDays: { gt: 0 } },
      data: { remainingDays: 0 },
    })

    if (result.count > 0) {
      this.logger.log(`만료 잔액 처리: ${result.count}건 소멸`)
    }
  }
}
