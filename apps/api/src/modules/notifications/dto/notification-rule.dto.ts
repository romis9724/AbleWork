import { z } from 'zod'

// ─── Shared sub-schemas ────────────────────────────────────────────────────

const ChannelTypeSchema = z.enum(['discord', 'email', 'in_app'])

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// ─── Create notification rule ─────────────────────────────────────────────

export const CreateNotificationRuleSchema = z.object({
  name: z.string().min(1).max(100),
  eventType: z.string().min(1).max(100),
  channelType: ChannelTypeSchema,
  webhookUrl: z.string().url().optional(),
  triggerCondition: z.record(z.unknown()).optional(),
  embedTemplate: z.record(z.unknown()).optional(),
  messageTemplateId: z.string().uuid().optional(),
  cronExpression: z.string().optional(),
  isActive: z.boolean().default(true),
})

export type CreateNotificationRuleDto = z.infer<typeof CreateNotificationRuleSchema>

// ─── Update notification rule ─────────────────────────────────────────────

export const UpdateNotificationRuleSchema = CreateNotificationRuleSchema.partial()

export type UpdateNotificationRuleDto = z.infer<typeof UpdateNotificationRuleSchema>

// ─── Update webhook URL (company-wide) ────────────────────────────────────

// 알림 규칙 모델은 회사 단위 단일 webhook을 사용한다(채널별 분리 webhook 미지원).
// 채널 단위 분리가 필요하면 NotificationRule에 channel 컬럼 추가 + 마이그레이션이 선행되어야 한다.
export const UpdateWebhookSchema = z.object({
  webhookUrl: z.union([z.string().url('유효한 URL을 입력하세요.'), z.literal('')]),
})

export type UpdateWebhookDto = z.infer<typeof UpdateWebhookSchema>

// ─── Toggle event rule ────────────────────────────────────────────────────

export const UpdateEventRuleSchema = z.object({
  eventType: z.string().min(1).max(50),
  isActive: z.boolean(),
})

export type UpdateEventRuleDto = z.infer<typeof UpdateEventRuleSchema>

// ─── Query: list rules ────────────────────────────────────────────────────

export const ListNotificationRulesQuerySchema = PaginationSchema.extend({
  companyId: z.string().uuid().optional(),
})

export type ListNotificationRulesQueryDto = z.infer<typeof ListNotificationRulesQuerySchema>

// ─── Query: list logs ─────────────────────────────────────────────────────

export const ListNotificationLogsQuerySchema = PaginationSchema.extend({
  ruleId: z.string().uuid().optional(),
  status: z.enum(['success', 'failed']).optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
})

export type ListNotificationLogsQueryDto = z.infer<typeof ListNotificationLogsQuerySchema>
