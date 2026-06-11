import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class MessageAutomationScheduler {
  private readonly logger = new Logger(MessageAutomationScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('message-automation') private readonly messageQueue: Queue,
  ) {}

  // 매일 00:05에 실행
  @Cron('5 0 * * *')
  async triggerDailyAutomations(): Promise<void> {
    this.logger.log('일일 자동화 확인 시작')

    // 1. 활성화된 모든 MessageAutomation 조회
    const automations = await this.prisma.messageAutomation.findMany({
      where: { isActive: true },
      include: { template: true },
    })

    if (automations.length === 0) {
      this.logger.log('처리할 활성 자동화가 없습니다.')
      return
    }

    // 2. 각 자동화에 대해 BullMQ 큐에 작업 추가
    for (const automation of automations) {
      await this.messageQueue.add('process-automation', {
        automationId: automation.id,
        triggeredAt: new Date().toISOString(),
      })
    }

    this.logger.log(`일일 자동화 ${automations.length}건 큐에 추가 완료`)
  }
}
