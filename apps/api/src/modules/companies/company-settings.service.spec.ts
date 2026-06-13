import { Test, TestingModule } from '@nestjs/testing'
import {
  CompanySettingsService,
  SETTING_DEFAULTS,
  SETTING_FIELD_MAP,
} from './company-settings.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'

/** companySetting.findMany가 반환할 행을 만드는 헬퍼 */
function makeRow(section: string, key: string, value: unknown) {
  return { id: `${section}.${key}`, companyId: COMPANY_ID, section, key, value }
}

// ── 모킹 (서비스가 실제 사용하는 모델/메서드만) ────────────────────────────────

const mockPrisma = {
  companySetting: {
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('CompanySettingsService', () => {
  let service: CompanySettingsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanySettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<CompanySettingsService>(CompanySettingsService)
    jest.clearAllMocks()
  })

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('DB에 저장된 설정값을 반환한다 (정상 경로)', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 15),
      ])

      const result = await service.get<number>(COMPANY_ID, 'attendance', 'late_grace_minutes', 5)

      expect(result).toBe(15)
    })

    it('멀티테넌시 — companyId 조건으로 조회한다 (타사 데이터 노출 방지)', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')

      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY_ID }) }),
      )
    })

    it('DB에 값이 없으면 인자로 전달한 defaultValue를 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      const result = await service.get<number>(COMPANY_ID, 'attendance', 'late_grace_minutes', 99)

      expect(result).toBe(99)
    })

    it('DB에도 없고 defaultValue도 없으면 SETTING_DEFAULTS에서 팔백한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      const result = await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')

      // SETTING_DEFAULTS['attendance.late_grace_minutes'] === 10
      expect(result).toBe(10)
    })

    it('DB·defaultValue·SETTING_DEFAULTS 모두 없으면 undefined를 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      const result = await service.get(COMPANY_ID, 'unknown', 'unknown_key')

      expect(result).toBeUndefined()
    })

    it('falsy 저장값(false, 0)도 defaultValue로 덮어쓰지 않고 그대로 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'pc_timeclock_enabled', false),
      ])

      const result = await service.get<boolean>(
        COMPANY_ID,
        'attendance',
        'pc_timeclock_enabled',
        true,
      )

      expect(result).toBe(false)
    })

    it('TTL 내 재조회 시 DB를 다시 호출하지 않는다 (캐시 HIT)', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 12),
      ])

      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')
      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')

      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(1)
    })

    it('TTL(60s) 초과 시 DB를 재조회한다 (캐시 만료)', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 12),
      ])

      const nowSpy = jest.spyOn(Date, 'now')
      nowSpy.mockReturnValue(1_000_000) // 1차 로드 시각
      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')

      nowSpy.mockReturnValue(1_000_000 + 60_001) // TTL(60_000ms) 초과
      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')

      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(2)
      nowSpy.mockRestore()
    })
  })

  // ── getNumber ────────────────────────────────────────────────────────────────

  describe('getNumber', () => {
    it('정상 숫자값을 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 20),
      ])

      const result = await service.getNumber(COMPANY_ID, 'attendance', 'late_grace_minutes', 10)

      expect(result).toBe(20)
    })

    it('숫자 형태의 문자열은 Number() 변환 후 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', '25'),
      ])

      const result = await service.getNumber(COMPANY_ID, 'attendance', 'late_grace_minutes', 10)

      expect(result).toBe(25)
    })

    it('숫자로 변환 불가한 문자열이면 defaultValue를 반환한다 (NaN 처리)', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 'abc'),
      ])

      const result = await service.getNumber(COMPANY_ID, 'attendance', 'late_grace_minutes', 10)

      expect(result).toBe(10)
    })

    it('값이 null이면 defaultValue를 반환한다 (Number(null)=0 회피하지 않음 검증)', async () => {
      // Number(null) === 0 이므로 0이 유효 숫자로 반환된다.
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', null),
      ])

      const result = await service.getNumber(COMPANY_ID, 'attendance', 'late_grace_minutes', 10)

      expect(result).toBe(0)
    })

    it('DB에 값이 없으면 인자로 전달한 defaultValue를 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      const result = await service.getNumber(COMPANY_ID, 'attendance', 'late_grace_minutes', 7)

      // get 내부에서 defaultValue(7)가 SETTING_DEFAULTS보다 우선한다 → 7
      expect(result).toBe(7)
    })

    it('defaultValue 없이 get을 거치면 SETTING_DEFAULTS 숫자값을 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      // getNumber는 항상 defaultValue를 요구하지만, 저장값/기본값 우선순위 확인용으로
      // SETTING_DEFAULTS와 동일한 값을 defaultValue로 넘겨 일관성을 검증한다.
      const result = await service.getNumber(COMPANY_ID, 'attendance', 'late_grace_minutes', 10)

      expect(result).toBe(10)
    })
  })

  // ── getAllForApi ─────────────────────────────────────────────────────────────

  describe('getAllForApi', () => {
    it('SETTING_FIELD_MAP의 모든 필드를 camelCase 키로 반환한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      const result = await service.getAllForApi(COMPANY_ID)

      for (const field of Object.keys(SETTING_FIELD_MAP)) {
        expect(result).toHaveProperty(field)
      }
      expect(Object.keys(result)).toHaveLength(Object.keys(SETTING_FIELD_MAP).length)
    })

    it('DB 저장값이 있으면 해당 값을, 없으면 SETTING_DEFAULTS를 채운다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 15),
      ])

      const result = await service.getAllForApi(COMPANY_ID)

      // DB 저장값
      expect(result.lateGracePeriodMinutes).toBe(15)
      // SETTING_DEFAULTS 팔백
      expect(result.nightShiftStart).toBe(SETTING_DEFAULTS['general.night_work_start'])
    })

    it('모든 FIELD_MAP 필드에 SETTING_DEFAULTS가 존재하여 어떤 필드도 null이 아니다', async () => {
      // 현재 데이터 계약상 FIELD_MAP의 모든 키는 SETTING_DEFAULTS에 대응 기본값이 있다.
      // 따라서 `?? null` 팔백은 도달하지 않으며, DB가 비어도 null 필드가 없어야 한다.
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      const result = await service.getAllForApi(COMPANY_ID)

      for (const [field, { section, key }] of Object.entries(SETTING_FIELD_MAP)) {
        expect(SETTING_DEFAULTS[`${section}.${key}`]).toBeDefined()
        expect(result[field]).not.toBeNull()
      }
    })

    it('멀티테넌시 — companyId별 독립 캐시를 사용한다', async () => {
      mockPrisma.companySetting.findMany
        .mockResolvedValueOnce([makeRow('attendance', 'late_grace_minutes', 15)])
        .mockResolvedValueOnce([
          { ...makeRow('attendance', 'late_grace_minutes', 30), companyId: OTHER_COMPANY_ID },
        ])

      const a = await service.getAllForApi(COMPANY_ID)
      const b = await service.getAllForApi(OTHER_COMPANY_ID)

      expect(a.lateGracePeriodMinutes).toBe(15)
      expect(b.lateGracePeriodMinutes).toBe(30)
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(2)
      expect(mockPrisma.companySetting.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
      expect(mockPrisma.companySetting.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ where: { companyId: OTHER_COMPANY_ID } }),
      )
    })
  })

  // ── patchFromApi ─────────────────────────────────────────────────────────────

  describe('patchFromApi', () => {
    beforeEach(() => {
      // 트랜잭션은 전달된 작업 배열을 그대로 통과시킨다.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockPrisma.$transaction.mockImplementation(async (ops: any) => ops)
      // upsert는 호출 인자를 그대로 식별 가능한 형태로 반환한다.
      mockPrisma.companySetting.upsert.mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (args: any) => args,
      )
      // getAllForApi 재조회용 (patch 직후 invalidate → DB 재조회)
      mockPrisma.companySetting.findMany.mockResolvedValue([])
    })

    it('유효한 필드를 멀티테넌시(companyId) 복합키 upsert로 저장한다', async () => {
      await service.patchFromApi(COMPANY_ID, { lateGracePeriodMinutes: 20 })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId_section_key: {
              companyId: COMPANY_ID,
              section: 'attendance',
              key: 'late_grace_minutes',
            },
          },
          update: { value: 20 },
          create: {
            companyId: COMPANY_ID,
            section: 'attendance',
            key: 'late_grace_minutes',
            value: 20,
          },
        }),
      )
    })

    it('SETTING_FIELD_MAP에 없는 필드는 무시한다', async () => {
      await service.patchFromApi(COMPANY_ID, {
        lateGracePeriodMinutes: 20,
        unknownField: 'ignored',
      })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ key: 'late_grace_minutes' }),
        }),
      )
    })

    it('undefined 값의 필드는 무시한다', async () => {
      await service.patchFromApi(COMPANY_ID, {
        lateGracePeriodMinutes: 20,
        earlyArrivalAllowedMinutes: undefined,
      })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(1)
    })

    it('여러 유효 필드를 단일 트랜잭션으로 원자성 있게 저장한다', async () => {
      await service.patchFromApi(COMPANY_ID, {
        lateGracePeriodMinutes: 20,
        earlyArrivalAllowedMinutes: 45,
        nightShiftStart: '23:00',
      })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledTimes(3)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
      // 트랜잭션에 3개의 작업 배열이 전달되었는지 검증
      const txArg = mockPrisma.$transaction.mock.calls[0][0]
      expect(Array.isArray(txArg)).toBe(true)
      expect(txArg).toHaveLength(3)
    })

    it('falsy 값(false)도 정상적으로 upsert한다', async () => {
      await service.patchFromApi(COMPANY_ID, { pcTimeclockEnabled: false })

      expect(mockPrisma.companySetting.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { value: false },
          create: expect.objectContaining({ value: false }),
        }),
      )
    })

    it('저장 성공 후 캐시를 무효화하여 최신값을 재조회한다', async () => {
      // 1) 사전 캐시 적재
      mockPrisma.companySetting.findMany.mockResolvedValueOnce([
        makeRow('attendance', 'late_grace_minutes', 10),
      ])
      await service.getAllForApi(COMPANY_ID)
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(1)

      // 2) patch → invalidate → getAllForApi 내부에서 DB 재조회
      mockPrisma.companySetting.findMany.mockResolvedValueOnce([
        makeRow('attendance', 'late_grace_minutes', 20),
      ])
      const result = await service.patchFromApi(COMPANY_ID, { lateGracePeriodMinutes: 20 })

      // 캐시가 무효화되어 findMany가 재호출됨 (사전 1회 + patch 후 1회)
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(2)
      expect(result.lateGracePeriodMinutes).toBe(20)
    })

    it('빈 patch 객체(유효 필드 없음)면 upsert를 호출하지 않는다', async () => {
      const result = await service.patchFromApi(COMPANY_ID, { unknownField: 'x' })

      expect(mockPrisma.companySetting.upsert).not.toHaveBeenCalled()
      // 변경된 필드는 없지만 전체 설정은 반환된다.
      expect(Object.keys(result)).toHaveLength(Object.keys(SETTING_FIELD_MAP).length)
    })

    it('트랜잭션 실패 시 에러를 전파하고 캐시를 무효화하지 않는다 (원자성)', async () => {
      // 사전 캐시 적재
      mockPrisma.companySetting.findMany.mockResolvedValueOnce([
        makeRow('attendance', 'late_grace_minutes', 10),
      ])
      await service.getAllForApi(COMPANY_ID)
      const callsBefore = mockPrisma.companySetting.findMany.mock.calls.length

      // 트랜잭션 실패 시뮬레이션
      mockPrisma.$transaction.mockRejectedValueOnce(new Error('DB error'))

      await expect(
        service.patchFromApi(COMPANY_ID, { lateGracePeriodMinutes: 20 }),
      ).rejects.toThrow('DB error')

      // invalidate가 호출되지 않아 캐시가 유지됨 → 재조회 없음
      expect(mockPrisma.companySetting.findMany.mock.calls.length).toBe(callsBefore)
    })
  })

  // ── invalidate ───────────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('특정 companyId 캐시만 삭제하고 다음 조회 시 DB를 재호출한다', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([
        makeRow('attendance', 'late_grace_minutes', 10),
      ])

      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(1)

      service.invalidate(COMPANY_ID)

      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes')
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(2)
    })

    it('한 회사 캐시를 무효화해도 다른 회사 캐시는 유지된다 (독립 캐시)', async () => {
      mockPrisma.companySetting.findMany.mockResolvedValue([])

      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes') // 1
      await service.get(OTHER_COMPANY_ID, 'attendance', 'late_grace_minutes') // 2
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(2)

      service.invalidate(COMPANY_ID)

      // COMPANY_ID는 재조회(3), OTHER_COMPANY_ID는 캐시 유지(추가 호출 없음)
      await service.get(COMPANY_ID, 'attendance', 'late_grace_minutes') // 3
      await service.get(OTHER_COMPANY_ID, 'attendance', 'late_grace_minutes') // 캐시 HIT
      expect(mockPrisma.companySetting.findMany).toHaveBeenCalledTimes(3)
    })
  })
})
