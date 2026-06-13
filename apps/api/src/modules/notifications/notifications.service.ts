import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
  UpdateWebhookDto,
  UpdateEventRuleDto,
  ListNotificationRulesQueryDto,
  ListNotificationLogsQueryDto,
} from './dto/notification-rule.dto'

/** 규칙이 하나도 없을 때 webhook 설정과 함께 생성할 기본 이벤트 목록 */
const DEFAULT_EVENT_TYPES = [
  'clock_in',
  'clock_out',
  'late',
  'absent',
  'leave_request',
  'leave_approved',
  'request_approved',
] as const

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
        eventType: dto.eventType,
        channelType: dto.channelType,
        webhookUrl: dto.webhookUrl,
        triggerCondition: (dto.triggerCondition ?? undefined) as Prisma.InputJsonValue | undefined,
        embedTemplate: (dto.embedTemplate ?? undefined) as Prisma.InputJsonValue | undefined,
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
      // 멀티테넌시: id 단독이 아닌 companyId를 함께 조건에 포함해 타 회사 규칙 수정을 차단한다.
      where: { id, companyId },
      data: {
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(dto.channelType !== undefined && { channelType: dto.channelType }),
        ...(dto.webhookUrl !== undefined && { webhookUrl: dto.webhookUrl }),
        ...(dto.triggerCondition !== undefined && {
          triggerCondition: dto.triggerCondition as Prisma.InputJsonValue,
        }),
        ...(dto.embedTemplate !== undefined && {
          embedTemplate: dto.embedTemplate as Prisma.InputJsonValue,
        }),
        ...(dto.messageTemplateId !== undefined && { messageTemplateId: dto.messageTemplateId }),
        ...(dto.cronExpression !== undefined && { cronExpression: dto.cronExpression }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })
  }

  /**
   * 회사의 모든 알림 규칙 webhookUrl 일괄 갱신.
   * 규칙이 하나도 없으면 기본 이벤트 규칙들을 webhookUrl과 함께 생성한다.
   */
  async updateWebhook(companyId: string, dto: UpdateWebhookDto) {
    const webhookUrl = dto.webhookUrl === '' ? null : dto.webhookUrl

    const count = await this.prisma.notificationRule.count({ where: { companyId } })

    if (count === 0) {
      await this.prisma.notificationRule.createMany({
        data: DEFAULT_EVENT_TYPES.map((eventType) => ({
          companyId,
          eventType,
          channelType: 'discord',
          webhookUrl,
          isActive: true,
        })),
      })
    } else {
      await this.prisma.notificationRule.updateMany({
        where: { companyId },
        data: { webhookUrl },
      })
    }

    return this.prisma.notificationRule.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * 이벤트별 알림 규칙 활성/비활성 upsert.
   * 규칙이 없으면 생성하며, webhookUrl은 기존 회사 규칙에서 상속한다.
   */
  async updateEventRule(companyId: string, dto: UpdateEventRuleDto) {
    const { eventType, isActive } = dto

    const existing = await this.prisma.notificationRule.findFirst({
      where: { companyId, eventType },
    })

    if (existing) {
      return this.prisma.notificationRule.update({
        where: { id: existing.id },
        data: { isActive },
      })
    }

    const sibling = await this.prisma.notificationRule.findFirst({
      where: { companyId, webhookUrl: { not: null } },
    })

    return this.prisma.notificationRule.create({
      data: {
        companyId,
        eventType,
        channelType: 'discord',
        webhookUrl: sibling?.webhookUrl ?? null,
        isActive,
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
