import { z } from 'zod'

// FE 계약: role은 대문자 (documents.constants.ts StepRole과 동일)
export const ApprovalStepRoleEnum = z.enum([
  'APPROVER',
  'AGREEMENT',
  'REFERENCE',
  'VIEWER',
  'RECEIVER',
])

export const StepInputSchema = z.object({
  role: ApprovalStepRoleEnum,
  assigneeId: z.string().min(1),
  stepOrder: z.number().int().min(0),
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
