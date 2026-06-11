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
