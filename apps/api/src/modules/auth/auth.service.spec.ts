import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { getQueueToken } from '@nestjs/bullmq'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn().mockResolvedValue([]),
}

const mockMail = {
  sendPasswordReset: jest.fn().mockResolvedValue(undefined),
}

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn(),
}

const mockConfig = {
  getOrThrow: jest.fn().mockReturnValue('test_secret'),
  get: jest.fn().mockReturnValue('15m'),
}

const mockQueue = { add: jest.fn() }

describe('AuthService', () => {
  let service: AuthService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
        { provide: MailService, useValue: mockMail },
        { provide: getQueueToken('notification'), useValue: mockQueue },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    jest.clearAllMocks()
  })

  describe('login', () => {
    it('올바른 자격증명으로 토큰을 반환한다', async () => {
      const hash = await bcrypt.hash('password123', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        employee: { id: 'emp-1', companyId: 'co-1', accessLevel: 'EMPLOYEE', isActive: true },
      })

      const result = await service.login({ email: 'test@test.com', password: 'password123' })
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('잘못된 비밀번호로 UnauthorizedException을 던진다', async () => {
      const hash = await bcrypt.hash('correct_password', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        employee: { id: 'emp-1', companyId: 'co-1', accessLevel: 'EMPLOYEE', isActive: true },
      })

      await expect(
        service.login({ email: 'test@test.com', password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('존재하지 않는 이메일로 UnauthorizedException을 던진다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)
      await expect(
        service.login({ email: 'nobody@test.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('forgotPassword', () => {
    it('사용자가 존재하면 토큰을 저장하고 메일을 발송한다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@test.com' })
      mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' })

      const result = await service.forgotPassword('test@test.com')

      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'u1', tokenHash: expect.any(String) }),
        }),
      )
      expect(mockMail.sendPasswordReset).toHaveBeenCalledWith('test@test.com', expect.any(String))
      expect(result).toHaveProperty('message')
    })

    it('원본 토큰이 아닌 sha256 해시를 저장한다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@test.com' })
      mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' })

      await service.forgotPassword('test@test.com')

      const sentToken = mockMail.sendPasswordReset.mock.calls[0][1] as string
      const storedHash = mockPrisma.passwordResetToken.create.mock.calls[0][0].data
        .tokenHash as string
      expect(storedHash).not.toBe(sentToken)
      expect(storedHash).toHaveLength(64) // sha256 hex
    })

    it('사용자가 없어도 동일한 응답을 반환한다 (이메일 열거 방지)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@test.com' })
      mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' })
      const found = await service.forgotPassword('test@test.com')

      mockPrisma.user.findUnique.mockResolvedValue(null)
      const notFound = await service.forgotPassword('nobody@test.com')

      expect(notFound).toEqual(found)
      expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledTimes(1)
    })

    it('메일 발송 실패 시에도 동일한 응답을 반환한다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@test.com' })
      mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'prt-1' })
      mockMail.sendPasswordReset.mockRejectedValueOnce(new Error('SMTP down'))

      await expect(service.forgotPassword('test@test.com')).resolves.toHaveProperty('message')
    })
  })

  describe('resetPassword', () => {
    const validDto = {
      token: 'raw-token',
      newPassword: 'NewPass123',
      confirmPassword: 'NewPass123',
    }

    it('유효한 토큰으로 비밀번호를 갱신하고 usedAt을 기록한다', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      })

      const result = await service.resetPassword(validDto)

      expect(mockPrisma.$transaction).toHaveBeenCalled()
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      )
      expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prt-1' },
          data: { usedAt: expect.any(Date) },
        }),
      )
      expect(result).toHaveProperty('message')
    })

    it('존재하지 않는 토큰이면 BadRequestException을 던진다', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null)
      await expect(service.resetPassword(validDto)).rejects.toThrow(BadRequestException)
    })

    it('만료된 토큰이면 BadRequestException을 던진다', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'u1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      })
      await expect(service.resetPassword(validDto)).rejects.toThrow(BadRequestException)
    })

    it('이미 사용된 토큰이면 BadRequestException을 던진다', async () => {
      mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'u1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      })
      await expect(service.resetPassword(validDto)).rejects.toThrow(BadRequestException)
    })
  })

  describe('changePassword', () => {
    it('현재 비밀번호가 틀리면 BadRequestException을 던진다', async () => {
      const hash = await bcrypt.hash('correct', 10)
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash })

      await expect(
        service.changePassword('u1', {
          currentPassword: 'wrong',
          newPassword: 'NewPass123',
          confirmPassword: 'NewPass123',
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })
})
