import { z } from 'zod'

const timeRegex = /^\d{2}:\d{2}$/

// ── 공통 페이지네이션 ─────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationDto = z.infer<typeof PaginationSchema>

// ── 메시지 목록 조회 (수신함) ─────────────────────────────────────────────────

export const MessageQuerySchema = PaginationSchema.extend({
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    .pipe(z.boolean().default(false)),
})

export type MessageQueryDto = z.infer<typeof MessageQuerySchema>

// ── 템플릿 생성 ───────────────────────────────────────────────────────────────

export const CreateTemplateSchema = z.object({
  name: z.string().min(1, '템플릿 이름을 입력하세요.').max(100),
  content: z.string().min(1, '템플릿 내용을 입력하세요.'),
  hasVariables: z.boolean().default(false),
})

export type CreateTemplateDto = z.infer<typeof CreateTemplateSchema>

// ── 템플릿 수정 ───────────────────────────────────────────────────────────────

export const UpdateTemplateSchema = z.object({
  name: z.string().min(1, '템플릿 이름을 입력하세요.').max(100).optional(),
  content: z.string().min(1, '템플릿 내용을 입력하세요.').optional(),
  hasVariables: z.boolean().optional(),
})

export type UpdateTemplateDto = z.infer<typeof UpdateTemplateSchema>

// ── 메시지 발송 ───────────────────────────────────────────────────────────────

export const SendMessageSchema = z.object({
  templateId: z.string().uuid('유효한 UUID를 입력하세요.').optional(),
  title: z.string().min(1, '제목을 입력하세요.').max(200),
  content: z.string().min(1, '내용을 입력하세요.'),
  recipientEmployeeIds: z
    .array(z.string().uuid('유효한 UUID를 입력하세요.'))
    .min(1, '수신자를 한 명 이상 선택하세요.'),
})

export type SendMessageDto = z.infer<typeof SendMessageSchema>

// ── 자동화 생성 ───────────────────────────────────────────────────────────────

export const CreateAutomationSchema = z.object({
  name: z.string().min(1, '자동화 이름을 입력하세요.').max(100),
  automationType: z.string().min(1, '자동화 유형을 입력하세요.'),
  triggerBasis: z.string().min(1, '트리거 기준을 입력하세요.'),
  offsetDays: z.number().int().default(0),
  sendTime: z
    .string()
    .regex(timeRegex, '발송 시간은 HH:mm 형식으로 입력하세요.'),
  sendEmail: z.boolean().default(false),
  startsAt: z.string().datetime({ message: 'ISO 8601 형식으로 입력하세요.' }).optional(),
  leaveTypeId: z.string().uuid('유효한 UUID를 입력하세요.').optional(),
  templateId: z.string().uuid('유효한 UUID를 입력하세요.'),
  isActive: z.boolean().default(true),
})

export type CreateAutomationDto = z.infer<typeof CreateAutomationSchema>
