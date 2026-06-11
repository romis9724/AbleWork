import { z } from 'zod'

export const UpdateAttendanceSchema = z
  .object({
    clockInAt: z
      .string()
      .datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' })
      .optional(),
    clockOutAt: z
      .string()
      .datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' })
      .optional(),
    status: z
      .enum(['normal', 'late', 'early_leave', 'absent', 'oncall', 'remote', 'deemed_work'])
      .optional(),
    note: z.string().max(500).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

export type UpdateAttendanceDto = z.infer<typeof UpdateAttendanceSchema>
