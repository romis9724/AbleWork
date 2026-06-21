import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { LlmChatRequest, LlmProvider } from './llm-provider.interface'

const DEFAULT_MAX_TOKENS = 512
const DEFAULT_TEMPERATURE = 0.3
const REQUEST_TIMEOUT_MS = 30_000

/**
 * OpenAI 호환 Chat Completions 구현체.
 * vLLM(자체호스팅)·OpenAI 모두 `POST {baseUrl}/chat/completions` 규격을 따르므로,
 * baseUrl·model·apiKey만 바꿔 동일 코드로 호출한다.
 * (baseUrl 예: vLLM `http://10.0.0.5:8000/v1`, OpenAI `https://api.openai.com/v1`)
 */
@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  readonly type = 'openai-compatible'

  async chat(req: LlmChatRequest): Promise<string> {
    const url = `${req.baseUrl.replace(/\/+$/, '')}/chat/completions`
    const res = await axios.post(
      url,
      {
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: req.temperature ?? DEFAULT_TEMPERATURE,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(req.apiKey ? { Authorization: `Bearer ${req.apiKey}` } : {}),
        },
        timeout: req.timeoutMs ?? REQUEST_TIMEOUT_MS,
      },
    )
    const content = res.data?.choices?.[0]?.message?.content
    return typeof content === 'string' ? content.trim() : ''
  }
}
