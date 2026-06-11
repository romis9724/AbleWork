import { z } from 'zod'

export const UpdateEmployeeSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z.string().max(20).nullable().optional(),
  employeeNumber: z.string().max(50).nullable().optional(),
  employmentType: z
    .enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'DAILY'])
    .optional(),
  accessLevel: z
    .enum(['GENERAL_ADMIN', 'ORG_ADMIN', 'EMPLOYEE'])
    .optional(),
  organizationIds: z.array(z.string().uuid()).min(1).optional(),
  primaryOrganizationId: z.string().uuid().optional(),
  positionIds: z.array(z.string().uuid()).optional(),
})

export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>
