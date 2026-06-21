import { Test } from '@nestjs/testing'
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter'
import axios from 'axios'
import { MessengerApprovalListener } from './messenger-approval.listener'
import { DiscordProvider } from './discord/discord.provider'
import { MESSENGER_PROVIDER } from './messenger-provider.interface'
import { PrismaService } from '../../../prisma/prisma.service'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const prismaMock = {
  approvalStep: { findMany: jest.fn() },
  document: { findFirst: jest.fn() },
  messengerAccount: { findFirst: jest.fn() },
}

/** async void 이벤트 핸들러가 끝날 때까지 마이크로태스크 큐를 비운다 */
const flush = () => new Promise((resolve) => setImmediate(resolve))

/**
 * W3 E2E(통합) — 실제 EventEmitter 연결을 통한 전 경로 검증.
 * 단위 테스트(listener.handleRequested 직접 호출)와 달리, 여기서는 `EventEmitterModule`로
 * 실제 emit→@OnApplicationBootstrap 구독→리스너→DiscordProvider(axios)까지 한 번에 흐른다.
 * 즉 "상신 이벤트가 실제로 발행되면 결재자 Discord로 DM이 나간다"는 회로 자체를 검증한다.
 */
describe('메신저 결재 흐름 통합 (이벤트 emit → 리스너 → Discord DM)', () => {
  let emitter: EventEmitter2
  const ORIGINAL_TOKEN = process.env.DISCORD_BOT_TOKEN

  beforeAll(async () => {
    process.env.DISCORD_BOT_TOKEN = 'test-token'
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        MessengerApprovalListener,
        DiscordProvider,
        { provide: MESSENGER_PROVIDER, useExisting: DiscordProvider },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile()
    // onApplicationBootstrap 실행 → 리스너가 *_REQUESTED 이벤트를 실제 구독
    await moduleRef.init()
    emitter = moduleRef.get(EventEmitter2)
  })

  afterAll(() => {
    process.env.DISCORD_BOT_TOKEN = ORIGINAL_TOKEN
  })

  beforeEach(() => jest.clearAllMocks())

  it('custom.requested 발행 → 결재자 Discord로 DM 채널 개설 + 버튼 메시지 전송', async () => {
    prismaMock.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'emp-approver' }])
    prismaMock.document.findFirst.mockResolvedValue({
      title: '[W3 데모] 메신저 결재 테스트',
      docNumber: null,
      content: { content: 'Discord DM 승인 버튼 검증' },
      drafter: { name: '홍길동' },
    })
    prismaMock.messengerAccount.findFirst.mockResolvedValue({ externalUserId: '1024877617456873502' })
    mockedAxios.post
      .mockResolvedValueOnce({ data: { id: 'dm-chan' } }) // DM 채널 개설
      .mockResolvedValueOnce({ data: { id: 'msg-1' } }) // 버튼 메시지

    // 실제 상신 이벤트 발행 (requests.service가 emit하는 것과 동일한 형태)
    emitter.emit('custom.requested', {
      requestId: 'req-int-1',
      documentId: 'doc-int-1',
      companyId: 'c1',
    })
    await flush()
    await flush()
    await flush()

    // 1) DM 채널 개설 — 연동된 결재자 Discord ID로
    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(mockedAxios.post.mock.calls[0][0]).toContain('/users/@me/channels')
    expect((mockedAxios.post.mock.calls[0][1] as { recipient_id: string }).recipient_id).toBe(
      '1024877617456873502',
    )
    // 2) 버튼 메시지 — custom_id에 requestId 인코딩(클릭 시 W1 엔드포인트가 결재 처리)
    const sendBody = JSON.stringify(mockedAxios.post.mock.calls[1][1])
    expect(sendBody).toContain('ablework:approve:request:req-int-1')
    expect(sendBody).toContain('ablework:reject:request:req-int-1')
    // 신청자·신청 내용도 메시지에 포함
    expect(sendBody).toContain('홍길동')
    expect(sendBody).toContain('Discord DM 승인 버튼 검증')
  })

  it('결재자가 메신저 미연동이면 이벤트가 와도 DM을 보내지 않는다', async () => {
    prismaMock.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'emp-x' }])
    prismaMock.document.findFirst.mockResolvedValue({ title: 'x', docNumber: null })
    prismaMock.messengerAccount.findFirst.mockResolvedValue(null)

    emitter.emit('leave.requested', { requestId: 'r', documentId: 'd', companyId: 'c1' })
    await flush()
    await flush()

    expect(mockedAxios.post).not.toHaveBeenCalled()
  })
})
