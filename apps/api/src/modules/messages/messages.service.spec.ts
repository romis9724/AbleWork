import { MessagesService } from './messages.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const SENDER_ID = 'sender-1'

function createMocks() {
  const prisma = {
    message: { create: jest.fn() },
    messageTemplate: { findFirst: jest.fn() },
    employee: { findMany: jest.fn() },
  }
  const mail = { sendMessageMail: jest.fn().mockResolvedValue(undefined) }
  return { prisma, mail }
}

/** fire-and-forget 비동기 작업 flush */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('MessagesService.sendMessage', () => {
  let prisma: ReturnType<typeof createMocks>['prisma']
  let mail: ReturnType<typeof createMocks>['mail']
  let service: MessagesService

  const baseDto = {
    title: '공지사항',
    content: '내용입니다.',
    recipientEmployeeIds: ['emp-1', 'emp-2'],
    sendEmail: false,
  }

  beforeEach(() => {
    const mocks = createMocks()
    prisma = mocks.prisma
    mail = mocks.mail
    service = new MessagesService(prisma as never, mail as never)
  })

  it('메시지와 수신자를 생성한다', async () => {
    // Arrange
    prisma.employee.findMany.mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }])
    prisma.message.create.mockResolvedValue({ id: 'message-1', recipients: [] })

    // Act
    const result = await service.sendMessage(COMPANY_ID, SENDER_ID, baseDto)

    // Assert
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_ID,
          senderId: SENDER_ID,
          type: 'manual',
          sendEmail: false,
          recipients: {
            create: [{ recipientId: 'emp-1' }, { recipientId: 'emp-2' }],
          },
        }),
      }),
    )
    expect(result).toEqual({ id: 'message-1', recipients: [] })
  })

  it('sendEmail=true이면 수신자 User 이메일로 메일을 발송한다', async () => {
    // Arrange — 첫 호출: 소속 검증, 두 번째 호출: 이메일 조회
    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'emp-1' }, { id: 'emp-2' }])
      .mockResolvedValueOnce([
        { user: { email: 'a@test.com' } },
        { user: null }, // 계정 미연결 직원 → 제외
      ])
    prisma.message.create.mockResolvedValue({ id: 'message-1', recipients: [] })

    // Act
    await service.sendMessage(COMPANY_ID, SENDER_ID, {
      ...baseDto,
      sendEmail: true,
    })
    await flushAsync()

    // Assert
    expect(mail.sendMessageMail).toHaveBeenCalledTimes(1)
    expect(mail.sendMessageMail).toHaveBeenCalledWith(
      'a@test.com',
      '공지사항',
      '내용입니다.',
    )
  })

  it('sendEmail=false이면 메일을 발송하지 않는다', async () => {
    // Arrange
    prisma.employee.findMany.mockResolvedValue([{ id: 'emp-1' }, { id: 'emp-2' }])
    prisma.message.create.mockResolvedValue({ id: 'message-1', recipients: [] })

    // Act
    await service.sendMessage(COMPANY_ID, SENDER_ID, baseDto)
    await flushAsync()

    // Assert
    expect(mail.sendMessageMail).not.toHaveBeenCalled()
  })

  it('이메일 조회가 실패해도 throw 하지 않는다 (메시지 저장 유지)', async () => {
    // Arrange
    prisma.employee.findMany
      .mockResolvedValueOnce([{ id: 'emp-1' }, { id: 'emp-2' }])
      .mockRejectedValueOnce(new Error('DB down'))
    prisma.message.create.mockResolvedValue({ id: 'message-1', recipients: [] })

    // Act & Assert — 예외 없이 완료
    await expect(
      service.sendMessage(COMPANY_ID, SENDER_ID, { ...baseDto, sendEmail: true }),
    ).resolves.toEqual({ id: 'message-1', recipients: [] })
    await flushAsync()
    expect(mail.sendMessageMail).not.toHaveBeenCalled()
  })
})
