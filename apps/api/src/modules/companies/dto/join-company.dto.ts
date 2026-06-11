import { z } from 'zod'

export const JoinCompanySchema = z.object({
  inviteCode: z.string().length(6),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(50),
})

export type JoinCompanyDto = z.infer<typeof JoinCompanySchema>
