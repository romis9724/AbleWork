import { Job } from 'bullmq'
import {
  MessageAutomationProcessor,
  renderTemplate,
  formatDateInTz,
  getHourInTz,
  getDayRangeInTz,
  addDaysToDateString,
} from './message-automation.processor'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const AUTOMATION_ID = 'automation-1'
const TEMPLATE_ID = 'template-1'

// 2026-06-12 09:00 KST === 2026-06-12T00:00:00.000Z
const TRIGGERED_AT_KST_9 = '2026-06-12T00:00:00.000Z'
// 2026-06-12 10:00 KST
const TRIGGERED_AT_KST_10 = '2026-06-12T01:00:00.000Z'

const baseAutomation = {
  id: AUTOMATION_ID,
  companyId: COMPANY_ID,
  name: '휴가 시작 안내',
  automationType: 'leave_reminder',
  leaveTypeId: null,
  triggerBasis: 'leave_start',
  offsetDays: -1,
  sendTime: new Date('1970-01-01T09:00:00.000Z'), // 09:00
  timezone: 'Asia/Seoul',
  templateId: TEMPLATE_ID,
  sendEmail: false,
  isActive: true,
  startsAt: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  template: {
    id: TEMPLATE_ID,
    companyId: COMPANY_ID,
    name: '휴가 안내',
    content: '{{이름}}님, 휴가가 곧 시작됩니다.',
    hasVariables: true,
  },
  company: { name: '에이블컴퍼니' },
}

