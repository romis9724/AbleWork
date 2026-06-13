import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import Mail from 'nodemailer/lib/mailer'

export interface IMailService {
  sendInviteCode(to: string, code: string, companyName: string): Promise<void>
  sendPasswordReset(to: string, token: string): Promise<void>
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
      port: this.config.get<number>('MAIL_PORT', 587),
      secure: this.config.get<boolean>('MAIL_SECURE', false),
      auth: {
        user: this.config.get<string>('MAIL_USER', ''),
        pass: this.config.get<string>('MAIL_PASS', ''),
      },
    })
  }

  async sendInviteCode(to: string, code: string, companyName: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM', 'no-reply@ablework.kr')
    // 사용자 입력(companyName)은 HTML 본문에 삽입되므로 이스케이프 (XSS 방지)
    const safeCompanyName = escapeHtml(companyName)

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>${safeCompanyName}에서 AbleWork로 초대합니다</h2>
  <p>아래 초대 코드를 사용하여 회원가입을 완료하세요.</p>
  <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 4px; margin: 20px 0;">
    ${code}
  </div>
  <p style="color: #666;">이 코드는 24시간 후 만료됩니다.</p>
</div>
`

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `[${companyName}] AbleWork 초대 코드`,
        html,
      })
      this.logger.log(`Invite code email sent to ${to}`)
    } catch (error) {
      this.logger.error(`Failed to send invite code email to ${to}`, error)
      throw error
    }
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
      await this.transporter.sendMail({
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
      await this.transporter.sendMail({
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
