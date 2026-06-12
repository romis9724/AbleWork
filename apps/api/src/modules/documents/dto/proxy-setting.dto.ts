import { z } from 'zod'

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const CreateProxySettingSchema = z
  .object({
    proxyId: z.string().min(1),
    startDate: z.string().regex(DATE_REGEX, 'YYYY-MM-DD 형식으로 입력하세요.'),
    endDate: z.string().regex(DATE_REGEX, 'YYYY-MM-DD 형식으로 입력하세요.'),
    reason: z.string().optional(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: '종료일은 시작일 이후여야 합니다.',
  })

export const UpdateProxySettingSchema = z
  .object({
    isActive: z.boolean().optional(),
    endDate: z.string().regex(DATE_REGEX, 'YYYY-MM-DD 형식으로 입력하세요.').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

export type CreateProxySettingDto = z.infer<typeof CreateProxySettingSchema>
export type UpdateProxySettingDto = z.infer<typeof UpdateProxySettingSchema>
