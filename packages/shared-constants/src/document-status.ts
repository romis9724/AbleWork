export const DocumentStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RECALLED: 'RECALLED',
  CANCELLED: 'CANCELLED',
} as const

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus]

export const ApprovalStepStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PRE_APPROVED: 'PRE_APPROVED',
  PROXY_APPROVED: 'PROXY_APPROVED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  SKIPPED: 'SKIPPED',
} as const

export type ApprovalStepStatus = (typeof ApprovalStepStatus)[keyof typeof ApprovalStepStatus]

export const ApprovalStepRole = {
  APPROVER: 'approver',
  COLLABORATOR: 'collaborator',
  VIEWER: 'viewer',
  CC: 'cc',
  RECEIVER: 'receiver',
  DEPT_COLLABORATOR: 'dept_collaborator',
  DEPT_RECEIVER: 'dept_receiver',
} as const

export type ApprovalStepRole = (typeof ApprovalStepRole)[keyof typeof ApprovalStepRole]
