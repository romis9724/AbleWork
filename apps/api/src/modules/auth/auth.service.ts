import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { LoginDto, ChangePasswordDto } from './dto/auth.dto'
import { AccessLevel } from '@ablework/shared-constants'

@Injectable()
export class AuthService {
  private readonly REFRESH_TTL_SEC = 7 * 24 * 60 * 60

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10)
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
