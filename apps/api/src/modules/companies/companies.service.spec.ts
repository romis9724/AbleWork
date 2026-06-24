import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { CompaniesService } from './companies.service'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditService } from '../audit/audit.service'

const mockCompany = {
  id: 'company-1',
  name: '테스트 회사',
  businessNumber: '1234567890',
  foundedAt: null,
  timezone: 'Asia/Seoul',
  locale: 'ko-KR',
  countryCode: 'KR',
  logoUrl: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockUser = {
  id: 'user-1',
  email: 'admin@test.com',
  passwordHash: 'hashed',
  name: '관리자',
  isActive: true,
}

const mockEmployee = {
  id: 'emp-1',
  companyId: 'company-1',
  userId: 'user-1',
  name: '관리자',
  accessLevel: 'SUPER_ADMIN',
  joinedAt: new Date(),
  isActive: true,
}

const mockPrisma = {
  group: {
    create: jest.fn(),
  },
  company: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  user: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  employee: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  companySetting: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn(),
}

describe('CompaniesService', () => {
  let service: CompaniesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile()

    service = module.get<CompaniesService>(CompaniesService)
    jest.clearAllMocks()
  })

  describe('create', () => {
    const createDto = {
      name: '테스트 회사',
      timezone: 'Asia/Seoul',
      locale: 'ko-KR',
      countryCode: 'KR',
      adminEmail: 'admin@test.com',
      adminPassword: 'Password123',
      adminName: '관리자',
    }

    it('그룹, 회사, 사용자, 직원을 트랜잭션으로 생성한다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const txMock = {
          group: { create: jest.fn().mockResolvedValue({ id: 'group-1', name: '테스트 회사' }) },
          company: { create: jest.fn().mockResolvedValue(mockCompany) },
          user: { create: jest.fn().mockResolvedValue(mockUser) },
          employee: { create: jest.fn().mockResolvedValue(mockEmployee) },
        }
        return fn(txMock as unknown as typeof mockPrisma)
      })

      const result = await service.create(createDto)

      expect(result.company.name).toBe('테스트 회사')
      expect(result.user.email).toBe('admin@test.com')
      expect(result.employee.accessLevel).toBe('SUPER_ADMIN')
    })

    it('이미 존재하는 이메일로 가입 시 BadRequestException을 던진다', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser)

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException)
    })
  })

  describe('findById', () => {
    it('회사가 존재하면 반환한다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany)

      const result = await service.findById('company-1', 'company-1')

      expect(result.id).toBe('company-1')
    })

    it('회사가 없으면 NotFoundException을 던진다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null)

      await expect(service.findById('non-existent', 'company-1')).rejects.toThrow(NotFoundException)
    })

    it('다른 companyId로 조회 시 ForbiddenException을 던진다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({ ...mockCompany, id: 'company-1' })

      await expect(service.findById('company-1', 'company-2')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('update', () => {
    it('회사 정보를 수정하고 반환한다', async () => {
      const updated = { ...mockCompany, name: '수정된 회사명' }
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany)
      mockPrisma.company.update.mockResolvedValue(updated)

      const result = await service.update('company-1', 'company-1', { name: '수정된 회사명' })

      expect(result.name).toBe('수정된 회사명')
    })
  })

  describe('generateInviteCode', () => {
    it('6자리 합류코드를 생성하고 저장한다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(mockCompany)
      mockPrisma.companySetting.upsert.mockResolvedValue({})

      const result = await service.generateInviteCode('company-1')

      expect(result.inviteCode).toHaveLength(6)
      expect(result.inviteCode).toMatch(/^[A-Z0-9]{6}$/)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
    })

    it('존재하지 않는 회사에 대해 NotFoundException을 던진다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null)

      await expect(service.generateInviteCode('non-existent')).rejects.toThrow(NotFoundException)
    })
  })

  describe('joinByInviteCode', () => {
    const joinDto = { inviteCode: 'ABC123' }

    it('유효한 코드로 현재 사용자를 회사 멤버(EMPLOYEE)로 추가한다', async () => {
      mockPrisma.companySetting.findFirst.mockResolvedValue({ companyId: 'company-1', value: 'ABC123' })
      mockPrisma.user.findUnique.mockResolvedValue({ name: '신규 직원' })
      mockPrisma.employee.findFirst.mockResolvedValue(null)
      mockPrisma.employee.create.mockResolvedValue({
        id: 'emp-2',
        companyId: 'company-1',
        accessLevel: 'EMPLOYEE',
      })

      const result = await service.joinByInviteCode('user-2', joinDto)

      expect(result.employee.accessLevel).toBe('EMPLOYEE')
      expect(mockPrisma.employee.create).toHaveBeenCalledTimes(1)
    })

    it('유효하지 않은 코드로 BadRequestException을 던진다', async () => {
      mockPrisma.companySetting.findFirst.mockResolvedValue(null)

      await expect(service.joinByInviteCode('user-2', { inviteCode: 'WRONG1' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('이미 해당 회사 멤버이면 BadRequestException을 던진다', async () => {
      mockPrisma.companySetting.findFirst.mockResolvedValue({ companyId: 'company-1', value: 'ABC123' })
      mockPrisma.user.findUnique.mockResolvedValue({ name: '기존 직원' })
      mockPrisma.employee.findFirst.mockResolvedValue({ id: 'emp-existing' })

      await expect(service.joinByInviteCode('user-2', joinDto)).rejects.toThrow(BadRequestException)
    })
  })

  describe('addCompany', () => {
    const addDto = {
      name: '새 계열사',
      timezone: 'Asia/Seoul',
      locale: 'ko-KR',
      countryCode: 'KR',
    }

    it('같은 그룹에 회사를 만들고 현재 사용자를 SUPER_ADMIN으로 등록한다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue({ groupId: 'group-1' })
      mockPrisma.user.findUnique.mockResolvedValue({ name: '관리자' })
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
        const txMock = {
          company: {
            create: jest.fn().mockResolvedValue({ ...mockCompany, id: 'company-2', groupId: 'group-1' }),
          },
          employee: {
            create: jest.fn().mockResolvedValue({ id: 'emp-3', companyId: 'company-2', accessLevel: 'SUPER_ADMIN' }),
          },
        }
        return fn(txMock as unknown as typeof mockPrisma)
      })

      const result = await service.addCompany('company-1', 'user-1', addDto)

      expect(result.company.id).toBe('company-2')
      expect(result.employee.accessLevel).toBe('SUPER_ADMIN')
    })

    it('현재 회사가 없으면 NotFoundException을 던진다', async () => {
      mockPrisma.company.findFirst.mockResolvedValue(null)

      await expect(service.addCompany('non-existent', 'user-1', addDto)).rejects.toThrow(
        NotFoundException,
      )
    })
  })
})
