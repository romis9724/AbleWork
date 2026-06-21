import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import {
  ApprovalMessagePayload,
  MessengerProvider,
} from '../messenger-provider.interface'

const DISCORD_API = 'https://discord.com/api/v10'
/** AbleWork 브랜드 색(#f36f20) */
const BRAND_COLOR = 0xf36f20
/** Discord component type — 1: action row, 2: button */
const ROW = 1
const BUTTON = 2
/** button style — 3: success(초록), 4: danger(빨강) */
const STYLE_SUCCESS = 3
const STYLE_DANGER = 4

/**
 * Discord 메신저 구현체 — Bot 토큰으로 채널에 결재 메시지(승인/반려 버튼)를 전송한다.
 * 버튼 클릭은 Interactions Endpoint(IntegrationsController)로 콜백된다.
 */
@Injectable()
export class DiscordProvider implements MessengerProvider {
  readonly platform = 'discord'
  private readonly logger = new Logger(DiscordProvider.name)

  private get token(): string {
    const token = process.env.DISCORD_BOT_TOKEN
    if (!token) throw new Error('DISCORD_BOT_TOKEN이 설정되지 않았습니다.')
    return token
  }

  async sendApprovalRequest(channelId: string, payload: ApprovalMessagePayload): Promise<string> {
    const body = {
      embeds: [
        {
          title: payload.eventLabel,
          description: this.buildDescription(payload),
          color: BRAND_COLOR,
        },
      ],
      components: [
        {
          type: ROW,
          components: [
            {
              type: BUTTON,
              style: STYLE_SUCCESS,
              label: '✅ 승인',
              custom_id: `ablework:approve:request:${payload.action.requestId}`,
            },
            {
              type: BUTTON,
              style: STYLE_DANGER,
              label: '❌ 반려',
              custom_id: `ablework:reject:request:${payload.action.requestId}`,
            },
          ],
        },
      ],
    }

    const res = await axios.post(`${DISCORD_API}/channels/${channelId}/messages`, body, {
      headers: { Authorization: `Bot ${this.token}`, 'Content-Type': 'application/json' },
    })
    return res.data.id as string
  }

  /**
   * embed 본문(description) 구성 — 라벨을 굵게(`**`)·라벨과 값을 한 줄에 배치한다.
   * embed field name은 마크다운이 적용되지 않아 강조가 약하므로, description 마크다운으로
   * 모든 클라이언트(모바일 포함)에서 일관되게 굵게 표시한다. AI 요약은 하단 블록.
   */
  private buildDescription(payload: ApprovalMessagePayload): string {
    const lines: string[] = []
    if (payload.requesterName) lines.push(`**신청자** ${payload.requesterName}`)
    if (payload.docNumber) lines.push(`**문서번호** ${payload.docNumber}`)
    for (const field of payload.fields ?? []) {
      lines.push(`**${field.name}** ${field.value}`)
    }
    const header = [payload.title, lines.join('\n')].filter(Boolean).join('\n\n')
    return payload.summary ? `${header}\n\n**🤖 AI 요약**\n${payload.summary}` : header
  }

  /**
   * 결재자 개인에게 DM으로 결재 요청 메시지를 전송한다.
   * Bot↔사용자 DM 채널을 먼저 개설(이미 있으면 기존 채널 반환)한 뒤 채널 전송 로직을 재사용한다.
   */
  async sendApprovalRequestToUser(
    externalUserId: string,
    payload: ApprovalMessagePayload,
  ): Promise<string> {
    const dmChannelId = await this.openDmChannel(externalUserId)
    return this.sendApprovalRequest(dmChannelId, payload)
  }

  /** Bot↔사용자 1:1 DM 채널 개설 — Discord는 동일 사용자에 대해 멱등(기존 채널 재사용) */
  private async openDmChannel(recipientUserId: string): Promise<string> {
    const res = await axios.post(
      `${DISCORD_API}/users/@me/channels`,
      { recipient_id: recipientUserId },
      { headers: { Authorization: `Bot ${this.token}`, 'Content-Type': 'application/json' } },
    )
    return res.data.id as string
  }
}
