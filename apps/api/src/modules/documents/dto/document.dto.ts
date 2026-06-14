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
  title: z.string().min(1, '제목을 입력하세요.').max(200),
  content: z.record(z.unknown()).default({}),
  steps: z.array(StepInputSchema).optional(),
})

export const UpdateDocumentSchema = z
  .object({
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

export const DOCUMENT_BOXES = [
  'draft',
  'in_progress',
  'completed',
  'pending_approval',
  'reference',
  'viewer',
  'receiver',
  'dept-docs', // AP-05-04 부서문서함 (내가 부서 담당자인 부서협조/부서수신)
  'ledger',
] as const

export const DocumentBoxFilterSchema = z.object({
  box: z.enum(DOCUMENT_BOXES).default('draft'),
  search: z.string().optional(),
  status: z.string().optional(), // ledger 전용 optional 필터
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type StepInput = z.infer<typeof StepInputSchema>
export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>
export type UpdateDocumentDto = z.infer<typeof UpdateDocumentSchema>
export type SubmitDocumentDto = z.infer<typeof SubmitDocumentSchema>
export type ApprovalCommentDto = z.infer<typeof ApprovalCommentSchema>
export type DocumentBoxFilterDto = z.infer<typeof DocumentBoxFilterSchema>
