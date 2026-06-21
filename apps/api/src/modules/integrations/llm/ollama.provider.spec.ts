import axios from 'axios'
import { OllamaProvider } from './ollama.provider'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('OllamaProvider', () => {
  let provider: OllamaProvider

  beforeEach(() => {
    provider = new OllamaProvider()
    jest.clearAllMocks()
  })

  it('native /api/chat로 think:false·stream:false 호출하고 message.content를 trim해 반환한다', async () => {
    mockedAxios.post.mockResolvedValue({ data: { message: { content: '  요약 결과  ' }, done_reason: 'stop' } })

    const out = await provider.chat({
      baseUrl: 'http://59.29.231.14:23076/',
      model: 'qwen3:8b',
      messages: [{ role: 'user', content: '요약해줘' }],
      maxTokens: 200,
      temperature: 0.3,
    })

    expect(out).toBe('요약 결과')
    const [url, body] = mockedAxios.post.mock.calls[0]
    // baseUrl 끝 슬래시 정리 + /api/chat (OpenAI 호환과 다른 경로)
    expect(url).toBe('http://59.29.231.14:23076/api/chat')
    const b = body as { think: boolean; stream: boolean; options: { num_predict: number; temperature: number } }
    expect(b.think).toBe(false) // 추론 끄기 — 요약에 토큰 낭비 방지
    expect(b.stream).toBe(false)
    expect(b.options.num_predict).toBe(200)
    expect(b.options.temperature).toBe(0.3)
  })

  it('content가 없으면 빈 문자열을 반환한다', async () => {
    mockedAxios.post.mockResolvedValue({ data: { message: {} } })
    expect(await provider.chat({ baseUrl: 'http://x:11434', model: 'm', messages: [] })).toBe('')
  })
})
