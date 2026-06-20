import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { MailService } from '../mail/mail.service'

// ── 상수 ──────────────────────────────────────────────────────────────────────

const DEFAULT_SEND_HOUR = 9
const DEFAULT_TIMEZONE = 'Asia/Seoul'
const MS_PER_DAY = 24 * 60 * 60 * 1000
const LEAVE_TRIGGER_BASES = ['leave_start', 'leave_end'] as const

type LeaveTriggerBasis = (typeof LEAVE_TRIGGER_BASES)[number]

interface RecipientTarget {
  id: string
  name: string
  email: string | null
}

// ── 순수 헬퍼 (단위 테스트 대상) ───────────────────────────────────────────────

/**
 * 템플릿 변수 치환. `{{이름}}` 과 `#{이름}` 두 문법을 모두 지원한다(FE 안내가 `#{}` 형식이므로).
 * 매칭되지 않는 변수는 원문 유지.
 */
export function renderTemplate(
  content: string,
  vars: Record<string, string>,
): string {
  const sub = (match: string, key: string) => (vars[key] !== undefined ? vars[key] : match)
  return content
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, sub) // {{변수}}
    .replace(/#\{\s*([^{}]+?)\s*\}/g, sub) // #{변수}
}

/** 해당 타임존 기준 'YYYY-MM-DD' 날짜 문자열 */
export function formatDateInTz(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/** 해당 타임존 기준 현재 시(0~23) */
export function getHourInTz(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return Number(hour)
}

/** 'YYYY-MM-DD' 문자열에 일수를 더한 새 날짜 문자열 반환 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const base = Date.parse(`${dateStr}T00:00:00.000Z`)
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** 해당 타임존의 UTC 오프셋(ms) */
function getTzOffsetMs(date: Date, timeZone: string): number {
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const local = new Date(date.toLocaleString('en-US', { timeZone }))
  return local.getTime() - utc.getTime()
}

/** 해당 타임존 기준 '오늘'의 시작/끝 UTC 시각 (멱등성 검사용) */
export function getDayRangeInTz(
  date: Date,
  timeZone: string,
): { start: Date; end: Date } {
  const dayStr = formatDateInTz(date, timeZone)
  const offsetMs = getTzOffsetMs(date, timeZone)
  const start = new Date(Date.parse(`${dayStr}T00:00:00.000Z`) - offsetMs)
  const end = new Date(start.getTime() + MS_PER_DAY)
  return { start, end }
}

function isLeaveTriggerBasis(basis: string): basis is LeaveTriggerBasis {
  return (LEAVE_TRIGGER_BASES as readonly string[]).includes(basis)
}

// ── Processor ─────────────────────────────────────────────────────────────────

@Processor('message-automation')
export class MessageAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageAutomationProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {
    super()
  }

  async process(
    job: Job<{ automationId: string; triggeredAt: string }>,
  ): Promise<void> {
    const { automationId, triggeredAt } = job.data
    const now = triggeredAt ? new Date(triggeredAt) : new Date()

    // 1. 자동화 + 템플릿 + 회사 로드
    const automation = await this.prisma.messageAutomation.findUnique({
      where: { id: automationId },
      include: {
        template: true,
        company: { select: { name: true } },
      },
    })

    if (!automation) {
      this.logger.warn(`자동화를 찾을 수 없습니다: ${automationId}`)
      return
    }

    if (!automation.isActive) {
      this.logger.log(`자동화 ${automationId}: 비활성 상태 — 스킵`)
      return
    }

    const timezone = automation.timezone || DEFAULT_TIMEZONE
    const todayStr = formatDateInTz(now, timezone)

    // 2. startsAt 이전이면 스킵 (@db.Date → UTC 자정 기준 날짜 문자열 비교)
    const startsAtStr = automation.startsAt.toISOString().slice(0, 10)
    if (startsAtStr > todayStr) {
      this.logger.log(
        `자동화 ${automationId}: 시작일(${startsAtStr}) 이전 — 스킵`,
      )
      return
    }

    // 3. sendTime 시(hour) 매칭 — 스케줄러가 매시간 실행되므로 현재 시와 일치할 때만 발송
    const sendHour = automation.sendTime
      ? automation.sendTime.getUTCHours()
      : DEFAULT_SEND_HOUR
    const currentHour = getHourInTz(now, timezone)
    if (sendHour !== currentHour) {
      return
    }

    // 4. 멱등성 — 같은 자동화가 같은 날(타임존 기준) 이미 발송됐으면 스킵
    const { start, end } = getDayRangeInTz(now, timezone)
    const alreadySent = await this.prisma.message.findFirst({
      where: {
        companyId: automation.companyId,
        automationId: automation.id,
        sentAt: { gte: start, lt: end },
      },
      select: { id: true },
    })
    if (alreadySent) {
      this.logger.log(`자동화 ${automationId}: 당일 발송 이력 존재 — 스킵`)
      return
    }

    // 5. 수신자 추출 (휴가 기반 트리거 vs 일반 공지형)
    const recipients = await this.resolveRecipients(automation, todayStr)
    if (recipients.length === 0) {
      this.logger.log(`자동화 ${automationId}: 대상 직원이 없습니다.`)
      return
    }

    // 6. 변수 치환 후 메시지 생성
    const monthStr = String(Number(todayStr.slice(5, 7))) // '6' 형식
    const baseVars: Record<string, string> = {
      회사명: automation.company.name,
      company: automation.company.name,
      날짜: todayStr,
      date: todayStr,
      월: monthStr,
      month: monthStr,
    }
    // {{이름}}·#{이름}·#{employee} 등 수신자 개인화 변수 사용 여부
    const hasPerRecipientVars = /(?:\{\{|#\{)\s*(이름|name|employee)\s*\}/.test(
      automation.template.content,
    )

    if (hasPerRecipientVars) {
      // 수신자별 개인화 콘텐츠 → 수신자당 Message 1건
      await this.prisma.$transaction(
        recipients.map((recipient) =>
          this.prisma.message.create({
            data: {
              companyId: automation.companyId,
              type: 'automated',
              title: automation.name,
              content: renderTemplate(automation.template.content, {
                ...baseVars,
                이름: recipient.name,
                name: recipient.name,
                employee: recipient.name,
              }),
              automationId: automation.id,
              templateId: automation.templateId,
              sendEmail: automation.sendEmail,
              recipients: { create: [{ recipientId: recipient.id }] },
            },
          }),
        ),
      )
    } else {
      // 공통 콘텐츠 → Message 1건 + 수신자 일괄
      await this.prisma.message.create({
        data: {
          companyId: automation.companyId,
          type: 'automated',
          title: automation.name,
          content: renderTemplate(automation.template.content, baseVars),
          automationId: automation.id,
          templateId: automation.templateId,
          sendEmail: automation.sendEmail,
          recipients: {
            create: recipients.map((r) => ({ recipientId: r.id })),
          },
        },
      })
    }

    // 7. 이메일 실발송 (fire-and-forget — 실패해도 메시지 저장은 유지)
    if (automation.sendEmail) {
      void this.dispatchEmails(automation.name, automation.template.content, baseVars, recipients)
    }

    this.logger.log(
      `자동화 처리 완료 ${automationId}: ${recipients.length}명에게 발송`,
    )
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  /**
   * 트리거 기준에 따라 수신자를 추출한다.
   * - leave_start / leave_end: 해당 날짜(오늘 - offsetDays)에 휴가가 시작/종료되는 직원만
   * - 그 외(일반 공지형): 회사의 활성 직원 전체
   */
  private async resolveRecipients(
    automation: {
      companyId: string
      triggerBasis: string
      offsetDays: number
      leaveTypeId: string | null
    },
    todayStr: string,
  ): Promise<RecipientTarget[]> {
    if (isLeaveTriggerBasis(automation.triggerBasis)) {
      // 발송일 = 휴가 기준일 + offsetDays → 오늘 발송 대상 휴가 기준일 = 오늘 - offsetDays
      const targetDateStr = addDaysToDateString(todayStr, -automation.offsetDays)
      const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`)
      const dateField =
        automation.triggerBasis === 'leave_start' ? 'startDate' : 'endDate'

      const leaves = await this.prisma.leave.findMany({
        where: {
          [dateField]: targetDate,
          status: 'APPROVED',
          ...(automation.leaveTypeId && {
            leaveTypeId: automation.leaveTypeId,
          }),
          employee: { companyId: automation.companyId, isActive: true },
        },
        select: {
          employee: {
            select: {
              id: true,
              name: true,
              user: { select: { email: true } },
            },
          },
        },
      })

      // 동일 직원 중복 제거
      const unique = new Map<string, RecipientTarget>()
      for (const leave of leaves) {
        unique.set(leave.employee.id, {
          id: leave.employee.id,
          name: leave.employee.name,
          email: leave.employee.user?.email ?? null,
        })
      }
      return [...unique.values()]
    }

    const employees = await this.prisma.employee.findMany({
      where: { companyId: automation.companyId, isActive: true },
      select: {
        id: true,
        name: true,
        user: { select: { email: true } },
      },
    })

    return employees.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.user?.email ?? null,
    }))
  }

  /** 수신자별 이메일 발송 — 실패는 MailService에서 로깅만 하고 throw 하지 않는다 */
  private async dispatchEmails(
    title: string,
    templateContent: string,
    baseVars: Record<string, string>,
    recipients: RecipientTarget[],
  ): Promise<void> {
    try {
      await Promise.all(
        recipients
          .filter((r): r is RecipientTarget & { email: string } => !!r.email)
          .map((recipient) =>
            this.mail.sendMessageMail(
              recipient.email,
              title,
              renderTemplate(templateContent, {
                ...baseVars,
                이름: recipient.name,
                name: recipient.name,
              }),
            ),
          ),
      )
    } catch (error) {
      this.logger.error('자동화 이메일 발송 중 오류', error)
    }
  }
}
