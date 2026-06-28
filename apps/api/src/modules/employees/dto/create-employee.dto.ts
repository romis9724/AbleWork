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
  // ID는 DB 기본값(uuid)이지만 시드·임포트 등 비-UUID ID도 존재할 수 있어 형식 강제 대신 비어있지 않음만 검증
  // (실재 여부는 companyId 스코프 DB 조회로 검증). 프론트(EmployeeCreateDialog)와도 정합.
  organizationIds: z
    .array(z.string().min(1))
    .min(1, '소속 조직을 하나 이상 선택하세요.'),
  primaryOrganizationId: z.string().min(1, '본조직을 선택하세요.'),
  positionIds: z.array(z.string().min(1)).optional().default([]),
})

export type CreateEmployeeDto = z.infer<typeof CreateEmployeeSchema>

/** 직원 일괄 등록 (CSV) — 조직은 이름으로 해석, 누락 필드는 서버 기본값 적용 */
export const BulkCreateEmployeeSchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().min(1).max(50),
        email: z.string().email(),
        joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        employmentType: z.string().optional(),
        // 조직·직위는 이름으로 해석. 다중은 세미콜론(;)으로 구분, 조직 첫 번째가 본조직.
        organizationName: z.string().optional(),
        positionName: z.string().optional(),
        // 권한 라벨(직원/조직관리자/총괄관리자). 생략 시 직원. 최고관리자는 업로드 불가.
        accessLevel: z.string().optional(),
        employeeNumber: z.string().max(50).optional(),
        phone: z.string().max(20).optional(),
      }),
    )
    .min(1, '등록할 행이 없습니다.')
    .max(500, '한 번에 최대 500행까지 등록할 수 있습니다.'),
})

export type BulkCreateEmployeeDto = z.infer<typeof BulkCreateEmployeeSchema>
