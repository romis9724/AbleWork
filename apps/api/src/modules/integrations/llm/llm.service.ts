import { BadRequestException, Injectable } from '@nestjs/common'
import { AiConfig, AiSettingsService } from './ai-settings.service'
import { OpenAiCompatibleProvider } from './openai-compatible.provider'
import { LlmMessage, LlmProvider } from './llm-provider.interface'

/** 연결 테스트 결과 */
export interface LlmTestResult {
  ok: boolean
  message: string
  model?: string
}

/**
 * LLM 실행 진입점 — 회사 AI 설정을 읽어 provider를 선택(factory)하고 호출한다.
 * vLLM·OpenAI는 OpenAI 호환 구현체를 공유하고, anthropic 등은 향후 분기를 추가한다.
 */
@Injectable()
export class LlmService {
  constructor(
    private readonly aiSettings: AiSettingsService,
    private readonly openAiCompatible: OpenAiCompatibleProvider,
  ) {}

  /** 활성화·설정 검증 후 채팅 완성 호출 */
  async chat(companyId: string, messages: LlmMessage[]): Promise<string> {
    const cfg = await this.aiSettings.getConfig(companyId)
    this.assertUsable(cfg)
    return this.selectProvider(cfg.provider).chat({
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      apiKey: cfg.apiKey || undefined,
      messages,
      maxTokens: cfg.maxTokens,
      temperature: cfg.temperature,
    })
  }

  /** AI 활성 여부 — 부가기능(요약 등)이 호출 전에 가볍게 확인 */
  async isEnabled(companyId: string): Promise<boolean> {
    const cfg = await this.aiSettings.getConfig(companyId)
    return cfg.enabled && !!cfg.baseUrl && !!cfg.model
  }

  /** 현재 설정으로 연결 테스트 — 짧은 프롬프트 1회 호출, 실패해도 throw 대신 결과로 반환 */
  async testConnection(companyId: string): Promise<LlmTestResult> {
    const cfg = await this.aiSettings.getConfig(companyId)
    try {
      this.assertUsable(cfg)
      const reply = await this.selectProvider(cfg.provider).chat({
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        apiKey: cfg.apiKey || undefined,
        messages: [{ role: 'user', content: 'ping. "pong"이라고만 답하세요.' }],
        maxTokens: 16,
        temperature: 0,
      })
      return { ok: true, message: `연결 성공 — 응답: ${reply.slice(0, 60) || '(빈 응답)'}`, model: cfg.model }
    } catch (err) {
      return { ok: false, message: this.errorMessage(err) }
    }
  }

  private assertUsable(cfg: AiConfig): void {
    if (!cfg.enabled) {
      throw new BadRequestException({ code: 'AI_DISABLED', message: 'AI 기능이 비활성화되어 있습니다.' })
    }
    if (!cfg.baseUrl) {
      throw new BadRequestException({ code: 'AI_BASE_URL_MISSING', message: 'AI 서버 주소(baseUrl)가 설정되지 않았습니다.' })
    }
    if (!cfg.model) {
      throw new BadRequestException({ code: 'AI_MODEL_MISSING', message: 'AI 모델이 설정되지 않았습니다.' })
    }
  }

  /** provider type → 구현체 (vLLM·OpenAI는 OpenAI 호환 공유) */
  private selectProvider(provider: string): LlmProvider {
    switch (provider) {
      case 'vllm':
      case 'openai':
        return this.openAiCompatible
      // case 'anthropic': return this.anthropicProvider  // 향후 추가
      default:
        throw new BadRequestException({
          code: 'AI_PROVIDER_UNSUPPORTED',
          message: `아직 지원하지 않는 AI provider입니다: ${provider}`,
        })
    }
  }

  /** axios/HttpException 등에서 사용자에게 보일 메시지 추출 */
  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
      const e = err as {
        response?: { data?: { error?: { message?: string } }; message?: string }
        code?: string
      }
      if (e.response?.message) return String(e.response.message) // NestJS HttpException
      if (e.response?.data?.error?.message) return String(e.response.data.error.message) // OpenAI 형식 에러
      if (e.code) return `연결 실패 (${e.code})`
    }
    return err instanceof Error ? err.message : '알 수 없는 오류'
  }
}
