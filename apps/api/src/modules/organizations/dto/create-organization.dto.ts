import { z } from 'zod'

export const CreateOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).default(0),
  approverId: z.string().uuid().optional(),
})

export type CreateOrganizationDto = z.infer<typeof CreateOrganizationSchema>
