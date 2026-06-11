import { z } from 'zod'

export const CreateWageInfoSchema = z.object({
  hourlyWage: z.number().int().min(0, '시급은 0 이상이어야 합니다.'),
  contractedWorkDays: z
    .string()
    .min(1, '계약 근무요일을 입력하세요.')
    .max(50),
  contractedHoursPerWeek: z
    .number()
    .min(0)
    .max(168, '주 계약시간이 너무 큽니다.')
    .multipleOf(0.01),
  weeklyPaidHolidayDay: z.string().max(10).optional(),
  maxHoursPerWeek: z.number().min(0).max(168).multipleOf(0.01).optional().default(52),
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
})

export type CreateWageInfoDto = z.infer<typeof CreateWageInfoSchema>
