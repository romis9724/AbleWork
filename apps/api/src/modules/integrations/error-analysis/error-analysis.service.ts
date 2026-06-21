import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailService } from '../../mail/mail.service'
import { DiscordWebhookService } from '../../notifications/discord-webhook.service'
import { LlmService } from '../llm/llm.service'
import { EVENTS } from '../../../events/domain-events'
import { ApiErrorEvent } from '../../../common/filters/api-error-event'

/** 같은 에러 시그니처는 이 시간 내 1회만 분석(중복 폭주 방지) */
const DEDUP_WINDOW_MS = 10 * 60 * 1000
/** 시간당 분석 상한(AI 호출 비용 보호) */
const HOURLY_CAP = 30
/** AI 분석 타임아웃 */
const AI_TIMEOUT_MS = 20_000
const DEFAULT_REPORT_EMAIL = 'romis@naver.com'

/**
 * API 에러를 회사 AI 설정으로 분석해 상세는 이메일, 경고는 Discord로 전송.
 * 부가 기능이므로 어떤 단계가 실패해도 절대 throw 하지 않는다.
 */
@Injectable()
export class ErrorAnalysisService {
  private readonly logger = new Logger(ErrorAnalysisService.name)
  private readonly seen = new Map<string, number>() // signature → lastTs
  private hourWindowStart = Date.now()
  private hourCount = 0

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly mail: MailService,
    private readonly discord: DiscordWebhookService,
  ) {}

  @OnEvent(EVENTS.API_ERROR_DETECTED)
  async handle(e: ApiErrorEvent): Promise<void> {
    try {
      if (!this.shouldProcess(e)) return
      const companyId = e.companyId ?? (await this.defaultCompanyId())
      const analysis = companyId ? await this.analyze(companyId, e) : null
      await this.notify(e, analysis)
    } catch (err) {
      this.logger.warn(`error-analysis 실패: ${this.msg(err)}`)
    }
  }

  /** 시그니처 디둡 + 시간당 상한 */
  private shouldProcess(e: ApiErrorEvent): boolean {
    const now = Date.now()
    if (now - this.hourWindowStart > 3_600_000) {
      this.hourWindowStart = now
      this.hourCount = 0
    }
    if (this.hourCount >= HOURLY_CAP) return false
    const sig = `${e.status}:${e.code}:${e.path}`
    const last = this.seen.get(sig)
    if (last !== undefined && now - last < DEDUP_WINDOW_MS) return false
    this.seen.set(sig, now)
    this.hourCount += 1
    this.prune(now)
    return true
  }

  private prune(now: number): void {
    if (this.seen.size < 500) return
    for (const [k, t] of this.seen) {
      if (now - t > DEDUP_WINDOW_MS) this.seen.delete(k)
    }
  }

  private async defaultCompanyId(): Promise<string | undefined> {
    const c = await this.prisma.company.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return c?.id
  }

  /** 회사 AI가 활성일 때만 분석 문자열 반환, 아니면 null */
  private async analyze(companyId: string, e: ApiErrorEvent): Promise<string | null> {
    try {
      if (!(await this.llm.isEnabled(companyId))) return null
      const ctx = [
        `HTTP ${e.status} ${e.code}`,
        `${e.method} ${e.path}`,
        `메시지: ${e.message}`,
        e.details ? `상세: ${JSON.stringify(e.details).slice(0, 1500)}` : '',
        e.stack ? `스택:\n${e.stack.slice(0, 2000)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      return await this.llm.chat(
        companyId,
        [
          {
            role: 'system',
            content:
              '너는 백엔드 SRE 보조다. 주어진 API 에러에 대해 (1) 추정 원인 (2) 영향 범위 (3) 조치 방안을 한국어로 항목별로 간결히 분석하라. 코드·설정·데이터 관점에서 구체적으로, 추측은 추측이라 명시.',
          },
          { role: 'user', content: `다음 API 에러를 분석하라:\n${ctx}` },
        ],
        { timeoutMs: AI_TIMEOUT_MS },
      )
    } catch (err) {
      this.logger.warn(`AI 분석 실패: ${this.msg(err)}`)
      return null
    }
  }

  /** 상세 → 이메일, 경고 → Discord */
  private async notify(e: ApiErrorEvent, analysis: string | null): Promise<void> {
    const title = `에러 ${e.status} ${e.code} — ${e.method} ${e.path}`
    const email = this.config.get<string>('ERROR_REPORT_EMAIL') || DEFAULT_REPORT_EMAIL

    const detail = [
      `발생시각: ${e.at}`,
      `요청: ${e.method} ${e.path}`,
      `상태: HTTP ${e.status} (${e.code})`,
      `메시지: ${e.message}`,
      e.companyId ? `회사: ${e.companyId}` : '',
      e.userId ? `사용자: ${e.userId}` : '',
      e.details ? `검증/상세: ${JSON.stringify(e.details)}` : '',
      e.stack ? `\n[스택]\n${e.stack}` : '',
      '',
      '[AI 분석]',
      analysis ??
        '(AI 미설정 또는 분석 실패 — 환경설정 > AI에서 활성화하면 원인 분석이 자동 첨부됩니다.)',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      await this.mail.sendMessageMail(email, title, detail)
    } catch (err) {
      this.logger.warn(`에러 메일 발송 실패: ${this.msg(err)}`)
    }

    const webhook = this.config.get<string>('DISCORD_ALERT_WEBHOOK_URL')
    if (!webhook) return
    const oneLine = analysis
      ? (analysis.split('\n').find((l) => l.trim()) ?? '').slice(0, 300)
      : '(AI 미설정 — 상세는 이메일 참조)'
    const embed = {
      title: `⚠ API 에러 ${e.status} ${e.code}`,
      color: e.status >= 500 ? 0xe74c3c : 0xf1c40f,
      description: `**${e.method} ${e.path}**\n${e.message}`.slice(0, 1000),
      fields: [
        { name: '추정 원인(요약)', value: oneLine || '-' },
        { name: '상세', value: `이메일(${email}) 참조` },
      ],
      footer: { text: `AbleWork · ${e.at}` },
    }
    try {
      await this.discord.send(webhook, embed)
    } catch (err) {
      this.logger.warn(`에러 Discord 발송 실패: ${this.msg(err)}`)
    }
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }
}
