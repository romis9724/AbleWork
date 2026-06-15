import { apiClient } from './api-client'
import type {
  AuthTokens,
  Attendance,
  AttendanceListResponse,
  DocumentListResponse,
  Employee,
  LeaveBalance,
  NowAtWorkResponse,
  RequestItem,
  RequestListResponse,
} from './api-types'

/**
 * 화면에서 호출하는 타입드 API 함수 모음.
 * 모든 경로는 웹 me-화면이 호출하는 엔드포인트를 그대로 미러링한다.
 */

// ── 인증 ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string): Promise<AuthTokens> =>
    apiClient.post('/auth/login', { email, password }) as Promise<AuthTokens>,
  refresh: (refreshToken: string): Promise<AuthTokens> =>
    apiClient.post('/auth/refresh', { refreshToken }) as Promise<AuthTokens>,
  changePassword: (data: {
    currentPassword: string
    newPassword: string
    confirmPassword: string
  }): Promise<void> => apiClient.post('/auth/change-password', data) as Promise<void>,
}

// ── 근태 ────────────────────────────────────────────────────────────────────
export const attendanceApi = {
  clockIn: (lat: number, lng: number): Promise<Attendance> =>
    apiClient.post('/attendances/clock-in', { lat, lng, method: 'gps' }) as Promise<Attendance>,
  clockOut: (lat: number, lng: number): Promise<Attendance> =>
    apiClient.post('/attendances/clock-out', { lat, lng, method: 'gps' }) as Promise<Attendance>,
  /** 내 출퇴근 내역 — EMPLOYEE 는 서버에서 본인으로 강제 스코핑됨 */
  list: (params: Record<string, string | undefined>): Promise<AttendanceListResponse> =>
    apiClient.get('/attendances', { params }) as Promise<AttendanceListResponse>,
  /** 현재 근무 현황 (회사 기준) — 관리 화면 팀 현황 요약용 */
  nowAtWork: (): Promise<NowAtWorkResponse> =>
    apiClient.get('/attendances/now-at-work') as Promise<NowAtWorkResponse>,
}

// ── 휴가 ────────────────────────────────────────────────────────────────────
export const leaveApi = {
  balance: (employeeId: string): Promise<LeaveBalance[]> =>
    apiClient.get(`/leaves/balance/${employeeId}`) as Promise<LeaveBalance[]>,
}

// ── 요청 ────────────────────────────────────────────────────────────────────
export const requestApi = {
  list: (params?: Record<string, string | undefined>): Promise<RequestListResponse> =>
    apiClient.get('/requests', { params }) as Promise<RequestListResponse>,
  cancel: (id: string): Promise<unknown> => apiClient.post(`/requests/${id}/cancel`),
}

// ── 직원/프로필 ───────────────────────────────────────────────────────────────
export const employeeApi = {
  get: (id: string): Promise<Employee> => apiClient.get(`/employees/${id}`) as Promise<Employee>,
}

// ── 전자결재 (관리자) ───────────────────────────────────────────────────────────
export const approvalApi = {
  /** 결재 대기 문서함 — 내 PENDING 결재 단계가 있는 문서 목록 */
  pendingInbox: (page = 1, limit = 50): Promise<DocumentListResponse> =>
    apiClient.get('/documents', {
      params: { box: 'pending_approval', page, limit },
    }) as Promise<DocumentListResponse>,
  approveStep: (documentId: string, stepId: string, comment?: string): Promise<unknown> =>
    apiClient.post(`/documents/${documentId}/steps/${stepId}/approve`, { comment }),
  rejectStep: (documentId: string, stepId: string, comment?: string): Promise<unknown> =>
    apiClient.post(`/documents/${documentId}/steps/${stepId}/reject`, { comment }),
}

/** /attendances · /requests 목록 응답을 항상 배열로 정규화한다. */
export function unwrapList<T>(raw: { items?: T[] } | T[] | undefined | null): T[] {
  if (Array.isArray(raw)) return raw
  return raw?.items ?? []
}

export type { RequestItem }
