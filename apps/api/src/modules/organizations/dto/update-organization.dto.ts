import { z } from 'zod'

export const UpdateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  approverId: z.string().uuid().nullable().optional(),
})

export type UpdateOrganizationDto = z.infer<typeof UpdateOrganizationSchema>
