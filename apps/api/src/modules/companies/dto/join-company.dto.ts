import { z } from 'zod'

// 멀티컴퍼니: 로그인한 사용자가 합류코드로 다른 회사에 합류. 본인 식별은 JWT에서.
export const JoinCompanySchema = z.object({
  inviteCode: z.string().length(6),
})

export type JoinCompanyDto = z.infer<typeof JoinCompanySchema>
