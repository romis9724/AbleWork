import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

/** FE camelCase 필드 ↔ DB (section, key) 매핑 */
export const SETTING_FIELD_MAP: Record<string, { section: string; key: string }> = {
  // 일반
  nightShiftStart: { section: 'general', key: 'night_work_start' },
  nightShiftEnd: { section: 'general', key: 'night_work_end' },
  weekStartDay: { section: 'general', key: 'week_start_day' },
  timeFormat: { section: 'general', key: 'time_format' },
  // 출퇴근
  noShiftClockPolicy: { section: 'attendance', key: 'allow_unscheduled' },
  lateGracePeriodMinutes: { section: 'attendance', key: 'late_grace_minutes' },
  earlyArrivalAllowedMinutes: { section: 'attendance', key: 'clockin_before_shift_minutes' },
  pcTimeclockEnabled: { section: 'attendance', key: 'pc_timeclock_enabled' },
  timeclockConfirmEnabled: { section: 'attendance', key: 'enable_confirmation' },
  // 근무일정
  shiftConfirmEnabled: { section: 'shift', key: 'enable_confirmation' },
  shiftTemplateCodeEnabled: { section: 'shift', key: 'template_code_enabled' },
  impliedWorkEnabled: { section: 'shift', key: 'deemed_work_enabled' },
  // 휴게시간
  autoBreakEnabled: { section: 'break', key: 'auto_break_enabled' },
  shiftBreakEnabled: { section: 'break', key: 'shift_break_enabled' },
  // 전자결재 (서비스 사용 설정)
  approvalServiceEnabled: { section: 'approval', key: 'enable_service' },
}

/**
 * 설정 기본값 (단일 출처 — 서비스/시드/문서 간 불일치 방지)
 * 키 형식: `${section}.${key}`
 */
export const SETTING_DEFAULTS: Record<string, unknown> = {
  'general.night_work_start': '22:00',
  'general.night_work_end': '06:00',
  'general.week_start_day': 'monday',
  'general.time_format': '24h',
  'attendance.allow_unscheduled': 'always', // always | if_no_shift | never
  'attendance.late_grace_minutes': 10,
  'attendance.clockin_before_shift_minutes': 30,
  'attendance.pc_timeclock_enabled': true,
  'attendance.enable_confirmation': true,
  'shift.enable_confirmation': true,
  'shift.template_code_enabled': false,
  'shift.deemed_work_enabled': false,
  'break.auto_break_enabled': false,
  'break.shift_break_enabled': false,
  'approval.enable_service': true, // 전자결재 서비스 기본 ON
}

const CACHE_TTL_MS = 60_000

interface CacheEntry {
  /** `${section}.${key}` → value */
  values: Map<string, unknown>
  expiresAt: number
}

/**
 * 회사 설정 읽기/쓰기 서비스 (CLAUDE.md §6 — 캐싱 필수)
 *
 * 사용 패턴:
 *   const grace = await this.settingsService.get<number>(companyId, 'attendance', 'late_grace_minutes', 10)
 */
@Injectable()
export class CompanySettingsService {
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly prisma: PrismaService) {}

  /** 단일 설정값 조회 (캐시 → DB → 기본값) */
  async get<T>(companyId: string, section: string, key: string, defaultValue?: T): Promise<T> {
    const values = await this.loadCompany(companyId)
    const raw = values.get(`${section}.${key}`)
    if (raw === undefined) {
      const fallback = defaultValue ?? (SETTING_DEFAULTS[`${section}.${key}`] as T)
      return fallback as T
    }
    return raw as T
  }

  /** 숫자 설정값 조회 (JSON value가 number가 아니면 기본값) */
  async getNumber(
    companyId: string,
    section: string,
    key: string,
    defaultValue: number,
  ): Promise<number> {
    const raw = await this.get<unknown>(companyId, section, key, defaultValue)
    const num = Number(raw)
    return Number.isFinite(num) ? num : defaultValue
  }

  /** FE 계약(camelCase 평면 객체)으로 전체 설정 반환 */
  async getAllForApi(companyId: string): Promise<Record<string, unknown>> {
    const values = await this.loadCompany(companyId)
    const result: Record<string, unknown> = {}
    for (const [field, { section, key }] of Object.entries(SETTING_FIELD_MAP)) {
      const dbKey = `${section}.${key}`
      result[field] = values.get(dbKey) ?? SETTING_DEFAULTS[dbKey] ?? null
    }
    return result
  }

  /** FE 계약(camelCase 부분 객체)으로 설정 일괄 저장 */
  async patchFromApi(
    companyId: string,
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const entries = Object.entries(patch).filter(
      ([field, value]) => SETTING_FIELD_MAP[field] !== undefined && value !== undefined,
    )

    await this.prisma.$transaction(
      entries.map(([field, value]) => {
        const { section, key } = SETTING_FIELD_MAP[field]
        return this.prisma.companySetting.upsert({
          where: { companyId_section_key: { companyId, section, key } },
          update: { value: value as Prisma.InputJsonValue },
          create: { companyId, section, key, value: value as Prisma.InputJsonValue },
        })
      }),
    )

    this.invalidate(companyId)
    return this.getAllForApi(companyId)
  }

  /** 캐시 무효화 (설정 변경 시) */
  invalidate(companyId: string): void {
    this.cache.delete(companyId)
  }

  private async loadCompany(companyId: string): Promise<Map<string, unknown>> {
    const cached = this.cache.get(companyId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.values
    }

    const rows = await this.prisma.companySetting.findMany({ where: { companyId } })
    const values = new Map<string, unknown>()
    for (const row of rows) {
      values.set(`${row.section}.${row.key}`, row.value)
    }

    this.cache.set(companyId, { values, expiresAt: Date.now() + CACHE_TTL_MS })
    return values
  }
}
