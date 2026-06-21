import { ErrorAnalysisService } from './error-analysis.service'
import { ApiErrorEvent } from '../../../common/filters/api-error-event'

const makeEvent = (over: Partial<ApiErrorEvent> = {}): ApiErrorEvent => ({
  status: 500,
  code: 'INTERNAL_SERVER_ERROR',
  message: 'boom',
  method: 'POST',
  path: '/api/v1/employees',
  companyId: 'c1',
  at: new Date().toISOString(),
  ...over,
})

describe('ErrorAnalysisService', () => {
  let svc: ErrorAnalysisService
  let config: { get: jest.Mock }
  let prisma: {
    company: { findFirst: jest.Mock }
    errorAnalysisLog: {
      create: jest.Mock
      findMany: jest.Mock
      count: jest.Mock
      findFirst: jest.Mock
    }
  }
  let llm: { isEnabled: jest.Mock; chat: jest.Mock }
  let mail: { sendMessageMail: jest.Mock }
  let discord: { send: jest.Mock }

  const build = () =>
    new ErrorAnalysisService(
      config as never,
      prisma as never,
      llm as never,
      mail as never,
      discord as never,
    )

  beforeEach(() => {
    config = {
      get: jest.fn((k: string) =>
        k === 'ERROR_REPORT_EMAIL'
          ? 'ops@x.com'
          : k === 'DISCORD_ALERT_WEBHOOK_URL'
            ? 'https://discord/wh'
            : undefined,
      ),
    }
    prisma = {
      company: { findFirst: jest.fn().mockResolvedValue({ id: 'default-co' }) },
      errorAnalysisLog: {
        create: jest.fn().mockResolvedValue({ id: 'log1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    }
    llm = {
      isEnabled: jest.fn().mockResolvedValue(true),
      chat: jest.fn().mockResolvedValue('추정 원인: 검증 실패\n조치: 스키마 정합'),
    }
    mail = { sendMessageMail: jest.fn().mockResolvedValue(undefined) }
    discord = { send: jest.fn().mockResolvedValue(undefined) }
    svc = build()
  })

  it('AI 활성: chat·이메일·Discord 모두 호출', async () => {
    await svc.handle(makeEvent())
    expect(llm.chat).toHaveBeenCalledWith('c1', expect.any(Array), expect.any(Object))
    expect(mail.sendMessageMail).toHaveBeenCalledWith(
      'ops@x.com',
      expect.stringContaining('에러 500'),
      expect.stringContaining('[AI 분석]'),
    )
    expect(discord.send).toHaveBeenCalledWith(
      'https://discord/wh',
      expect.objectContaining({ title: expect.stringContaining('API 에러 500') }),
    )
    // 분석 결과 영속화(관리자 조회용)
    expect(prisma.errorAnalysisLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'c1',
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          aiEnabled: true,
          notifiedEmail: true,
          notifiedDiscord: true,
          aiAnalysis: expect.stringContaining('추정 원인'),
        }),
      }),
    )
  })

  it('findAll: 회사 스코프 목록·총계 반환', async () => {
    prisma.errorAnalysisLog.findMany.mockResolvedValue([{ id: 'a' }])
    prisma.errorAnalysisLog.count.mockResolvedValue(1)
    const res = await svc.findAll('c1', { page: 1, limit: 25 } as never)
    expect(res).toEqual({ items: [{ id: 'a' }], total: 1, page: 1, limit: 25 })
    expect(prisma.errorAnalysisLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'c1' }) }),
    )
  })

  it('findOne: 회사 스코프 단건 조회', async () => {
    prisma.errorAnalysisLog.findFirst.mockResolvedValue({ id: 'x' })
    const res = await svc.findOne('c1', 'x')
    expect(res).toEqual({ id: 'x' })
    expect(prisma.errorAnalysisLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'x', companyId: 'c1' },
    })
  })

  it('같은 시그니처 중복은 1회만 처리(디둡)', async () => {
    await svc.handle(makeEvent())
    await svc.handle(makeEvent())
    expect(mail.sendMessageMail).toHaveBeenCalledTimes(1)
  })

  it('AI 비활성: chat 미호출, 이메일엔 미설정 안내', async () => {
    llm.isEnabled.mockResolvedValue(false)
    await svc.handle(makeEvent({ path: '/x' }))
    expect(llm.chat).not.toHaveBeenCalled()
    expect(mail.sendMessageMail).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('AI 미설정'),
    )
  })

  it('companyId 없으면 기본 회사로 분석', async () => {
    await svc.handle(makeEvent({ companyId: undefined, path: '/y' }))
    expect(prisma.company.findFirst).toHaveBeenCalled()
    expect(llm.isEnabled).toHaveBeenCalledWith('default-co')
  })

  it('웹훅 미설정 시 Discord 미호출', async () => {
    config.get = jest.fn((k: string) => (k === 'ERROR_REPORT_EMAIL' ? 'ops@x.com' : undefined))
    svc = build()
    await svc.handle(makeEvent({ path: '/z' }))
    expect(discord.send).not.toHaveBeenCalled()
  })

  it('메일 발송 실패해도 throw 하지 않음', async () => {
    mail.sendMessageMail.mockRejectedValue(new Error('smtp down'))
    await expect(svc.handle(makeEvent({ path: '/w' }))).resolves.toBeUndefined()
  })
})
