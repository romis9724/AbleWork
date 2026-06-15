import { z } from 'zod'

/**
 * 감사 로그 조회 필터.
 * 쿼리스트링 기반이므로 page/limit은 문자열을 coerce 한다.
 */
export const AuditFilterSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  actorId: z.string().optional(),
  action: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
})

export type AuditFilterDto = z.infer<typeof AuditFilterSchema>
