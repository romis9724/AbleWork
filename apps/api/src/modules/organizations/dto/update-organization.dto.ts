import { z } from 'zod'

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  approverId: z.string().uuid().nullable().optional(),
  // AP-04-07 문서담당자 (미지정 시 approverId/팀장 fallback)
  docManagerId: z.string().uuid().nullable().optional(),
})

export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>
