import { z } from 'zod'

export const CreateCompanySchema = z.object({
  name: z.string().min(1).max(100),
  businessNumber: z.string().min(10).max(12).optional(),
  foundedAt: z.coerce.date().optional(),
  timezone: z.string().default('Asia/Seoul'),
  locale: z.string().default('ko-KR'),
  countryCode: z.string().length(2).default('KR'),
  logoUrl: z.string().url().optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(100),
  adminName: z.string().min(1).max(50),
})

export type CreateCompanyDto = z.infer<typeof CreateCompanySchema>
