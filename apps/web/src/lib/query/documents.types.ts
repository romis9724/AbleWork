// 전자결재 도메인 타입 정의 (god file 분할 · 항목 24) — 쿼리 훅은 documents.ts 에서 소비.
import type { DocumentFieldDef } from '@ablework/shared-constants'

export type { DocumentFieldDef }

export type DocumentStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'RECALLED'

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

export type DocumentBox =
  | 'draft'
  | 'in_progress'
  | 'completed'
  | 'pending_approval'
  | 'reference'
  | 'viewer'
  | 'receiver'
  | 'dept-docs'
  | 'status'
  | 'ledger'

/** 결재 현황 phase — 상신(미처리)/진행중(일부 승인) */
export type DocumentPhase = 'SUBMITTED' | 'IN_PROGRESS' | null

export type StepAction =
  | 'approve'
  | 'reject'
  | 'pre-approve'
  | 'return-prev'
  | 'cancel-approval'
  | 'agree'
  | 'view'
  | 'receive'
  | 'dept-collab'
  | 'bounce'

export type FormVisibilityScope = 'PUBLIC' | 'DEPARTMENT' | 'PRIVATE'

export interface DocumentForm {
  id: string
  name: string
  category?: string | null
  /** AP-01 양식함 분류 id */
  categoryId?: string | null
  /** AP-01 공개범위 (공개/부서공개/비공개) */
  visibilityScope?: FormVisibilityScope
  /** AP-01 보존연한(년) */
  retentionYears?: number | null
  /** AP-01 문서번호 약어 */
  abbreviation?: string | null
  /** AP-01 양식 설명 */
  description?: string | null
  /** AP-01-03 양식별 기본 결재선(공용 결재선 id) */
  defaultLineId?: string | null
  /** AP-01-07 양식 담당자(직원 id) */
  formOwnerId?: string | null
  /** AP-01-06 ZIP 첨부 허용 */
  allowZipUpload?: boolean
  allowReDraft: boolean
  allowPreApproval: boolean
  sortOrder: number
  isActive: boolean
  fieldsSchema?: { fields?: DocumentFieldDef[] } | null
}

export interface FormCategory {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

/** 기안 본문 템플릿 — 기안양식 "기본 본문" 채우기용 회사 공용 템플릿 (content=HTML) */
export interface BodyTemplate {
  id: string
  name: string
  content: string
  sortOrder: number
  isActive: boolean
}

/** AP 문서성격(채번 대분류) — 사업관리/일반관리/인사관리/LABL CHINA 등 */
export interface DocumentCategory {
  id: string
  name: string
  abbreviation: string
  sortOrder: number
  isActive: boolean
}

export interface FormAccessRule {
  id: string
  formId: string
  scopeType: 'ORGANIZATION' | 'POSITION'
  scopeId: string
}

export interface DocumentNumberRule {
  pattern: string
  resetYearly: boolean
}

export interface ApprovalStepInput {
  role: StepRole
  /** 개인 단계 결재자 (부서 단계는 비움 — organizationId 사용) */
  assigneeId?: string
  /** 부서 단계(DEPT_COLLABORATOR/DEPT_RECEIVER) 대상 부서 */
  organizationId?: string
  stepOrder: number
}

export interface SharedApprovalLine {
  id: string
  name: string
  steps: ApprovalStepInput[]
  /** 작성자 (AP-01-08) */
  createdBy?: { id: string; name: string } | null
  /** 작성일 */
  createdAt?: string
}

export interface DocumentListItem {
  id: string
  docNumber?: string | null
  title: string
  status: DocumentStatus
  submittedAt?: string | null
  form?: { id?: string; name: string } | null
  /** AP 문서성격(채번 대분류) */
  category?: { id: string; name: string; abbreviation: string } | null
  drafter?: { id?: string; name: string } | null
  mySteps?: { id: string; role: StepRole; status: StepStatus }[]
  /** 결재 현황(status box)용: 상신/진행중 구분 */
  phase?: DocumentPhase
  /** 결재 현황(status box)용: 현재 결재 차례인 결재자 */
  currentApprover?: { id: string; name: string } | null
}

export interface DocumentListResponse {
  items: DocumentListItem[]
  total: number
  page: number
  limit: number
}

export interface ApprovalStepDetail {
  id: string
  role: StepRole
  stepOrder: number
  status: StepStatus
  assignee?: { id: string; name: string } | null
  /** 부서 단계 대상 부서 (DEPT_COLLABORATOR/DEPT_RECEIVER) */
  organization?: { id: string; name: string } | null
  isProxy?: boolean
  proxy?: { id?: string; name: string } | null
  comment?: string | null
  actedAt?: string | null
}

export interface DocumentHistoryEntry {
  action: string
  comment?: string | null
  createdAt: string
  actor?: { name: string } | null
}

export interface DocumentContent {
  body?: string
  [key: string]: unknown
}

export interface DocumentDetail {
  id: string
  docNumber?: string | null
  title: string
  content?: DocumentContent | null
  status: DocumentStatus
  form?: {
    id?: string
    name: string
    allowReDraft?: boolean
    allowPreApproval?: boolean
    allowZipUpload?: boolean
  } | null
  /** AP 문서성격(채번 대분류) */
  category?: { id: string; name: string; abbreviation: string } | null
  categoryId?: string | null
  drafter?: { id?: string; name: string } | null
  submittedAt?: string | null
  approvalLines?: { steps: ApprovalStepDetail[] }[]
  history?: DocumentHistoryEntry[]
  requestId?: string | null
}

export interface DocumentAttachment {
  id: string
  fileName: string
  contentType: string
  size: number
  createdAt: string
  uploader?: { id: string; name: string } | null
}

export interface ProxySetting {
  id: string
  proxyId: string
  startDate: string
  endDate: string
  reason?: string | null
  proxy?: { id?: string; name: string } | null
}
