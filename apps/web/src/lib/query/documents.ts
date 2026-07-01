'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'

// ---------- 타입 ----------
// 타입 정의는 documents.types.ts 로 분리 (god file 분할 · 항목 24). 공개 API 유지를 위해 전량 재수출.
export * from './documents.types'
import type {
  DocumentBox,
  StepAction,
  DocumentForm,
  FormCategory,
  BodyTemplate,
  DocumentCategory,
  FormAccessRule,
  DocumentNumberRule,
  ApprovalStepInput,
  SharedApprovalLine,
  DocumentListResponse,
  DocumentContent,
  DocumentDetail,
  DocumentAttachment,
  ProxySetting,
} from './documents.types'

// ---------- 쿼리 키 ----------

const FORMS_KEY = ['document-forms']
const LINES_KEY = ['shared-approval-lines']
const PERSONAL_LINES_KEY = ['personal-approval-lines']
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

// ---------- 기안 본문 템플릿 (회사설정 > 전자결재) ----------

const BODY_TEMPLATES_KEY = ['body-templates']

export const useBodyTemplates = () =>
  useQuery({
    queryKey: BODY_TEMPLATES_KEY,
    queryFn: () => apiClient.get('/body-templates') as Promise<BodyTemplate[]>,
    staleTime: 60_000,
  })

export const useCreateBodyTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; content: string; sortOrder?: number }) =>
      apiClient.post('/body-templates', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: BODY_TEMPLATES_KEY }),
  })
}

export const useUpdateBodyTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; content?: string; sortOrder?: number; isActive?: boolean }) =>
      apiClient.patch(`/body-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: BODY_TEMPLATES_KEY }),
  })
}

export const useDeleteBodyTemplate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/body-templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: BODY_TEMPLATES_KEY }),
  })
}

// AP 문서성격(채번 대분류) CRUD
const DOC_CATEGORIES_KEY = ['document-categories']

export const useDocumentCategories = () =>
  useQuery({
    queryKey: DOC_CATEGORIES_KEY,
    queryFn: () => apiClient.get('/document-categories') as Promise<DocumentCategory[]>,
    staleTime: 60_000,
  })

export const useCreateDocumentCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; abbreviation: string; sortOrder?: number }) =>
      apiClient.post('/document-categories', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOC_CATEGORIES_KEY }),
  })
}

export const useUpdateDocumentCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      name?: string
      abbreviation?: string
      sortOrder?: number
      isActive?: boolean
    }) => apiClient.patch(`/document-categories/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOC_CATEGORIES_KEY }),
  })
}

export const useDeleteDocumentCategory = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/document-categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: DOC_CATEGORIES_KEY }),
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

/** 공용 결재선명 사전 중복 확인 — 등록/수정 모달 [중복체크] 버튼 */
export const useCheckSharedLineName = () =>
  useMutation({
    mutationFn: ({ name, excludeId }: { name: string; excludeId?: string }) =>
      apiClient.get('/shared-approval-lines/check-name', {
        params: { name, ...(excludeId ? { excludeId } : {}) },
      }) as Promise<{ duplicate: boolean }>,
  })

export const useDeleteSharedApprovalLine = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/shared-approval-lines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: LINES_KEY }),
  })
}

// ---------- 개인 결재선 (빠른 결재선 불러오기) ----------

/** 내 결재선 목록 — 본인 소유분. 결재선명 부분검색 지원. */
export const usePersonalApprovalLines = (search?: string) => {
  const trimmed = search?.trim()
  const params = trimmed ? { search: trimmed } : undefined
  return useQuery({
    queryKey: params ? [...PERSONAL_LINES_KEY, params] : PERSONAL_LINES_KEY,
    queryFn: () =>
      apiClient.get('/personal-approval-lines', { params }) as Promise<SharedApprovalLine[]>,
    staleTime: 60_000,
  })
}

/** 현재 결재선 구성을 내 결재선으로 저장 */
export const useSavePersonalApprovalLine = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; steps: ApprovalStepInput[] }) =>
      apiClient.post('/personal-approval-lines', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_LINES_KEY }),
  })
}

export const useDeletePersonalApprovalLine = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/personal-approval-lines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSONAL_LINES_KEY }),
  })
}

// ---------- 문서함 / 문서 ----------

export interface DocumentListParams {
  page?: number
  limit?: number
  status?: string
  /** 부분검색어 (대상은 searchField로 지정) */
  search?: string
  /** 탭별 검색 대상 — 전체(제목+문서번호+양식+기안자)/제목/양식/기안자 */
  searchField?: 'all' | 'title' | 'form' | 'drafter'
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
    mutationFn: (data: {
      formId: string
      categoryId?: string | null
      title: string
      content: DocumentContent
      /** 임시저장 시 결재선·수신/참조/공람 보존 (DRAFT) */
      steps?: ApprovalStepInput[]
    }) => apiClient.post('/documents', data) as Promise<DocumentDetail>,
    onSuccess: () => qc.invalidateQueries({ queryKey: DOCS_KEY }),
  })
}

export const useUpdateDocument = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      /** 임시저장(DRAFT) 문서의 양식 변경 */
      formId?: string
      categoryId?: string | null
      title?: string
      content?: DocumentContent
      /** 임시저장 결재선·수신/참조/공람 교체 (DRAFT) */
      steps?: ApprovalStepInput[]
    }) => apiClient.patch(`/documents/${id}`, data),
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

/** 결재 종료/진행 후 사후 의견 등록 (기안자/결재 관계자) */
export const useAddDocumentOpinion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, comment }: { documentId: string; comment: string }) =>
      apiClient.post(`/documents/${documentId}/opinions`, { comment }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [...DOCS_KEY, 'detail', vars.documentId] })
      qc.invalidateQueries({ queryKey: DOCS_KEY })
    },
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
