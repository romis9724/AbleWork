import { z } from 'zod'

// 로그인한 SUPER_ADMIN이 같은 그룹에 새 회사를 추가할 때 사용.
// 관리자 계정(admin*)은 현재 사용자를 재사용하므로 받지 않는다.
export const AddCompanySchema = z.object({
  name: z.string().min(1).max(100),
  businessNumber: z.string().min(10).max(12).optional(),
  foundedAt: z.coerce.date().optional(),
  timezone: z.string().default('Asia/Seoul'),
  locale: z.string().default('ko-KR'),
  countryCode: z.string().length(2).default('KR'),
  logoUrl: z.string().url().optional(),
})

export type AddCompanyDto = z.infer<typeof AddCompanySchema>
