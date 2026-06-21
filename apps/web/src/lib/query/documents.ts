'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { DocumentFieldDef } from '@ablework/shared-constants'
import apiClient from '@/lib/api-client'

// ---------- 타입 ----------

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

// ---------- 쿼리 키 ----------

const FORMS_KEY = ['document-forms']
const LINES_KEY = ['shared-approval-lines']
const DOCS_KEY = ['documents']
const PROXY_KEY = ['proxy-settings']

// ---------- 기안양식 ----------

export const useDocumentForms = () =>
  useQuery({
    queryKey: FORMS_KEY,
    queryFn: () => apiClient.get('/document-forms') as Promise<DocumentForm[]>,
    staleTime: 60_000,
  })

export const useCreateDocumentForm = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiClient.post('/document-forms', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  })
}

export const useUpdateDocumentForm = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/document-forms/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  })
}

export const useDeleteDocumentForm = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/document-forms/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: FORMS_KEY }),
  })
}

// AP-01 양식함(분류) CRUD
const CATEGORIES_KEY = ['form-categories']

export const useFormCategories = () =>
  useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: () => apiClient.get('/form-categories') as Promise<FormCategory[]>,
    staleTime: 60_000,
  })

export const useCreateFormCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; sortOrder?: number }) =>
      apiClient.post('/form-categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export const useUpdateFormCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; sortOrder?: number; isActive?: boolean }) =>
      apiClient.patch(`/form-categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

export const useDeleteFormCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/form-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CATEGORIES_KEY }),
  })
}

// AP-01-07 양식 접근규칙
export const useFormAccessRules = (formId: string | null) =>
  useQuery({
    queryKey: [...FORMS_KEY, formId, 'access-rules'],
    queryFn: () =>
      apiClient.get(`/document-forms/${formId}/access-rules`) as Promise<FormAccessRule[]>,
    enabled: !!formId,
  })

export const useCreateFormAccessRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formId, ...data }: { formId: string; scopeType: string; scopeId: string }) =>
      apiClient.post(`/document-forms/${formId}/access-rules`, data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: [...FORMS_KEY, vars.formId, 'access-rules'] }),
  })
}

export const useDeleteFormAccessRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formId, ruleId }: { formId: string; ruleId: string }) =>
      apiClient.delete(`/document-forms/${formId}/access-rules/${ruleId}`),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: [...FORMS_KEY, vars.formId, 'access-rules'] }),
  })
}

export const useDocumentNumberRule = (formId: string | null) =>
  useQuery({
    queryKey: [...FORMS_KEY, formId, 'number-rule'],
    queryFn: () =>
      apiClient.get(`/document-forms/${formId}/number-rule`) as Promise<DocumentNumberRule | null>,
    enabled: !!formId,
  })

export const useSaveDocumentNumberRule = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ formId, ...data }: { formId: string } & DocumentNumberRule) =>
      apiClient.put(`/document-forms/${formId}/number-rule`, data),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: [...FORMS_KEY, vars.formId, 'number-rule'] }),
  })
}

// ---------- 공용 결재선 ----------

/** 공용 결재선 목록 필터 (C-9b) — 결재선명·작성자·결재자·작성일 */
export interface SharedLineFilter {
  search?: string
  author?: string
  approver?: string
  dateFrom?: string
  dateTo?: string
}

export const useSharedApprovalLines = (filter?: SharedLineFilter) => {
  // 빈 값 제거 — 미입력 필드는 미전송(쿼리키 안정 + 빈 날짜 400 방어)
  const params: Record<string, string> = {}
  if (filter) {
    for (const [k, v] of Object.entries(filter)) {
      const trimmed = v?.trim()
      if (trimmed) params[k] = trimmed
    }
  }
  const hasParams = Object.keys(params).length > 0
  return useQuery({
    queryKey: hasParams ? [...LINES_KEY, params] : LINES_KEY,
    queryFn: () =>
      apiClient.get('/shared-approval-lines', {
        params: hasParams ? params : undefined,
      }) as Promise<SharedApprovalLine[]>,
    staleTime: 60_000,
  })
}

export const useCreateSharedApprovalLine = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; steps: ApprovalStepInput[] }) =>
      apiClient.post('/shared-approval-lines', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: LINES_KEY }),
  })
}

export const useUpdateSharedApprovalLine = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; steps?: ApprovalStepInput[] }) =>
      apiClient.patch(`/shared-approval-lines/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: LINES_KEY }),
  })
}

export const useDeleteSharedApprovalLine = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/shared-approval-lines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LINES_KEY }),
  })
}

// ---------- 문서함 / 문서 ----------

