/**
 * 전자결재 모듈 상수 (FE API 계약과 동일한 대문자 role/status 사용)
 *
 * 주의: shared-constants의 ApprovalStepRole(소문자)과 다름 —
 * Phase 2 FE 계약이 대문자 role을 사용하므로 본 모듈에서는 이 상수를 사용한다.
 */

export const DocStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RECALLED: 'RECALLED',
  CANCELLED: 'CANCELLED',
} as const

export type DocStatus = (typeof DocStatus)[keyof typeof DocStatus]

export const StepRole = {
  APPROVER: 'APPROVER',
  AGREEMENT: 'AGREEMENT',
  REFERENCE: 'REFERENCE',
  VIEWER: 'VIEWER',
  RECEIVER: 'RECEIVER',
} as const

export type StepRole = (typeof StepRole)[keyof typeof StepRole]

export const StepStatus = {
  WAITING: 'WAITING', // 결재 차례 대기 (비활성)
  PENDING: 'PENDING', // 처리 가능 (활성)
  APPROVED: 'APPROVED',
  PROXY_APPROVED: 'PROXY_APPROVED',
  PRE_APPROVED: 'PRE_APPROVED',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED', // 전단계 반려를 실행한 단계
  CANCELLED: 'CANCELLED',
  SKIPPED: 'SKIPPED', // 전결로 건너뜀
  VIEWED: 'VIEWED', // 참조/공람 확인
  RECEIVED: 'RECEIVED', // 수신 처리
} as const

export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus]

/** 결재 흐름(순차 진행)에 참여하는 role */
export const APPROVAL_FLOW_ROLES: string[] = [StepRole.APPROVER, StepRole.AGREEMENT]

/** "결재 처리됨"으로 간주하는 step status (회수/결재취소 가능 여부 판정에 사용) */
export const ACTED_STEP_STATUSES: string[] = [
  StepStatus.APPROVED,
  StepStatus.PROXY_APPROVED,
  StepStatus.PRE_APPROVED,
]

/** ApprovalHistory.action 값 */
export const HistoryAction = {
  SUBMIT: 'SUBMIT',
  RECALL: 'RECALL',
  APPROVE: 'APPROVE',
  PROXY_APPROVE: 'PROXY_APPROVE',
  AGREE: 'AGREE',
  REJECT: 'REJECT',
  PRE_APPROVE: 'PRE_APPROVE',
  RETURN_PREV: 'RETURN_PREV',
  CANCEL_APPROVAL: 'CANCEL_APPROVAL',
  VIEW: 'VIEW',
  RECEIVE: 'RECEIVE',
} as const

export type HistoryAction = (typeof HistoryAction)[keyof typeof HistoryAction]
