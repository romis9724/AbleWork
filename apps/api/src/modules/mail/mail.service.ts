import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import Mail from 'nodemailer/lib/mailer'

export interface IMailService {
  sendInviteCode(to: string, code: string, companyName: string): Promise<void>
  sendPasswordReset(to: string, token: string): Promise<void>
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

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>${companyName}에서 AbleWork로 초대합니다</h2>
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
    const resetLink = `${frontendUrl}/auth/reset-password?token=${token}`

    const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>비밀번호 재설정</h2>
  <p>아래 버튼을 클릭하여 비밀번호를 재설정하세요.</p>
  <a href="${resetLink}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
    비밀번호 재설정
  </a>
  <p style="color: #666;">이 링크는 1시간 후 만료됩니다. 본인이 요청하지 않은 경우 이 이메일을 무시하세요.</p>
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
}
