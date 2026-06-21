import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { NOTIFIABLE_EVENTS } from '@ablework/shared-constants'
import { EVENTS } from '../../../events/domain-events'
import { PrismaService } from '../../../prisma/prisma.service'
import { LlmService } from '../llm/llm.service'
import {
  ApprovalField,
  ApprovalMessagePayload,
  MESSENGER_PROVIDER,
  MessengerProvider,
} from './messenger-provider.interface'

/** 상신(결재 요청) 이벤트만 — EVENTS에서 *_REQUESTED 파생(SSOT). 새 요청 유형 추가 시 자동 포함 */
const REQUEST_EVENTS: string[] = Object.entries(EVENTS)
  .filter(([key]) => key.endsWith('_REQUESTED'))
  .map(([, value]) => value)

/** 이벤트명 → 한국어 라벨 (DM 제목 구성용) — NOTIFIABLE_EVENTS(SSOT)에서 파생 */
const EVENT_LABEL: Record<string, string> = Object.fromEntries(
  NOTIFIABLE_EVENTS.map((e) => [e.event, e.label]),
)

/**
 * 신청 payload 필드 → 한국어 라벨. 이 정의 순서가 곧 표시 우선순위다
 * (JSONB는 키 순서를 보존하지 않으므로 아래에서 명시적으로 정렬한다).
 */
const PAYLOAD_LABELS: Record<string, string> = {
  title: '제목',
  content: '내용',
  startDate: '시작일',
  endDate: '종료일',
  startAt: '시작',
  endAt: '종료',
  date: '일자',
  days: '일수',
  hours: '시간',
  amount: '금액',
  reason: '사유',
  memo: '메모',
  note: '비고',
}

/** 라벨 정의 순서를 표시 우선순위로 사용 */
const FIELD_PRIORITY = Object.keys(PAYLOAD_LABELS)

/** 결재 내용 본문에 표시할 최대 항목 수 (Discord embed 가독성) */
const MAX_CONTENT_FIELDS = 6

/**
 * 신청 내용(JSON payload)에서 사람이 읽을 항목만 추출한다.
 * - ID성 필드·중첩값 제외(2순위 AI 요약이 자연어로 정리)
 * - JSONB 키 순서가 비결정적이므로 라벨 정의 순서로 정렬(미지 키는 뒤)
 * - 최대 MAX_CONTENT_FIELDS개
 */
function buildContentFields(content: unknown): ApprovalField[] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return []
  const obj = content as Record<string, unknown>
  const orderOf = (key: string): number => {
    const i = FIELD_PRIORITY.indexOf(key)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const keys = Object.keys(obj)
    .filter((key) => obj[key] != null && typeof obj[key] !== 'object' && !/id$/i.test(key))
    .sort((a, b) => orderOf(a) - orderOf(b))

  return keys.slice(0, MAX_CONTENT_FIELDS).map((key) => ({
    name: PAYLOAD_LABELS[key] ?? key,
    value: String(obj[key]).slice(0, 1024),
  }))
}

/** 상신 이벤트 payload (requests.service가 emit하는 형태) */
interface RequestedPayload {
  requestId?: string
  documentId?: string
  companyId?: string
}

/**
 * 메신저 양방향 결재 — 상신(*_REQUESTED) 발생 시 현재 결재자에게 DM으로 [승인][반려] 버튼을 보낸다.
 * 버튼 클릭은 W1의 Interactions 엔드포인트(DiscordInteractionService)가 처리한다.
 *
 * NotificationListener(회사 webhook 채널 브로드캐스트)와 역할이 분리된다:
 *  - 이 리스너는 결재 "당사자" 개인 DM으로 즉시 결재를 유도(양방향).
 *  - 결재자가 메신저 계정을 연동(MessengerAccount)한 경우에만 발송. 미연동이면 조용히 skip.
 *  - 모든 에러를 흡수해 상신 트랜잭션/타 리스너에 영향을 주지 않는다(fire-and-forget).
 */
