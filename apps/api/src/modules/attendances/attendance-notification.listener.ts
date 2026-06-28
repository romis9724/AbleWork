import { Inject, Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'
import {
  MESSENGER_PROVIDER,
  MessengerProvider,
} from '../integrations/messenger/messenger-provider.interface'
import { EVENTS } from '../../events/domain-events'

interface ClockEventPayload {
  companyId: string
  employeeId: string
  status?: string
}
interface NoShowPayload {
  companyId: string
  employeeId: string
  minute: number
}

/**
 * 출퇴근 알림 — 개인 DM(Discord) 중심.
 * - 출근/지각: 소속 부서 팀장(approverId)에게 발송(본인 제외)
 * - 미출근 독촉: 본인에게 발송
 * 수신자가 Discord 미연동이거나 DM 실패 시 인앱 메시지 + 이메일로 폴백한다.
 * 회사 알림 설정(NotificationRule)에서 해당 이벤트가 비활성이면 발송하지 않는다.
 */
@Injectable()
export class AttendanceNotificationListener {
  private readonly logger = new Logger(AttendanceNotificationListener.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    @Inject(MESSENGER_PROVIDER) private readonly messenger: MessengerProvider,
  ) {}

  @OnEvent(EVENTS.ATTENDANCE_CLOCK_IN)
  async onClockIn(payload: ClockEventPayload) {
    // 지각은 별도 이벤트(ATTENDANCE_LATE)로 처리되므로 정상 출근만 여기서 알린다
    if (payload.status === 'late') return
    const name = await this.employeeName(payload.employeeId)
    await this.notifyManager(
      payload.companyId,
      payload.employeeId,
      EVENTS.ATTENDANCE_CLOCK_IN,
      '출근 알림',
      `${name}님이 출근했습니다.`,
    )
  }

  @OnEvent(EVENTS.ATTENDANCE_LATE)
  async onLate(payload: ClockEventPayload) {
    const name = await this.employeeName(payload.employeeId)
    await this.notifyManager(
      payload.companyId,
      payload.employeeId,
      EVENTS.ATTENDANCE_LATE,
      '지각 알림',
      `${name}님이 지각했습니다.`,
    )
  }

  @OnEvent(EVENTS.ATTENDANCE_NO_SHOW_REMINDER)
  async onNoShow(payload: NoShowPayload) {
    await this.notify(
      payload.companyId,
      payload.employeeId,
      EVENTS.ATTENDANCE_NO_SHOW_REMINDER,
      '출근 알림',
      `근무 시작 후 ${payload.minute}분이 지났습니다. 아직 출근 기록이 없어요. 출근해 주세요.`,
    )
  }

  // ── 내부 ────────────────────────────────────────────────────────────────────

  private async employeeName(employeeId: string): Promise<string> {
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { name: true },
    })
    return emp?.name ?? '직원'
  }

  /** 출근 직원의 소속 부서 팀장(approverId)에게 알림 — 팀장이 없거나 본인이면 발송하지 않음 */
  private async notifyManager(
    companyId: string,
    employeeId: string,
    eventType: string,
    title: string,
    body: string,
  ) {
    const primary = await this.prisma.employeeOrganization.findFirst({
      where: { employeeId, isPrimary: true },
      select: { organization: { select: { approverId: true } } },
    })
    const managerId = primary?.organization?.approverId
    if (!managerId || managerId === employeeId) return // 팀장 없음 또는 본인=팀장 → 본인 제외
    await this.notify(companyId, managerId, eventType, title, body)
  }

  /** 수신자에게 DM(연동 시) 또는 인앱+이메일(폴백)로 발송. 이벤트 비활성 시 skip. */
  private async notify(
    companyId: string,
    recipientEmployeeId: string,
    eventType: string,
    title: string,
    body: string,
  ) {
    // 알림 설정에서 해당 이벤트가 비활성이면 발송하지 않는다(규칙 없으면 기본 발송)
    const rule = await this.prisma.notificationRule.findFirst({
      where: { companyId, eventType },
      select: { isActive: true },
    })
    if (rule && !rule.isActive) return

    // 1순위: Discord 개인 DM
    const account = await this.prisma.messengerAccount.findFirst({
      where: { companyId, employeeId: recipientEmployeeId, platform: 'discord' },
      select: { externalUserId: true },
    })
    if (account) {
      try {
        await this.messenger.sendDirectMessage(account.externalUserId, { title, description: body })
        return
      } catch (e) {
        this.logger.warn(`Discord DM 발송 실패 — 인앱/이메일로 폴백 (employee: ${recipientEmployeeId})`, e as Error)
      }
    }

    // 폴백: 인앱 메시지 + 이메일
    await this.prisma.message.create({
      data: {
        companyId,
        type: 'automated',
        title,
        content: body,
        recipients: { create: [{ recipientId: recipientEmployeeId }] },
      },
    })
    const recipient = await this.prisma.employee.findUnique({
      where: { id: recipientEmployeeId },
      select: { user: { select: { email: true } } },
    })
    if (recipient?.user?.email) {
      try {
        await this.mail.sendMessageMail(recipient.user.email, title, body)
      } catch {
        // 이메일 실패는 무시(인앱 메시지는 이미 기록됨)
      }
    }
  }
}
