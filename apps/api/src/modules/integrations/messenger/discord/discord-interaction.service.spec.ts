import { Test, TestingModule } from '@nestjs/testing'
import { DiscordInteractionService } from './discord-interaction.service'
import { PrismaService } from '../../../../prisma/prisma.service'
import { RequestsService } from '../../../requests/requests.service'

const mockPrisma = {
  messengerAccount: { findFirst: jest.fn() },
  employee: { findFirst: jest.fn() },
}
const mockRequests = { approve: jest.fn(), reject: jest.fn() }

const ACCOUNT = { id: 'ma-1', companyId: 'c1', employeeId: 'e1', platform: 'discord', externalUserId: 'd1' }
const EMPLOYEE = { id: 'e1', userId: 'u1', accessLevel: 'EMPLOYEE', companyId: 'c1' }

/** 버튼 클릭 interaction(type 3) 픽스처 */
const buttonInteraction = (customId: string, discordUserId = 'd1') => ({
  type: 3,
  data: { custom_id: customId },
  member: { user: { id: discordUserId } },
})

describe('DiscordInteractionService', () => {
  let service: DiscordInteractionService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordInteractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RequestsService, useValue: mockRequests },
      ],
    }).compile()
    service = module.get(DiscordInteractionService)
    jest.clearAllMocks()
  })

  it('PING(type 1)에 PONG(type 1)으로 응답한다', async () => {
    expect(await service.handle({ type: 1 })).toEqual({ type: 1 })
  })

  it('승인 버튼 → 본인 검증 후 RequestsService.approve 호출 + 메시지 갱신(type 7)', async () => {
    mockPrisma.messengerAccount.findFirst.mockResolvedValue(ACCOUNT)
    mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE)
    mockRequests.approve.mockResolvedValue({})

    const res = (await service.handle(
      buttonInteraction('ablework:approve:request:r1'),
    )) as { type: number; data: { components: unknown[] } }

    expect(mockRequests.approve).toHaveBeenCalledWith(
      'c1',
      'r1',
      {},
      { sub: 'u1', employeeId: 'e1', companyId: 'c1', accessLevel: 'EMPLOYEE' },
    )
    expect(res.type).toBe(7) // UPDATE_MESSAGE
    expect(res.data.components).toEqual([]) // 버튼 제거
  })

  it('반려 버튼 → RequestsService.reject(코멘트 포함) 호출', async () => {
    mockPrisma.messengerAccount.findFirst.mockResolvedValue(ACCOUNT)
    mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE)
    mockRequests.reject.mockResolvedValue({})

    await service.handle(buttonInteraction('ablework:reject:request:r1'))

    expect(mockRequests.reject).toHaveBeenCalledWith(
      'c1',
      'r1',
      { comment: '메신저에서 반려' },
      expect.objectContaining({ employeeId: 'e1', companyId: 'c1' }),
    )
  })

  it('연동 계정이 없으면 ephemeral 안내(type 4, flag 64) + 결재 미호출', async () => {
    mockPrisma.messengerAccount.findFirst.mockResolvedValue(null)

    const res = (await service.handle(
      buttonInteraction('ablework:approve:request:r1'),
    )) as { type: number; data: { flags: number } }

    expect(res.type).toBe(4)
    expect(res.data.flags).toBe(64)
    expect(mockRequests.approve).not.toHaveBeenCalled()
  })

  it('결재 액션 에러 메시지를 클릭자에게 ephemeral로 전달한다', async () => {
    mockPrisma.messengerAccount.findFirst.mockResolvedValue(ACCOUNT)
    mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE)
    // NestJS HttpException의 커스텀 {code,message} 형태
    mockRequests.approve.mockRejectedValue({ response: { code: 'REQUEST_ALREADY_APPROVED', message: '이미 승인된 요청입니다.' } })

    const res = (await service.handle(
      buttonInteraction('ablework:approve:request:r1'),
    )) as { type: number; data: { content: string; flags: number } }

    expect(res.type).toBe(4)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('이미 승인된 요청입니다.')
  })

  it('알 수 없는 custom_id는 ephemeral 안내', async () => {
    const res = (await service.handle(buttonInteraction('foo:bar'))) as { type: number }
    expect(res.type).toBe(4)
    expect(mockPrisma.messengerAccount.findFirst).not.toHaveBeenCalled()
  })
})