@Injectable()
export class MessengerApprovalListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(MessengerApprovalListener.name)

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    @Inject(MESSENGER_PROVIDER) private readonly messenger: MessengerProvider,
    private readonly llm: LlmService,
  ) {}

  onApplicationBootstrap(): void {
    for (const event of REQUEST_EVENTS) {
      this.eventEmitter.on(event, (payload: RequestedPayload) => {
        // handleRequested 내부에서 모든 에러를 흡수하므로 리스너가 앱을 중단시키지 않는다.
        void this.handleRequested(event, payload)
      })
    }
    this.logger.log(`메신저 결재 리스너 등록: ${REQUEST_EVENTS.length}개 상신 이벤트`)
  }

  async handleRequested(event: string, payload: RequestedPayload): Promise<void> {
    try {
      const { companyId, documentId, requestId } = payload
      // documentId가 없으면 전자결재 연동 전(양식 미설정) 요청 — DM 대상 아님
      if (!companyId || !documentId || !requestId) return

      // 현재 결재 차례(PENDING) — 병렬 결재면 복수
      const steps = await this.prisma.approvalStep.findMany({
        where: { line: { documentId }, status: 'PENDING' },
        select: { assigneeId: true },
      })
      if (steps.length === 0) return

      const doc = await this.prisma.document.findFirst({
        where: { id: documentId, companyId },
        select: {
          title: true,
          docNumber: true,
          content: true,
          drafter: { select: { name: true } },
        },
      })

      const requesterName = doc?.drafter?.name ?? undefined
      const fields = doc?.content ? buildContentFields(doc.content) : []
      const eventLabel = `${EVENT_LABEL[event] ?? '결재'} 결재 요청`
      // AI 요약(활성 시) — 실패해도 DM은 그대로 발송
      const summary = await this.buildSummary(companyId, eventLabel, requesterName, fields)

      const messagePayload: ApprovalMessagePayload = {
        eventLabel,
        title: doc?.title ?? '결재 요청',
        ...(requesterName ? { requesterName } : {}),
        ...(doc?.docNumber ? { docNumber: doc.docNumber } : {}),
        ...(fields.length ? { fields } : {}),
        ...(summary ? { summary } : {}),
        action: { kind: 'request', requestId },
      }

      // 중복 결재자 제거(병렬 라운드 안전) 후 각자에게 DM — 1명 실패가 나머지를 막지 않도록 개별 흡수
      const assigneeIds = [...new Set(steps.map((s) => s.assigneeId))]
      for (const assigneeId of assigneeIds) {
        await this.notifyAssignee(companyId, assigneeId, messagePayload).catch((err) => {
          this.logger.warn(
            `결재자(${assigneeId}) DM 실패: ${err instanceof Error ? err.message : String(err)}`,
          )
        })
      }
    } catch (err) {
      this.logger.warn(
        `메신저 결재 DM 처리 실패 — event=${event}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * AI 요약 — AI 활성 시 신청 내용을 한국어 한 문장으로 요약한다.
   * 미설정·미활성·실패 시 undefined를 반환해 DM은 요약 없이 정상 발송된다(graceful).
   */
  private async buildSummary(
    companyId: string,
    eventLabel: string,
    requesterName: string | undefined,
    fields: ApprovalField[],
  ): Promise<string | undefined> {
    try {
      if (fields.length === 0 || !(await this.llm.isEnabled(companyId))) return undefined
      const lines = [
        requesterName ? `신청자: ${requesterName}` : '',
        ...fields.map((f) => `${f.name}: ${f.value}`),
      ]
        .filter(Boolean)
        .join('\n')
      const text = await this.llm.chat(companyId, [
        {
          role: 'system',
          content:
            '너는 전자결재 요약 비서다. 결재자가 한눈에 판단하도록 신청 내용을 한국어 한 문장으로 간결히 요약하라. 인사말·추측 없이 핵심(기간·일수·사유)만 담아라.',
        },
        { role: 'user', content: `다음 "${eventLabel}" 내용을 한 문장으로 요약:\n${lines}` },
      ])
      return text.trim() || undefined
    } catch (err) {
      this.logger.warn(`AI 요약 실패 — ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }

  /** 결재자의 메신저 계정을 찾아 DM 발송. 미연동이면 skip. */
  private async notifyAssignee(
    companyId: string,
    employeeId: string,
    payload: ApprovalMessagePayload,
  ): Promise<void> {
    const account = await this.prisma.messengerAccount.findFirst({
      where: { companyId, employeeId, platform: this.messenger.platform },
      select: { externalUserId: true },
    })
    if (!account) return
    await this.messenger.sendApprovalRequestToUser(account.externalUserId, payload)
  }
}
