import { Module } from '@nestjs/common'
import { RequestsModule } from '../requests/requests.module'
import { IntegrationsController } from './integrations.controller'
import { DiscordInteractionService } from './messenger/discord/discord-interaction.service'
import { DiscordProvider } from './messenger/discord/discord.provider'
import { MESSENGER_PROVIDER } from './messenger/messenger-provider.interface'
import { MessengerAccountController } from './messenger/messenger-account.controller'
import { MessengerAccountService } from './messenger/messenger-account.service'
import { MessengerApprovalListener } from './messenger/messenger-approval.listener'
import { LlmModule } from './llm/llm.module'

/**
 * 메신저 연동(메신저 양방향 결재). 현재 구현체는 Discord.
 * RequestsModule에서 RequestsService를 주입받아 버튼 콜백을 결재 액션으로 연결한다.
 * MESSENGER_PROVIDER 토큰으로 추상화 — 카카오워크/네이버웍스 확장 시 구현체만 교체.
 */
@Module({
  imports: [RequestsModule, LlmModule],
  controllers: [IntegrationsController, MessengerAccountController],
  providers: [
    DiscordInteractionService,
    DiscordProvider,
    MessengerAccountService,
    MessengerApprovalListener,
    { provide: MESSENGER_PROVIDER, useExisting: DiscordProvider },
  ],
  exports: [MESSENGER_PROVIDER, DiscordProvider],
})
export class IntegrationsModule {}
