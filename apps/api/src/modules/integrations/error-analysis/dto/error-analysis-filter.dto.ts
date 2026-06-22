import { z } from 'zod'

/** 처리 상태 — 미해결/완료 */
export const RESOLUTION_STATUSES = ['OPEN', 'RESOLVED'] as const

/**
 * AI 에러 분석 로그 조회 필터.
 * 쿼리스트링 기반이므로 page/limit/status는 문자열을 coerce 한다.
 *
 * 기간 필터는 두 가지를 지원한다.
 * - startDate/endDate: 날짜 단위(YYYY-MM-DD). 하위 호환용. 해당 일자 00:00~23:59(UTC).
 * - from/to: 시간 단위(ISO 8601 datetime). "오늘 09:00 이후" 같은 시각 범위 조회용.
 *   from/to가 주어지면 startDate/endDate보다 우선한다.
 */
export const ErrorAnalysisFilterSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** 시작 시각(포함) — ISO datetime, 예: 2026-06-22T00:00:00.000Z */
  from: z.string().datetime({ offset: true }).optional(),
  /** 종료 시각(포함) — ISO datetime */
  to: z.string().datetime({ offset: true }).optional(),
  /** 처리 상태 */
  resolutionStatus: z.enum(RESOLUTION_STATUSES).optional(),
  /** HTTP 상태 코드 (예: 400, 500) */
  status: z.coerce.number().int().min(100).max(599).optional(),
  /** 요청 메서드 */
  method: z.string().max(10).optional(),
  /** 코드·메시지·경로 부분 검색 */
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

export type ErrorAnalysisFilterDto = z.infer<typeof ErrorAnalysisFilterSchema>

/**
 * 일괄 처리 상태 변경 DTO.
 * status 생략 시 RESOLVED(완료 처리). OPEN을 보내면 미해결로 되돌린다.
 */
export const BulkResolveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '대상이 비어 있습니다.').max(500),
  status: z.enum(RESOLUTION_STATUSES).default('RESOLVED'),
})

export type BulkResolveDto = z.infer<typeof BulkResolveSchema>
