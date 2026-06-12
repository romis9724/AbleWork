import { z } from 'zod'

export const CreateCompanyHolidaySchema = z.object({
  name: z.string().min(1).max(100),
  holidayDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  isAnnualRepeat: z.boolean().optional(),
  type: z.string().max(20).optional(),
})

export type CreateCompanyHolidayDto = z.infer<typeof CreateCompanyHolidaySchema>
