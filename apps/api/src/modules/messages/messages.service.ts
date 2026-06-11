import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SendMessageDto,
  CreateAutomationDto,
  PaginationDto,
  MessageQueryDto,
} from './dto/message.dto'

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── MSG-01 템플릿 목록 ────────────────────────────────────────────────────────

  async findTemplates(companyId: string, query: PaginationDto) {
    const { page, limit } = query
    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      this.prisma.messageTemplate.findMany({
        where: { companyId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.messageTemplate.count({ where: { companyId } }),
    ])

    return { items, total, page, limit }
  }

  // ── MSG-02 템플릿 생성 ────────────────────────────────────────────────────────

  async createTemplate(companyId: string, dto: CreateTemplateDto) {
    return this.prisma.messageTemplate.create({
      data: { companyId, ...dto },
    })
  }

  // ── MSG-03 템플릿 수정 ────────────────────────────────────────────────────────

  async updateTemplate(companyId: string, id: string, dto: UpdateTemplateDto) {
    await this.assertTemplateBelongsToCompany(companyId, id)

    return this.prisma.messageTemplate.update({
      where: { id },
      data: dto,
    })
  }

  // ── MSG-04 템플릿 삭제 ────────────────────────────────────────────────────────

  async deleteTemplate(companyId: string, id: string) {
    await this.assertTemplateBelongsToCompany(companyId, id)

    await this.prisma.messageTemplate.delete({ where: { id } })

    return { deleted: true }
  }

  // ── MSG-05 메시지 발송 ────────────────────────────────────────────────────────

  async sendMessage(companyId: string, senderId: string, dto: SendMessageDto) {
    const { templateId, title, content, recipientEmployeeIds } = dto

    if (templateId) {
      await this.assertTemplateBelongsToCompany(companyId, templateId)
    }

    await this.assertEmployeesBelongToCompany(companyId, recipientEmployeeIds)

    const message = await this.prisma.message.create({
      data: {
        companyId,
        type: 'manual',
        title,
        content,
        senderId,
        ...(templateId && { templateId }),
        recipients: {
          create: recipientEmployeeIds.map((recipientId) => ({ recipientId })),
        },
      },
      include: {
        recipients: true,
      },
    })

    return message
  }

  // ── MSG-06 수신 메시지 목록 ───────────────────────────────────────────────────

  async findMyMessages(employeeId: string, query: MessageQueryDto) {
    const { page, limit, unreadOnly } = query
    const skip = (page - 1) * limit

    const where = {
      recipientId: employeeId,
      ...(unreadOnly && { readAt: null }),
    }

    const [items, total] = await Promise.all([
      this.prisma.messageRecipient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          message: {
            select: {
              id: true,
              companyId: true,
              type: true,
              title: true,
              content: true,
              senderId: true,
              automationId: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.messageRecipient.count({ where }),
    ])

    return {
      items: items.map(({ readAt, message }: { readAt: Date | null; message: Record<string, unknown> }) => ({
        ...message,
        readAt,
      })),
      total,
      page,
      limit,
    }
  }

  // ── MSG-07 메시지 읽음 처리 ───────────────────────────────────────────────────

  async markAsRead(messageId: string, employeeId: string) {
    const recipient = await this.prisma.messageRecipient.findFirst({
      where: { messageId, recipientId: employeeId },
    })

    if (!recipient) {
      throw new NotFoundException({
        code: 'MESSAGE_RECIPIENT_NOT_FOUND',
        message: '메시지를 찾을 수 없습니다.',
      })
    }

    return this.prisma.messageRecipient.update({
      where: { id: recipient.id },
      data: { readAt: new Date() },
    })
  }

  // ── MSG-08 자동화 목록 ────────────────────────────────────────────────────────

  async findAutomations(companyId: string, query: PaginationDto) {
    const { page, limit } = query
    const skip = (page - 1) * limit

    const [items, total] = await Promise.all([
      this.prisma.messageAutomation.findMany({
        where: { companyId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          template: { select: { id: true, name: true } },
        },
      }),
      this.prisma.messageAutomation.count({ where: { companyId } }),
    ])

    return { items, total, page, limit }
  }

  // ── MSG-09 자동화 생성 ────────────────────────────────────────────────────────

  async createAutomation(companyId: string, dto: CreateAutomationDto) {
    await this.assertTemplateBelongsToCompany(companyId, dto.templateId)

    return this.prisma.messageAutomation.create({
      data: {
        companyId,
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      },
    })
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

  private async assertTemplateBelongsToCompany(companyId: string, templateId: string) {
    const template = await this.prisma.messageTemplate.findFirst({
      where: { id: templateId, companyId },
    })
    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: '템플릿을 찾을 수 없습니다.',
      })
    }
    return template
  }

  private async assertEmployeesBelongToCompany(
    companyId: string,
    employeeIds: string[],
  ) {
    const employees = await this.prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: { id: true },
    })

    if (employees.length !== employeeIds.length) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '수신자 중 회사 소속이 아닌 직원이 포함되어 있습니다.',
      })
    }
  }
}
