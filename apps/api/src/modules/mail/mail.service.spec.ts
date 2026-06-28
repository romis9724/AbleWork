import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { MailService } from './mail.service'

// ── nodemailer 모킹 ──────────────────────────────────────────────────────────
// createTransport가 반환하는 transporter의 sendMail을 캡처하기 위해 모듈 전체를 모킹한다.

jest.mock('nodemailer')

// 모든 sendMail 호출을 캡처하는 단일 jest.fn()
const mockSendMail = jest.fn()
const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const TO = 'user@example.com'
const FROM = 'no-reply@ablework.kr'
const FRONTEND_URL = 'http://localhost:3000'

/**
 * ConfigService 모킹 — 기본값을 그대로 반환하도록 구성.
 * 일부 테스트에서는 커스텀 환경값을 주입한다.
 */
function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return {
    get: jest.fn(<T>(key: string, defaultValue?: T): T => {
      if (key in overrides) {
        return overrides[key] as T
      }
      // 테스트 기본은 상용(production)으로 두어 실제 발송 경로를 검증한다.
      // 비프로덕션 생략 동작은 NODE_ENV override로 별도 테스트한다.
      if (key === 'NODE_ENV') {
        return 'production' as T
      }
      return defaultValue as T
    }),
  } as unknown as ConfigService

}

/** 마지막 sendMail 호출 인자를 꺼낸다 */
function lastMailArg(): nodemailer.SendMailOptions {
  const calls = mockSendMail.mock.calls
  return calls[calls.length - 1][0] as nodemailer.SendMailOptions
}

