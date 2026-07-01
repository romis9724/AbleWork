import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { RuleWithDetails } from './requests.constants'
import type { PrismaService } from '../../prisma/prisma.service'

// 요청 승인 파이프라인에서 쓰는 순수 계산 헬퍼(상태·DI 없음).
// RequestsService에서 분리 — 단위 테스트·재사용이 쉽도록.
// prisma를 받는 헬퍼(loadRequestInCompany·getEmployeeOrgIds)는 main·approval 서브서비스 공용.

/** 'HH:MM' → 1970-01-01 기준 UTC Date. 형식이 아니면 null. */
export function parseTimeToDate(time?: string | null): Date | null {
  if (!time || !/^\d{1,2}:\d{2}$/.test(time)) return null
  return new Date(`1970-01-01T${time.padStart(5, '0')}:00.000Z`)
}

/** 'HH:MM' 두 값의 시간 차이(시간 단위). 음수/오류면 0. */
export function hoursBetween(start?: string | null, end?: string | null): number {
  if (!start || !end) return 0
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

/** 날짜(YYYY-MM-DD)와 시각(Date의 UTC 시/분)을 로컬 Date로 결합. */
export function combineDateAndTime(date: string, time: Date): Date {
  const hh = String(time.getUTCHours()).padStart(2, '0')
  const mm = String(time.getUTCMinutes()).padStart(2, '0')
  return new Date(`${date}T${hh}:${mm}:00`)
}

/** 해당 라운드의 필수 승인 수(details 없으면 1). */
export function roundRequiredCount(rule: RuleWithDetails, round: number): number {
  const details = (rule?.details ?? []).filter((d) => d.round === round)
  if (details.length === 0) return 1
  return Math.max(1, ...details.map((d) => d.requiredCount ?? 1))
}

/** 총 결재 라운드 수 (rule.maxApprovalRounds와 details의 최대 round 중 큰 값). */
export function getMaxRounds(rule: RuleWithDetails): number {
  const detailMax = (rule?.details ?? []).reduce((m, d) => Math.max(m, d.round), 0)
  return Math.max(1, rule?.maxApprovalRounds ?? 1, detailMax)
}

/** PENDING 상태가 아니면 예외 (이미 처리된 요청). */
export function assertRequestPending(request: { status: string }) {
  if (request.status !== 'PENDING') {
    throw new BadRequestException({
      code: 'REQUEST_NOT_PENDING',
      message: '이미 처리된 요청입니다.',
    })
  }
}

/** 요청이 해당 회사 소속인지 검증하고 반환 — 멀티테넌시(main·approval 공용). */
export async function loadRequestInCompany(
  prisma: PrismaService,
  companyId: string,
  requestId: string,
) {
  const request = await prisma.request.findFirst({
    where: { id: requestId, companyId },
  })
  if (!request) {
    throw new NotFoundException({
      code: 'REQUEST_NOT_FOUND',
      message: '요청을 찾을 수 없습니다.',
    })
  }
  return request
}

/** 직원의 소속 조직 ID 목록 (companyId 조건 포함 — 멀티테넌시, main·approval 공용). */
export async function getEmployeeOrgIds(
  prisma: PrismaService,
  companyId: string,
  employeeId: string,
): Promise<string[]> {
  const orgs = await prisma.employeeOrganization.findMany({
    where: { employeeId, organization: { companyId } },
    select: { organizationId: true },
  })
  return orgs.map((o: { organizationId: string }) => o.organizationId)
}
