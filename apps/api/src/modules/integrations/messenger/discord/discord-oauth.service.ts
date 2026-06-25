import { Injectable, BadRequestException, Logger } from '@nestjs/common'
import axios from 'axios'
import * as crypto from 'crypto'
import { JwtPayload } from '../../../../common/types/jwt-payload.type'
import { MessengerAccountService } from '../messenger-account.service'
import { DiscordProvider } from './discord.provider'

const DISCORD_AUTHORIZE = 'https://discord.com/api/oauth2/authorize'
const DISCORD_TOKEN = 'https://discord.com/api/v10/oauth2/token'
const DISCORD_ME = 'https://discord.com/api/v10/users/@me'
/** OAuth scope — identify(사용자 id 조회) + guilds.join(회사 길드 자동 합류) */
const OAUTH_SCOPE = 'identify guilds.join'
/** state 유효기간 10분 */
const STATE_TTL_MS = 10 * 60 * 1000

interface StatePayload {
  employeeId: string
  companyId: string
  exp: number
}

/**
 * 직원 Discord 계정 OAuth 연동.
 * start: 인증 URL 생성(state는 HMAC 서명으로 위변조·만료 방어).
 * callback: state 검증 → code 교환 → users/@me로 Discord user id 획득 →
 *           MessengerAccount upsert → 회사 길드 자동 합류(guilds.join).
 */
@Injectable()
export class DiscordOAuthService {
  private readonly logger = new Logger(DiscordOAuthService.name)

  constructor(
    private readonly messengerAccounts: MessengerAccountService,
    private readonly discord: DiscordProvider,
  ) {}

  // ── 설정 ────────────────────────────────────────────────────────────────────

  /** CLIENT_ID는 OAuth용. 미지정 시 봇 APPLICATION_ID 재사용(동일 앱) */
  private get clientId(): string {
    const id = process.env.DISCORD_CLIENT_ID ?? process.env.DISCORD_APPLICATION_ID
    if (!id) throw new Error('DISCORD_CLIENT_ID(또는 DISCORD_APPLICATION_ID) 미설정')
    return id
  }

  private get clientSecret(): string {
    const secret = process.env.DISCORD_CLIENT_SECRET
    if (!secret) throw new Error('DISCORD_CLIENT_SECRET 미설정')
    return secret
  }

  private get redirectUri(): string {
    const uri = process.env.DISCORD_OAUTH_REDIRECT_URI
    if (!uri) throw new Error('DISCORD_OAUTH_REDIRECT_URI 미설정')
    return uri
  }

  /** state 서명 비밀키 — 인증 JWT 시크릿 재사용 */
  private get stateSecret(): string {
    return process.env.JWT_SECRET ?? 'dev-state-secret'
  }

  // ── start ───────────────────────────────────────────────────────────────────

  /** 연동 시작 — Discord 인증 URL 생성(FE가 이 URL로 이동) */
  buildAuthorizeUrl(user: JwtPayload): string {
    const state = this.signState({
      employeeId: user.employeeId,
      companyId: user.companyId,
      exp: Date.now() + STATE_TTL_MS,
    })
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: OAUTH_SCOPE,
      state,
      prompt: 'consent',
    })
    return `${DISCORD_AUTHORIZE}?${params.toString()}`
  }

  // ── callback ──────────────────────────────────────────────────────────────────

  /** 연동 콜백 — code 교환 후 Discord user id를 MessengerAccount에 저장하고 길드 합류 */
  async handleCallback(code: string, state: string): Promise<{ employeeId: string }> {
    if (!code || !state) {
      throw new BadRequestException({ code: 'OAUTH_INVALID_CALLBACK', message: '잘못된 콜백 요청입니다.' })
    }
    const { employeeId, companyId } = this.verifyState(state)

    const accessToken = await this.exchangeCode(code)
    const discordUserId = await this.fetchUserId(accessToken)

    await this.messengerAccounts.link(companyId, employeeId, {
      platform: 'discord',
      externalUserId: discordUserId,
    })
    // 봇 DM 전제: 회사 길드에 자동 합류(실패해도 연동은 유지)
    await this.discord.addGuildMember(discordUserId, accessToken)

    this.logger.log(`Discord 연동 완료: employee=${employeeId}`)
    return { employeeId }
  }

  // ── 내부: Discord API ─────────────────────────────────────────────────────────

  /** authorization_code → access_token 교환 */
  private async exchangeCode(code: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
    })
    try {
      const res = await axios.post(DISCORD_TOKEN, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      const token = res.data?.access_token as string | undefined
      if (!token) throw new Error('access_token 누락')
      return token
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      this.logger.error(`토큰 교환 실패: ${msg}`)
      throw new BadRequestException({
        code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
        message: 'Discord 인증에 실패했습니다. 다시 시도해 주세요.',
      })
    }
  }

  /** access_token으로 Discord user id 조회 */
  private async fetchUserId(accessToken: string): Promise<string> {
    const res = await axios.get(DISCORD_ME, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const id = res.data?.id as string | undefined
    if (!id) {
      throw new BadRequestException({
        code: 'OAUTH_USER_FETCH_FAILED',
        message: 'Discord 사용자 정보를 가져오지 못했습니다.',
      })
    }
    return id
  }

  // ── 내부: state HMAC ────────────────────────────────────────────────────────

  private signState(payload: StatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = this.hmac(body)
    return `${body}.${sig}`
  }

  private verifyState(state: string): StatePayload {
    const [body, sig] = state.split('.')
    if (!body || !sig || !this.timingSafeEqual(sig, this.hmac(body))) {
      throw new BadRequestException({ code: 'OAUTH_STATE_INVALID', message: '연동 요청이 유효하지 않습니다.' })
    }
    let payload: StatePayload
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    } catch {
      throw new BadRequestException({ code: 'OAUTH_STATE_INVALID', message: '연동 요청이 유효하지 않습니다.' })
    }
    if (!payload.exp || Date.now() > payload.exp) {
      throw new BadRequestException({ code: 'OAUTH_STATE_EXPIRED', message: '연동 요청이 만료되었습니다. 다시 시도해 주세요.' })
    }
    return payload
  }

  private hmac(body: string): string {
    return crypto.createHmac('sha256', this.stateSecret).update(body).digest('base64url')
  }

  private timingSafeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return crypto.timingSafeEqual(ab, bb)
  }
}
