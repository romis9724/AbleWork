import { z } from 'zod'

/** 메신저 계정 연동 — 직원 본인이 자기 메신저(Discord 등) 사용자 ID를 등록 */
export const LinkMessengerSchema = z.object({
  platform: z.enum(['discord']).default('discord'),
  externalUserId: z.string().trim().min(1, '메신저 사용자 ID를 입력하세요.').max(100),
})
export type LinkMessengerDto = z.infer<typeof LinkMessengerSchema>
