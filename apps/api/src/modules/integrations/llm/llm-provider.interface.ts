/**
 * LLM 제공자 추상화 — vLLM(우선)·OpenAI는 OpenAI 호환 한 구현체로 공유하고,
 * Anthropic 등 다른 규격은 향후 별도 구현체로 교체 가능하게 한다.
 */

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 한 번의 채팅 완성 호출에 필요한 모든 입력 (provider는 무상태) */
export interface LlmChatRequest {
  baseUrl: string
  model: string
  apiKey?: string
  messages: LlmMessage[]
  maxTokens?: number
  temperature?: number
  /** 호출별 요청 타임아웃(ms). 미지정 시 provider 기본값. 부가기능(요약 등)은 짧게 잡아 핵심 흐름을 막지 않는다. */
  timeoutMs?: number
}

export interface LlmProvider {
  /** provider 식별자 */
  readonly type: string
  /** 채팅 완성 — 응답 본문(content) 문자열을 반환 */
  chat(req: LlmChatRequest): Promise<string>
}
