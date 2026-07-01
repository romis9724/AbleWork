// 근무일정 화면 순수 날짜 유틸·상수·폼 타입 (god file 분할 · 항목 24).
import type { ShiftType } from '@/lib/query/shifts'
import type { Employee } from '@/lib/query/employees'
import type { Organization } from '@/lib/query/organizations'

// ── 날짜 유틸 (로컬 기준) ─────────────────────────────────────────────────────
export const DOW = ['월', '화', '수', '목', '금', '토', '일'] as const
export const DAYS_PER_WEEK = 7
export const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
/** 해당 날짜가 속한 주의 월요일 */
export function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}
export function toHHMM(value: string): string {
  // 이미 HH:mm 이면 그대로, ISO/datetime 이면 로컬 시각으로 변환.
  if (TIME_REGEX.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function weekLabel(weekStart: Date): string {
  const end = addDays(weekStart, DAYS_PER_WEEK - 1)
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  const fmtShort = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  return `${fmt(weekStart)} – ${fmtShort(end)}`
}

/** 조직 트리를 깊이순 평탄화 (하위 부서까지 select에 노출) */
export function flattenOrgs(orgs: Organization[]): Organization[] {
  return orgs.flatMap((o) => [o, ...flattenOrgs(o.children ?? [])])
}

/** 근무유형 카테고리 → 로스터 칩 클래스(.day/.night/.remote/.leave) */
export function shiftCellClass(type?: ShiftType): string {
  const cat = (type?.category ?? '').toLowerCase()
  const name = (type?.name ?? '').toLowerCase()
  if (cat.includes('night') || name.includes('야간')) return 'night'
  if (cat.includes('remote') || name.includes('재택')) return 'remote'
  if (cat.includes('leave') || name.includes('휴') || name.includes('연차') || name.includes('반차')) return 'leave'
  return 'day'
}

// ── 폼 상태 ───────────────────────────────────────────────────────────────────
export interface ShiftForm {
  employeeId: string
  organizationId: string
  positionId: string
  date: string
  templateId: string
  startTime: string
  endTime: string
  shiftTypeId: string
}

export type AddTab = '템플릿 기준' | '조직 기준' | '직위 기준' | '직원 기준'

export function emptyForm(): ShiftForm {
  return {
    employeeId: '',
    organizationId: '',
    positionId: '',
    date: toLocalDateStr(new Date()),
    templateId: '',
    startTime: '',
    endTime: '',
    shiftTypeId: '',
  }
}

/** Employee.positionId 는 타입 선언에 없을 수 있어 안전하게 읽는다 */
export function readEmployeePositionId(emp: Employee): string | undefined {
  const value = (emp as Employee & { positionId?: string }).positionId
  return typeof value === 'string' ? value : undefined
}
