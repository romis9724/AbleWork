import { z } from 'zod'

/** 직원 로그인 비밀번호 규칙 (영문 + 숫자 포함, 8자 이상) — auth.dto와 동일 정책 */
export const EmployeePasswordSchema = z
  .string()
  .min(8, '비밀번호는 8자 이상이어야 합니다.')
  .regex(/[A-Za-z]/, '비밀번호에 영문자를 포함하세요.')
  .regex(/[0-9]/, '비밀번호에 숫자를 포함하세요.')

export const CreateEmployeeSchema = z.object({
  email: z.string().email('유효한 이메일을 입력하세요.'),
  name: z.string().min(1, '이름을 입력하세요.').max(50),
  // 초기 로그인 비밀번호. 생략 시 계정은 비활성 상태로 생성되며 추후 비밀번호 재설정으로 활성화한다.
  initialPassword: EmployeePasswordSchema.optional(),
  phone: z.string().max(20).optional(),
  employeeNumber: z.string().max(50).optional(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  employmentType: z.enum(['regular', 'contract', 'part_time', 'daily'], {
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
