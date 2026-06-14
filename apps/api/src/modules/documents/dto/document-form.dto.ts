import { z } from 'zod'
import { StepInputSchema } from './document.dto'

// AP-01 양식 공개범위 — 공개/부서공개/비공개
export const FormVisibilityScope = ['PUBLIC', 'DEPARTMENT', 'PRIVATE'] as const

export const CreateDocumentFormSchema = z.object({
  name: z.string().min(1, '양식명을 입력하세요.').max(200),
  category: z.string().max(100).optional(),
  // AP-01 양식함 분류 id (미지정 가능)
  categoryId: z.string().uuid().nullable().optional(),
  fieldsSchema: z.record(z.unknown()).default({}),
  // AP-01 양식 메타
  visibilityScope: z.enum(FormVisibilityScope).default('PUBLIC'),
  retentionYears: z.number().int().min(0).max(100).nullable().optional(),
  abbreviation: z.string().max(20).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  // AP-01-03 양식별 기본 결재선 (공용 결재선 id, 미지정 가능)
  defaultLineId: z.string().uuid().nullable().optional(),
  // AP-01-07 양식 담당자(직원 id, 미지정 가능)
  formOwnerId: z.string().uuid().nullable().optional(),
  // AP-01-06 ZIP 첨부 허용
  allowZipUpload: z.boolean().default(false),
  sortOrder: z.number().int().min(0).default(0),
  allowReDraft: z.boolean().default(false),
  allowPreApproval: z.boolean().default(false),
})

export const UpdateDocumentFormSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    category: z.string().max(100).optional(),
    categoryId: z.string().uuid().nullable().optional(),
    fieldsSchema: z.record(z.unknown()).optional(),
    visibilityScope: z.enum(FormVisibilityScope).optional(),
    retentionYears: z.number().int().min(0).max(100).nullable().optional(),
    abbreviation: z.string().max(20).nullable().optional(),
    description: z.string().max(1000).nullable().optional(),
    defaultLineId: z.string().uuid().nullable().optional(),
    formOwnerId: z.string().uuid().nullable().optional(),
    allowZipUpload: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
    allowReDraft: z.boolean().optional(),
    allowPreApproval: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

// AP-01 양식함(카테고리) CRUD
export const CreateFormCategorySchema = z.object({
  name: z.string().min(1, '분류명을 입력하세요.').max(100),
  sortOrder: z.number().int().min(0).default(0),
})

export const UpdateFormCategorySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

export type CreateFormCategoryDto = z.infer<typeof CreateFormCategorySchema>
export type UpdateFormCategoryDto = z.infer<typeof UpdateFormCategorySchema>

// AP-01-07 양식 접근규칙 — 특정 조직/직무에만 작성 권한 부여 (규칙 없으면 전체 허용)
export const FormAccessScopeType = ['ORGANIZATION', 'POSITION'] as const
export const CreateFormAccessRuleSchema = z.object({
  scopeType: z.enum(FormAccessScopeType),
  scopeId: z.string().uuid(),
})
export type CreateFormAccessRuleDto = z.infer<typeof CreateFormAccessRuleSchema>

// 문서번호 채번 규칙 — pattern 토큰: {YYYY}, {MM}, {SEQ:n}(n자리 0패딩)
export const UpsertNumberRuleSchema = z.object({
  pattern: z.string().min(1, '채번 패턴을 입력하세요.').max(200),
  resetYearly: z.boolean().default(true),
})

export const CreateSharedLineSchema = z.object({
  name: z.string().min(1, '결재선 이름을 입력하세요.').max(100),
  steps: z.array(StepInputSchema).min(1, '결재 단계를 하나 이상 입력하세요.'),
})

export const UpdateSharedLineSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    steps: z.array(StepInputSchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

export type CreateDocumentFormDto = z.infer<typeof CreateDocumentFormSchema>
export type UpdateDocumentFormDto = z.infer<typeof UpdateDocumentFormSchema>
export type UpsertNumberRuleDto = z.infer<typeof UpsertNumberRuleSchema>
export type CreateSharedLineDto = z.infer<typeof CreateSharedLineSchema>
export type UpdateSharedLineDto = z.infer<typeof UpdateSharedLineSchema>
