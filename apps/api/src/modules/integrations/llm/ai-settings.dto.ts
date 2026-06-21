import { z } from 'zod'

/** 지원 provider — vLLM(우선)·OpenAI는 OpenAI 호환, anthropic은 향후 */
export const AI_PROVIDERS = ['vllm', 'openai', 'anthropic'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/** AI 설정 수정 — 알려진 필드만 허용, 알 수 없는 키는 strip */
export const PatchAiSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    provider: z.enum(AI_PROVIDERS).optional(),
    baseUrl: z.string().trim().max(500).optional(),
    model: z.string().trim().max(200).optional(),
    // 빈 문자열·마스킹값이면 기존 키 유지(저장하지 않음)
    apiKey: z.string().max(500).optional(),
    maxTokens: z.number().int().min(1).max(8192).optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strip()

export type PatchAiSettingsDto = z.infer<typeof PatchAiSettingsSchema>
