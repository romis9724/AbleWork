import { z } from 'zod'

export const CreateSnapshotSchema = z.object({
  name: z.string().min(1, '스냅샷 이름을 입력해주세요.').max(100),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD 이어야 합니다.'),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식은 YYYY-MM-DD 이어야 합니다.'),
  columnConfig: z.record(z.unknown()).optional(),
})

export type CreateSnapshotDto = z.infer<typeof CreateSnapshotSchema>

export const CreateCustomColumnSchema = z.object({
  name: z.string().min(1, '열 이름을 입력해주세요.').max(100),
  formula: z.string().min(1, '수식을 입력해주세요.'),
  leaveTypeId: z.string().uuid('올바른 UUID 형식이 아닙니다.').optional(),
  shiftTypeId: z.string().uuid('올바른 UUID 형식이 아닙니다.').optional(),
})

export type CreateCustomColumnDto = z.infer<typeof CreateCustomColumnSchema>
