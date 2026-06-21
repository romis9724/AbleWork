import { Module } from '@nestjs/common'
import { PrismaModule } from '../../../prisma/prisma.module'
import { LlmModule } from '../llm/llm.module'
import { DiscordWebhookService } from '../../notifications/discord-webhook.service'
import { ErrorAnalysisService } from './error-analysis.service'

/**
 * API 에러 분석 — GlobalExceptionFilter가 발행한 EVENTS.API_ERROR_DETECTED를 구독해
 * 회사 AI 설정(LlmService)으로 원인을 분석하고, 상세는 이메일·경고는 Discord로 보낸다.
 * MailService(@Global)·ConfigService(global)·EventEmitter2(global)는 import 불필요.
 */
@Module({
  imports: [PrismaModule, LlmModule],
  providers: [ErrorAnalysisService, DiscordWebhookService],
})
export class ErrorAnalysisModule {}
