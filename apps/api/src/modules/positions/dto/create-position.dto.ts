import { z } from 'zod'

export const CreatePositionSchema = z.object({
  name: z.string().min(1, '직위명을 입력하세요.').max(100),
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

// 정렬 순서 일괄 변경 — ids 배열 순서를 sortOrder(0..n)로 저장
export const ReorderPositionsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '정렬 대상이 비어 있습니다.'),
})

export type ReorderPositionsDto = z.infer<typeof ReorderPositionsSchema>
