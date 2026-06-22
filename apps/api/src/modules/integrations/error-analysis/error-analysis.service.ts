import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OnEvent } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../../prisma/prisma.service'
import { MailService } from '../../mail/mail.service'
import { DiscordWebhookService } from '../../notifications/discord-webhook.service'
import { LlmService } from '../llm/llm.service'
import { EVENTS } from '../../../events/domain-events'
import { ApiErrorEvent } from '../../../common/filters/api-error-event'
import { ErrorAnalysisFilterDto, BulkResolveDto } from './dto/error-analysis-filter.dto'

/** 알림(이메일·Discord) 발송 성공 여부 */
interface NotifyResult {
  email: boolean
  discord: boolean
}

/** 같은 에러 시그니처는 이 시간 내 1회만 분석(중복 폭주 방지) */
const DEDUP_WINDOW_MS = 10 * 60 * 1000
/** 시간당 분석 상한(AI 호출 비용 보호) */
const HOURLY_CAP = 30
/**
 * 알림·분석·적재 대상에서 제외할 HTTP 상태 코드.
 * 404(NOT_FOUND)는 끊긴 링크·오타 경로·봇 탐색 등 정상 범주의 클라이언트 노이즈라
 * 알림 가치가 없고 AI 토큰만 소모하므로 파이프라인 진입 전에 차단한다.
 */
