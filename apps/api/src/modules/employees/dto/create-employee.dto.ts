import { z } from 'zod'

export const CreateEmployeeSchema = z.object({
  email: z.string().email('유효한 이메일을 입력하세요.'),
  name: z.string().min(1, '이름을 입력하세요.').max(50),
  phone: z.string().max(20).optional(),
  employeeNumber: z.string().max(50).optional(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'DAILY'], {
    errorMap: () => ({ message: '고용형태가 올바르지 않습니다.' }),
  }),
  accessLevel: z.enum(['GENERAL_ADMIN', 'ORG_ADMIN', 'EMPLOYEE'], {
    errorMap: () => ({ message: '접근 레벨이 올바르지 않습니다.' }),
  }),
  organizationIds: z
    .array(z.string().uuid())
    .min(1, '소속 조직을 하나 이상 선택하세요.'),
  primaryOrganizationId: z.string().uuid('유효한 UUID를 입력하세요.'),
  positionIds: z.array(z.string().uuid()).optional().default([]),
})

export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>
