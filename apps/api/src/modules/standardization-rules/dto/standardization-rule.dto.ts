import { z } from 'zod'

export const CreateStandardizationRuleSchema = z.object({
  name: z.string().min(1, '규칙명을 입력해주세요.').max(100),
  calculationBasis: z.enum(['attendance', 'shift']),
  startTimeRule: z.string().min(1).max(20),
  endTimeRule: z.string().min(1).max(20),
  positionId: z.string().min(1, '올바른 UUID 형식이 아닙니다.').nullish(),
  excludeNoCheckin: z.boolean().optional(),
  includeManualBreak: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export type CreateStandardizationRuleDto = z.infer<
  typeof CreateStandardizationRuleSchema
>

export const UpdateStandardizationRuleSchema =
  CreateStandardizationRuleSchema.partial()

export type UpdateStandardizationRuleDto = z.infer<
  typeof UpdateStandardizationRuleSchema
>
