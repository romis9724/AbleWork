import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Processor('message-automation')
export class MessageAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageAutomationProcessor.name)

  constructor(private readonly prisma: PrismaService) {
    super()
  }

  async process(job: Job<{ automationId: string; triggeredAt: string }>): Promise<void> {
    const { automationId } = job.data

    // 1. 자동화 및 템플릿 로드
    const automation = await this.prisma.messageAutomation.findUnique({
      where: { id: automationId },
      include: { template: true },
    })

    if (!automation) {
      this.logger.warn(`자동화를 찾을 수 없습니다: ${automationId}`)
      return
    }

    // 2. 회사의 활성 직원 목록 조회
    const employees = await this.prisma.employee.findMany({
      where: { companyId: automation.companyId, isActive: true },
      select: { id: true },
    })

    if (employees.length === 0) {
      this.logger.log(`자동화 ${automationId}: 대상 직원이 없습니다.`)
      return
    }

    // 3. Message 레코드 생성
    const message = await this.prisma.message.create({
      data: {
        companyId: automation.companyId,
        type: 'automated',
        title: automation.name,
        content: automation.template.content,
        automationId: automation.id,
      },
    })

    // 4. MessageRecipient 레코드 일괄 생성
    await this.prisma.messageRecipient.createMany({
      data: employees.map((e: { id: string }) => ({
        messageId: message.id,
        recipientId: e.id,
      })),
    })

    this.logger.log(
      `자동화 처리 완료 ${automationId}: ${employees.length}명에게 발송`,
    )
  }
}
