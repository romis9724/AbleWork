import { z } from 'zod'

/**
 * AI 에러 분석 로그 조회 필터.
 * 쿼리스트링 기반이므로 page/limit/status는 문자열을 coerce 한다.
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
