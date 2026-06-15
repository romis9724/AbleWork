import { colors } from './theme'

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

export interface BadgeStyle {
  bg: string
  fg: string
}

export const BADGE_TONES: Record<BadgeTone, BadgeStyle> = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: colors.neutralSoft, fg: colors.neutral },
  brand: { bg: colors.brandSoft, fg: colors.brand },
}

// ── 출퇴근 상태 ────────────────────────────────────────────────────────────────
export const ATTENDANCE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  normal: { label: '정상', tone: 'success' },
  late: { label: '지각', tone: 'warning' },
  early_leave: { label: '조퇴', tone: 'warning' },
  absent: { label: '결근', tone: 'danger' },
  oncall: { label: '무일정', tone: 'info' },
  deemed_work: { label: '간주근무', tone: 'info' },
  remote: { label: '재택', tone: 'info' },
}

export function attendanceBadge(status: string): { label: string; tone: BadgeTone } {
  return ATTENDANCE_STATUS[status] ?? { label: status, tone: 'neutral' }
}

// ── 요청 유형 ──────────────────────────────────────────────────────────────────
export const REQUEST_TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  LEAVE_MODIFY: '휴가 수정',
  LEAVE_DELETE: '휴가 취소',
  SHIFT_CREATE: '근무일정 신청',
  SHIFT_MODIFY: '근무일정 수정',
  SHIFT_DELETE: '근무일정 삭제',
  ATTENDANCE_EDIT: '출퇴근 정정',
  ATTENDANCE_CREATE: '기록 생성',
  ATTENDANCE_DELETE: '기록 삭제',
  DEVICE_CHANGE: '기기 변경',
  OFFSITE_WORK: '외근/출장',
  CUSTOM: '기타 요청',
}

export function requestTypeLabel(type: string): string {
  return REQUEST_TYPE_LABEL[type] ?? type
}

// ── 요청 상태 ──────────────────────────────────────────────────────────────────
export const REQUEST_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: '대기중', tone: 'warning' },
  APPROVED: { label: '승인', tone: 'success' },
  FORCE_APPROVED: { label: '강제승인', tone: 'success' },
  REJECTED: { label: '거절', tone: 'danger' },
  FORCE_REJECTED: { label: '강제거절', tone: 'danger' },
  CANCELLED: { label: '취소', tone: 'neutral' },
}

export function requestStatusBadge(status: string): { label: string; tone: BadgeTone } {
  return REQUEST_STATUS[status] ?? { label: status, tone: 'neutral' }
}

// ── 문서 상태 ──────────────────────────────────────────────────────────────────
export const DOC_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: '임시저장', tone: 'neutral' },
  PENDING: { label: '결재중', tone: 'info' },
  APPROVED: { label: '승인', tone: 'success' },
  REJECTED: { label: '반려', tone: 'danger' },
  RECALLED: { label: '회수', tone: 'neutral' },
}

export function docStatusBadge(status: string): { label: string; tone: BadgeTone } {
  return DOC_STATUS[status] ?? { label: status, tone: 'neutral' }
}

// ── 고용 형태 ──────────────────────────────────────────────────────────────────
export const EMPLOYMENT_LABEL: Record<string, string> = {
  REGULAR: '정규직',
  CONTRACT: '계약직',
  PART_TIME: '파트타임',
  INTERN: '인턴',
  DAILY: '일용직',
}

// ── 날짜/시간 포맷 ──────────────────────────────────────────────────────────────
export function timeLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function dateLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

export function shortDate(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ko-KR')
}
