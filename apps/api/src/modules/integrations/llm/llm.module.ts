import { Module } from '@nestjs/common'
import { CompaniesModule } from '../../companies/companies.module'
import { AiSettingsController } from './ai-settings.controller'
import { AiSettingsService } from './ai-settings.service'
import { LlmService } from './llm.service'
import { OpenAiCompatibleProvider } from './openai-compatible.provider'
import { OllamaProvider } from './ollama.provider'

/**
 * LLM 연동 — AI 설정(company_settings section='ai') + provider 추상화 + 연결 테스트.
 * vLLM 우선, OpenAI 호환 구현체 공유. CompanySettingsService만 빌려 순환 의존을 피한다.
 * LlmService를 export해 메신저 결재 요약 등 후속 AI 기능이 사용한다.
 */
@Module({
  imports: [CompaniesModule],
  controllers: [AiSettingsController],
  providers: [AiSettingsService, LlmService, OpenAiCompatibleProvider, OllamaProvider],
  exports: [LlmService, AiSettingsService],
})
export class LlmModule {}
