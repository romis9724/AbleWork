import { z } from 'zod'

export const CreateSchedulePatternSchema = z.object({
  name: z.string().min(1, '패턴 이름을 입력하세요.').max(100),
  description: z.string().max(500).optional(),
  repeatCycleDays: z
    .number()
    .int()
    .min(1, '반복 주기는 1일 이상이어야 합니다.')
    .max(365, '반복 주기는 365일 이하여야 합니다.'),
  patternDefinition: z
    .record(z.string(), z.string().uuid())
    .describe('날짜 인덱스(0-based 문자열) → templateId JSONB'),
  holidayHandling: z.enum(['skip_and_shift', 'skip_and_keep', 'no_skip'], {
    errorMap: () => ({ message: '공휴일 처리 방식이 올바르지 않습니다.' }),
  }),
})

export const UpdateSchedulePatternSchema = CreateSchedulePatternSchema.partial()

export const ApplySchedulePatternSchema = z.object({
  employeeIds: z
    .array(z.string().uuid('유효한 UUID를 입력하세요.'))
    .min(1, '적용할 직원을 한 명 이상 선택하세요.'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
})

export type CreateSchedulePatternDto = z.infer<typeof CreateSchedulePatternSchema>
export type UpdateSchedulePatternDto = z.infer<typeof UpdateSchedulePatternSchema>
export type ApplySchedulePatternDto = z.infer<typeof ApplySchedulePatternSchema>
