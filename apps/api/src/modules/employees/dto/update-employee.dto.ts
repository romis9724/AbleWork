import { z } from 'zod'

export const UpdateEmployeeSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  phone: z.string().max(20).nullable().optional(),
  employeeNumber: z.string().max(50).nullable().optional(),
  employmentType: z
    .enum(['regular', 'contract', 'part_time', 'daily'])
    .optional(),
  joinedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
  resignedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .nullable()
    .optional(),
  accessLevel: z
    .enum(['GENERAL_ADMIN', 'ORG_ADMIN', 'EMPLOYEE'])
    .optional(),
  // ID 형식 강제(uuid) 대신 비어있지 않음만 — 시드/임포트 등 비-UUID ID 허용(실재는 DB 조회로 검증)
  organizationIds: z.array(z.string().min(1)).min(1).optional(),
  primaryOrganizationId: z.string().min(1).optional(),
  positionIds: z.array(z.string().min(1)).optional(),
})

export type UpdateEmployeeDto = z.infer<typeof UpdateEmployeeSchema>
