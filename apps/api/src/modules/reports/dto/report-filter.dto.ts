import { z } from 'zod'

export const ReportFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD 이어야 합니다.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD 이어야 합니다.'),
  organizationId: z.string().min(1, '올바른 UUID 형식이 아닙니다.').optional(),
  employeeId: z.string().min(1, '올바른 UUID 형식이 아닙니다.').optional(),
  // 지각/조퇴 표시 최소 임곗값(분). FE 필터 바에서 전달.
  lateThresholdMinutes: z.coerce.number().int().min(0).optional(),
  earlyLeaveThresholdMinutes: z.coerce.number().int().min(0).optional(),
})

export type ReportFilterDto = z.infer<typeof ReportFilterSchema>

export const SnapshotListFilterSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export type SnapshotListFilterDto = z.infer<typeof SnapshotListFilterSchema>
