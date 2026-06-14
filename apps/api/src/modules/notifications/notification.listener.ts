import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { NOTIFIABLE_EVENTS } from '@ablework/shared-constants'
import { DiscordWebhookService } from './discord-webhook.service'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * 알림 이벤트 구독자.
 *
 * 구독 대상은 단일 출처 `NOTIFIABLE_EVENTS`(@ablework/shared-constants)에서 부트스트랩 시 일괄 등록한다.
 * 개별 @OnEvent 데코레이터를 쓰지 않는 이유: 이벤트가 늘 때마다 핸들러를 누락하는 드리프트(고아 이벤트)를 막기 위함.
 * 새 알림 이벤트는 NOTIFIABLE_EVENTS에 추가하면 발송·기본규칙·FE 토글이 함께 따라온다.
 */
@Injectable()
export class NotificationListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationListener.name)

  constructor(
    private readonly discordWebhookService: DiscordWebhookService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onApplicationBootstrap(): void {
    for (const { event } of NOTIFIABLE_EVENTS) {
      this.eventEmitter.on(event, (payload: Record<string, unknown>) => {
        // handleEvent 내부에서 모든 에러를 흡수하므로 리스너가 앱을 중단시키지 않는다.
        void this.handleEvent(event, payload)
      })
    }
    this.logger.log(`알림 리스너 등록: ${NOTIFIABLE_EVENTS.length}개 이벤트`)
  }

  private async handleEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    // 최상위 try/catch — fire-and-forget(void) 호출이므로 rule 조회 실패가
    // unhandled rejection으로 새어나가지 않도록 흡수한다.
    try {
      const companyId = payload?.companyId as string | undefined
      if (!companyId) return

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
    } catch (err) {
      this.logger.error(
        `알림 처리 실패 — event=${eventType}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
