import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { ShiftTemplatesService } from './shift-templates.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const SHIFT_TYPE_ID = 'shift-type-1'
const TEMPLATE_ID = 'template-1'

const baseTemplate = {
  id: TEMPLATE_ID,
  companyId: COMPANY_ID,
  shiftTypeId: SHIFT_TYPE_ID,
  name: '오전 근무',
  code: 'AM',
  startTime: new Date(1970, 0, 1, 9, 0),
  endTime: new Date(1970, 0, 1, 18, 0),
  isActive: true,
  createdAt: new Date(),
  shiftType: { id: SHIFT_TYPE_ID, name: '일반근무', color: '#4A90E2' },
}

const mockPrisma = {
  shiftTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  shiftType: {
    findFirst: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('ShiftTemplatesService', () => {
  let service: ShiftTemplatesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShiftTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<ShiftTemplatesService>(ShiftTemplatesService)
    jest.clearAllMocks()
  })

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('활성화된 템플릿 목록을 반환한다', async () => {
      mockPrisma.shiftTemplate.findMany.mockResolvedValue([baseTemplate])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toHaveLength(1)
      expect(mockPrisma.shiftTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('유효한 DTO로 템플릿을 생성한다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue({ id: SHIFT_TYPE_ID })
      mockPrisma.shiftTemplate.create.mockResolvedValue(baseTemplate)

      const dto = {
        shiftTypeId: SHIFT_TYPE_ID,
        name: '오전 근무',
        code: 'AM',
        startTime: '09:00',
        endTime: '18:00',
      }

      const result = await service.create(COMPANY_ID, dto)

      expect(result).toEqual(baseTemplate)
      expect(mockPrisma.shiftTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            name: '오전 근무',
          }),
        }),
      )
    })

    it('유효하지 않은 shiftTypeId이면 BadRequestException을 던진다', async () => {
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(
        service.create(COMPANY_ID, {
          shiftTypeId: 'invalid-id',
          name: '템플릿',
          startTime: '09:00',
          endTime: '18:00',
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('템플릿 이름을 수정한다', async () => {
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(baseTemplate)
      mockPrisma.shiftTemplate.update.mockResolvedValue({ ...baseTemplate, name: '수정된 템플릿' })

      const result = await service.update(COMPANY_ID, TEMPLATE_ID, { name: '수정된 템플릿' })

      expect(result.name).toBe('수정된 템플릿')
    })

    it('존재하지 않는 템플릿이면 NotFoundException을 던진다', async () => {
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, 'nonexistent', { name: '수정' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('shiftTypeId 변경 시 유효성 검사를 수행한다', async () => {
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(baseTemplate)
      mockPrisma.shiftType.findFirst.mockResolvedValue(null)

      await expect(
        service.update(COMPANY_ID, TEMPLATE_ID, { shiftTypeId: 'bad-type-id' }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('isActive를 false로 설정하여 소프트 삭제한다', async () => {
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(baseTemplate)
      mockPrisma.shiftTemplate.update.mockResolvedValue({ ...baseTemplate, isActive: false })

      const result = await service.remove(COMPANY_ID, TEMPLATE_ID)

      expect(result.isActive).toBe(false)
      expect(mockPrisma.shiftTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TEMPLATE_ID },
          data: { isActive: false },
        }),
      )
    })

    it('존재하지 않는 템플릿이면 NotFoundException을 던진다', async () => {
      mockPrisma.shiftTemplate.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(NotFoundException)
    })
  })
})
