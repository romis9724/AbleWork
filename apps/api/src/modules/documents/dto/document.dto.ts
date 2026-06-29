import { z } from 'zod'

// FE 계약: role은 대문자 (documents.constants.ts StepRole과 동일)
export const ApprovalStepRoleEnum = z.enum([
  'APPROVER',
  'AGREEMENT',
  'REFERENCE',
  'VIEWER',
  'RECEIVER',
  'DEPT_COLLABORATOR', // AP-04-02 부서협조
  'DEPT_RECEIVER', // AP-04-06 부서수신
])

/** 부서로 라우팅되는 role — assigneeId 대신 organizationId를 받아 서버가 부서 문서담당자로 해석 */
const DEPT_ROLE_VALUES: string[] = ['DEPT_COLLABORATOR', 'DEPT_RECEIVER']

/**
 * 결재 단계 입력.
 * - 개인 단계(APPROVER/AGREEMENT/REFERENCE/VIEWER/RECEIVER): assigneeId 필수.
 * - 부서 단계(DEPT_COLLABORATOR/DEPT_RECEIVER): organizationId 필수, assignee는 서버가 해석.
 */
export const StepInputSchema = z
  .object({
    role: ApprovalStepRoleEnum,
    assigneeId: z.string().min(1).optional(),
    organizationId: z.string().min(1).optional(),
    stepOrder: z.number().int().min(0),
  })
  .superRefine((val, ctx) => {
    const isDept = DEPT_ROLE_VALUES.includes(val.role)
    if (isDept && !val.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: '부서협조/부서수신 단계는 대상 부서를 지정해야 합니다.',
      })
    }
    if (!isDept && !val.assigneeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assigneeId'],
        message: '결재자를 지정해야 합니다.',
      })
    }
  })

export const CreateDocumentSchema = z.object({
  formId: z.string().min(1),
  // AP 문서성격(채번 대분류) — 기안 시 선택(미지정 가능)
  categoryId: z.string().min(1).nullable().optional(),
  title: z.string().min(1, '제목을 입력하세요.').max(200),
  content: z.record(z.unknown()).default({}),
  steps: z.array(StepInputSchema).optional(),
})

export const UpdateDocumentSchema = z
  .object({
    // 임시저장(DRAFT) 문서의 양식 변경 허용 (AP-02 임시저장 재편집)
    formId: z.string().min(1).optional(),
    categoryId: z.string().min(1).nullable().optional(),
    title: z.string().min(1).max(200).optional(),
    content: z.record(z.unknown()).optional(),
    steps: z.array(StepInputSchema).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

export const SubmitDocumentSchema = z.object({
  steps: z.array(StepInputSchema).optional(),
  sharedLineId: z.string().min(1).optional(),
})

export const ApprovalCommentSchema = z.object({
  comment: z.string().optional(),
})

// AP 결재 종료/진행 후 사후 의견 등록 — 의견 본문 필수
export const AddOpinionSchema = z.object({
  comment: z.string().min(1, '의견을 입력하세요.').max(2000),
})

// AP-02-08 공람/참조 사후 추가 — 진행중/완료 문서에 공람자·참조자 지정 (비차단, 개인만)
export const AddCcStepsSchema = z.object({
  steps: z
    .array(
      z.object({
        role: z.enum(['VIEWER', 'REFERENCE']),
        assigneeId: z.string().min(1),
      }),
    )
    .min(1, '추가할 공람자·참조자를 선택하세요.')
    .max(50),
})

// AP-05-06 결재 현황 다중 삭제 (관리자) — 최대 100건
export const BulkForceDeleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '삭제할 문서를 선택하세요.').max(100),
})

export const DOCUMENT_BOXES = [
  'draft',
  'in_progress',
  'completed',
  'pending_approval',
  'reference',
  'viewer',
  'receiver',
  'dept-docs', // AP-05-04 부서문서함 (내가 부서 담당자인 부서협조/부서수신)
  'status', // AP-05-06 결재 현황 (관리자 — 상신/진행중/반려)
  'ledger',
] as const

// 탭별 검색 대상 필드 — 전체(제목+문서번호+양식+기안자) / 제목 / 양식 / 기안자
export const DOCUMENT_SEARCH_FIELDS = ['all', 'title', 'form', 'drafter'] as const

export const DocumentBoxFilterSchema = z.object({
  box: z.enum(DOCUMENT_BOXES).default('draft'),
  search: z.string().optional(),
  searchField: z.enum(DOCUMENT_SEARCH_FIELDS).optional(),
  status: z.string().optional(), // ledger/status 박스 필터 (status: ''/SUBMITTED/IN_PROGRESS/REJECTED)
  formId: z.string().min(1).optional(), // 기안양식 필터 (status 박스)
  dateFrom: z.string().optional(), // 상신일 시작 (YYYY-MM-DD)
  dateTo: z.string().optional(), // 상신일 종료 (YYYY-MM-DD)
  page: z.coerce.number().int().min(1).default(1),
  // 백업 화면은 기간 내 전체 문서를 한 번에 조회한다(zip 번들 대상 목록). 상한을 1000으로 둔다.
  limit: z.coerce.number().int().min(1).max(1000).default(20),
})

export type StepInput = z.infer<typeof StepInputSchema>
export type BulkForceDeleteDto = z.infer<typeof BulkForceDeleteSchema>
export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>
export type UpdateDocumentDto = z.infer<typeof UpdateDocumentSchema>
export type SubmitDocumentDto = z.infer<typeof SubmitDocumentSchema>
export type ApprovalCommentDto = z.infer<typeof ApprovalCommentSchema>
export type AddOpinionDto = z.infer<typeof AddOpinionSchema>
export type AddCcStepsDto = z.infer<typeof AddCcStepsSchema>
export type DocumentBoxFilterDto = z.infer<typeof DocumentBoxFilterSchema>
