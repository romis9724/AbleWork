// 근태 관리 화면 순수 헬퍼·상수·타입 (god file 분할 · 항목 24).
import type { BadgeKind } from '@/components/ab/atoms'
import type { Attendance } from '@/lib/query/attendances'

// ── 상태 메타 ─────────────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<string, string> = {
  normal: '정상',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
  oncall: '무일정',
}
export const STATUS_BADGE: Record<string, BadgeKind> = {
  normal: 'b-done',
  late: 'b-wait',
  early_leave: 'b-submit',
  absent: 'b-reject',
  oncall: 'b-prog',
}
export const BREAK_TYPE_LABEL: Record<string, string> = { rest: '휴게', meal: '식사', other: '기타' }

// span bar window: 08:00 → 20:00
const SPAN_START = 8 * 60
const SPAN_END = 20 * 60
const SPAN_WIDTH = SPAN_END - SPAN_START

function minutesOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
export function spanStyle(clockInAt: string, clockOutAt?: string): { left: string; width: string } | null {
  const i = minutesOf(clockInAt)
  const o = clockOutAt ? minutesOf(clockOutAt) : SPAN_END
  const left = Math.max(0, ((i - SPAN_START) / SPAN_WIDTH) * 100)
  const right = Math.min(100, ((o - SPAN_START) / SPAN_WIDTH) * 100)
  if (right <= left) return null
  return { left: left + '%', width: right - left + '%' }
}
export function timeLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}
export function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' })
}
export function workDuration(clockInAt: string, clockOutAt?: string): string {
  if (!clockOutAt) return '근무중'
  const diff = (new Date(clockOutAt).getTime() - new Date(clockInAt).getTime()) / 1000 / 60
  if (diff < 0) return '—'
  return `${Math.floor(diff / 60)}h ${String(Math.floor(diff % 60)).padStart(2, '0')}m`
}
export function toDatetimeLocal(iso?: string | null): string {
  return iso ? iso.slice(0, 16) : ''
}
export function getThisMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
}

export interface EditForm {
  clockInAt: string
  clockOutAt: string
  status: string
  note: string
}
export interface BreakRow {
  id?: string
  breakType: string
  startAt: string
  endAt: string
}
export interface CreateForm {
  employeeId: string
  clockInAt: string
  clockOutAt: string
  status: string
  note: string
}
export const EMPTY_CREATE: CreateForm = { employeeId: '', clockInAt: '', clockOutAt: '', status: '', note: '' }

export function unwrap(raw: unknown): Attendance[] {
  if (Array.isArray(raw)) return raw as Attendance[]
  return ((raw as { items?: Attendance[] })?.items ?? []) as Attendance[]
}
