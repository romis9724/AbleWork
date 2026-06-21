import axios from 'axios'
import { OpenAiCompatibleProvider } from './openai-compatible.provider'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('OpenAiCompatibleProvider', () => {
  let provider: OpenAiCompatibleProvider

  beforeEach(() => {
    provider = new OpenAiCompatibleProvider()
    jest.clearAllMocks()
  })

  it('baseUrl 끝 슬래시를 정리해 /chat/completions로 호출하고 content를 trim해 반환한다', async () => {
    mockedAxios.post.mockResolvedValue({ data: { choices: [{ message: { content: '  요약 결과  ' } }] } })

    const out = await provider.chat({
      baseUrl: 'http://vllm:8000/v1/',
      model: 'qwen2.5',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(out).toBe('요약 결과')
    const [url, body, config] = mockedAxios.post.mock.calls[0]
    expect(url).toBe('http://vllm:8000/v1/chat/completions')
    expect((body as { model: string }).model).toBe('qwen2.5')
    // apiKey 없으면 Authorization 헤더 없음(vLLM 무인증 케이스)
    expect((config as { headers: Record<string, string> }).headers.Authorization).toBeUndefined()
  })

  it('apiKey가 있으면 Bearer 인증 헤더를 붙인다(외부 LLM)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { choices: [{ message: { content: 'x' } }] } })

    await provider.chat({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: 'sk-test',
      messages: [{ role: 'user', content: 'hi' }],
    })

    const config = mockedAxios.post.mock.calls[0][2] as { headers: Record<string, string> }
    expect(config.headers.Authorization).toBe('Bearer sk-test')
  })

  it('응답에 content가 없으면 빈 문자열을 반환한다', async () => {
    mockedAxios.post.mockResolvedValue({ data: { choices: [] } })
    expect(await provider.chat({ baseUrl: 'http://x/v1', model: 'm', messages: [] })).toBe('')
  })
})