function createMocks() {
  const prisma = {
    messageAutomation: { findUnique: jest.fn() },
    message: { findFirst: jest.fn(), create: jest.fn() },
    leave: { findMany: jest.fn() },
    employee: { findMany: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  }
  const mail = { sendMessageMail: jest.fn().mockResolvedValue(undefined) }
  return { prisma, mail }
}

function createJob(triggeredAt: string): Job<{ automationId: string; triggeredAt: string }> {
  return { data: { automationId: AUTOMATION_ID, triggeredAt } } as Job<{
    automationId: string
    triggeredAt: string
  }>
}

/** fire-and-forget 비동기 작업 flush */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

// ── 순수 헬퍼 ──────────────────────────────────────────────────────────────────

describe('renderTemplate', () => {
  it('기본 변수를 치환한다', () => {
    // Arrange
    const content = '{{이름}}님 안녕하세요. {{회사명}}에서 알립니다. ({{날짜}})'

    // Act
    const result = renderTemplate(content, {
      이름: '홍길동',
      회사명: '에이블',
      날짜: '2026-06-12',
    })

    // Assert
    expect(result).toBe('홍길동님 안녕하세요. 에이블에서 알립니다. (2026-06-12)')
  })

  it('공백이 있는 변수 표기도 치환한다', () => {
    expect(renderTemplate('{{ name }}님', { name: 'Kim' })).toBe('Kim님')
  })

  it('매칭되지 않는 변수는 원문을 유지한다', () => {
    expect(renderTemplate('{{알수없음}} 내용', { 이름: '홍길동' })).toBe(
      '{{알수없음}} 내용',
    )
  })

  it('변수가 없는 콘텐츠는 그대로 반환한다', () => {
    expect(renderTemplate('일반 공지입니다.', { 이름: '홍길동' })).toBe(
      '일반 공지입니다.',
    )
  })

  it('#{변수} 문법도 치환한다 (FE 안내 형식)', () => {
    expect(
      renderTemplate('안녕하세요, #{이름}님. 이번 달은 #{month}입니다.', {
        이름: '홍길동',
        month: '6',
      }),
    ).toBe('안녕하세요, 홍길동님. 이번 달은 6입니다.')
  })

  it('#{employee} 별칭과 #{회사명}을 치환한다', () => {
    expect(
      renderTemplate('#{employee}님, #{회사명} 공지', { employee: '김직원', 회사명: '에이블' }),
    ).toBe('김직원님, 에이블 공지')
  })

  it('{{}} 와 #{} 를 한 콘텐츠에서 함께 치환한다', () => {
    expect(renderTemplate('{{이름}} / #{month}', { 이름: '홍', month: '6' })).toBe('홍 / 6')
  })

  it('#{} 미매칭 변수는 원문 유지', () => {
    expect(renderTemplate('#{없음} 내용', { 이름: '홍' })).toBe('#{없음} 내용')
  })
})

describe('날짜/시간 헬퍼', () => {
  it('formatDateInTz는 타임존 기준 날짜를 반환한다', () => {
    // UTC 2026-06-11 23:00 → KST 2026-06-12 08:00
    const date = new Date('2026-06-11T23:00:00.000Z')
    expect(formatDateInTz(date, 'Asia/Seoul')).toBe('2026-06-12')
    expect(formatDateInTz(date, 'UTC')).toBe('2026-06-11')
  })

  it('getHourInTz는 타임존 기준 시(hour)를 반환한다', () => {
    const date = new Date('2026-06-12T00:00:00.000Z')
    expect(getHourInTz(date, 'Asia/Seoul')).toBe(9)
    expect(getHourInTz(date, 'UTC')).toBe(0)
  })

  it('addDaysToDateString은 일수를 더한 날짜 문자열을 반환한다', () => {
    expect(addDaysToDateString('2026-06-12', 1)).toBe('2026-06-13')
    expect(addDaysToDateString('2026-06-12', -1)).toBe('2026-06-11')
    expect(addDaysToDateString('2026-06-30', 1)).toBe('2026-07-01')
  })

  it('getDayRangeInTz는 타임존 기준 하루 범위를 UTC로 반환한다', () => {
    const date = new Date('2026-06-12T00:00:00.000Z') // KST 09:00
    const { start, end } = getDayRangeInTz(date, 'Asia/Seoul')
    // KST 2026-06-12 00:00 == UTC 2026-06-11 15:00
    expect(start.toISOString()).toBe('2026-06-11T15:00:00.000Z')
    expect(end.toISOString()).toBe('2026-06-12T15:00:00.000Z')
  })
})

// ── Processor ─────────────────────────────────────────────────────────────────

describe('MessageAutomationProcessor', () => {
  let prisma: ReturnType<typeof createMocks>['prisma']
  let mail: ReturnType<typeof createMocks>['mail']
  let processor: MessageAutomationProcessor

  beforeEach(() => {
    const mocks = createMocks()
    prisma = mocks.prisma
    mail = mocks.mail
    processor = new MessageAutomationProcessor(
      prisma as never,
      mail as never,
    )
  })

  it('자동화가 없으면 아무것도 하지 않는다', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue(null)

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))

    // Assert
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('startsAt 이전이면 스킵한다', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue({
      ...baseAutomation,
      startsAt: new Date('2026-07-01T00:00:00.000Z'), // 미래
    })

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))

    // Assert
    expect(prisma.message.findFirst).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('현재 시가 sendTime의 시와 다르면 발송하지 않는다', async () => {
    // Arrange — sendTime 09:00, 현재 KST 10:00
    prisma.messageAutomation.findUnique.mockResolvedValue(baseAutomation)

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_10))

    // Assert
    expect(prisma.message.findFirst).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('같은 날 이미 발송된 자동화는 중복 발송하지 않는다 (멱등성)', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue(baseAutomation)
    prisma.message.findFirst.mockResolvedValue({ id: 'existing-message' })

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))

    // Assert
    expect(prisma.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          automationId: AUTOMATION_ID,
          sentAt: { gte: expect.any(Date), lt: expect.any(Date) },
        }),
      }),
    )
    expect(prisma.message.create).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('leave_start 트리거는 해당 날짜에 휴가가 시작되는 직원만 수신자로 한다', async () => {
    // Arrange — offsetDays=-1 → 발송일 다음날(2026-06-13) 시작 휴가 대상
    prisma.messageAutomation.findUnique.mockResolvedValue(baseAutomation)
    prisma.message.findFirst.mockResolvedValue(null)
    prisma.leave.findMany.mockResolvedValue([
      {
        employee: {
          id: 'emp-1',
          name: '홍길동',
          user: { email: 'hong@test.com' },
        },
      },
    ])
    prisma.message.create.mockResolvedValue({ id: 'message-1' })

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))

    // Assert
    expect(prisma.leave.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startDate: new Date('2026-06-13T00:00:00.000Z'),
          status: 'APPROVED',
          employee: { companyId: COMPANY_ID, isActive: true },
        }),
      }),
    )
    // {{이름}} 변수 포함 → 수신자별 개인화 메시지 ($transaction 경유)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_ID,
          automationId: AUTOMATION_ID,
          content: '홍길동님, 휴가가 곧 시작됩니다.',
          recipients: { create: [{ recipientId: 'emp-1' }] },
        }),
      }),
    )
    // 전 직원 조회는 호출되지 않아야 한다
    expect(prisma.employee.findMany).not.toHaveBeenCalled()
  })

  it('leave_start 트리거에 leaveTypeId가 있으면 휴가 유형 조건이 포함된다', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue({
      ...baseAutomation,
      leaveTypeId: 'leave-type-1',
    })
    prisma.message.findFirst.mockResolvedValue(null)
    prisma.leave.findMany.mockResolvedValue([])

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))

    // Assert
    expect(prisma.leave.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leaveTypeId: 'leave-type-1' }),
      }),
    )
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('일반 공지형(휴가 트리거 아님)은 전 직원에게 단일 메시지로 발송한다', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue({
      ...baseAutomation,
      triggerBasis: 'company_notice',
      template: {
        ...baseAutomation.template,
        content: '{{회사명}} 전체 공지입니다.',
      },
    })
    prisma.message.findFirst.mockResolvedValue(null)
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', name: '홍길동', user: { email: 'hong@test.com' } },
      { id: 'emp-2', name: '김철수', user: null },
    ])
    prisma.message.create.mockResolvedValue({ id: 'message-1' })

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))

    // Assert — 회사명 변수 치환 + 수신자 일괄 생성
    expect(prisma.message.create).toHaveBeenCalledTimes(1)
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '에이블컴퍼니 전체 공지입니다.',
          recipients: {
            create: [{ recipientId: 'emp-1' }, { recipientId: 'emp-2' }],
          },
        }),
      }),
    )
  })

  it('sendEmail=true이면 이메일이 있는 수신자에게 메일을 발송한다', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue({
      ...baseAutomation,
      triggerBasis: 'company_notice',
      sendEmail: true,
      template: { ...baseAutomation.template, content: '공지: {{이름}}님 확인 바랍니다.' },
    })
    prisma.message.findFirst.mockResolvedValue(null)
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', name: '홍길동', user: { email: 'hong@test.com' } },
      { id: 'emp-2', name: '김철수', user: null }, // 이메일 없음 → 제외
    ])
    prisma.message.create.mockResolvedValue({ id: 'message-1' })

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))
    await flushAsync()

    // Assert
    expect(mail.sendMessageMail).toHaveBeenCalledTimes(1)
    expect(mail.sendMessageMail).toHaveBeenCalledWith(
      'hong@test.com',
      '휴가 시작 안내',
      '공지: 홍길동님 확인 바랍니다.',
    )
  })

  it('sendEmail=false이면 메일을 발송하지 않는다', async () => {
    // Arrange
    prisma.messageAutomation.findUnique.mockResolvedValue({
      ...baseAutomation,
      triggerBasis: 'company_notice',
      template: { ...baseAutomation.template, content: '공지입니다.' },
    })
    prisma.message.findFirst.mockResolvedValue(null)
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', name: '홍길동', user: { email: 'hong@test.com' } },
    ])
    prisma.message.create.mockResolvedValue({ id: 'message-1' })

    // Act
    await processor.process(createJob(TRIGGERED_AT_KST_9))
    await flushAsync()

    // Assert
    expect(mail.sendMessageMail).not.toHaveBeenCalled()
  })
})