async function buildService(config: ConfigService): Promise<MailService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MailService,
      { provide: ConfigService, useValue: config },
    ],
  }).compile()

  return module.get<MailService>(MailService)
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('MailService', () => {
  let service: MailService
  let loggerLog: jest.SpyInstance
  let loggerError: jest.SpyInstance

  beforeEach(async () => {
    jest.clearAllMocks()

    // createTransport는 항상 sendMail을 가진 객체를 반환한다.
    mockedNodemailer.createTransport.mockReturnValue({
      sendMail: mockSendMail,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' })

    service = await buildService(buildConfig())

    // 로깅 호출 검증을 위해 Logger 인스턴스 메서드를 스파이한다.
    // (서비스 인스턴스의 private logger를 직접 가져온다)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logger = (service as any).logger
    loggerLog = jest.spyOn(logger, 'log').mockImplementation(() => undefined)
    loggerError = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  // ── constructor / transporter 초기화 ─────────────────────────────────────────

  describe('constructor', () => {
    it('기본 SMTP 설정으로 nodemailer transporter를 초기화한다', () => {
      // beforeEach에서 이미 buildConfig() 기본값으로 생성됨
      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: '', pass: '' },
        }),
      )
    })

    it('환경변수로 커스텀 SMTP 설정을 주입할 수 있다', async () => {
      mockedNodemailer.createTransport.mockClear()

      const config = buildConfig({
        MAIL_HOST: 'smtp.custom.com',
        MAIL_PORT: 465,
        MAIL_SECURE: true,
        MAIL_USER: 'svc@custom.com',
        MAIL_PASS: 'secret',
      })

      await buildService(config)

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.custom.com',
          port: 465,
          secure: true,
          auth: { user: 'svc@custom.com', pass: 'secret' },
        }),
      )
    })
  })

  // ── sendPasswordReset ──────────────────────────────────────────────────────

  describe('sendPasswordReset', () => {
    it('비밀번호 재설정 메일을 발송한다 (제목/링크 검증)', async () => {
      await service.sendPasswordReset(TO, 'plain-token')

      const mail = lastMailArg()
      expect(mail.to).toBe(TO)
      expect(mail.from).toBe(FROM)
      expect(mail.subject).toBe('[AbleWork] 비밀번호 재설정 안내')
      expect(mail.html).toContain(`${FRONTEND_URL}/reset-password?token=plain-token`)
    })

    it('성공 시 logger.log를 호출한다', async () => {
      await service.sendPasswordReset(TO, 'plain-token')

      expect(loggerLog).toHaveBeenCalledWith(expect.stringContaining(TO))
    })

    it('[URL 인코딩] 토큰의 특수문자(?, &, =, #)가 encodeURIComponent로 인코딩된다', async () => {
      const token = 'a?b&c=d#e'

      await service.sendPasswordReset(TO, token)

      const html = lastMailArg().html as string
      // 인코딩된 토큰이 들어가야 한다
      expect(html).toContain(`token=${encodeURIComponent(token)}`)
      // URL 구조를 깨뜨리는 원본 토큰이 그대로 들어가면 안 된다
      expect(html).not.toContain(`token=${token}`)
    })

    it('[URL 인코딩] 커스텀 FRONTEND_URL을 사용한다', async () => {
      const config = buildConfig({ FRONTEND_URL: 'https://app.ablework.kr' })
      const customService = await buildService(config)

      await customService.sendPasswordReset(TO, 'tok')

      const html = lastMailArg().html as string
      expect(html).toContain('https://app.ablework.kr/reset-password?token=tok')
    })

    it('SMTP 발송 실패 시 에러를 다시 throw하고 logger.error를 호출한다', async () => {
      const smtpError = new Error('SMTP timeout')
      mockSendMail.mockRejectedValueOnce(smtpError)

      await expect(service.sendPasswordReset(TO, 'tok')).rejects.toThrow('SMTP timeout')
      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining(TO), smtpError)
    })

    it('빈 수신자 주소도 nodemailer로 그대로 전달된다 (검증 미수행 — notes 참조)', async () => {
      await service.sendPasswordReset('', 'tok')

      expect(lastMailArg().to).toBe('')
    })
  })

  // ── 환경 가드 (상용에서만 발송) ────────────────────────────────────────────────

  describe('환경 가드', () => {
    it('비프로덕션(개발) 환경에서는 메일을 실제 발송하지 않는다', async () => {
      const devService = await buildService(buildConfig({ NODE_ENV: 'development' }))

      await devService.sendPasswordReset(TO, 'tok')
      await devService.sendAccountSetup(TO, 'tok', '홍길동')
      await devService.sendMessageMail(TO, '제목', '내용')

      expect(mockSendMail).not.toHaveBeenCalled()
    })

    it('프로덕션 환경에서는 메일을 발송한다', async () => {
      const prodService = await buildService(buildConfig({ NODE_ENV: 'production' }))

      await prodService.sendAccountSetup(TO, 'tok', '홍길동')

      expect(mockSendMail).toHaveBeenCalledTimes(1)
      expect(lastMailArg().subject).toBe('[AbleWork] 계정 설정 안내')
    })
  })

  // ── sendMessageMail ──────────────────────────────────────────────────────────

  describe('sendMessageMail', () => {
    it('메시지 메일을 발송한다 (제목/본문 이스케이프 검증)', async () => {
      await service.sendMessageMail(TO, '공지사항', '내용입니다')

      const mail = lastMailArg()
      expect(mail.to).toBe(TO)
      expect(mail.from).toBe(FROM)
      expect(mail.subject).toBe('[AbleWork] 공지사항')
      expect(mail.html).toContain('공지사항')
      expect(mail.html).toContain('내용입니다')
    })

    it('성공 시 logger.log를 호출한다', async () => {
      await service.sendMessageMail(TO, '제목', '내용')

      expect(loggerLog).toHaveBeenCalledWith(expect.stringContaining(TO))
    })

    it('[XSS] 제목의 HTML/스크립트 태그가 이스케이프된다', async () => {
      await service.sendMessageMail(TO, '<b>긴급</b>', '내용')

      const html = lastMailArg().html as string
      expect(html).not.toContain('<b>긴급</b>')
      expect(html).toContain('&lt;b&gt;긴급&lt;/b&gt;')
    })

    it('[XSS] 내용의 스크립트 태그가 이스케이프된다 (pre-wrap 컨텍스트)', async () => {
      await service.sendMessageMail(TO, '제목', '<script>steal()</script>')

      const html = lastMailArg().html as string
      expect(html).not.toContain('<script>steal()</script>')
      expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;')
    })

    it('[fire-and-forget] SMTP 발송 실패 시 throw하지 않고 logger.error만 호출한다', async () => {
      const smtpError = new Error('SMTP down')
      mockSendMail.mockRejectedValueOnce(smtpError)

      // throw하지 않아야 한다 (메시지 저장 자체는 유지되어야 함)
      await expect(
        service.sendMessageMail(TO, '제목', '내용'),
      ).resolves.toBeUndefined()

      expect(loggerError).toHaveBeenCalledWith(expect.stringContaining(TO), smtpError)
    })

    it('빈 수신자 주소도 nodemailer로 그대로 전달된다 (검증 미수행 — notes 참조)', async () => {
      await service.sendMessageMail('', '제목', '내용')

      expect(lastMailArg().to).toBe('')
    })
  })

  // ── escapeHtml 동작 (메서드를 통한 간접 검증) ────────────────────────────────

  describe('escapeHtml (간접 검증)', () => {
    it('모든 HTML 특수문자(&, <, >, ", \')를 올바르게 이스케이프한다', async () => {
      await service.sendMessageMail(TO, `&<>"'`, '본문')

      const html = lastMailArg().html as string
      // & 가 가장 먼저 치환되어야 이중 이스케이프가 발생하지 않는다
      expect(html).toContain('&amp;&lt;&gt;&quot;&#39;')
    })

    it('이미 이스케이프된 엔티티를 이중 이스케이프한다 (& → &amp;)', async () => {
      // '&lt;' 라는 리터럴 문자열은 '&amp;lt;' 가 되어야 한다 (의도된 동작)
      await service.sendMessageMail(TO, '&lt;', '본문')

      const html = lastMailArg().html as string
      expect(html).toContain('&amp;lt;')
    })
  })
})
