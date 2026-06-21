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
    const fields: Array<{ name: string; value: string; inline?: boolean }> = []
    if (payload.docNumber) fields.push({ name: '문서번호', value: payload.docNumber, inline: true })
    if (payload.summary) fields.push({ name: '🤖 AI 요약', value: payload.summary })

    const body = {
      embeds: [
        {
          title: payload.eventLabel,
          description: payload.title,
          color: BRAND_COLOR,
          ...(fields.length ? { fields } : {}),
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
}
