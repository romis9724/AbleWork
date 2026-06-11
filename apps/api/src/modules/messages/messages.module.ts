import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'
import { MessageAutomationProcessor } from './message-automation.processor'
import { MessageAutomationScheduler } from './message-automation.scheduler'

@Module({
  imports: [
    BullModule.registerQueue({ name: 'message-automation' }),
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessageAutomationProcessor, MessageAutomationScheduler],
})
export class MessagesModule {}
