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
  DEPT_COLLABORATOR: 'DEPT_COLLABORATOR', // AP-04-02 부서협조 (부서 문서담당자 단일 결정)
  DEPT_RECEIVER: 'DEPT_RECEIVER', // AP-04-06 부서수신 (부서 문서담당자 수신확인/반송)
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
  BOUNCED: 'BOUNCED', // AP-04-06 부서수신 반송 (기안자에게 반환)
} as const

export type StepStatus = (typeof StepStatus)[keyof typeof StepStatus]

/**
 * 결재 흐름(순차 진행, 차단)에 참여하는 role.
 * DEPT_COLLABORATOR(부서협조)는 AGREEMENT처럼 단일 결정으로 흐름에 합류한다.
 */
export const APPROVAL_FLOW_ROLES: string[] = [
  StepRole.APPROVER,
  StepRole.AGREEMENT,
  StepRole.DEPT_COLLABORATOR,
]

/** 최종 승인 후 활성화되는 수신 role (RECEIVER + 부서수신) */
export const RECEIVER_ROLES: string[] = [StepRole.RECEIVER, StepRole.DEPT_RECEIVER]

/** 부서(조직)로 라우팅되어 assignee를 부서 문서담당자(docManagerId ?? approverId)로 해석하는 role */
export const DEPT_ROLES: string[] = [StepRole.DEPT_COLLABORATOR, StepRole.DEPT_RECEIVER]

/** 반려 시 취소(CANCELLED)되는 미처리 단계 role — 남은 결재 흐름 + 수신 */
export const CANCEL_ON_REJECT_ROLES: string[] = [...APPROVAL_FLOW_ROLES, ...RECEIVER_ROLES]

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
  DEPT_COLLAB: 'DEPT_COLLAB', // 부서협조 완료
  BOUNCE: 'BOUNCE', // 부서수신 반송
} as const

export type HistoryAction = (typeof HistoryAction)[keyof typeof HistoryAction]
