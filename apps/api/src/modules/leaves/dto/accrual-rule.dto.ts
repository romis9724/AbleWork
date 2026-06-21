import { z } from 'zod'

export const AccrualRuleItemSchema = z.object({
  accrualBasis: z.enum(['monthly', 'yearly']),
  tenureMonths: z.number().int().min(0).optional(),
  tenureYears: z.number().int().min(0).optional(),
  accrualDays: z.number().min(0).max(999.99),
  validMonths: z.number().int().min(1).optional(),
  periodStartMd: z
    .string()
    .regex(/^\d{2}-\d{2}$/, 'MM-DD 형식으로 입력하세요.')
    .optional(),
  periodEndMd: z
    .string()
    .regex(/^\d{2}-\d{2}$/, 'MM-DD 형식으로 입력하세요.')
    .optional(),
  sortOrder: z.number().int().min(0).default(0),
})

export const CreateAccrualRuleSchema = z.object({
  leaveGroupId: z.string().min(1, '유효한 UUID를 입력하세요.'),
  name: z.string().min(1, '규칙명을 입력하세요.').max(100),
  memo: z.string().optional(),
  isActive: z.boolean().default(true),
  items: z.array(AccrualRuleItemSchema).min(1, '발생 규칙 항목을 하나 이상 추가하세요.'),
})

export const UpdateAccrualRuleSchema = CreateAccrualRuleSchema.partial()

export const RunAccrualRuleSchema = z.object({
  employeeId: z.string().min(1).optional(),
  employeeIds: z.array(z.string().min(1)).optional(),
  year: z.number().int().min(2000).max(2100).default(new Date().getFullYear()),
})

export type CreateAccrualRuleDto = z.infer<typeof CreateAccrualRuleSchema>
export type UpdateAccrualRuleDto = z.infer<typeof UpdateAccrualRuleSchema>
export type RunAccrualRuleDto = z.infer<typeof RunAccrualRuleSchema>
