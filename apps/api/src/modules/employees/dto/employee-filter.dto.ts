import { z } from 'zod'

export const EmployeeFilterSchema = z.object({
  search: z.string().optional(),
  organizationId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => {
      if (v === 'true') return true
      if (v === 'false') return false
      return undefined
    }),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1).default(1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .pipe(z.number().int().min(1).max(200).default(20)),
})

export type EmployeeFilterDto = z.infer<typeof EmployeeFilterSchema>
