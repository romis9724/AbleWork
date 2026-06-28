import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { NOTIFIABLE_EVENTS } from '@ablework/shared-constants'
import { DiscordWebhookService } from './discord-webhook.service'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../../prisma/prisma.service'

/** 이벤트명 → 한국어 라벨 (email/in_app 제목·본문 구성용) */
const EVENT_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFIABLE_EVENTS.map((e) => [e.event, e.label]),
)

/** 이벤트명 → 그룹 라벨 (Discord embed footer) */
const EVENT_GROUP_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFIABLE_EVENTS.map((e) => [e.event, e.groupLabel]),
)

/** AbleWork 브랜드 색(#f36f20)의 10진 값 — Discord embed color */
const BRAND_COLOR = 0xf36f20

/**
 * 알림 이벤트 구독자.
 *
 * 구독 대상은 단일 출처 `NOTIFIABLE_EVENTS`(@ablework/shared-constants)에서 부트스트랩 시 일괄 등록한다.
 * 채널별 디스패치: discord(회사 webhook 브로드캐스트) / email(수신자 개인 메일) / in_app(사내 메시지함).
 * email·in_app 수신자는 payload에서 assigneeId(결재 차례) ?? drafterId(기안자) ?? requesterId(신청자) 순으로 해석한다.
 */
@Injectable()
export class NotificationListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationListener.name)

  constructor(
    private readonly discordWebhookService: DiscordWebhookService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mailService: MailService,
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
      // 이벤트가 비활성(규칙 없음)이면 발송하지 않는다
      if (rules.length === 0) return

      for (const rule of rules) {
        const sentAt = new Date()
        let status: 'success' | 'failed' = 'success'
        let errorMessage: string | undefined

        try {
          await this.dispatch(rule, eventType, payload, companyId)
        } catch (err) {
          status = 'failed'
          errorMessage = err instanceof Error ? err.message : String(err)
          this.logger.error(`알림 발송 실패 — rule=${rule.id} event=${eventType}: ${errorMessage}`)
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

      // 활성 이벤트는 수신자 개인에게 이메일·인앱 도달을 보장한다.
      // (기본 규칙은 discord webhook만 생성되므로, 수신자가 특정되면 이메일/인앱도 보낸다.
      //  단 해당 채널 규칙이 이미 있으면 위에서 처리했으므로 중복 발송하지 않는다.)
      const recipientId = this.resolveRecipientId(payload)
      if (recipientId) {
        const channels = new Set(rules.map((r) => r.channelType))
        try {
          if (!channels.has('email')) await this.sendEmailTo(recipientId, companyId, eventType, payload)
          if (!channels.has('in_app')) await this.sendInAppTo(recipientId, companyId, eventType, payload)
        } catch (err) {
          this.logger.error(
            `수신자 개인 알림(이메일/인앱) 발송 실패 — event=${eventType}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    } catch (err) {
      this.logger.error(
        `알림 처리 실패 — event=${eventType}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /** 채널별 발송 디스패치 */
  private async dispatch(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rule: any,
    eventType: string,
    payload: Record<string, unknown>,
    companyId: string,
  ): Promise<void> {
    if (rule.channelType === 'discord') {
      if (!rule.webhookUrl) return
      await this.discordWebhookService.send(rule.webhookUrl, this.buildDiscordEmbed(eventType, payload, rule.embedTemplate))
      return
    }

    // email / in_app — 개인 수신자 해석 필요
    const recipientId = this.resolveRecipientId(payload)
    if (!recipientId) return // 수신자를 특정할 수 없으면 skip (discord 브로드캐스트가 보완)

    if (rule.channelType === 'email') {
      await this.sendEmailTo(recipientId, companyId, eventType, payload)
      return
    }
    if (rule.channelType === 'in_app') {
      await this.sendInAppTo(recipientId, companyId, eventType, payload)
    }
  }

  /** 수신자 개인 이메일 발송 */
  private async sendEmailTo(
    recipientId: string,
    companyId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: recipientId, companyId },
      select: { user: { select: { email: true } } },
    })
    const email = employee?.user?.email
    if (!email) return
    const { title, content } = this.buildMessage(eventType, payload)
    await this.mailService.sendMessageMail(email, title, content)
  }

  /** 수신자 사내 메시지함(in_app) 발송 */
  private async sendInAppTo(
    recipientId: string,
    companyId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { title, content } = this.buildMessage(eventType, payload)
    await this.prisma.message.create({
      data: {
        companyId,
        // 자동 생성 메시지 타입은 'automated'로 통일(message-automation.processor와 일치, 'manual'과 구분) — E-10b
        type: 'automated',
        title,
        content,
        recipients: { create: [{ recipientId }] },
      },
    })
  }

  /**
   * Discord embed 구조화 (L3) — 이벤트 라벨 title + 문서/요청 제목 description +
   * 그룹 footer + 브랜드 색. 관리자 지정 embedTemplate이 있으면 마지막에 덮어쓴다.
   */
  private buildDiscordEmbed(
    eventType: string,
    payload: Record<string, unknown>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    embedTemplate: any,
  ): object {
    const label = EVENT_LABEL[eventType] ?? eventType
    const group = EVENT_GROUP_LABEL[eventType]
    const subject = typeof payload.title === 'string' && payload.title ? String(payload.title) : undefined
    const docNumber = typeof payload.docNumber === 'string' ? String(payload.docNumber) : undefined

    const fields: Array<{ name: string; value: string; inline?: boolean }> = []
    if (docNumber) fields.push({ name: '문서번호', value: docNumber, inline: true })

    const base: Record<string, unknown> = {
      title: label,
      color: BRAND_COLOR,
      ...(subject ? { description: subject } : {}),
      ...(fields.length ? { fields } : {}),
      ...(group ? { footer: { text: group } } : {}),
    }
    // 관리자 커스텀 템플릿이 있으면 덮어쓰기 허용
    if (typeof embedTemplate === 'object' && embedTemplate !== null) {
      return { ...base, ...(embedTemplate as object) }
    }
    return base
  }

  /** payload에서 알림 수신 직원 id 해석 */
  private resolveRecipientId(payload: Record<string, unknown>): string | null {
    const candidate = payload.assigneeId ?? payload.drafterId ?? payload.requesterId
    return typeof candidate === 'string' && candidate ? candidate : null
  }

  /** email/in_app 제목·본문 구성 (이벤트 라벨 + payload.title) */
  private buildMessage(
    eventType: string,
    payload: Record<string, unknown>,
  ): { title: string; content: string } {
    const label = EVENT_LABEL[eventType] ?? eventType
    const subject = typeof payload.title === 'string' && payload.title ? ` — ${payload.title}` : ''
    return { title: `[알림] ${label}`, content: `${label}${subject}` }
  }
}
