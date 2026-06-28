import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PositionsService } from './positions.service'
import { PrismaService } from '../../prisma/prisma.service'

const COMPANY_ID = 'company-1'
const POSITION_ID = 'pos-1'

const basePosition = {
  id: POSITION_ID,
  companyId: COMPANY_ID,
  name: '매니저',
  color: '#FF5733',
  sortOrder: 0,
  isActive: true,
}

const mockPrisma = {
  position: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  employeePosition: {
    count: jest.fn(),
  },
  // 배열(operation 묶음)을 받는 트랜잭션 형태를 지원
  $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
}

describe('PositionsService', () => {
  let service: PositionsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PositionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<PositionsService>(PositionsService)
    jest.clearAllMocks()
  })

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('해당 회사의 활성 직위 목록을 반환한다', async () => {
      mockPrisma.position.findMany.mockResolvedValue([basePosition])
      const result = await service.findAll(COMPANY_ID)
      expect(result).toEqual([basePosition])
      expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('직위를 생성하고 반환한다', async () => {
      const dto = { name: '파트타이머', color: '#3498DB', sortOrder: 1 }
      mockPrisma.position.create.mockResolvedValue({ ...basePosition, ...dto })

      const result = await service.create(COMPANY_ID, dto)
      expect(result.name).toBe('파트타이머')
      expect(mockPrisma.position.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_ID, name: '파트타이머' }),
        }),
      )
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('존재하는 직위를 수정한다', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(basePosition)
      mockPrisma.position.update.mockResolvedValue({ ...basePosition, name: '시니어 매니저' })

      const result = await service.update(COMPANY_ID, POSITION_ID, { name: '시니어 매니저' })
      expect(result.name).toBe('시니어 매니저')
    })

    it('존재하지 않으면 NotFoundException(POSITION_NOT_FOUND)을 던진다', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: '변경' }),
      ).rejects.toThrow(NotFoundException)
    })
  })

  // ── reorder ──────────────────────────────────────────────────────────────────

  describe('reorder', () => {
    it('ids 순서대로 sortOrder를 0..n으로 재설정한다', async () => {
      mockPrisma.position.count.mockResolvedValue(2)
      mockPrisma.position.update.mockResolvedValue(basePosition)
      mockPrisma.position.findMany.mockResolvedValue([basePosition])

      await service.reorder(COMPANY_ID, ['pos-2', 'pos-1'])

      expect(mockPrisma.position.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'pos-2', companyId: COMPANY_ID },
        data: { sortOrder: 0 },
      })
      expect(mockPrisma.position.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'pos-1', companyId: COMPANY_ID },
        data: { sortOrder: 1 },
      })
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('타사 직위가 섞여 있으면 BadRequestException(POSITION_NOT_FOUND)을 던진다', async () => {
      // 요청 id 2개 중 1개만 자사 활성 직위로 확인됨
      mockPrisma.position.count.mockResolvedValue(1)

      await expect(service.reorder(COMPANY_ID, ['pos-1', 'pos-x'])).rejects.toThrow(
        BadRequestException,
      )
      expect(mockPrisma.position.update).not.toHaveBeenCalled()
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('배정된 활성 직원이 없으면 소프트 삭제한다 (isActive=false)', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(basePosition)
      mockPrisma.employeePosition.count.mockResolvedValue(0)
      mockPrisma.position.update.mockResolvedValue({ ...basePosition, isActive: false })

      const result = await service.remove(COMPANY_ID, POSITION_ID)
      expect(result.isActive).toBe(false)
      // 참조무결성 검사 시 employee 관계로 companyId까지 확인 (멀티테넌시 방어)
      expect(mockPrisma.employeePosition.count).toHaveBeenCalledWith({
        where: { positionId: POSITION_ID, employee: { companyId: COMPANY_ID, isActive: true } },
      })
      expect(mockPrisma.position.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: POSITION_ID, companyId: COMPANY_ID }, // 멀티테넌시 방어
          data: { isActive: false },
        }),
      )
    })

    it('배정된 활성 직원이 있으면 ForbiddenException(POSITION_IN_USE)을 던지고 삭제하지 않는다', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(basePosition)
      mockPrisma.employeePosition.count.mockResolvedValue(2)

      await expect(service.remove(COMPANY_ID, POSITION_ID)).rejects.toThrow(ForbiddenException)
      await expect(service.remove(COMPANY_ID, POSITION_ID)).rejects.toMatchObject({
        response: { code: 'POSITION_IN_USE' },
      })
      expect(mockPrisma.position.update).not.toHaveBeenCalled()
    })

    it('존재하지 않으면 NotFoundException을 던진다', async () => {
      mockPrisma.position.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(NotFoundException)
    })
  })
})
