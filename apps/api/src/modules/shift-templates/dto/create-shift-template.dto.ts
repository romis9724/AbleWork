import { z } from 'zod'

// HH:MM 형식 시간 문자열 검증
const TimeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'HH:MM 형식으로 입력하세요.')

export const CreateShiftTemplateSchema = z.object({
  shiftTypeId: z.string().min(1, '유효한 근무유형 ID를 입력하세요.'),
  name: z.string().min(1, '템플릿 이름을 입력하세요.').max(100),
  code: z.string().max(20).optional(),
  startTime: TimeSchema,
  endTime: TimeSchema,
})

export const UpdateShiftTemplateSchema = z.object({
  shiftTypeId: z.string().min(1).optional(),
  name: z.string().min(1).max(100).optional(),
  code: z.string().max(20).optional(),
  startTime: TimeSchema.optional(),
  endTime: TimeSchema.optional(),
})

export type CreateShiftTemplateDto = z.infer<typeof CreateShiftTemplateSchema>
export type UpdateShiftTemplateDto = z.infer<typeof UpdateShiftTemplateSchema>
