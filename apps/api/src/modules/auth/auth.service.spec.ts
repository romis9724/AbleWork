import { Test, TestingModule } from '@nestjs/testing'
import { UnauthorizedException, BadRequestException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { getQueueToken } from '@nestjs/bullmq'
import * as bcrypt from 'bcryptjs'
import { AuthService } from './auth.service'
import { PrismaService } from '../../prisma/prisma.service'

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  employee: {
    findUnique: jest.fn(),
  },
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
