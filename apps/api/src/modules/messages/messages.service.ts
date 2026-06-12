import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SendMessageDto,
  CreateAutomationDto,
  UpdateAutomationDto,
  ReadMessageDto,
  PaginationDto,
  MessageQueryDto,
} from './dto/message.dto'

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

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
    const { templateId, title, content, recipientEmployeeIds, sendEmail } = dto

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
        templateId: templateId ?? null,
        sendEmail,
        recipients: {
          create: recipientEmployeeIds.map((recipientId) => ({ recipientId })),
        },
      },
      include: {
        recipients: true,
      },
    })

    // 이메일 실발송 — fire-and-forget. 실패해도 메시지 저장은 유지된다.
    if (sendEmail) {
      void this.dispatchMessageEmails(companyId, recipientEmployeeIds, title, content)
    }

    return message
  }

  /** 수신 직원들의 User 이메일을 조회하여 발송. 실패는 로깅만 한다. */
  private async dispatchMessageEmails(
    companyId: string,
    recipientEmployeeIds: string[],
    title: string,
    content: string,
  ): Promise<void> {
    try {
      const employees = await this.prisma.employee.findMany({
        where: { companyId, id: { in: recipientEmployeeIds } },
        select: { user: { select: { email: true } } },
      })

      const emails = employees
        .map((e) => e.user?.email)
        .filter((email): email is string => !!email)

      await Promise.all(
        emails.map((email) => this.mail.sendMessageMail(email, title, content)),
      )
    } catch (error) {
      this.logger.error('메시지 이메일 발송 중 오류', error)
    }
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
        orderBy: { id: 'desc' },
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
              sentAt: true,
            },
          },
        },
      }),
      this.prisma.messageRecipient.count({ where }),
    ])

    return {
      items: items.map(({ readAt, message }) => ({
        ...message,
        readAt,
      })),
      total,
      page,
      limit,
    }
  }

  // ── MSG-07 메시지 읽음 처리 ───────────────────────────────────────────────────

  async markAsRead(messageId: string, employeeId: string, dto?: ReadMessageDto) {
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
      data: {
        readAt: recipient.readAt ?? new Date(),
        ...(dto?.note !== undefined && { note: dto.note }),
      },
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
        name: dto.name,
        automationType: dto.automationType,
        triggerBasis: dto.triggerBasis,
        offsetDays: dto.offsetDays,
        sendTime: this.toSendTimeDate(dto.sendTime),
        sendEmail: dto.sendEmail,
        leaveTypeId: dto.leaveTypeId,
        templateId: dto.templateId,
        isActive: dto.isActive,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
      },
    })
  }

  // ── MSG-10 자동화 수정 ────────────────────────────────────────────────────────

  async updateAutomation(companyId: string, id: string, dto: UpdateAutomationDto) {
    await this.assertAutomationBelongsToCompany(companyId, id)

    if (dto.templateId) {
      await this.assertTemplateBelongsToCompany(companyId, dto.templateId)
    }

    return this.prisma.messageAutomation.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.automationType !== undefined && { automationType: dto.automationType }),
        ...(dto.triggerBasis !== undefined && { triggerBasis: dto.triggerBasis }),
        ...(dto.offsetDays !== undefined && { offsetDays: dto.offsetDays }),
        ...(dto.sendTime !== undefined && { sendTime: this.toSendTimeDate(dto.sendTime) }),
        ...(dto.sendEmail !== undefined && { sendEmail: dto.sendEmail }),
        ...(dto.leaveTypeId !== undefined && { leaveTypeId: dto.leaveTypeId }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.startsAt !== undefined && { startsAt: new Date(dto.startsAt) }),
      },
    })
  }

  // ── MSG-11 자동화 삭제 ────────────────────────────────────────────────────────

  async deleteAutomation(companyId: string, id: string) {
    await this.assertAutomationBelongsToCompany(companyId, id)

    await this.prisma.messageAutomation.delete({ where: { id } })

    return { deleted: true }
  }

  // ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

  /** 'HH:mm' 문자열을 Prisma @db.Time 컬럼용 Date 값으로 변환 */
  private toSendTimeDate(sendTime: string): Date {
    return new Date(`1970-01-01T${sendTime}:00.000Z`)
  }

  private async assertAutomationBelongsToCompany(companyId: string, id: string) {
    const automation = await this.prisma.messageAutomation.findFirst({
      where: { id, companyId },
    })
    if (!automation) {
      throw new NotFoundException({
        code: 'AUTOMATION_NOT_FOUND',
        message: '자동화 규칙을 찾을 수 없습니다.',
      })
    }
    return automation
  }

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
