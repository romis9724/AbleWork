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
  // 조직/직무 FK — 모듈 내 다른 참조 필드(organizationId·assigneeId)와 동일하게 string으로 받고,
  // 실제 존재·소속 검증은 서비스(FORM_ACCESS_SCOPE_NOT_FOUND)에서 수행한다.
  scopeId: z.string().min(1),
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

// AP-01-07 공용 결재선 목록 필터 (C-9b) — 결재선명·작성자·결재자·작성일
const SHARED_LINE_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
// 빈 문자열 쿼리 파라미터(?dateFrom=)는 undefined로 정규화 — 미입력 필드 방어
const optionalDate = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().regex(SHARED_LINE_DATE_REGEX, 'YYYY-MM-DD 형식으로 입력하세요.').optional(),
)
export const SharedLineFilterSchema = z
  .object({
    // 결재선명 부분검색 (기존 호환: search)
    search: z.string().trim().max(100).optional(),
    // 작성자명/사번 부분검색 (createdBy)
    author: z.string().trim().max(50).optional(),
    // 결재자명/사번 부분검색 (steps 내 assignee)
    approver: z.string().trim().max(50).optional(),
    // 작성일 범위 (YYYY-MM-DD, KST 기준)
    dateFrom: optionalDate,
    dateTo: optionalDate,
  })
  .refine((d) => !d.dateFrom || !d.dateTo || d.dateFrom <= d.dateTo, {
    message: '시작일은 종료일보다 늦을 수 없습니다.',
    path: ['dateTo'],
  })

export type CreateDocumentFormDto = z.infer<typeof CreateDocumentFormSchema>
export type UpdateDocumentFormDto = z.infer<typeof UpdateDocumentFormSchema>
export type UpsertNumberRuleDto = z.infer<typeof UpsertNumberRuleSchema>
export type CreateSharedLineDto = z.infer<typeof CreateSharedLineSchema>
export type UpdateSharedLineDto = z.infer<typeof UpdateSharedLineSchema>
export type SharedLineFilterDto = z.infer<typeof SharedLineFilterSchema>
