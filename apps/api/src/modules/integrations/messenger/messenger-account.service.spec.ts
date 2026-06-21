import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { MessengerAccountService } from './messenger-account.service'
import { PrismaService } from '../../../prisma/prisma.service'

const mockPrisma = {
  messengerAccount: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
}

describe('MessengerAccountService', () => {
  let service: MessengerAccountService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessengerAccountService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile()
    service = module.get(MessengerAccountService)
    jest.clearAllMocks()
  })

  it('link — 복합 유니크키로 upsert(등록/갱신)', async () => {
    mockPrisma.messengerAccount.upsert.mockResolvedValue({ id: 'a' })
    await service.link('c1', 'e1', { platform: 'discord', externalUserId: 'd1' })
    expect(mockPrisma.messengerAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId_employeeId_platform: { companyId: 'c1', employeeId: 'e1', platform: 'discord' } },
        create: expect.objectContaining({ companyId: 'c1', employeeId: 'e1', platform: 'discord', externalUserId: 'd1' }),
        update: { externalUserId: 'd1' },
      }),
    )
  })

  it('findMine — companyId/employeeId 스코프', async () => {
    mockPrisma.messengerAccount.findMany.mockResolvedValue([])
    await service.findMine('c1', 'e1')
    expect(mockPrisma.messengerAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'c1', employeeId: 'e1' } }),
    )
  })

  it('unlink — 본인 소유 검증 후 삭제', async () => {
    mockPrisma.messengerAccount.findFirst.mockResolvedValue({ id: 'a' })
    mockPrisma.messengerAccount.delete.mockResolvedValue({})
    const result = await service.unlink('c1', 'e1', 'a')
    expect(result).toEqual({ deleted: true })
    // 멀티테넌시 + 본인 소유: where에 id/companyId/employeeId 모두 포함
    expect(mockPrisma.messengerAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'a', companyId: 'c1', employeeId: 'e1' } }),
    )
  })

  it('unlink — 없으면 NotFound, delete 미호출', async () => {
    mockPrisma.messengerAccount.findFirst.mockResolvedValue(null)
    await expect(service.unlink('c1', 'e1', 'x')).rejects.toThrow(NotFoundException)
    expect(mockPrisma.messengerAccount.delete).not.toHaveBeenCalled()
  })
})
