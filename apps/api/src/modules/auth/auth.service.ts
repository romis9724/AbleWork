import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import * as bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { MailService } from '../mail/mail.service'
import { LoginDto, ChangePasswordDto, ResetPasswordDto } from './dto/auth.dto'
import { AccessLevel } from '@ablework/shared-constants'

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000 // 30분
const RESET_TOKEN_BYTES = 32

@Injectable()
export class AuthService {
  private readonly REFRESH_TTL_SEC = 7 * 24 * 60 * 60
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    @InjectQueue('notification') private readonly notifQueue: Queue,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email, isActive: true },
      include: {
        employee: { select: { id: true, companyId: true, accessLevel: true, isActive: true } },
      },
    })

    if (!user) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.')

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!passwordValid)
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.')

    if (!user.employee || !user.employee.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.')
    }

    const payload: JwtPayload = {
      sub: user.id,
      employeeId: user.employee.id,
      companyId: user.employee.companyId,
      accessLevel: user.employee.accessLevel as AccessLevel,
    }

    return this.generateTokens(payload)
  }

  async refresh(rawToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: JwtPayload
    try {
      payload = this.jwt.verify<JwtPayload>(rawToken, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('유효하지 않은 Refresh Token입니다.')
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: payload.employeeId, isActive: true },
    })
    if (!employee) throw new UnauthorizedException('유효하지 않은 토큰입니다.')

    const freshPayload: JwtPayload = {
      sub: payload.sub,
      employeeId: payload.employeeId,
      companyId: payload.companyId,
      accessLevel: employee.accessLevel as AccessLevel,
    }

    return this.generateTokens(freshPayload)
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.')

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash)
    if (!valid) throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.')

    const hash = await bcrypt.hash(dto.newPassword, 10)
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } })
  }

  /**
   * 비밀번호 재설정 요청 (이메일 열거 방지: 사용자 존재 여부와 무관하게 항상 동일 응답)
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = { message: '등록된 이메일이라면 재설정 안내 메일이 발송됩니다.' }

    const user = await this.prisma.user.findUnique({
      where: { email, isActive: true },
      select: { id: true, email: true },
    })
    if (!user) return response

    const token = randomBytes(RESET_TOKEN_BYTES).toString('hex')
    const tokenHash = this.hashResetToken(token)

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    })

    try {
      await this.mail.sendPasswordReset(user.email, token)
    } catch (error) {
      // 메일 실패가 응답 차이로 이어지면 이메일 열거가 가능해지므로 로깅만 한다
      this.logger.error(`비밀번호 재설정 메일 발송 실패 (userId: ${user.id})`, error)
    }

    return response
  }

  /** 토큰 검증 후 비밀번호 재설정 (1회용 토큰 — usedAt 기록) */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const tokenHash = this.hashResetToken(dto.token)

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    })

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'AUTH_RESET_TOKEN_INVALID',
        message: '유효하지 않거나 만료된 재설정 링크입니다. 다시 요청해 주세요.',
      })
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10)

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ])

    return { message: '비밀번호가 재설정되었습니다.' }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10)
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  private generateTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    })
    const refreshToken = this.jwt.sign(payload, {
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    })
    return { accessToken, refreshToken }
  }
}
