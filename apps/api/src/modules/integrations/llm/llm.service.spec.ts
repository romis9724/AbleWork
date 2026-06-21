import { BadRequestException } from '@nestjs/common'
import { LlmService } from './llm.service'
import { AiSettingsService } from './ai-settings.service'
import { OpenAiCompatibleProvider } from './openai-compatible.provider'

const aiSettings = { getConfig: jest.fn() }
const provider = { type: 'openai-compatible', chat: jest.fn() }

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
      provider as unknown as OpenAiCompatibleProvider,
    )
  })

  it('chat — 설정(baseUrl·model·maxTokens)을 적용해 provider.chat을 호출한다', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    provider.chat.mockResolvedValue('응답')

    const out = await service.chat('c1', [{ role: 'user', content: 'hi' }])

    expect(out).toBe('응답')
    expect(provider.chat).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'http://vllm:8000/v1', model: 'qwen2.5', maxTokens: 512 }),
    )
  })

  it('chat — 비활성이면 AI_DISABLED로 막고 provider를 호출하지 않는다', async () => {
    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, enabled: false })
    await expect(service.chat('c1', [])).rejects.toThrow(BadRequestException)
    expect(provider.chat).not.toHaveBeenCalled()
  })

  it('testConnection — 성공 시 ok=true·model 반환', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    provider.chat.mockResolvedValue('pong')
    const r = await service.testConnection('c1')
    expect(r.ok).toBe(true)
    expect(r.model).toBe('qwen2.5')
  })

  it('testConnection — 호출 실패(예외)도 throw 없이 ok=false로 흡수', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    provider.chat.mockRejectedValue({ code: 'ECONNREFUSED' })
    const r = await service.testConnection('c1')
    expect(r.ok).toBe(false)
    expect(r.message).toContain('ECONNREFUSED')
  })

  it('testConnection — baseUrl 미설정이면 ok=false', async () => {
    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, baseUrl: '' })
    const r = await service.testConnection('c1')
    expect(r.ok).toBe(false)
  })

  it('isEnabled — enabled·baseUrl·model이 모두 있어야 true', async () => {
    aiSettings.getConfig.mockResolvedValue(enabledCfg)
    expect(await service.isEnabled('c1')).toBe(true)

    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, model: '' })
    expect(await service.isEnabled('c1')).toBe(false)
  })

  it('chat — 지원하지 않는 provider면 AI_PROVIDER_UNSUPPORTED', async () => {
    aiSettings.getConfig.mockResolvedValue({ ...enabledCfg, provider: 'anthropic' })
    await expect(service.chat('c1', [])).rejects.toThrow(BadRequestException)
  })
})
