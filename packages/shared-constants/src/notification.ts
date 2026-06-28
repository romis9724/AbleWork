export const NotificationChannelType = {
  DISCORD: 'discord',
  EMAIL: 'email',
  IN_APP: 'in_app',
} as const

export type NotificationChannelType = (typeof NotificationChannelType)[keyof typeof NotificationChannelType]

export const DomainEvent = {
  ATTENDANCE_CLOCK_IN: 'attendance.clock_in',
  ATTENDANCE_CLOCK_OUT: 'attendance.clock_out',
  ATTENDANCE_LATE: 'attendance.late',
  ATTENDANCE_ABSENT: 'attendance.absent',
  ATTENDANCE_NO_SHOW_REMINDER: 'attendance.no_show_reminder',
  LEAVE_REQUESTED: 'leave.requested',
  LEAVE_APPROVED: 'leave.approved',
  LEAVE_REJECTED: 'leave.rejected',
  SHIFT_REQUESTED: 'shift.requested',
  ATTENDANCE_REQUESTED: 'attendance.requested',
  DEVICE_CHANGE_REQUESTED: 'device.change_requested',
  REQUEST_FORCE_APPROVED: 'request.force_approved',
  DOCUMENT_SUBMITTED: 'document.submitted',
  DOCUMENT_STEP_APPROVED: 'document.step_approved',
  DOCUMENT_STEP_REJECTED: 'document.step_rejected',
  DOCUMENT_PREV_RETURNED: 'document.prev_returned',
  DOCUMENT_APPROVED: 'document.approved',
  DOCUMENT_REJECTED: 'document.rejected',
  DOCUMENT_RECALLED: 'document.recalled',
  DOCUMENT_CANCELLED: 'document.cancelled',
} as const

export type DomainEvent = (typeof DomainEvent)[keyof typeof DomainEvent]

/**
 * 알림 가능 이벤트 단일 출처(SSOT).
 *
 * `event`는 apps/api `src/events/domain-events.ts`의 EVENTS 값(런타임 발행/구독명)과 정확히 일치해야 한다.
 * 이 목록 하나가 다음을 모두 구동한다:
 *  - 백엔드 NotificationListener 구독(OnApplicationBootstrap에서 event별 등록)
 *  - NotificationsService.DEFAULT_EVENT_TYPES(webhook 최초 등록 시 생성할 기본 규칙)
 *  - 프론트 알림 설정 토글 목록/라벨/그룹
 *
 * 짧은 키(예: 'clock_in')를 쓰면 규칙 eventType과 런타임 이벤트명이 어긋나 알림이 발송되지 않으므로 금지.
 */
export interface NotifiableEvent {
  event: string
  label: string
  group: string
  groupLabel: string
}

export const NOTIFIABLE_EVENTS: readonly NotifiableEvent[] = [
  { event: 'attendance.clock_in', label: '출근', group: 'attendance', groupLabel: '출퇴근' },
  { event: 'attendance.late', label: '지각', group: 'attendance', groupLabel: '출퇴근' },
  { event: 'attendance.no_show_reminder', label: '미출근 독촉', group: 'attendance', groupLabel: '출퇴근' },

  { event: 'leave.requested', label: '휴가 신청', group: 'leave', groupLabel: '휴가' },
  { event: 'leave.approved', label: '휴가 승인', group: 'leave', groupLabel: '휴가' },
  { event: 'leave.rejected', label: '휴가 반려', group: 'leave', groupLabel: '휴가' },

  { event: 'shift.requested', label: '근무일정 변경 신청', group: 'request', groupLabel: '근무·근태 요청' },
  { event: 'shift.approved', label: '근무일정 변경 승인', group: 'request', groupLabel: '근무·근태 요청' },
  { event: 'shift.rejected', label: '근무일정 변경 반려', group: 'request', groupLabel: '근무·근태 요청' },
  { event: 'attendance.requested', label: '출퇴근 정정 신청', group: 'request', groupLabel: '근무·근태 요청' },
  { event: 'attendance.approved', label: '출퇴근 정정 승인', group: 'request', groupLabel: '근무·근태 요청' },
  { event: 'attendance.rejected', label: '출퇴근 정정 반려', group: 'request', groupLabel: '근무·근태 요청' },

  { event: 'device.change_requested', label: '기기 변경 신청', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'device.change_approved', label: '기기 변경 승인', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'device.change_rejected', label: '기기 변경 반려', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'offsite.requested', label: '외근 신청', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'offsite.approved', label: '외근 승인', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'offsite.rejected', label: '외근 반려', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'custom.requested', label: '기타 요청 신청', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'custom.approved', label: '기타 요청 승인', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },
  { event: 'custom.rejected', label: '기타 요청 반려', group: 'etc_request', groupLabel: '기기·외근·기타 요청' },

  { event: 'document.submitted', label: '문서 상신', group: 'approval', groupLabel: '전자결재' },
  { event: 'document.approved', label: '문서 최종 승인', group: 'approval', groupLabel: '전자결재' },
  { event: 'document.rejected', label: '문서 반려', group: 'approval', groupLabel: '전자결재' },
  { event: 'document.recalled', label: '문서 회수', group: 'approval', groupLabel: '전자결재' },
  { event: 'document.step_pending', label: '결재 차례 도래', group: 'approval', groupLabel: '전자결재' },
  { event: 'document.bounced', label: '부서수신 반송', group: 'approval', groupLabel: '전자결재' },
] as const

/** 알림 가능 이벤트명만 추출한 배열 */
export const NOTIFIABLE_EVENT_TYPES: readonly string[] = NOTIFIABLE_EVENTS.map((e) => e.event)
