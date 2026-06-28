import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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

export interface MyCompanyItem {
  companyId: string
  companyName: string
  logoUrl: string | null
  accessLevel: AccessLevel
  isCurrent: boolean
}

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
        employees: {
          where: { isActive: true },
          select: { id: true, companyId: true, accessLevel: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!user) throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.')

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash)
    if (!passwordValid)
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.')

    if (user.employees.length === 0) {
      throw new UnauthorizedException('비활성화된 계정입니다.')
    }

    // 멀티컴퍼니: 마지막 선택 회사(lastCompanyId) 우선, 없으면 가장 먼저 가입한 회사
    const activeEmployee =
      user.employees.find((e) => e.companyId === user.lastCompanyId) ?? user.employees[0]

    const payload: JwtPayload = {
      sub: user.id,
      employeeId: activeEmployee.id,
      companyId: activeEmployee.companyId,
      accessLevel: activeEmployee.accessLevel as AccessLevel,
    }

    return this.generateTokens(payload)
  }

  /**
   * 회사 전환 — 사용자가 활성 멤버십을 가진 다른 회사로 토큰을 재발급한다.
   * 선택 회사를 lastCompanyId에 기억한다.
   */
  async switchCompany(
    userId: string,
    companyId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const employee = await this.prisma.employee.findFirst({
      where: { userId, companyId, isActive: true },
      select: { id: true, companyId: true, accessLevel: true },
    })

    if (!employee) {
      throw new ForbiddenException({
        code: 'COMPANY_MEMBERSHIP_NOT_FOUND',
        message: '해당 회사에 대한 접근 권한이 없습니다.',
      })
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastCompanyId: companyId },
    })

    const payload: JwtPayload = {
      sub: userId,
      employeeId: employee.id,
      companyId: employee.companyId,
      accessLevel: employee.accessLevel as AccessLevel,
    }

    return this.generateTokens(payload)
  }

  /**
   * 내 소속 회사 목록 — 회사 전환 UI용.
   */
  async getMyCompanies(userId: string, currentCompanyId: string): Promise<MyCompanyItem[]> {
    const employees = await this.prisma.employee.findMany({
      where: { userId, isActive: true },
      select: {
        accessLevel: true,
        company: { select: { id: true, name: true, logoUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return employees.map((e) => ({
      companyId: e.company.id,
      companyName: e.company.name,
      logoUrl: e.company.logoUrl,
      accessLevel: e.accessLevel as AccessLevel,
      isCurrent: e.company.id === currentCompanyId,
    }))
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
        // 비밀번호 설정 = 본인 확인 완료 → 계정 활성화(초대로 만든 비활성 계정도 이때 활성화)
        data: { passwordHash, isActive: true },
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
