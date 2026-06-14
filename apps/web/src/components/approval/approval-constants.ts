import type { DocumentStatus, StepRole, StepStatus, DocumentBox } from '@/lib/query/documents'

/** 문서 상태 라벨 */
export const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: '임시저장',
  PENDING: '진행중',
  APPROVED: '승인',
  REJECTED: '반려',
  RECALLED: '회수',
}

/** 문서 상태 칩 색 (배경/글자) — DRAFT 회색 / PENDING 주황 / APPROVED 초록 / REJECTED 빨강 / RECALLED 보라 */
export const DOC_STATUS_STYLE: Record<DocumentStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: '#eeeeee', fg: '#616161' },
  PENDING: { bg: '#fff3e0', fg: '#e65100' },
  APPROVED: { bg: '#e8f5e9', fg: '#2e7d32' },
  REJECTED: { bg: '#ffebee', fg: '#c62828' },
  RECALLED: { bg: '#f3e5f5', fg: '#7b1fa2' },
}

/** 결재선 역할 라벨 */
export const STEP_ROLE_LABEL: Record<StepRole, string> = {
  APPROVER: '결재',
  AGREEMENT: '협조',
  REFERENCE: '참조',
  VIEWER: '공람',
  RECEIVER: '수신',
  DEPT_COLLABORATOR: '부서협조',
  DEPT_RECEIVER: '부서수신',
}

export const STEP_ROLE_OPTIONS: { value: StepRole; label: string }[] = [
  { value: 'APPROVER', label: '결재' },
  { value: 'AGREEMENT', label: '협조' },
  { value: 'REFERENCE', label: '참조' },
  { value: 'VIEWER', label: '공람' },
  { value: 'RECEIVER', label: '수신' },
  { value: 'DEPT_COLLABORATOR', label: '부서협조' },
  { value: 'DEPT_RECEIVER', label: '부서수신' },
]

/** 부서로 라우팅되는 역할 — 직원 대신 부서(조직)를 선택 */
export const DEPT_STEP_ROLES: StepRole[] = ['DEPT_COLLABORATOR', 'DEPT_RECEIVER']
export const isDeptRole = (role: StepRole): boolean => DEPT_STEP_ROLES.includes(role)

/** 결재 단계 상태 라벨 */
export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  PENDING: '대기',
  WAITING: '예정',
  APPROVED: '승인',
  PRE_APPROVED: '전결',
  PROXY_APPROVED: '대결',
  REJECTED: '반려',
  RETURNED: '전단계 반려',
  CANCELLED: '취소됨',
  SKIPPED: '생략',
  VIEWED: '확인',
  RECEIVED: '수신완료',
  BOUNCED: '반송',
}

/** 결재 단계 상태 칩 색 */
export const STEP_STATUS_STYLE: Record<StepStatus, { bg: string; fg: string }> = {
  PENDING: { bg: '#fff3e0', fg: '#e65100' },
  WAITING: { bg: '#f5f5f5', fg: '#9e9e9e' },
  APPROVED: { bg: '#e8f5e9', fg: '#2e7d32' },
  PRE_APPROVED: { bg: '#e8f5e9', fg: '#1b5e20' },
  PROXY_APPROVED: { bg: '#e0f2f1', fg: '#00695c' },
  REJECTED: { bg: '#ffebee', fg: '#c62828' },
  RETURNED: { bg: '#ffebee', fg: '#ad1457' },
  CANCELLED: { bg: '#eeeeee', fg: '#9e9e9e' },
  SKIPPED: { bg: '#eeeeee', fg: '#9e9e9e' },
  VIEWED: { bg: '#e3f2fd', fg: '#1565c0' },
  RECEIVED: { bg: '#e3f2fd', fg: '#0d47a1' },
  BOUNCED: { bg: '#fce4ec', fg: '#ad1457' },
}

/** 직원용 문서함 탭 정의 */
export const BOX_TABS: { value: Exclude<DocumentBox, 'ledger'>; label: string }[] = [
  { value: 'draft', label: '기안함' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'pending_approval', label: '결재함' },
  { value: 'reference', label: '참조' },
  { value: 'viewer', label: '공람' },
  { value: 'receiver', label: '수신' },
  { value: 'dept-docs', label: '부서함' },
]

/** 문서 이력 액션 라벨 (미정의 액션은 원문 표기) */
export const HISTORY_ACTION_LABEL: Record<string, string> = {
  CREATE: '기안 작성',
  SUBMIT: '상신',
  APPROVE: '승인',
  PRE_APPROVE: '전결',
  PROXY_APPROVE: '대결',
  REJECT: '반려',
  RETURN_PREV: '전단계 반려',
  CANCEL_APPROVAL: '결재 취소',
  RECALL: '회수',
  AGREE: '협조',
  VIEW: '공람 확인',
  RECEIVE: '수신 처리',
  DEPT_COLLAB: '부서협조',
  BOUNCE: '부서수신 반송',
}

export const dateTimeText = (value?: string | null) =>
  value ? new Date(value).toLocaleString('ko-KR') : '—'

export const dateText = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('ko-KR') : '—'
