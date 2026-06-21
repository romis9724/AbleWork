import { BadRequestException } from '@nestjs/common'
import { LlmService } from './llm.service'
import { AiSettingsService } from './ai-settings.service'
import { OpenAiCompatibleProvider } from './openai-compatible.provider'
import { OllamaProvider } from './ollama.provider'

const aiSettings = { getConfig: jest.fn() }
const openAi = { type: 'openai-compatible', chat: jest.fn() }
const ollama = { type: 'ollama', chat: jest.fn() }

const enabledCfg = {
  enabled: true,
  provider: 'vllm',
  baseUrl: 'http://vllm:8000/v1',
  model: 'qwen2.5',
  apiKey: '',
  maxTokens: 512,
  temperature: 0.3,
}

describe('LlmService', () => {
  let service: LlmService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new LlmService(
      aiSettings as unknown as AiSettingsService,
      openAi as unknown as OpenAiCompatibleProvider,
      ollama as unknown as OllamaProvider,
    )
  })

  it('chat — vLLM/OpenAI는 OpenAI 호환 provider로 라우팅한다', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    openAi.chat.mockResolvedValue('응답')

    const out = await service.chat('c1', [{ role: 'user', content: 'hi' }])

    expect(out).toBe('응답')
    expect(openAi.chat).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://vllm:8000/v1', model: 'qwen2.5', maxTokens: 512 }),
    )
    expect(ollama.chat).not.toHaveBeenCalled()
  })

  it('chat — provider=ollama면 OllamaProvider로 라우팅한다', async () => {
    aiSettings.getConfig.mockResolvedValue({
      ...enabledCfg,
      provider: 'ollama',
      baseUrl: 'http://oll:23076',
      model: 'qwen3:8b',
    })
    ollama.chat.mockResolvedValue('올라마 응답')

    const out = await service.chat('c1', [{ role: 'user', content: 'hi' }])

    expect(out).toBe('올라마 응답')
    expect(ollama.chat).toHaveBeenCalled()
    expect(openAi.chat).not.toHaveBeenCalled()
  })

  it('chat — 비활성이면 AI_DISABLED로 막고 provider를 호출하지 않는다', async () => {
    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, enabled: false })
    await expect(service.chat('c1', [])).rejects.toThrow(BadRequestException)
    expect(openAi.chat).not.toHaveBeenCalled()
    expect(ollama.chat).not.toHaveBeenCalled()
  })

  it('testConnection — 성공 시 ok=true·model 반환', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    openAi.chat.mockResolvedValue('pong')
    const r = await service.testConnection('c1')
    expect(r.ok).toBe(true)
    expect(r.model).toBe('qwen2.5')
  })

  it('testConnection — 호출 실패(예외)도 throw 없이 ok=false로 흡수', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    openAi.chat.mockRejectedValue({ code: 'ECONNREFUSED' })
    const r = await service.testConnection('c1')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('ECONNREFUSED')
  })

  it('testConnection — baseUrl 미설정이면 ok=false', async () => {
    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, baseUrl: '' })
    expect((await service.testConnection('c1')).ok).toBe(false)
  })

  it('isEnabled — enabled·baseUrl·model이 모두 있어야 true', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    expect(await service.isEnabled('c1')).toBe(true)

    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, model: '' })
    expect(await service.isEnabled('c1')).toBe(false)
  })

  it('chat — 아직 미지원 provider(anthropic)는 AI_PROVIDER_UNSUPPORTED', async () => {
    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, provider: 'anthropic' })
    await expect(service.chat('c1', [])).rejects.toThrow(BadRequestException)
  })
})
