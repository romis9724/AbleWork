import { z } from 'zod'

export const UpdateCompanySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  businessNumber: z.string().min(10).max(12).optional(),
  foundedAt: z.coerce.date().optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  logoUrl: z.string().url().optional(),
})

export type UpdateCompanyDto = z.infer<typeof UpdateCompanySchema>
