import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
  ListNotificationRulesQueryDto,
  ListNotificationLogsQueryDto,
} from './dto/notification-rule.dto'

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Rules ──────────────────────────────────────────────────────────────

  async getRules(companyId: string, query: ListNotificationRulesQueryDto) {
    const { page, limit, companyId: queryCompanyId } = query
    const skip = (page - 1) * limit

    // SUPER_ADMIN may pass an explicit companyId to cross-company query
    const whereCompanyId = queryCompanyId ?? companyId

    const [items, total] = await Promise.all([
      this.prisma.notificationRule.findMany({
        where: { companyId: whereCompanyId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notificationRule.count({
        where: { companyId: whereCompanyId },
      }),
    ])

    return { items, total, page, limit }
  }

  async createRule(companyId: string, dto: CreateNotificationRuleDto) {
    return this.prisma.notificationRule.create({
      data: {
        companyId,
        name: dto.name,
        eventType: dto.eventType,
        channelType: dto.channelType,
        webhookUrl: dto.webhookUrl,
        triggerCondition: dto.triggerCondition ?? {},
        embedTemplate: dto.embedTemplate ?? {},
        messageTemplateId: dto.messageTemplateId,
        cronExpression: dto.cronExpression,
        isActive: dto.isActive,
      },
    })
  }

  async updateRule(id: string, companyId: string, dto: UpdateNotificationRuleDto) {
    const existing = await this.prisma.notificationRule.findFirst({
      where: { id, companyId },
    })

    if (!existing) {
      throw new NotFoundException({ code: 'RULE_NOT_FOUND', message: '알림 규칙을 찾을 수 없습니다.' })
    }

    return this.prisma.notificationRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(dto.channelType !== undefined && { channelType: dto.channelType }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.triggerCondition !== undefined && { triggerCondition: dto.triggerCondition }),
        ...(dto.embedTemplate !== undefined && { embedTemplate: dto.embedTemplate }),
        ...(dto.messageTemplateId !== undefined && { messageTemplateId: dto.messageTemplateId }),
        ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })
  }

  // ─── Logs ───────────────────────────────────────────────────────────────

  async getLogs(companyId: string, query: ListNotificationLogsQueryDto) {
    const { page, limit, ruleId, status, startDate, endDate } = query
    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where: {
          rule: { companyId },
          ...(ruleId && { ruleId }),
          ...(status && { status }),
          ...(startDate || endDate
            ? {
                sentAt: {
                  ...(startDate && { gte: new Date(startDate) }),
                  ...(endDate && { lte: new Date(endDate) }),
                },
              }
            : {}),
        },
        select: {
          id: true,
          ruleId: true,
          eventType: true,
          status: true,
          retryCount: true,
          errorMessage: true,
          sentAt: true,
          createdAt: true,
        },
        skip,
        take: limit,
        orderBy: { sentAt: 'desc' },
      }),
      this.prisma.notificationLog.count({
        where: {
          rule: { companyId },
          ...(ruleId && { ruleId }),
          ...(status && { status }),
          ...(startDate || endDate
            ? {
                sentAt: {
                  ...(startDate && { gte: new Date(startDate) }),
                  ...(endDate && { lte: new Date(endDate) }),
                },
              }
            : {}),
        },
      }),
    ])

    return { items, total, page, limit }
  }
}
