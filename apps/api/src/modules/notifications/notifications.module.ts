import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { NotificationListener } from './notification.listener'
import { DiscordWebhookService } from './discord-webhook.service'

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationListener, DiscordWebhookService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
