import { z } from 'zod'

// shared-constants/request-type.ts 와 동일하게 유지
export const RequestTypeEnum = z.enum([
  'LEAVE_CREATE',
  'LEAVE_MODIFY',
  'LEAVE_DELETE',
  'SHIFT_CREATE',
  'SHIFT_MODIFY',
  'SHIFT_DELETE',
  'ATTENDANCE_EDIT',
  'ATTENDANCE_CREATE',
  'ATTENDANCE_DELETE',
  'DEVICE_CHANGE',
  'OFFSITE_WORK',
  'CUSTOM',
])

export const CreateRequestSchema = z.object({
  type: RequestTypeEnum,
  customTypeId: z.string().uuid().optional(),
  payload: z.record(z.unknown()),
})

export const CreateApprovalRuleSchema = z.object({
  name: z.string().min(1, '규칙명을 입력하세요.').max(100),
  requestType: z.string().min(1),
  customTypeId: z.string().uuid().optional(),
  priority: z.number().int().min(0).default(0),
  scopeOrgIds: z.array(z.string().uuid()).optional(),
  scopePositionIds: z.array(z.string().uuid()).optional(),
  maxApprovalRounds: z.number().int().min(1).default(1),
  isAutoApprove: z.boolean().default(false),
  isActive: z.boolean().default(true),
  details: z.array(
    z.object({
      tag: z.string().max(30).optional(),
      round: z.number().int().min(1).default(1),
      requiredCount: z.number().int().min(1).default(1),
      approverPositionId: z.string().uuid().optional(),
      isForbidden: z.boolean().default(false),
      sortOrder: z.number().int().min(0).default(0),
    }),
  ).default([]),
})

// 부분 수정: details 배열이 포함되면 기존 details를 전체 교체한다.
export const UpdateApprovalRuleSchema = z
  .object({
    name: z.string().min(1, '규칙명을 입력하세요.').max(100).optional(),
    requestType: z.string().min(1).optional(),
    customTypeId: z.string().uuid().optional(),
    priority: z.number().int().min(0).optional(),
    scopeOrgIds: z.array(z.string().uuid()).optional(),
    scopePositionIds: z.array(z.string().uuid()).optional(),
    maxApprovalRounds: z.number().int().min(1).optional(),
    isAutoApprove: z.boolean().optional(),
    isActive: z.boolean().optional(),
    details: z
      .array(
        z.object({
          tag: z.string().max(30).optional(),
          round: z.number().int().min(1).default(1),
          requiredCount: z.number().int().min(1).default(1),
          approverPositionId: z.string().uuid().optional(),
          isForbidden: z.boolean().default(false),
          sortOrder: z.number().int().min(0).default(0),
        }),
      )
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: '수정할 항목을 하나 이상 입력하세요.',
  })

export const ApproveRejectSchema = z.object({
  comment: z.string().optional(),
})

export const BulkApproveSchema = z.object({
  requestIds: z.array(z.string().uuid()).min(1, '승인할 요청을 하나 이상 선택하세요.'),
  comment: z.string().optional(),
})

export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const

export const RequestFilterSchema = z.object({
  scope: z.enum(['mine', 'pending_approval', 'completed', 'referenced']).default('mine'),
  type: z.string().optional(),
  // 단일값('PENDING') 또는 콤마 구분 다중값('APPROVED,REJECTED') 허용
  status: z
    .string()
    .optional()
    .refine(
      (value) =>
        value === undefined ||
        value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .every((s) => (REQUEST_STATUSES as readonly string[]).includes(s)),
      { message: `status는 ${REQUEST_STATUSES.join(', ')} 중 하나(콤마 구분 가능)여야 합니다.` },
    ),
  allEmployees: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateRequestDto = z.infer<typeof CreateRequestSchema>
export type CreateApprovalRuleDto = z.infer<typeof CreateApprovalRuleSchema>
export type UpdateApprovalRuleDto = z.infer<typeof UpdateApprovalRuleSchema>
export type ApproveRejectDto = z.infer<typeof ApproveRejectSchema>
export type BulkApproveDto = z.infer<typeof BulkApproveSchema>
export type RequestFilterDto = z.infer<typeof RequestFilterSchema>
