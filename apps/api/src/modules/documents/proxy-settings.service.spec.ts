import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException, BadRequestException } from '@nestjs/common'
import { ProxySettingsService } from './proxy-settings.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateProxySettingDto, UpdateProxySettingDto } from './dto/proxy-setting.dto'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const PRINCIPAL_ID = 'employee-principal' // 위임자(본인)
const PROXY_ID = 'employee-proxy' // 대리결재자
const SETTING_ID = 'proxy-setting-1'

// 자사 소속 재직 중인 대리결재자 후보
const baseProxyEmployee = {
  id: PROXY_ID,
  companyId: COMPANY_ID,
  name: '대리인',
  isActive: true,
}

// 기존 대리결재 설정 (principal 본인 소유)
const baseSetting = {
  id: SETTING_ID,
  principalId: PRINCIPAL_ID,
  proxyId: PROXY_ID,
  startDate: new Date('2024-06-01'),
  endDate: new Date('2024-06-30'),
  reason: '연차 사용',
  isActive: true,
  createdAt: new Date('2024-05-20'),
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제 사용하는 모델/메서드만 정의한다.

const mockPrisma = {
  proxySettings: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  employee: {
    findFirst: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('ProxySettingsService', () => {
  let service: ProxySettingsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProxySettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<ProxySettingsService>(ProxySettingsService)
    jest.clearAllMocks()
  })

  // ── findMine ───────────────────────────────────────────────────────────────

  describe('findMine', () => {
    it('본인(principal)의 대리결재 설정 목록을 반환한다', async () => {
      mockPrisma.proxySettings.findMany.mockResolvedValue([baseSetting])

      const result = await service.findMine(PRINCIPAL_ID)

      expect(result).toEqual([baseSetting])
      // principalId 조건으로만 조회되어야 한다 (본인 소유 한정)
      expect(mockPrisma.proxySettings.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ principalId: PRINCIPAL_ID }),
        }),
      )
    })

    it('다른 직원의 employeeId로는 본인 설정만 조회된다 (principalId 격리)', async () => {
      const OTHER_EMPLOYEE = 'employee-other'
      mockPrisma.proxySettings.findMany.mockResolvedValue([])

      await service.findMine(OTHER_EMPLOYEE)

      // 호출자의 employeeId가 그대로 principalId 필터로 사용되어야 한다
      expect(mockPrisma.proxySettings.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { principalId: OTHER_EMPLOYEE },
        }),
      )
    })

    it('결과가 createdAt 역순으로 정렬된다', async () => {
      mockPrisma.proxySettings.findMany.mockResolvedValue([baseSetting])

      await service.findMine(PRINCIPAL_ID)

      expect(mockPrisma.proxySettings.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      )
    })
  })

  // ── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto: CreateProxySettingDto = {
      proxyId: PROXY_ID,
      startDate: '2024-06-01',
      endDate: '2024-06-30',
      reason: '연차 사용',
    }

    it('정상적으로 대리결재 설정을 생성한다 (모든 필드 유효)', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseProxyEmployee)
      mockPrisma.proxySettings.create.mockResolvedValue(baseSetting)

      const result = await service.create(COMPANY_ID, PRINCIPAL_ID, baseDto)

      expect(result).toEqual(baseSetting)
      expect(mockPrisma.proxySettings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            principalId: PRINCIPAL_ID,
            proxyId: PROXY_ID,
            startDate: new Date('2024-06-01'),
            endDate: new Date('2024-06-30'),
            reason: '연차 사용',
          }),
        }),
      )
    })

    it('대리인 조회 시 companyId + isActive 조건으로 자사 재직자만 검증한다 (멀티테넌시)', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseProxyEmployee)
      mockPrisma.proxySettings.create.mockResolvedValue(baseSetting)

      await service.create(COMPANY_ID, PRINCIPAL_ID, baseDto)

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: PROXY_ID,
            companyId: COMPANY_ID,
            isActive: true,
          }),
        }),
      )
    })

    it('reason 미제공 시 null로 저장한다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseProxyEmployee)
      mockPrisma.proxySettings.create.mockResolvedValue(baseSetting)

      const { reason: _omit, ...dtoNoReason } = baseDto

      await service.create(COMPANY_ID, PRINCIPAL_ID, dtoNoReason as CreateProxySettingDto)

      expect(mockPrisma.proxySettings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reason: null }),
        }),
      )
    })

    it('시작일과 종료일이 같은 날짜여도 생성된다', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseProxyEmployee)
      mockPrisma.proxySettings.create.mockResolvedValue(baseSetting)

      await service.create(COMPANY_ID, PRINCIPAL_ID, {
        ...baseDto,
        startDate: '2024-06-10',
        endDate: '2024-06-10',
      })

      expect(mockPrisma.proxySettings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date('2024-06-10'),
            endDate: new Date('2024-06-10'),
          }),
        }),
      )
    })

    it('과거 시작일이어도 그대로 저장된다 (과거 차단 정책 없음)', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(baseProxyEmployee)
      mockPrisma.proxySettings.create.mockResolvedValue(baseSetting)

      await service.create(COMPANY_ID, PRINCIPAL_ID, {
        ...baseDto,
        startDate: '2020-01-01',
        endDate: '2020-01-31',
      })

      expect(mockPrisma.proxySettings.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startDate: new Date('2020-01-01') }),
        }),
      )
    })

    it('본인을 대리인으로 지정하면 BadRequestException(PROXY_SELF_NOT_ALLOWED)을 던진다', async () => {
      await expect(
        service.create(COMPANY_ID, PRINCIPAL_ID, { ...baseDto, proxyId: PRINCIPAL_ID }),
      ).rejects.toThrow(BadRequestException)

      // 본인 검증에서 즉시 실패 — 직원 조회로 진행하지 않는다
      expect(mockPrisma.employee.findFirst).not.toHaveBeenCalled()
      expect(mockPrisma.proxySettings.create).not.toHaveBeenCalled()
    })

    it('대리인이 다른 회사 소속이면 NotFoundException을 던진다', async () => {
      // companyId 불일치로 findFirst가 null 반환
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.create(COMPANY_ID, PRINCIPAL_ID, baseDto)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.proxySettings.create).not.toHaveBeenCalled()
    })

    it('대리인이 비활성(isActive=false) 직원이면 NotFoundException을 던진다', async () => {
      // isActive 조건 불충족으로 findFirst가 null 반환
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.create(COMPANY_ID, PRINCIPAL_ID, baseDto)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.proxySettings.create).not.toHaveBeenCalled()
    })
  })

  // ── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('endDate를 정상적으로 수정한다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.update.mockResolvedValue({
        ...baseSetting,
        endDate: new Date('2024-07-15'),
      })

      const dto: UpdateProxySettingDto = { endDate: '2024-07-15' }
      const result = await service.update(PRINCIPAL_ID, SETTING_ID, dto)

      expect(result.endDate).toEqual(new Date('2024-07-15'))
      expect(mockPrisma.proxySettings.update).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
        data: { endDate: new Date('2024-07-15') },
      })
    })

    it('isActive만 수정한다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.update.mockResolvedValue({ ...baseSetting, isActive: false })

      await service.update(PRINCIPAL_ID, SETTING_ID, { isActive: false })

      expect(mockPrisma.proxySettings.update).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
        data: { isActive: false },
      })
    })

    it('endDate와 isActive를 동시에 수정한다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.update.mockResolvedValue({
        ...baseSetting,
        isActive: false,
        endDate: new Date('2024-07-01'),
      })

      await service.update(PRINCIPAL_ID, SETTING_ID, {
        isActive: false,
        endDate: '2024-07-01',
      })

      expect(mockPrisma.proxySettings.update).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
        data: { isActive: false, endDate: new Date('2024-07-01') },
      })
    })

    it('소유 검증을 principalId + settingId 조건으로 수행한다 (본인 소유만 수정)', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.update.mockResolvedValue(baseSetting)

      await service.update(PRINCIPAL_ID, SETTING_ID, { isActive: true })

      expect(mockPrisma.proxySettings.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: SETTING_ID,
            principalId: PRINCIPAL_ID,
          }),
        }),
      )
    })

    it('다른 직원의 설정을 수정하려 하면 NotFoundException을 던진다', async () => {
      // principalId 불일치로 findFirst가 null 반환
      mockPrisma.proxySettings.findFirst.mockResolvedValue(null)

      await expect(
        service.update('employee-other', SETTING_ID, { isActive: false }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.proxySettings.update).not.toHaveBeenCalled()
    })

    it('존재하지 않는 settingId면 NotFoundException(PROXY_SETTING_NOT_FOUND)을 던진다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(null)

      await expect(
        service.update(PRINCIPAL_ID, 'nonexistent', { isActive: false }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.proxySettings.update).not.toHaveBeenCalled()
    })

    it('endDate를 startDate 이전 날짜로 수정하면 BadRequestException(PROXY_PERIOD_INVALID)을 던진다', async () => {
      // 기존 startDate는 2024-06-01 → endDate를 2024-05-01로 변경 시도
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)

      await expect(
        service.update(PRINCIPAL_ID, SETTING_ID, { endDate: '2024-05-01' }),
      ).rejects.toThrow(BadRequestException)
      expect(mockPrisma.proxySettings.update).not.toHaveBeenCalled()
    })

    it('endDate가 startDate와 같은 날짜면 통과한다 (경계값)', async () => {
      // startDate(2024-06-01)와 동일한 endDate는 허용
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.update.mockResolvedValue(baseSetting)

      await expect(
        service.update(PRINCIPAL_ID, SETTING_ID, { endDate: '2024-06-01' }),
      ).resolves.toBeDefined()
      expect(mockPrisma.proxySettings.update).toHaveBeenCalled()
    })
  })

  // ── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('본인 소유 설정을 삭제하고 { deleted: true }를 반환한다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.delete.mockResolvedValue(baseSetting)

      const result = await service.remove(PRINCIPAL_ID, SETTING_ID)

      expect(result).toEqual({ deleted: true })
      expect(mockPrisma.proxySettings.delete).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
      })
    })

    it('삭제 전 소유 검증을 principalId + settingId 조건으로 수행한다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(baseSetting)
      mockPrisma.proxySettings.delete.mockResolvedValue(baseSetting)

      await service.remove(PRINCIPAL_ID, SETTING_ID)

      expect(mockPrisma.proxySettings.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: SETTING_ID,
            principalId: PRINCIPAL_ID,
          }),
        }),
      )
    })

    it('다른 직원의 설정을 삭제하려 하면 NotFoundException을 던진다', async () => {
      // principalId 불일치로 findFirst가 null 반환
      mockPrisma.proxySettings.findFirst.mockResolvedValue(null)

      await expect(service.remove('employee-other', SETTING_ID)).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.proxySettings.delete).not.toHaveBeenCalled()
    })

    it('존재하지 않는 settingId면 NotFoundException을 던진다', async () => {
      mockPrisma.proxySettings.findFirst.mockResolvedValue(null)

      await expect(service.remove(PRINCIPAL_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      )
      expect(mockPrisma.proxySettings.delete).not.toHaveBeenCalled()
    })
  })
})
