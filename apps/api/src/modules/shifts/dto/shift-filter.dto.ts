import { z } from 'zod'

export const ShiftFilterSchema = z.object({
  employeeId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  startAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
  endAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
})

export type ShiftFilterDto = z.infer<typeof ShiftFilterSchema>
