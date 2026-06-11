import { z } from 'zod'

export const CreatePositionSchema = z.object({
  name: z.string().min(1, '직무명을 입력하세요.').max(100),
  color: z.string().max(20).optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
})

export type CreatePositionDto = z.infer<typeof CreatePositionSchema>

export const UpdatePositionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

export type UpdatePositionDto = z.infer<typeof UpdatePositionSchema>
