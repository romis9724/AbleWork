import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { NotificationsService } from './notifications.service'
import { DiscordWebhookService } from './discord-webhook.service'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class NotificationListener {
  private readonly logger = new Logger(NotificationListener.name)

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly discordWebhookService: DiscordWebhookService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('attendance.clock_in')
  async handleClockIn(payload: { employeeId: string; companyId: string; clockInAt: Date }) {
    await this.handleEvent('attendance.clock_in', payload)
  }

  @OnEvent('attendance.late')
  async handleLate(payload: { employeeId: string; companyId: string; lateMinutes: number }) {
    await this.handleEvent('attendance.late', payload)
  }

  @OnEvent('leave.requested')
  async handleLeaveRequested(payload: { employeeId: string; companyId: string; leaveRequestId: string }) {
    await this.handleEvent('leave.requested', payload)
  }

  @OnEvent('leave.approved')
  async handleLeaveApproved(payload: { employeeId: string; companyId: string; leaveRequestId: string }) {
    await this.handleEvent('leave.approved', payload)
  }

  @OnEvent('leave.rejected')
  async handleLeaveRejected(payload: { employeeId: string; companyId: string; leaveRequestId: string }) {
    await this.handleEvent('leave.rejected', payload)
  }

  private async handleEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    const companyId = payload.companyId as string

    const rules = await this.prisma.notificationRule.findMany({
      where: { eventType, companyId, isActive: true },
    })

    for (const rule of rules) {
      const sentAt = new Date()
      let status: 'success' | 'failed' = 'success'
      let errorMessage: string | undefined

      try {
        if (rule.channelType === 'discord' && rule.webhookUrl) {
          const embed = {
            ...(typeof rule.embedTemplate === 'object' && rule.embedTemplate !== null
              ? (rule.embedTemplate as object)
              : {}),
            ...payload,
          }
          await this.discordWebhookService.send(rule.webhookUrl, embed)
        }
      } catch (err) {
        status = 'failed'
        errorMessage = err instanceof Error ? err.message : String(err)
        this.logger.error(
          `알림 발송 실패 — rule=${rule.id} event=${eventType}: ${errorMessage}`,
        )
      }

      try {
        await this.prisma.notificationLog.create({
          data: {
            ruleId: rule.id,
            eventType,
            payload: payload as object,
            status,
            retryCount: status === 'failed' ? 1 : 0,
            ...(errorMessage !== undefined && { errorMessage }),
            sentAt,
          },
        })
      } catch (logErr) {
        // Log recording must never crash the listener
        this.logger.error(
          `알림 로그 저장 실패 — rule=${rule.id}: ${logErr instanceof Error ? logErr.message : String(logErr)}`,
        )
      }
    }
  }
}
