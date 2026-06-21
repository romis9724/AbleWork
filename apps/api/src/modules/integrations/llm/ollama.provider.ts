import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { LlmChatRequest, LlmProvider } from './llm-provider.interface'

const DEFAULT_MAX_TOKENS = 512
const DEFAULT_TEMPERATURE = 0.3
/** 자체 호스팅 추론은 느릴 수 있어 여유를 둔다 */
const REQUEST_TIMEOUT_MS = 60_000

/**
 * Ollama native 구현체 — `POST {baseUrl}/api/chat`.
 * OpenAI 호환(/v1)과 달리 `think:false`를 지원해, 추론 모델(qwen3 등)의 사고 과정을 꺼서
 * 요약처럼 짧은 응답에 토큰을 낭비하지 않고 본문만 받는다.
 * (provider마다 API가 달라 LlmProvider 추상화가 필요한 대표 사례)
 *
 * baseUrl은 OpenAI 호환과 달리 `/v1` 없이 루트(예: `http://host:11434`)를 쓴다.
 */
@Injectable()
export class OllamaProvider implements LlmProvider {
  readonly type = 'ollama'

  async chat(req: LlmChatRequest): Promise<string> {
    const url = `${req.baseUrl.replace(/\/+$/, '')}/api/chat`
    const res = await axios.post(
      url,
      {
        model: req.model,
        messages: req.messages,
        think: false,
        stream: false,
        options: {
          num_predict: req.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: req.temperature ?? DEFAULT_TEMPERATURE,
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : {}),
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    )
    const content = res.data?.message?.content
    return typeof content === 'string' ? content.trim() : ''
  }
}
