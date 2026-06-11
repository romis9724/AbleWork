import { z } from 'zod'

export const CreateLeaveGroupSchema = z.object({
  name: z.string().min(1, '그룹명을 입력하세요.').max(100),
  code: z.string().max(20).optional(),
  overageLimitDays: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

export type CreateLeaveGroupDto = z.infer<typeof CreateLeaveGroupSchema>
