import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { TimeclockAreasService } from './timeclock-areas.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── 픽스처 ────────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const ORG_ID = 'org-1'
const AREA_ID = 'area-1'

const baseArea = {
  id: AREA_ID,
  organizationId: ORG_ID,
  name: '본사 1층',
  authMethod: 'gps',
  locationLat: 37.5665,
  locationLng: 126.9780,
  locationRadiusMeters: 100,
  wifiSsid: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  organization: { id: ORG_ID, name: '개발팀' },
}

const mockPrisma = {
  timeclockArea: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  organization: {
    findFirst: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('TimeclockAreasService', () => {
  let service: TimeclockAreasService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TimeclockAreasService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<TimeclockAreasService>(TimeclockAreasService)
    jest.clearAllMocks()
  })

  // ── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('조직 필터 없이 회사 소속 모든 장소를 반환한다', async () => {
      mockPrisma.timeclockArea.findMany.mockResolvedValue([baseArea])

      const result = await service.findAll(COMPANY_ID)

      expect(result).toHaveLength(1)
      expect(mockPrisma.timeclockArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      )
    })

    it('organizationId 필터를 적용하면 조직 유효성을 검사한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: ORG_ID, companyId: COMPANY_ID })
      mockPrisma.timeclockArea.findMany.mockResolvedValue([baseArea])

      await service.findAll(COMPANY_ID, ORG_ID)

      expect(mockPrisma.organization.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORG_ID, companyId: COMPANY_ID } }),
      )
    })

    it('유효하지 않은 organizationId이면 BadRequestException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(service.findAll(COMPANY_ID, 'invalid-org')).rejects.toThrow(BadRequestException)
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('GPS 인증 방식으로 장소를 생성한다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue({ id: ORG_ID, companyId: COMPANY_ID })
      mockPrisma.timeclockArea.create.mockResolvedValue(baseArea)

      const dto = {
        organizationId: ORG_ID,
        name: '본사 1층',
        authMethod: 'gps' as const,
        locationLat: 37.5665,
        locationLng: 126.9780,
        locationRadiusMeters: 100,
      }

      const result = await service.create(COMPANY_ID, dto)

      expect(result).toEqual(baseArea)
      expect(mockPrisma.timeclockArea.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: '본사 1층', authMethod: 'gps' }),
        }),
      )
    })

    it('유효하지 않은 조직이면 BadRequestException을 던진다', async () => {
      mockPrisma.organization.findFirst.mockResolvedValue(null)

      await expect(
        service.create(COMPANY_ID, {
          organizationId: 'bad-org',
          name: '장소',
          authMethod: 'none' as const,
        }),
      ).rejects.toThrow(BadRequestException)
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('장소 이름을 수정한다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(baseArea)
      mockPrisma.timeclockArea.update.mockResolvedValue({ ...baseArea, name: '수정된 장소' })

      const result = await service.update(COMPANY_ID, AREA_ID, { name: '수정된 장소' })

      expect(result.name).toBe('수정된 장소')
      expect(mockPrisma.timeclockArea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: AREA_ID },
          data: expect.objectContaining({ name: '수정된 장소' }),
        }),
      )
    })

    it('존재하지 않는 장소이면 NotFoundException을 던진다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(null)

      await expect(service.update(COMPANY_ID, 'nonexistent', { name: '수정' })).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('isActive를 false로 설정하여 소프트 삭제한다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(baseArea)
      mockPrisma.timeclockArea.update.mockResolvedValue({ ...baseArea, isActive: false })

      const result = await service.remove(COMPANY_ID, AREA_ID)

      expect(result.isActive).toBe(false)
      expect(mockPrisma.timeclockArea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: AREA_ID },
          data: { isActive: false },
        }),
      )
    })

    it('존재하지 않는 장소이면 NotFoundException을 던진다', async () => {
      mockPrisma.timeclockArea.findFirst.mockResolvedValue(null)

      await expect(service.remove(COMPANY_ID, 'nonexistent')).rejects.toThrow(NotFoundException)
    })
  })
})
