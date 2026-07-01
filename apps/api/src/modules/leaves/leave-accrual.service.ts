import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { RunAccrualRuleDto } from './dto/accrual-rule.dto'

/**
 * 연차 발생(부여) 엔진 (god file 분할 · 항목 24).
 * 규칙 실행(runAccrualRule) + 근속/월할/유효기간 계산 + 대상 직원별 잔액 부여.
 */
@Injectable()
export class LeaveAccrualService {
  constructor(private readonly prisma: PrismaService) {}

  async runAccrualRule(
    companyId: string,
    ruleId: string,
    dto: RunAccrualRuleDto,
  ) {
    const rule = await this.prisma.leaveAccrualRule.findFirst({
      where: { id: ruleId, companyId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        leaveGroup: { include: { leaveTypes: { where: { isActive: true } } } },
      },
    })

    if (!rule) {
      throw new NotFoundException({
        code: 'ACCRUAL_RULE_NOT_FOUND',
        message: '발생 규칙을 찾을 수 없습니다.',
      })
    }

    // 대상 직원 목록 결정 (employeeIds 배열 > 단일 employeeId > 전체)
    const targetEmployeeIds =
      dto.employeeIds && dto.employeeIds.length > 0
        ? dto.employeeIds
        : dto.employeeId
          ? [dto.employeeId]
          : undefined

    const employees = await this.prisma.employee.findMany({
      where: {
        companyId,
        isActive: true,
        ...(targetEmployeeIds && { id: { in: targetEmployeeIds } }),
      },
      select: { id: true, joinedAt: true },
    })

    if (employees.length === 0) return { processed: 0 }

    // 그룹 중복 발생 방지: 그룹의 "대표 유형 1개"에만 잔액을 발생시킨다.
    // (그룹 내 모든 유형에 전액 발생 시 연차 15일 × 유형 수만큼 중복 발생하는 버그가 있었음)
    const targetLeaveType = this.pickRepresentativeLeaveType(rule.leaveGroup.leaveTypes)
    if (!targetLeaveType) return { processed: 0 }

    const targetYear = dto.year
    // 기준일: 과거 연도 → 해당 연도 말일, 당해 연도 → 오늘, 미래 연도 → 해당 연도 초일
    // (Cron이 매일 실행되어도 당해 연도 기준 근속/월 발생 횟수가 정확히 계산되도록 클램프)
    const referenceDate = this.clampToYear(new Date(), targetYear)

    let processed = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await this.prisma.$transaction(async (tx: any) => {
      for (const employee of employees) {
        const accrual = this.calcAccrualForEmployee(
          rule.items,
          employee.joinedAt,
          targetYear,
          referenceDate,
        )
        if (!accrual) continue

        const applied = await this.applyAccrualTarget(tx, {
          employeeId: employee.id,
          leaveTypeId: targetLeaveType.id,
          year: targetYear,
          targetDays: accrual.targetDays,
          expiresAt: accrual.expiresAt,
        })

        if (applied) processed++
      }
    })

    return { processed }
  }

  // ── 발생 규칙 계산 헬퍼 ──────────────────────────────────────────────────────

