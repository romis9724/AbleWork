import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import Mail from 'nodemailer/lib/mailer'

export interface IMailService {
  sendPasswordReset(to: string, token: string): Promise<void>
  sendAccountSetup(to: string, token: string, name?: string): Promise<void>
  sendMessageMail(to: string, title: string, content: string): Promise<void>
}

/** HTML 본문에 삽입되는 사용자 입력 값 이스케이프 (XSS 방지) */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

@Injectable()
export class MailService implements IMailService {
  private readonly logger = new Logger(MailService.name)
  private transporter: Mail

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      // env 값은 문자열로 들어오므로 Number/명시 비교로 강제 — 특히 secure는 "false"(문자열)가
      // truthy라 implicit TLS를 켜버려 587(STARTTLS)에서 'wrong version number'로 실패한다.
      port: Number(this.config.get('MAIL_PORT', 587)),
      secure: String(this.config.get('MAIL_SECURE', 'false')) === 'true',
      auth: {
        user: this.config.get<string>('MAIL_USER', ''),
        pass: this.config.get<string>('MAIL_PASS', ''),
      },
    })
  }

  /** 상용(프로덕션)에서만 실제 발송한다. 개발·테스트 등 비프로덕션은 생략(로깅만). */
  private get mailEnabled(): boolean {
    return String(this.config.get('NODE_ENV', 'development')) === 'production'
  }

  /** 모든 메일 발송의 공통 출구 — 비프로덕션 환경에서는 실제 전송하지 않는다. */
  private async deliver(options: Mail.Options): Promise<void> {
    if (!this.mailEnabled) {
      this.logger.warn(
        `메일 발송 생략(비프로덕션 환경): to=${options.to}, subject=${options.subject}`,
      )
      return
    }
    await this.transporter.sendMail(options)
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM', 'no-reply@ablework.kr')
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')
    // 토큰은 URL 쿼리 파라미터로 들어가므로 특수문자(?, &, =, # 등)를 인코딩
    const resetLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>비밀번호 재설정</h2>
  <p>아래 버튼을 클릭하여 비밀번호를 재설정하세요.</p>
  <a href="${resetLink}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
    비밀번호 재설정
  </a>
  <p style="color: #666;">이 링크는 30분 후 만료됩니다. 본인이 요청하지 않은 경우 이 이메일을 무시하세요.</p>
</div>
`

    try {
      await this.deliver({
        from,
        to,
        subject: '[AbleWork] 비밀번호 재설정 안내',
        html,
      })
      this.logger.log(`Password reset email sent to ${to}`)
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${to}`, error)
      throw error
    }
  }

  /**
   * 계정 설정(초대) 이메일 — 대량 등록 등으로 만든 비활성 계정에 발송.
   * 동일한 reset-password 화면을 재사용하며, 비밀번호 설정 시 계정이 활성화된다.
   */
  async sendAccountSetup(to: string, token: string, name?: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM', 'no-reply@ablework.kr')
    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000')
    const setupLink = `${frontendUrl}/reset-password?token=${encodeURIComponent(token)}`
    const greeting = name ? `${escapeHtml(name)}님, ` : ''

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>AbleWork 계정 설정 안내</h2>
  <p>${greeting}AbleWork에 계정이 생성되었습니다. 아래 버튼을 눌러 비밀번호를 설정하면 로그인할 수 있습니다.</p>
  <a href="${setupLink}" style="display: inline-block; background: #f36f20; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
    비밀번호 설정하고 시작하기
  </a>
  <p style="color: #666;">이 링크는 7일 후 만료됩니다. 만료 시 로그인 화면의 "비밀번호 찾기"로 다시 설정할 수 있습니다.</p>
</div>
`

    try {
      await this.deliver({
        from,
        to,
        subject: '[AbleWork] 계정 설정 안내',
        html,
      })
      this.logger.log(`Account setup email sent to ${to}`)
    } catch (error) {
      this.logger.error(`Failed to send account setup email to ${to}`, error)
      throw error
    }
  }

  /**
   * 범용 메시지 이메일 발송 (사내 메시지 / 자동화 메시지).
   * 발송 실패는 로깅만 하고 throw 하지 않는다 — 메시지 저장 자체는 유지되어야 한다.
   */
  async sendMessageMail(to: string, title: string, content: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM', 'no-reply@ablework.kr')

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>${escapeHtml(title)}</h2>
  <div style="background: #f9f9f9; padding: 20px; border-radius: 6px; margin: 20px 0; white-space: pre-wrap;">
    ${escapeHtml(content)}
  </div>
  <p style="color: #666; font-size: 12px;">본 메일은 AbleWork에서 자동 발송되었습니다.</p>
</div>
`

    try {
      await this.deliver({
        from,
        to,
        subject: `[AbleWork] ${title}`,
        html,
      })
      this.logger.log(`Message email sent to ${to}`)
    } catch (error) {
      // 이메일 실패는 메시지 발송 자체를 막지 않는다 (fire-and-forget)
      this.logger.error(`Failed to send message email to ${to}`, error)
    }
  }
}