export interface DocumentListParams {
  page?: number
  limit?: number
  status?: string
  /** 제목·문서번호 부분검색 (BE: title/docNumber contains) */
  search?: string
  /** 결재 현황(status box) 필터 — 기안양식 id */
  formId?: string
  /** 결재 현황(status box) 필터 — 상신일 시작 (YYYY-MM-DD) */
  dateFrom?: string
  /** 결재 현황(status box) 필터 — 상신일 종료 (YYYY-MM-DD) */
  dateTo?: string
}

export const useDocuments = (box: DocumentBox, params?: DocumentListParams) =>
  useQuery({
    queryKey: [...DOCS_KEY, box, params],
    queryFn: () =>
      apiClient.get('/documents', {
        params: { box, ...params },
      }) as Promise<DocumentListResponse>,
    staleTime: 15_000,
  })

export const useDocument = (id: string | null) =>
  useQuery({
    queryKey: [...DOCS_KEY, 'detail', id],
    queryFn: () => apiClient.get(`/documents/${id}`) as Promise<DocumentDetail>,
    enabled: !!id,
  })

export const useCreateDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { formId: string; title: string; content: DocumentContent }) =>
      apiClient.post('/documents', data) as Promise<DocumentDetail>,
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export const useUpdateDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; content?: DocumentContent }) =>
      apiClient.patch(`/documents/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export const useDeleteDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

// AP-05-06 관리자 강제 삭제 (결재 현황)
export const useForceDeleteDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/documents/${id}/force`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export interface BulkForceDeleteResult {
  deletedCount: number
  deletedIds: string[]
  skipped: { id: string; reason: string }[]
}

// AP-05-06 결재 현황 다중 삭제 (체크박스 선택삭제)
export const useBulkForceDeleteDocuments = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.post('/documents/bulk-force-delete', { ids }) as Promise<BulkForceDeleteResult>,
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export const useSubmitDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      steps,
      sharedLineId,
    }: {
      id: string
      steps: ApprovalStepInput[]
      sharedLineId?: string
    }) => apiClient.post(`/documents/${id}/submit`, { steps, sharedLineId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

// AP-02-08 공람/참조 사후 추가 (진행중·완료 문서)
export const useAddCcSteps = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      documentId,
      steps,
    }: {
      documentId: string
      steps: { role: 'VIEWER' | 'REFERENCE'; assigneeId: string }[]
    }) => apiClient.post(`/documents/${documentId}/cc`, { steps }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export const useRecallDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/documents/${id}/recall`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export const useDocumentStepAction = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      documentId,
      stepId,
      action,
      comment,
    }: {
      documentId: string
      stepId: string
      action: StepAction
      comment?: string
    }) => apiClient.post(`/documents/${documentId}/steps/${stepId}/${action}`, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

// ---------- 기안 첨부파일 (AP-02-01) ----------

const ATTACH_KEY = (documentId: string) => [...DOCS_KEY, 'attachments', documentId]

export const useDocumentAttachments = (documentId: string | null) =>
  useQuery({
    queryKey: ATTACH_KEY(documentId ?? ''),
    queryFn: () =>
      apiClient.get(`/documents/${documentId}/attachments`) as Promise<DocumentAttachment[]>,
    enabled: !!documentId,
  })

export const useUploadAttachment = (documentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiClient.post(`/documents/${documentId}/attachments`, formData) as Promise<DocumentAttachment>
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ATTACH_KEY(documentId) }),
  })
}

export const useDeleteAttachment = (documentId: string) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (attachmentId: string) =>
      apiClient.delete(`/documents/${documentId}/attachments/${attachmentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ATTACH_KEY(documentId) }),
  })
}

/** 첨부 다운로드 — Blob 응답을 받아 브라우저 저장 트리거 */
export async function downloadAttachment(
  documentId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const blob = (await apiClient.get(
    `/documents/${documentId}/attachments/${attachmentId}/download`,
    { responseType: 'blob' },
  )) as unknown as Blob
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- 대리결재 설정 ----------

export const useProxySettings = () =>
  useQuery({
    queryKey: PROXY_KEY,
    queryFn: () => apiClient.get('/proxy-settings') as Promise<ProxySetting[]>,
    staleTime: 30_000,
  })

export const useCreateProxySetting = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { proxyId: string; startDate: string; endDate: string; reason?: string }) =>
      apiClient.post('/proxy-settings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROXY_KEY }),
  })
}

export const useUpdateProxySetting = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/proxy-settings/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROXY_KEY }),
  })
}

export const useDeleteProxySetting = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/proxy-settings/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROXY_KEY }),
  })
}
