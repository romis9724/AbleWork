import { Test, TestingModule } from '@nestjs/testing'
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { EmployeesService } from './employees.service'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtPayload } from '../../common/types/jwt-payload.type'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const EMPLOYEE_ID = 'employee-1'

const makeRequester = (accessLevel: AccessLevel, employeeId = 'req-emp-1'): JwtPayload => ({
  sub: 'user-1',
  employeeId,
  companyId: COMPANY_ID,
  accessLevel,
})

const baseEmployee = {
  id: EMPLOYEE_ID,
  companyId: COMPANY_ID,
  userId: 'user-1',
  name: '홍길동',
  phone: '010-1234-5678',
  employeeNumber: 'E001',
  joinedAt: new Date('2024-01-01'),
  resignedAt: null,
  employmentType: 'regular',
  accessLevel: AccessLevel.EMPLOYEE,
  deviceId: 'device-abc',
  deviceBoundAt: new Date(),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  organizations: [{ organizationId: 'org-1' }],
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────

const mockPrisma = {
  employee: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  employeeOrganization: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  employeePosition: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  organization: {
    count: jest.fn(),
  },
  wageInfo: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(),
}

const mockEvents = { emit: jest.fn() }

// 기본값: org_admin_can_manage_employees = true (권한 허용)
const mockSettings = { get: jest.fn().mockResolvedValue(true) }

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('EmployeesService', () => {
  let service: EmployeesService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: CompanySettingsService, useValue: mockSettings },
      ],
    }).compile()

    service = module.get<EmployeesService>(EmployeesService)
    jest.clearAllMocks()
  })

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('존재하는 직원을 반환한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)

      const result = await service.findOne(COMPANY_ID, EMPLOYEE_ID, requester)
      expect(result).toEqual(baseEmployee)
      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: EMPLOYEE_ID, companyId: COMPANY_ID } }),
      )
    })

    it('존재하지 않으면 NotFoundException(EMPLOYEE_NOT_FOUND)을 던진다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(service.findOne(COMPANY_ID, EMPLOYEE_ID, requester)).rejects.toThrow(
        NotFoundException,
      )
    })

    it('ORG_ADMIN이 다른 조직 직원에 접근하면 ForbiddenException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN, 'req-emp-org-admin')
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...baseEmployee,
        organizations: [{ organizationId: 'org-999' }], // 다른 조직
      })
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
      ])

      await expect(service.findOne(COMPANY_ID, EMPLOYEE_ID, requester)).rejects.toThrow(
        ForbiddenException,
      )
    })

    it('ORG_ADMIN이 같은 조직 직원에 접근하면 성공한다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN, 'req-emp-org-admin')
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([
        { organizationId: 'org-1' },
      ])

      await expect(service.findOne(COMPANY_ID, EMPLOYEE_ID, requester)).resolves.toBeDefined()
    })
  })

  // ── deactivate ───────────────────────────────────────────────────────────────

  // ── findAll — ORG_ADMIN 조직 스코프 ─────────────────────────────────────────

  describe('findAll — ORG_ADMIN 조직 스코프', () => {
    it('ORG_ADMIN은 자신의 소속 조직 직원만 조회된다 (조직 필터 자동 적용)', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN, 'req-emp-org-admin')
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: 'org-1' }])
      mockPrisma.employee.findMany.mockResolvedValue([])
      mockPrisma.employee.count.mockResolvedValue(0)

      await service.findAll(COMPANY_ID, { page: 1, limit: 20 }, requester)

      const whereArg = mockPrisma.employee.findMany.mock.calls[0][0].where
      expect(whereArg.companyId).toBe(COMPANY_ID)
      expect(whereArg.organizations).toEqual({
        some: { organizationId: { in: ['org-1'] } },
      })
    })

    it('GENERAL_ADMIN은 조직 스코프 조건 없이 회사 전체 직원을 조회한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findMany.mockResolvedValue([baseEmployee])
      mockPrisma.employee.count.mockResolvedValue(1)

      await service.findAll(COMPANY_ID, { page: 1, limit: 20 }, requester)

      const whereArg = mockPrisma.employee.findMany.mock.calls[0][0].where
      expect(whereArg.companyId).toBe(COMPANY_ID)
      expect(whereArg.organizations).toBeUndefined()
      expect(mockPrisma.employeeOrganization.findMany).not.toHaveBeenCalled()
    })
  })

  describe('deactivate', () => {
    it('활성 직원을 퇴사 처리한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, isActive: false })

      const result = await service.deactivate(COMPANY_ID, EMPLOYEE_ID, '2024-12-31', requester)
      expect(result.isActive).toBe(false)
      expect(mockPrisma.employee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EMPLOYEE_ID },
          data: expect.objectContaining({ isActive: false }),
        }),
      )
    })

    it('이미 퇴사한 직원은 EMPLOYEE_ALREADY_DEACTIVATED 에러를 던진다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue({ ...baseEmployee, isActive: false })

      await expect(
        service.deactivate(COMPANY_ID, EMPLOYEE_ID, undefined, requester),
      ).rejects.toThrow(BadRequestException)
    })

    it('존재하지 않는 직원이면 NotFoundException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(null)

      await expect(
        service.deactivate(COMPANY_ID, 'nonexistent', undefined, requester),
      ).rejects.toThrow(NotFoundException)
    })

    it('권한 설정이 꺼져 있으면 ORG_ADMIN의 퇴사 처리를 차단한다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: 'org-1' }])
      mockSettings.get.mockResolvedValueOnce(false) // org_admin_can_manage_employees = false

      await expect(
        service.deactivate(COMPANY_ID, EMPLOYEE_ID, undefined, requester),
      ).rejects.toThrow(ForbiddenException)
      expect(mockSettings.get).toHaveBeenCalledWith(
        COMPANY_ID,
        'permission',
        'org_admin_can_manage_employees',
        true,
      )
    })

    it('권한 설정이 켜져 있으면 ORG_ADMIN도 퇴사 처리가 가능하다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: 'org-1' }])
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, isActive: false })

      const result = await service.deactivate(COMPANY_ID, EMPLOYEE_ID, undefined, requester)
      expect(result.isActive).toBe(false)
    })

    it('GENERAL_ADMIN은 권한 설정과 무관하게 퇴사 처리가 가능하다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, isActive: false })
      mockSettings.get.mockResolvedValue(false)

      const result = await service.deactivate(COMPANY_ID, EMPLOYEE_ID, undefined, requester)
      expect(result.isActive).toBe(false)
      mockSettings.get.mockResolvedValue(true) // 기본값 복원
    })
  })

  // ── activate ─────────────────────────────────────────────────────────────────

  describe('activate', () => {
    it('퇴사한 직원을 재활성화한다 (isActive=true, resignedAt=null)', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue({
        ...baseEmployee,
        isActive: false,
        resignedAt: new Date('2024-12-31'),
      })
      mockPrisma.employee.update.mockResolvedValue({
        ...baseEmployee,
        isActive: true,
        resignedAt: null,
      })

      const result = await service.activate(COMPANY_ID, EMPLOYEE_ID, requester)
      expect(result.isActive).toBe(true)
      expect(result.resignedAt).toBeNull()
      expect(mockPrisma.employee.update).toHaveBeenCalledWith({
        where: { id: EMPLOYEE_ID },
        data: { isActive: true, resignedAt: null },
      })
    })

    it('이미 재직 중인 직원은 EMPLOYEE_ALREADY_ACTIVE 에러를 던진다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee) // isActive: true

      await expect(service.activate(COMPANY_ID, EMPLOYEE_ID, requester)).rejects.toThrow(
        BadRequestException,
      )
      expect(mockPrisma.employee.update).not.toHaveBeenCalled()
    })
  })

  // ── update (권한 설정 enforcement) ──────────────────────────────────────────

  describe('update — 권한 설정 enforcement', () => {
    it('권한 설정이 꺼져 있으면 ORG_ADMIN의 타인 수정은 차단된다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: 'org-1' }])
      mockSettings.get.mockResolvedValueOnce(false)

      await expect(
        service.update(COMPANY_ID, EMPLOYEE_ID, { name: '새이름' }, requester),
      ).rejects.toThrow(ForbiddenException)
    })

    it('권한 설정이 꺼져 있어도 본인 이름/전화번호 수정은 허용된다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN, EMPLOYEE_ID)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([{ organizationId: 'org-1' }])
      mockSettings.get.mockResolvedValue(false)
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      )
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, name: '새이름' })

      const result = await service.update(COMPANY_ID, EMPLOYEE_ID, { name: '새이름' }, requester)
      expect(result.name).toBe('새이름')
      mockSettings.get.mockResolvedValue(true) // 기본값 복원
    })

    it('이름/전화번호 변경 시 연결된 User.name/phone도 같은 트랜잭션에서 동기화한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      )
      mockPrisma.employee.update.mockResolvedValue({
        ...baseEmployee,
        name: '김새이름',
        phone: '010-9999-0000',
      })
      mockPrisma.user.update.mockResolvedValue({})

      await service.update(
        COMPANY_ID,
        EMPLOYEE_ID,
        { name: '김새이름', phone: '010-9999-0000' },
        requester,
      )

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: baseEmployee.userId },
        data: { name: '김새이름', phone: '010-9999-0000' },
      })
    })

    it('이름/전화번호가 아닌 필드만 변경하면 User 동기화를 호출하지 않는다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.$transaction.mockImplementation(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma),
      )
      mockPrisma.employee.update.mockResolvedValue({ ...baseEmployee, employeeNumber: 'E002' })

      await service.update(COMPANY_ID, EMPLOYEE_ID, { employeeNumber: 'E002' }, requester)

      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })
  })

  // ── resetDevice ──────────────────────────────────────────────────────────────

  describe('resetDevice', () => {
    it('deviceId와 deviceBoundAt을 null로 초기화한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.employee.update.mockResolvedValue({
        ...baseEmployee,
        deviceId: null,
        deviceBoundAt: null,
      })

      const result = await service.resetDevice(COMPANY_ID, EMPLOYEE_ID, requester)
      expect(result.deviceId).toBeNull()
      expect(result.deviceBoundAt).toBeNull()
    })
  })

  // ── findWageInfos ────────────────────────────────────────────────────────────

  describe('findWageInfos', () => {
    it('직원의 근로정보 목록을 반환한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      const wageInfos = [
        {
          id: 'wi-1',
          employeeId: EMPLOYEE_ID,
          hourlyWage: 10000,
          contractedWorkDays: 'MON,TUE,WED,THU,FRI',
          contractedHoursPerWeek: 40,
          weeklyPaidHolidayDay: 'SUN',
          maxHoursPerWeek: 52,
          effectiveFrom: new Date('2024-01-01'),
          createdAt: new Date(),
        },
      ]
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.wageInfo.findMany.mockResolvedValue(wageInfos)

      const result = await service.findWageInfos(COMPANY_ID, EMPLOYEE_ID, requester)
      expect(result).toEqual(wageInfos)
      expect(mockPrisma.wageInfo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { employeeId: EMPLOYEE_ID } }),
      )
    })
  })

  // ── createWageInfo ───────────────────────────────────────────────────────────

  describe('createWageInfo', () => {
    it('근로정보를 생성한다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      const dto = {
        hourlyWage: 12000,
        contractedWorkDays: 'MON,TUE,WED,THU,FRI',
        contractedHoursPerWeek: 40,
        weeklyPaidHolidayDay: 'SUN',
        maxHoursPerWeek: 52,
        effectiveFrom: '2024-06-01',
      }
      mockPrisma.employee.findFirst.mockResolvedValue(baseEmployee)
      mockPrisma.wageInfo.create.mockResolvedValue({ id: 'wi-new', employeeId: EMPLOYEE_ID, ...dto })

      const result = await service.createWageInfo(COMPANY_ID, EMPLOYEE_ID, dto, requester)
      expect(result.hourlyWage).toBe(12000)
      expect(mockPrisma.wageInfo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ employeeId: EMPLOYEE_ID, hourlyWage: 12000 }),
        }),
      )
    })
  })

  // ── guardOrgScope ────────────────────────────────────────────────────────────

  describe('guardOrgScope', () => {
    it('SUPER_ADMIN은 모든 직원에 접근 가능하다', async () => {
      const requester = makeRequester(AccessLevel.SUPER_ADMIN)
      await expect(
        service.guardOrgScope(requester, { organizations: [{ organizationId: 'any-org' }] }),
      ).resolves.toBeUndefined()
    })

    it('GENERAL_ADMIN은 모든 직원에 접근 가능하다', async () => {
      const requester = makeRequester(AccessLevel.GENERAL_ADMIN)
      await expect(
        service.guardOrgScope(requester, { organizations: [{ organizationId: 'any-org' }] }),
      ).resolves.toBeUndefined()
    })

    it('ORG_ADMIN이 소속 조직과 겹치지 않으면 ForbiddenException을 던진다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([
        { organizationId: 'org-mine' },
      ])

      await expect(
        service.guardOrgScope(requester, { organizations: [{ organizationId: 'org-other' }] }),
      ).rejects.toThrow(ForbiddenException)
    })

    it('ORG_ADMIN이 소속 조직과 겹치면 통과한다', async () => {
      const requester = makeRequester(AccessLevel.ORG_ADMIN)
      mockPrisma.employeeOrganization.findMany.mockResolvedValue([
        { organizationId: 'org-shared' },
      ])

      await expect(
        service.guardOrgScope(requester, { organizations: [{ organizationId: 'org-shared' }] }),
      ).resolves.toBeUndefined()
    })
  })
})
