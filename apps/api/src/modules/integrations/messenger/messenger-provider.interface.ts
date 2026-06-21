/**
 * 메신저 양방향 결재 — 메신저 추상화 (메신저 봇 = AI 결재 허브, 1순위 MVP).
 *
 * Discord가 첫 구현체. 진짜 타겟인 카카오워크/네이버웍스로 교체 가능하도록
 * 메시지 전송을 인터페이스 뒤로 숨긴다. (docs/design/MESSENGER_APPROVAL.md)
 */

/** 버튼 액션 식별 — PoC는 요청연동(request) 결재 기준 */
export type ApprovalAction = { kind: 'request'; requestId: string }

/** 결재 요청 메시지 페이로드 — 알림 + 승인/반려 버튼 구성용 */
export interface ApprovalMessagePayload {
  /** 이벤트 라벨 (예: "휴가 신청 결재 요청") */
  eventLabel: string
  /** 문서/요청 제목 */
  title: string
  docNumber?: string
  /** 후속 AI 요약(2순위) — 현재 미사용, 메시지 [AI 요약] 결합 시 채움 */
  summary?: string
  /** 버튼 액션 식별 */
  action: ApprovalAction
}

/** 메신저 제공자 추상화 — sendApprovalRequest가 핵심(전송 + 갱신용 식별자 반환) */
export interface MessengerProvider {
  readonly platform: string
  /** 결재 요청 메시지(+승인/반려 버튼)를 채널에 전송하고 메시지 식별자(갱신용)를 반환 */
  sendApprovalRequest(target: string, payload: ApprovalMessagePayload): Promise<string>
  /**
   * 결재자 개인(외부 사용자 ID)에게 1:1 DM으로 결재 요청 메시지를 전송한다.
   * 회사 채널 브로드캐스트(NotificationListener)와 달리 "당사자에게 직접" 보내 즉시 결재를 유도한다.
   */
  sendApprovalRequestToUser(externalUserId: string, payload: ApprovalMessagePayload): Promise<string>
}

/** DI 토큰 — 현재 구현체는 DiscordProvider */
export const MESSENGER_PROVIDER = Symbol('MESSENGER_PROVIDER')