  /**
   * 그룹 대표 휴가 유형 선택 — 발생 대상은 그룹당 1개 유형으로 제한한다.
   * 우선순위: deductionDays=1 이고 timeOption='full_day'인 유형 → 없으면 첫 번째 활성 유형
   */
  private pickRepresentativeLeaveType(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    leaveTypes: any[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any | null {
    if (leaveTypes.length === 0) return null
    return (
      leaveTypes.find(
        (t) => Number(t.deductionDays) === 1 && t.timeOption === 'full_day',
      ) ?? leaveTypes[0]
    )
  }

  /**
   * 직원 1명에 대한 발생 목표 계산.
   *
   * 구간 매칭: 근속기간을 충족하는 항목 중 "가장 높은 구간"을 선택한다.
   * (예: 근속 4년, 구간 [1년→15일, 3년→16일] → 16일 적용)
   *
   * 월 기준(accrualBasis='monthly') 발생 방식:
   *   LeaveBalance unique 키가 (employeeId, leaveTypeId, year)뿐이라 월별 발생 이력을
   *   별도 저장할 수 없다. 따라서 "연간 누적 목표 = 월 발생량 × 경과 개월 수"를 계산해
   *   accruedDays를 목표값으로 set하는 방식을 쓴다. Cron이 매일 실행되면 새 달이
   *   경과할 때마다 목표가 1개월분씩 증가하므로 "이번 달 발생분이 없으면 추가"와
   *   동일하게 동작하고, 같은 달에 여러 번 실행해도 목표가 같아 멱등이다.
   *   한계: 수동 발생(manualAccrual)이 같은 (직원, 유형, 연도) 잔액을 증가시킨 경우
   *   규칙 목표와 합산 구분이 불가능해, 수동분만큼 규칙 발생이 흡수될 수 있다.
   */
  private calcAccrualForEmployee(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: any[],
    joinedAt: Date,
    targetYear: number,
    referenceDate: Date,
  ): { targetDays: number; expiresAt: Date | null } | null {
    const tenureMonths = this.calcTenureMonths(joinedAt, referenceDate)

    // 구간 기준(개월 환산) 내림차순 정렬 후 첫 매칭 = 충족하는 가장 높은 구간
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const thresholdOf = (item: any): number =>
      item.accrualBasis === 'yearly'
        ? (item.tenureYears ?? 0) * 12
        : (item.tenureMonths ?? 0)

    const applicableItem = [...items]
      .sort((a, b) => thresholdOf(b) - thresholdOf(a))
      .find((item) => tenureMonths >= thresholdOf(item))

    if (!applicableItem) return null

    const accrualDays = Number(applicableItem.accrualDays)
    const expiresAt = this.calcExpiresAt(applicableItem, joinedAt, targetYear)

    if (applicableItem.accrualBasis === 'monthly') {
      const months = this.calcMonthlyAccrualCount(joinedAt, targetYear, referenceDate)
      if (months === 0) return null
      return { targetDays: accrualDays * months, expiresAt }
    }

    // 연 기준: 연 1회 전액 발생
    return { targetDays: accrualDays, expiresAt }
  }

  /**
   * 만료일 계산.
   * - 회계연도 규칙(periodStartMd 사용): 기간 종료일(periodEndMd) 기준.
   *   periodEndMd가 없으면 기간 시작일 + validMonths, 둘 다 없으면 null.
   * - 입사일 기준 규칙: 발생 기준일(대상 연도의 입사 기념일) + validMonths.
   *   validMonths 없으면 null.
   */
  private calcExpiresAt(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any,
    joinedAt: Date,
    targetYear: number,
  ): Date | null {
    if (item.periodStartMd) {
      const periodStart = this.dateFromMd(targetYear, item.periodStartMd)
      if (item.periodEndMd) {
        const sameYearEnd = this.dateFromMd(targetYear, item.periodEndMd)
        // 기간이 연도를 넘어가는 경우 (예: 03-01 ~ 02-28) 종료일은 다음 해
        return sameYearEnd < periodStart
          ? this.dateFromMd(targetYear + 1, item.periodEndMd)
          : sameYearEnd
      }
      return item.validMonths ? this.addMonths(periodStart, item.validMonths) : null
    }

    if (!item.validMonths) return null

    const anniversary = new Date(
      Date.UTC(targetYear, joinedAt.getUTCMonth(), joinedAt.getUTCDate()),
    )
    return this.addMonths(anniversary, item.validMonths)
  }

  /** 대상 연도 내 월 발생 횟수: max(연초, 입사일) ~ 기준일 사이의 만(滿) 개월 수 (0~12) */
  private calcMonthlyAccrualCount(
    joinedAt: Date,
    targetYear: number,
    referenceDate: Date,
  ): number {
    const yearStart = new Date(Date.UTC(targetYear, 0, 1))
    const start = joinedAt > yearStart ? joinedAt : yearStart
    if (referenceDate < start) return 0

    let months =
      (referenceDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (referenceDate.getUTCMonth() - start.getUTCMonth())
    if (referenceDate.getUTCDate() < start.getUTCDate()) months -= 1

    const MAX_MONTHS_PER_YEAR = 12
    return Math.min(MAX_MONTHS_PER_YEAR, Math.max(0, months))
  }

  /**
   * 멱등 발생 적용: accruedDays를 규칙 계산 목표값으로 set.
   * - 목표값 <= 현재 accruedDays 이면 스킵 → 같은 연도에 여러 번 실행해도 중복 증가 없음
   * - 증가분(delta)만 remainingDays에 가산 → usedDays(사용분)는 보존
   * 주의: manualAccrual/보상휴가의 increment 방식(upsertAccruedBalance)과는 별도 경로다.
   */
  private async applyAccrualTarget(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    params: {
      employeeId: string
      leaveTypeId: string
      year: number
      targetDays: number
      expiresAt: Date | null
    },
  ): Promise<boolean> {
    const { employeeId, leaveTypeId, year, targetDays, expiresAt } = params
    const uniqueKey = { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } }

    const existing = await tx.leaveBalance.findUnique({ where: uniqueKey })

    if (!existing) {
      await tx.leaveBalance.create({
        data: {
          employeeId,
          leaveTypeId,
          year,
          accruedDays: targetDays,
          usedDays: 0,
          remainingDays: targetDays,
          expiresAt,
        },
      })
      return true
    }

    const delta = targetDays - Number(existing.accruedDays)
    if (delta <= 0) return false // 이미 목표 이상 발생됨 — 멱등 가드

    await tx.leaveBalance.update({
      where: uniqueKey,
      data: {
        accruedDays: targetDays,
        remainingDays: { increment: delta },
        ...(expiresAt && { expiresAt }),
      },
    })
    return true
  }

  /** 기준일을 대상 연도 범위로 클램프: 과거 연도→연말, 당해 연도→오늘, 미래 연도→연초 */
  private clampToYear(date: Date, year: number): Date {
    const yearStart = new Date(Date.UTC(year, 0, 1))
    const yearEnd = new Date(Date.UTC(year, 11, 31))
    if (date < yearStart) return yearStart
    if (date > yearEnd) return yearEnd
    return date
  }

  /** 'MM-DD' 문자열 → 해당 연도의 UTC Date */
  private dateFromMd(year: number, md: string): Date {
    const [month, day] = md.split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day))
  }

  private addMonths(date: Date, months: number): Date {
    const result = new Date(date)
    result.setUTCMonth(result.getUTCMonth() + months)
    return result
  }

  // ── HR-06-09 잔여 휴가 조회 ──────────────────────────────────────────────────


  private calcTenureMonths(joinedAt: Date, referenceDate: Date): number {
    const diffMs = referenceDate.getTime() - joinedAt.getTime()
    if (diffMs < 0) return 0
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    return Math.floor(diffDays / 30.44)
  }
}
