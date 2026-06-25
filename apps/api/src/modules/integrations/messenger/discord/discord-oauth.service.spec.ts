import axios from 'axios'
import { BadRequestException } from '@nestjs/common'
import { DiscordOAuthService } from './discord-oauth.service'
import { MessengerAccountService } from '../messenger-account.service'
import { DiscordProvider } from './discord.provider'
import { JwtPayload } from '../../../../common/types/jwt-payload.type'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const USER: JwtPayload = {
  sub: 'user-1',
  employeeId: 'emp-1',
  companyId: 'co-1',
  accessLevel: 'EMPLOYEE' as JwtPayload['accessLevel'],
}

const stateFromUrl = (url: string): string =>
  new URL(url).searchParams.get('state') as string

describe('DiscordOAuthService', () => {
  let service: DiscordOAuthService
  const messengerAccounts = { link: jest.fn() }
  const discord = { addGuildMember: jest.fn() }

  beforeEach(() => {
    process.env.DISCORD_CLIENT_ID = 'client-1'
    process.env.DISCORD_CLIENT_SECRET = 'secret-1'
    process.env.DISCORD_OAUTH_REDIRECT_URI = 'https://work.abmwc.net/api/integrations/discord/oauth/callback'
    process.env.JWT_SECRET = 'test-secret'
    service = new DiscordOAuthService(
      messengerAccounts as unknown as MessengerAccountService,
      discord as unknown as DiscordProvider,
    )
    jest.clearAllMocks()
  })

  describe('buildAuthorizeUrl', () => {
    it('인증 URL에 client_id·redirect_uri·scope·state가 포함된다', () => {
      const url = service.buildAuthorizeUrl(USER)
      expect(url).toContain('client_id=client-1')
      expect(url).toContain('scope=identify+guilds.join')
      expect(url).toContain('response_type=code')
      expect(stateFromUrl(url)).toBeTruthy()
    })

    it('CLIENT_ID 미설정 시 APPLICATION_ID를 재사용한다', () => {
      delete process.env.DISCORD_CLIENT_ID
      process.env.DISCORD_APPLICATION_ID = 'app-9'
      const url = service.buildAuthorizeUrl(USER)
      expect(url).toContain('client_id=app-9')
    })
  })

  describe('handleCallback', () => {
    it('정상: state 검증 → 토큰교환 → user조회 → 연동 upsert → 길드 합류', async () => {
      const state = stateFromUrl(service.buildAuthorizeUrl(USER))
      mockedAxios.post.mockResolvedValue({ data: { access_token: 'at-1' } })
      mockedAxios.get.mockResolvedValue({ data: { id: 'discord-123' } })
      messengerAccounts.link.mockResolvedValue({})
      discord.addGuildMember.mockResolvedValue(true)

      const result = await service.handleCallback('code-1', state)

      expect(result).toEqual({ employeeId: 'emp-1' })
      expect(messengerAccounts.link).toHaveBeenCalledWith('co-1', 'emp-1', {
        platform: 'discord',
        externalUserId: 'discord-123',
      })
      expect(discord.addGuildMember).toHaveBeenCalledWith('discord-123', 'at-1')
    })

    it('code/state 누락 시 OAUTH_INVALID_CALLBACK', async () => {
      await expect(service.handleCallback('', 'x')).rejects.toMatchObject({
        response: { code: 'OAUTH_INVALID_CALLBACK' },
      })
    })

    it('위변조 state면 OAUTH_STATE_INVALID (연동 시도 안 함)', async () => {
      await expect(service.handleCallback('code', 'tampered.signature')).rejects.toMatchObject({
        response: { code: 'OAUTH_STATE_INVALID' },
      })
      expect(messengerAccounts.link).not.toHaveBeenCalled()
    })

    it('다른 시크릿으로 서명된 state는 거부한다', async () => {
      const state = stateFromUrl(service.buildAuthorizeUrl(USER))
      process.env.JWT_SECRET = 'rotated-secret'
      const other = new DiscordOAuthService(
        messengerAccounts as unknown as MessengerAccountService,
        discord as unknown as DiscordProvider,
      )
      await expect(other.handleCallback('code', state)).rejects.toMatchObject({
        response: { code: 'OAUTH_STATE_INVALID' },
      })
    })

    it('만료된 state면 OAUTH_STATE_EXPIRED', async () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
      const state = stateFromUrl(service.buildAuthorizeUrl(USER))
      nowSpy.mockReturnValue(1_000_000 + 11 * 60 * 1000) // 11분 후
      await expect(service.handleCallback('code', state)).rejects.toMatchObject({
        response: { code: 'OAUTH_STATE_EXPIRED' },
      })
      nowSpy.mockRestore()
    })

    it('토큰 교환 실패 시 OAUTH_TOKEN_EXCHANGE_FAILED', async () => {
      const state = stateFromUrl(service.buildAuthorizeUrl(USER))
      mockedAxios.post.mockRejectedValue(new Error('boom'))
      await expect(service.handleCallback('code', state)).rejects.toMatchObject({
        response: { code: 'OAUTH_TOKEN_EXCHANGE_FAILED' },
      })
      expect(messengerAccounts.link).not.toHaveBeenCalled()
    })

    it('길드 합류 실패는 연동을 막지 않는다(graceful)', async () => {
      const state = stateFromUrl(service.buildAuthorizeUrl(USER))
      mockedAxios.post.mockResolvedValue({ data: { access_token: 'at-1' } })
      mockedAxios.get.mockResolvedValue({ data: { id: 'discord-123' } })
      messengerAccounts.link.mockResolvedValue({})
      discord.addGuildMember.mockResolvedValue(false) // 합류 실패해도

      const result = await service.handleCallback('code-1', state)
      expect(result).toEqual({ employeeId: 'emp-1' })
      expect(messengerAccounts.link).toHaveBeenCalled()
    })
  })
})

void BadRequestException
