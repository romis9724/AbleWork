import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from './company-settings.service'
import {
  PermissionSettingsService,
  ORG_ADMIN_PERMISSION_FIELDS,
  EMPLOYEE_PERMISSION_FIELDS,
} from './permission-settings.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const PERMISSION_SECTION = 'permission'

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스는 쓰기 시 prisma.companySetting.upsert + $transaction 만 사용한다.
// 읽기는 전부 CompanySettingsService.get 에 위임하므로 prisma 직접 호출이 없다.

const mockPrisma = {
  companySetting: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
}

// CompanySettingsService 모킹 — get / invalidate 만 사용
const mockSettings = {
  get: jest.fn(),
  invalidate: jest.fn(),
}

/**
 * settingsService.get 기본 동작: (companyId, section, key, defaultValue) →
 * 저장된 값이 없으므로 defaultValue 그대로 반환한다.
 * 특정 키만 다른 값을 주고 싶을 때는 overrides 맵을 사용한다.
 */
const setupGetDefaults = (overrides: Record<string, unknown> = {}): void => {
  mockSettings.get.mockImplementation(
    (_companyId: string, _section: string, key: string, defaultValue: unknown) =>
      Promise.resolve(key in overrides ? overrides[key] : defaultValue),
  )
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('PermissionSettingsService', () => {
  let service: PermissionSettingsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CompanySettingsService, useValue: mockSettings },
      ],
    }).compile()

    service = module.get<PermissionSettingsService>(PermissionSettingsService)
    jest.clearAllMocks()
  })

  // ── getForApi ──────────────────────────────────────────────────────────────

  describe('getForApi', () => {
    it('orgAdmin/employee 두 그룹의 모든 필드를 기본값으로 반환한다', async () => {
      setupGetDefaults()

      const result = await service.getForApi(COMPANY_ID)

      // orgAdmin 7개 필드 — 전부 기본값 true
      expect(result.orgAdmin).toEqual({
        employee_manage: true,
        employee_device_reset: true,
        work_info_manage: true,
        shift_manage: true,
        shift_template_manage: true,
        leave_manage: true,
        attendance_manage: true,
      })
      // employee 3개 필드 — org_view_all/shift_view_others 는 false, attendance_view 만 true
      expect(result.employee).toEqual({
        org_view_all: false,
        shift_view_others: false,
        attendance_view: true,
      })
    })

    it('필드 개수만큼 settingsService.get 을 호출한다 (orgAdmin 7 + employee 3 = 10회)', async () => {
      setupGetDefaults()

      await service.getForApi(COMPANY_ID)

      const orgAdminCount = Object.keys(ORG_ADMIN_PERMISSION_FIELDS).length
      const employeeCount = Object.keys(EMPLOYEE_PERMISSION_FIELDS).length
      expect(mockSettings.get).toHaveBeenCalledTimes(orgAdminCount + employeeCount)
      expect(orgAdminCount).toBe(7)
      expect(employeeCount).toBe(3)
    })

    it('멀티테넌시 — 모든 조회가 호출자의 companyId 로 격리된다', async () => {
      setupGetDefaults()

      await service.getForApi(COMPANY_ID)

      // 모든 get 호출의 첫 인자가 companyId 여야 한다 (타사 데이터 노출 방지)
      const calls = mockSettings.get.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) {
        expect(call[0]).toBe(COMPANY_ID)
        // 두 번째 인자는 항상 'permission' 섹션
        expect(call[1]).toBe(PERMISSION_SECTION)
      }
    })

    it('멀티테넌시 — 다른 companyId 로는 해당 회사 컨텍스트로만 조회한다', async () => {
      setupGetDefaults()

      await service.getForApi(OTHER_COMPANY_ID)

      for (const call of mockSettings.get.mock.calls) {
        expect(call[0]).toBe(OTHER_COMPANY_ID)
      }
    })

    it('각 필드는 매핑된 DB key 로 조회된다 (orgAdmin: employee_manage → org_admin_can_manage_employees)', async () => {
      setupGetDefaults()

      await service.getForApi(COMPANY_ID)

      expect(mockSettings.get).toHaveBeenCalledWith(
        COMPANY_ID,
        PERMISSION_SECTION,
        'org_admin_can_manage_employees',
        true,
      )
      expect(mockSettings.get).toHaveBeenCalledWith(
        COMPANY_ID,
        PERMISSION_SECTION,
        'employee_can_view_all_orgs',
        false,
      )
    })

    it('DB에 boolean true 가 저장되어 있으면 그 값을 반영한다', async () => {
      setupGetDefaults({ employee_can_view_all_orgs: true })

      const result = await service.getForApi(COMPANY_ID)

      expect(result.employee.org_view_all).toBe(true)
    })

    it('DB에 boolean false 가 저장되어 있으면 그 값을 반영한다', async () => {
      setupGetDefaults({ org_admin_can_manage_employees: false })

      const result = await service.getForApi(COMPANY_ID)

      expect(result.orgAdmin.employee_manage).toBe(false)
    })

    it('타입 강제 방어 — DB 값이 문자열 "true" 면 boolean 이 아니므로 기본값을 사용한다', async () => {
      // 문자열 'true' 는 truthy 지만 typeof !== 'boolean' → defaultValue(true) 로 폴백
      setupGetDefaults({ org_admin_can_manage_employees: 'true' })

      const result = await service.getForApi(COMPANY_ID)

      // 기본값 true 와 동일하므로, false 기본값 필드로 강제 검증
      setupGetDefaults({ employee_can_view_all_orgs: 'true' })
      const result2 = await service.getForApi(COMPANY_ID)

      expect(result.orgAdmin.employee_manage).toBe(true)
      // 기본값 false 인 필드에 문자열 'true' 가 들어와도 boolean 아니므로 false 유지
      expect(result2.employee.org_view_all).toBe(false)
    })

    it('타입 강제 방어 — DB 값이 숫자 1 이면 boolean 이 아니므로 기본값을 사용한다', async () => {
      setupGetDefaults({ employee_can_view_all_orgs: 1 })

      const result = await service.getForApi(COMPANY_ID)

      // 숫자 1 은 truthy 지만 boolean 아님 → 기본값 false 유지
      expect(result.employee.org_view_all).toBe(false)
    })

    it('타입 강제 방어 — DB 값이 null 이면 기본값을 사용한다', async () => {
      setupGetDefaults({ org_admin_can_manage_employees: null })

      const result = await service.getForApi(COMPANY_ID)

      expect(result.orgAdmin.employee_manage).toBe(true)
    })
  })

  // ── patchFromApi ─────────────────────────────────────────────────────────────

  describe('patchFromApi', () => {
    beforeEach(() => {
      // $transaction 은 전달된 upsert 배열을 그대로 resolve 한다고 가정
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (ops: any) => ops)
      // upsert 는 placeholder 객체를 반환 (실제로는 PrismaPromise)
      mockPrisma.companySetting.upsert.mockImplementation((args: unknown) => args)
    })

    it('orgAdmin 일부 필드만 패치하면 해당 필드만 upsert 한다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { orgAdmin: { employee_manage: false } })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId_section_key: {
              companyId: COMPANY_ID,
              section: PERMISSION_SECTION,
              key: 'org_admin_can_manage_employees',
            },
          },
          update: { value: false },
          create: {
            companyId: COMPANY_ID,
            section: PERMISSION_SECTION,
            key: 'org_admin_can_manage_employees',
            value: false,
          },
        }),
      )
    })

    it('employee 일부 필드만 패치하면 해당 필드만 upsert 한다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { employee: { org_view_all: true } })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId_section_key: {
              companyId: COMPANY_ID,
              section: PERMISSION_SECTION,
              key: 'employee_can_view_all_orgs',
            },
          },
          update: { value: true },
        }),
      )
    })

    it('orgAdmin + employee 필드를 한 트랜잭션으로 함께 upsert 한다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, {
        orgAdmin: { leave_manage: false },
        employee: { attendance_view: false },
      })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(2)
      // 단일 $transaction 호출에 두 upsert 가 묶여야 한다 (원자성)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txArg = mockPrisma.$transaction.mock.calls[0][0] as any[]
      expect(txArg).toHaveLength(2)
    })

    it('멀티테넌시 — upsert where 의 복합키에 호출자 companyId 가 포함된다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { orgAdmin: { shift_manage: true } })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId_section_key: expect.objectContaining({ companyId: COMPANY_ID }),
          }),
        }),
      )
    })

    it('멀티테넌시 — 다른 companyId 패치는 그 회사 키로만 저장된다', async () => {
      setupGetDefaults()

      await service.patchFromApi(OTHER_COMPANY_ID, { orgAdmin: { shift_manage: true } })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId_section_key: expect.objectContaining({ companyId: OTHER_COMPANY_ID }),
          }),
          create: expect.objectContaining({ companyId: OTHER_COMPANY_ID }),
        }),
      )
    })

    it('upsert create 절에 companyId/section/key/value 가 모두 포함된다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { orgAdmin: { work_info_manage: false } })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: {
            companyId: COMPANY_ID,
            section: PERMISSION_SECTION,
            key: 'org_admin_can_manage_work_info',
            value: false,
          },
        }),
      )
    })

    it('upsert update 절은 value 만 갱신한다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { employee: { shift_view_others: true } })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arg = mockPrisma.companySetting.upsert.mock.calls[0][0] as any
      expect(arg.update).toEqual({ value: true })
    })

    it('변경 사항이 있으면 트랜잭션 후 캐시를 무효화한다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { orgAdmin: { employee_manage: false } })

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      expect(mockSettings.invalidate).toHaveBeenCalledWith(COMPANY_ID)
    })

    it('빈 패치({orgAdmin:{}, employee:{}}) 면 트랜잭션도 무효화도 실행하지 않는다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, { orgAdmin: {}, employee: {} })

      expect(mockPrisma.companySetting.upsert).not.toHaveBeenCalled()
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      expect(mockSettings.invalidate).not.toHaveBeenCalled()
    })

    it('패치 객체가 비어도({}) 안전하게 동작한다 (no-op)', async () => {
      setupGetDefaults()

      const result = await service.patchFromApi(COMPANY_ID, {})

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
      // 그래도 최신 상태를 읽어 반환한다
      expect(result.orgAdmin).toBeDefined()
      expect(result.employee).toBeDefined()
    })

    it('알 수 없는 필드명은 조용히 필터링된다 (화이트리스트 외 키 무시)', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, {
        orgAdmin: { employee_manage: true, bogus_field: true },
        employee: { not_a_real_field: false },
      })

      // 유효한 employee_manage 1건만 upsert
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ key: 'org_admin_can_manage_employees' }),
        }),
      )
    })

    it('undefined 값은 필터링된다 (Zod optional 미전달 필드)', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, {
        orgAdmin: { employee_manage: undefined, leave_manage: true },
      })

      // employee_manage(undefined) 는 무시, leave_manage 만 upsert
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ key: 'org_admin_can_manage_leaves' }),
        }),
      )
    })

    it('boolean 이 아닌 값은 타입 가드로 필터링된다', async () => {
      setupGetDefaults()

      await service.patchFromApi(COMPANY_ID, {
        // 런타임 방어 검증을 위해 잘못된 타입을 의도적으로 주입
        orgAdmin: { employee_manage: 'yes' as unknown as boolean, shift_manage: true },
      })

      // 문자열 'yes' 는 제외, boolean true 인 shift_manage 만 upsert
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ key: 'org_admin_can_manage_shifts' }),
        }),
      )
    })

    it('패치 후 getForApi 로 최신 상태(메모리 캐시가 아닌 재조회)를 반환한다', async () => {
      // 패치한 값이 그대로 반영되도록 get override 를 구성
      setupGetDefaults({ org_admin_can_manage_employees: false })

      const result = await service.patchFromApi(COMPANY_ID, {
        orgAdmin: { employee_manage: false },
      })

      // 반환값은 settingsService.get 을 통한 재조회 결과
      expect(result.orgAdmin.employee_manage).toBe(false)
    })

    it('각 orgAdmin 필드가 개별적으로 올바른 DB key 로 매핑된다', async () => {
      setupGetDefaults()

      const expectedMap: Record<string, string> = {
        employee_manage: 'org_admin_can_manage_employees',
        employee_device_reset: 'org_admin_can_reset_devices',
        work_info_manage: 'org_admin_can_manage_work_info',
        shift_manage: 'org_admin_can_manage_shifts',
        shift_template_manage: 'org_admin_can_manage_shift_templates',
        leave_manage: 'org_admin_can_manage_leaves',
        attendance_manage: 'org_admin_can_manage_attendances',
      }

      for (const [field, expectedKey] of Object.entries(expectedMap)) {
        jest.clearAllMocks()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockPrisma.$transaction.mockImplementation(async (ops: any) => ops)
        mockPrisma.companySetting.upsert.mockImplementation((args: unknown) => args)
        setupGetDefaults()

        await service.patchFromApi(COMPANY_ID, { orgAdmin: { [field]: true } })

        expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({ key: expectedKey }),
          }),
        )
      }
    })

    it('각 employee 필드가 개별적으로 올바른 DB key 로 매핑된다', async () => {
      const expectedMap: Record<string, string> = {
        org_view_all: 'employee_can_view_all_orgs',
        shift_view_others: 'employee_can_view_others_shifts',
        attendance_view: 'employee_can_view_attendance',
      }

      for (const [field, expectedKey] of Object.entries(expectedMap)) {
        jest.clearAllMocks()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockPrisma.$transaction.mockImplementation(async (ops: any) => ops)
        mockPrisma.companySetting.upsert.mockImplementation((args: unknown) => args)
        setupGetDefaults()

        await service.patchFromApi(COMPANY_ID, { employee: { [field]: false } })

        expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({ key: expectedKey }),
          }),
        )
      }
    })

    it('트랜잭션이 실패하면 에러를 전파하고 캐시를 무효화하지 않는다 (원자성)', async () => {
      setupGetDefaults()
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('tx failed'))

      await expect(
        service.patchFromApi(COMPANY_ID, { orgAdmin: { employee_manage: false } }),
      ).rejects.toThrow('tx failed')

      // 트랜잭션이 실패했으므로 invalidate 는 호출되지 않아야 한다
      expect(mockSettings.invalidate).not.toHaveBeenCalled()
    })
  })
})
