import axios from 'axios'
import { DiscordProvider } from './discord.provider'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

describe('DiscordProvider', () => {
  let provider: DiscordProvider
  const ORIGINAL_TOKEN = process.env.DISCORD_BOT_TOKEN

  beforeEach(() => {
    process.env.DISCORD_BOT_TOKEN = 'test-token'
    provider = new DiscordProvider()
    jest.clearAllMocks()
  })

  afterAll(() => {
    process.env.DISCORD_BOT_TOKEN = ORIGINAL_TOKEN
  })

  it('채널에 승인/반려 버튼 메시지를 전송하고 메시지 id를 반환한다', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'msg-1' } })

    const ref = await provider.sendApprovalRequest('chan-1', {
      eventLabel: '휴가 신청 결재 요청',
      title: '홍길동 연차 2일',
      docNumber: 'LEAVE-2026-001',
      action: { kind: 'request', requestId: 'req-1' },
    })

    expect(ref).toBe('msg-1')

    const [url, body, config] = mockedAxios.post.mock.calls[0]
    expect(url).toContain('/channels/chan-1/messages')
    // 승인/반려 custom_id에 requestId 인코딩
    expect(JSON.stringify(body)).toContain('ablework:approve:request:req-1')
    expect(JSON.stringify(body)).toContain('ablework:reject:request:req-1')
    // Bot 토큰 인증 헤더
    expect((config as { headers: Record<string, string> }).headers.Authorization).toBe('Bot test-token')
  })

  it('summary가 있으면 AI 요약 필드를 포함한다', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'msg-2' } })

    await provider.sendApprovalRequest('chan-1', {
      eventLabel: '결재 요청',
      title: '문서',
      summary: '연차 2일, 잔여 충분, 특이사항 없음.',
      action: { kind: 'request', requestId: 'req-2' },
    })

    expect(JSON.stringify(mockedAxios.post.mock.calls[0][1])).toContain('AI 요약')
  })

  it('사용자에게 DM 채널을 개설하고 버튼 메시지를 전송한다', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'dm-chan-1' } }) // 1) DM 채널 개설
      .mockResolvedValueOnce({ data: { id: 'msg-9' } }) // 2) 메시지 전송

    const ref = await provider.sendApprovalRequestToUser('discord-user-1', {
      eventLabel: '휴가 신청 결재 요청',
      title: '홍길동 연차 2일',
      action: { kind: 'request', requestId: 'req-7' },
    })

    expect(ref).toBe('msg-9')

    // 1) DM 채널 개설 — recipient_id 전달
    const [openUrl, openBody] = mockedAxios.post.mock.calls[0]
    expect(openUrl).toContain('/users/@me/channels')
    expect((openBody as { recipient_id: string }).recipient_id).toBe('discord-user-1')

    // 2) 개설된 DM 채널로 승인/반려 버튼 메시지
    const [sendUrl, sendBody] = mockedAxios.post.mock.calls[1]
    expect(sendUrl).toContain('/channels/dm-chan-1/messages')
    expect(JSON.stringify(sendBody)).toContain('ablework:approve:request:req-7')
    expect(JSON.stringify(sendBody)).toContain('ablework:reject:request:req-7')
  })

  it('토큰이 없으면 에러를 던진다', async () => {
    delete process.env.DISCORD_BOT_TOKEN
    const p = new DiscordProvider()
    await expect(
      p.sendApprovalRequest('chan-1', {
        eventLabel: 'x',
        title: 'y',
        action: { kind: 'request', requestId: 'r' },
      }),
    ).rejects.toThrow('DISCORD_BOT_TOKEN')
  })
})