const IGNORED_STATUSES = new Set<number>([404])
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
      const aiEnabled = companyId ? await this.llm.isEnabled(companyId) : false
      const analysis = aiEnabled && companyId ? await this.analyze(companyId, e) : null
      const notified = await this.notify(e, analysis)
      // 회사 컨텍스트가 있을 때만 영속화(관리자 조회는 회사 스코프)
      if (companyId) await this.persist(companyId, e, analysis, aiEnabled, notified)
    } catch (err) {
      this.logger.warn(`error-analysis 실패: ${this.msg(err)}`)
    }
  }

  /** 제외 상태 코드 차단 + 시그니처 디둡 + 시간당 상한 */
  private shouldProcess(e: ApiErrorEvent): boolean {
    if (IGNORED_STATUSES.has(e.status)) return false
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

  /** 회사 AI로 원인/조치 분석 문자열 반환(실패 시 null). 활성 여부는 호출 측에서 판단. */
  private async analyze(companyId: string, e: ApiErrorEvent): Promise<string | null> {
    try {
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

  /** 상세 → 이메일, 경고 → Discord. 각 채널 발송 성공 여부를 반환. */
  private async notify(e: ApiErrorEvent, analysis: string | null): Promise<NotifyResult> {
    const title = `에러 ${e.status} ${e.code} — ${e.method} ${e.path}`
    const email = this.config.get<string>('ERROR_REPORT_EMAIL') || DEFAULT_REPORT_EMAIL
    const result: NotifyResult = { email: false, discord: false }

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
      result.email = true
    } catch (err) {
      this.logger.warn(`에러 메일 발송 실패: ${this.msg(err)}`)
    }

    const webhook = this.config.get<string>('DISCORD_ALERT_WEBHOOK_URL')
    if (!webhook) return result
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
      result.discord = true
    } catch (err) {
      this.logger.warn(`에러 Discord 발송 실패: ${this.msg(err)}`)
    }
    return result
  }

  /** 분석 결과를 영속화(관리자 조회용). 저장 실패가 알림을 깨지 않도록 예외를 삼킨다. */
  private async persist(
    companyId: string,
    e: ApiErrorEvent,
    analysis: string | null,
    aiEnabled: boolean,
    notified: NotifyResult,
  ): Promise<void> {
    try {
      await this.prisma.errorAnalysisLog.create({
        data: {
          companyId,
          status: e.status,
          code: e.code,
          message: e.message,
          method: e.method,
          path: e.path,
          userId: e.userId ?? null,
          detail:
            e.details === undefined || e.details === null
              ? Prisma.JsonNull
              : (e.details as Prisma.InputJsonValue),
          stack: e.stack ?? null,
          aiAnalysis: analysis,
          aiEnabled,
          notifiedEmail: notified.email,
          notifiedDiscord: notified.discord,
        },
      })
    } catch (err) {
      this.logger.warn(`에러 분석 로그 저장 실패: ${this.msg(err)}`)
    }
  }

  // ── 조회 (관리자: 부가기능 > AI 에러 분석) ──────────────────────────────────

  async findAll(companyId: string, filter: ErrorAnalysisFilterDto) {
    const { page, limit } = filter
    const skip = (page - 1) * limit
    const where = this.buildWhere(companyId, filter)

    const [items, total] = await Promise.all([
      this.prisma.errorAnalysisLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.errorAnalysisLog.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async findOne(companyId: string, id: string) {
    return this.prisma.errorAnalysisLog.findFirst({ where: { id, companyId } })
  }

  /**
   * 처리 상태 일괄 변경. companyId 스코프로 타 회사 레코드는 건드리지 않는다.
   * RESOLVED 처리 시 처리시각·처리자를 기록하고, OPEN으로 되돌리면 초기화한다.
   */
  async bulkResolve(
    companyId: string,
    dto: BulkResolveDto,
    employeeId: string,
  ): Promise<{ count: number }> {
    const resolved = dto.status === 'RESOLVED'
    const result = await this.prisma.errorAnalysisLog.updateMany({
      where: { id: { in: dto.ids }, companyId },
      data: {
        resolutionStatus: dto.status,
        resolvedAt: resolved ? new Date() : null,
        resolvedById: resolved ? employeeId : null,
      },
    })
    return { count: result.count }
  }

  /** 현재 필터에 해당하는 로그를 CSV(UTF-8 BOM)로 생성. 페이지네이션 없이 상한까지. */
  async exportCsv(companyId: string, filter: ErrorAnalysisFilterDto): Promise<string> {
    const where = this.buildWhere(companyId, filter)
    const items = await this.prisma.errorAnalysisLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: EXPORT_ROW_CAP,
    })
    return this.toCsv(items)
  }

  /** findAll·exportCsv 공통 where 절. */
  private buildWhere(
    companyId: string,
    filter: ErrorAnalysisFilterDto,
  ): Prisma.ErrorAnalysisLogWhereInput {
    const { startDate, endDate, from, to, resolutionStatus, status, method, search } = filter
    const range = this.buildDateRange(startDate, endDate, from, to)
    return {
      companyId,
      ...(resolutionStatus && { resolutionStatus }),
      ...(status !== undefined && { status }),
      ...(method && { method }),
      ...(range && { createdAt: range }),
      ...(search && {
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { message: { contains: search, mode: 'insensitive' } },
          { path: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }
  }

  /** 시간 단위(from/to) 우선, 없으면 날짜 단위(startDate/endDate). */
  private buildDateRange(
    startDate?: string,
    endDate?: string,
    from?: string,
    to?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (from || to) {
      const range: Prisma.DateTimeFilter = {}
      if (from) range.gte = new Date(from)
      if (to) range.lte = new Date(to)
      return range
    }
    if (!startDate && !endDate) return undefined
    const range: Prisma.DateTimeFilter = {}
    if (startDate) range.gte = new Date(`${startDate}T00:00:00.000Z`)
    if (endDate) range.lte = new Date(`${endDate}T23:59:59.999Z`)
    return range
  }

  private toCsv(items: ErrorAnalysisLogRow[]): string {
    const header = [
      '발생시각(KST)',
      '처리상태',
      'HTTP',
      '코드',
      '메서드',
      '경로',
      '메시지',
      'AI분석',
      '이메일통지',
      'Discord통지',
      '완료시각(KST)',
    ]
    const lines = items.map((i) =>
      [
        toKst(i.createdAt),
        i.resolutionStatus === 'RESOLVED' ? '완료' : '미해결',
        String(i.status),
        i.code,
        i.method,
        i.path,
        i.message,
        i.aiAnalysis ? '분석됨' : i.aiEnabled ? '실패' : '미설정',
        i.notifiedEmail ? 'Y' : 'N',
        i.notifiedDiscord ? 'Y' : 'N',
        i.resolvedAt ? toKst(i.resolvedAt) : '',
      ]
        .map(csvEscape)
        .join(','),
    )
    // BOM + CRLF: Excel 한글 깨짐 방지
    return '﻿' + [header.map(csvEscape).join(','), ...lines].join('\r\n')
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }
}

/** CSV export 최대 행 수(메모리·응답 크기 보호) */
const EXPORT_ROW_CAP = 5000

/** CSV에 필요한 최소 필드 형태 */
interface ErrorAnalysisLogRow {
  createdAt: Date
  resolutionStatus: string
  status: number
  code: string
  method: string
  path: string
  message: string
  aiAnalysis: string | null
  aiEnabled: boolean
  notifiedEmail: boolean
  notifiedDiscord: boolean
  resolvedAt: Date | null
}

/** RFC 4180: 쉼표·따옴표·개행 포함 값은 따옴표로 감싸고 내부 따옴표는 이중화. */
function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** UTC Date → 'YYYY-MM-DD HH:mm:ss' (Asia/Seoul). sv-SE 로케일이 ISO 유사 포맷을 준다. */
function toKst(d: Date): string {
  return new Date(d).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' })
}
