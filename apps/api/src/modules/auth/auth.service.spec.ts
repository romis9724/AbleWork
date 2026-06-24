import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common'
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
    findFirst: jest.fn(),
    findMany: jest.fn(),
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
        lastCompanyId: null,
        employees: [
          { id: 'emp-1', companyId: 'co-1', accessLevel: 'EMPLOYEE', createdAt: new Date() },
        ],
      })

      const result = await service.login({ email: 'test@test.com', password: 'password123' })
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('lastCompanyId가 있으면 해당 회사 멤버십을 활성으로 선택한다', async () => {
      const hash = await bcrypt.hash('password123', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        lastCompanyId: 'co-2',
        employees: [
          { id: 'emp-1', companyId: 'co-1', accessLevel: 'EMPLOYEE', createdAt: new Date() },
          { id: 'emp-2', companyId: 'co-2', accessLevel: 'SUPER_ADMIN', createdAt: new Date() },
        ],
      })

      await service.login({ email: 'test@test.com', password: 'password123' })

      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-2', companyId: 'co-2', accessLevel: 'SUPER_ADMIN' }),
        expect.anything(),
      )
    })

    it('잘못된 비밀번호로 UnauthorizedException을 던진다', async () => {
      const hash = await bcrypt.hash('correct_password', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        lastCompanyId: null,
        employees: [
          { id: 'emp-1', companyId: 'co-1', accessLevel: 'EMPLOYEE', createdAt: new Date() },
        ],
      })

      await expect(
        service.login({ email: 'test@test.com', password: 'wrong_password' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('소속 회사가 없으면 UnauthorizedException을 던진다', async () => {
      const hash = await bcrypt.hash('password123', 10)
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        passwordHash: hash,
        lastCompanyId: null,
        employees: [],
      })

      await expect(
        service.login({ email: 'test@test.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('존재하지 않는 이메일로 UnauthorizedException을 던진다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)
      await expect(
        service.login({ email: 'nobody@test.com', password: 'any' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('switchCompany', () => {
    it('멤버십이 있는 회사로 전환하고 lastCompanyId를 기록한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue({
        id: 'emp-2',
        companyId: 'co-2',
        accessLevel: 'SUPER_ADMIN',
      })
      mockPrisma.user.update.mockResolvedValue({})

      const result = await service.switchCompany('user-1', 'co-2')

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastCompanyId: 'co-2' },
      })
      expect(mockJwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-2', companyId: 'co-2' }),
        expect.anything(),
      )
      expect(result).toHaveProperty('accessToken')
    })

    it('멤버십이 없는 회사로 전환 시 ForbiddenException을 던진다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.switchCompany('user-1', 'co-x')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('getMyCompanies', () => {
    it('내 활성 회사 목록을 반환하고 현재 회사를 표시한다', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([
        { accessLevel: 'EMPLOYEE', company: { id: 'co-1', name: 'A사', logoUrl: null } },
        { accessLevel: 'SUPER_ADMIN', company: { id: 'co-2', name: 'B사', logoUrl: null } },
      ])

      const result = await service.getMyCompanies('user-1', 'co-2')

      expect(result).toHaveLength(2)
      expect(result.find((c) => c.companyId === 'co-2')?.isCurrent).toBe(true)
      expect(result.find((c) => c.companyId === 'co-1')?.isCurrent).toBe(false)
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
