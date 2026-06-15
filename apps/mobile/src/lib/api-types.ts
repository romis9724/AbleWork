import type { AccessLevel } from '@ablework/shared-constants'

/**
 * 모바일에서 사용하는 API 응답 타입 (웹 query 훅과 정합).
 * 서버 봉투({ success, data })는 api-client 인터셉터가 벗겨 data 만 전달한다.
 */

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface AttendanceBreak {
  id: string
  attendanceId: string
  breakType: string
  startAt: string
  endAt?: string | null
  isManual: boolean
}

export interface Attendance {
  id: string
  employeeId: string
  clockInAt: string
  clockOutAt?: string | null
  status: string
  isConfirmed: boolean
  note?: string | null
  employee?: { name: string }
  breaks?: AttendanceBreak[]
}

export interface MyTodayAttendance {
  attendance: (Attendance & { breaks: AttendanceBreak[] }) | null
  openBreak: AttendanceBreak | null
}

/** /attendances 목록 응답 — 배열 또는 { items } 봉투 모두 대응 */
export type AttendanceListResponse = { items?: Attendance[]; total?: number } | Attendance[]

export interface LeaveType {
  id: string
  name: string
  displayName?: string
  code?: string | null
  isActive: boolean
}

export interface LeaveBalance {
  id: string
  leaveTypeId: string
  year: number
  accruedDays: number
  usedDays: number
  remainingDays: number
  expiresAt?: string | null
  leaveType?: LeaveType
}

export interface RequestItem {
  id: string
  type: string
  status: string
  requesterId?: string
  payload: Record<string, unknown>
  createdAt: string
  requester?: { name: string }
  document?: { id: string; status: string }
}

export type RequestListResponse = { items?: RequestItem[]; total?: number } | RequestItem[]

export interface Employee {
  id: string
  name: string
  employeeNumber?: string
  phone?: string
  joinedAt: string
  employmentType: string
  accessLevel: AccessLevel
  isActive: boolean
  user?: { email: string }
  organizations?: { organization: { id: string; name: string }; isPrimary: boolean }[]
  positions?: { position: { id: string; name: string } }[]
}

export type StepRole =
  | 'APPROVER'
  | 'AGREEMENT'
  | 'REFERENCE'
  | 'VIEWER'
  | 'RECEIVER'
  | 'DEPT_COLLABORATOR'
  | 'DEPT_RECEIVER'

export type StepStatus =
  | 'PENDING'
  | 'WAITING'
  | 'APPROVED'
  | 'PRE_APPROVED'
  | 'PROXY_APPROVED'
  | 'REJECTED'
  | 'RETURNED'
  | 'CANCELLED'
  | 'SKIPPED'
  | 'VIEWED'
  | 'RECEIVED'
  | 'BOUNCED'

export type DocumentStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECALLED'

export interface DocumentListItem {
  id: string
  docNumber?: string | null
  title: string
  status: DocumentStatus
  submittedAt?: string | null
  form?: { id?: string; name: string } | null
  drafter?: { id?: string; name: string } | null
  mySteps?: { id: string; role: StepRole; status: StepStatus }[]
  currentApprover?: { id: string; name: string } | null
}

export interface DocumentListResponse {
  items: DocumentListItem[]
  total: number
  page: number
  limit: number
}

/** 결재 대기 문서함(box) 식별자 */
export type DocumentBox = 'pending_approval'

export interface NowAtWork {
  attendanceId: string
  employeeId: string
  employeeName: string
  organization: { name: string } | null
  clockInAt: string
  status: string
  workingStatus: string
  isOncall: boolean
}

export interface NowAtWorkResponse {
  total: number
  items: NowAtWork[]
}
