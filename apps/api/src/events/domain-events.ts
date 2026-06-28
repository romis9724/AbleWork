/**
 * 도메인 이벤트 상수 (CLAUDE.md §8)
 *
 * 발행: 서비스 레이어에서 `this.events.emit(EVENTS.xxx, payload)`
 * 구독: NotificationListener 등에서 `@OnEvent(EVENTS.xxx)`
 *
 * 이벤트 이름을 문자열 리터럴로 직접 쓰지 말 것 — 발행↔구독 이름 불일치(고아 이벤트)의 원인.
 */
export const EVENTS = {
  // 출퇴근
  ATTENDANCE_CLOCK_IN: 'attendance.clock_in',
  ATTENDANCE_CLOCK_OUT: 'attendance.clock_out',
  ATTENDANCE_LATE: 'attendance.late',
  // 미출근 독촉 — 근무 시작 후 일정 시간이 지나도 출근 기록이 없을 때 본인에게 발송
  ATTENDANCE_NO_SHOW_REMINDER: 'attendance.no_show_reminder',

  // HR 요청 — 상신
  LEAVE_REQUESTED: 'leave.requested',
  SHIFT_REQUESTED: 'shift.requested',
  ATTENDANCE_REQUESTED: 'attendance.requested',
  DEVICE_CHANGE_REQUESTED: 'device.change_requested',
  OFFSITE_WORK_REQUESTED: 'offsite.requested',
  CUSTOM_REQUESTED: 'custom.requested',

  // HR 요청 — 승인/거절
  LEAVE_APPROVED: 'leave.approved',
  LEAVE_REJECTED: 'leave.rejected',
  SHIFT_APPROVED: 'shift.approved',
  SHIFT_REJECTED: 'shift.rejected',
  ATTENDANCE_APPROVED: 'attendance.approved',
  ATTENDANCE_REJECTED: 'attendance.rejected',
  DEVICE_CHANGE_APPROVED: 'device.change_approved',
  DEVICE_CHANGE_REJECTED: 'device.change_rejected',
  OFFSITE_WORK_APPROVED: 'offsite.approved',
  OFFSITE_WORK_REJECTED: 'offsite.rejected',
  CUSTOM_APPROVED: 'custom.approved',
  CUSTOM_REJECTED: 'custom.rejected',

  // 휴가 발생
  LEAVE_ACCRUED: 'leave.accrued',
  LEAVE_COMPENSATION_ACCRUED: 'leave.compensation.accrued',

  // 직원
  EMPLOYEE_CREATED: 'employee.created',

  // 전자결재 (Phase 2)
  DOCUMENT_SUBMITTED: 'document.submitted',
  DOCUMENT_APPROVED: 'document.approved',
  DOCUMENT_REJECTED: 'document.rejected',
  DOCUMENT_RECALLED: 'document.recalled',
  DOCUMENT_STEP_PENDING: 'document.step_pending', // 다음 결재자 차례 알림
  DOCUMENT_STEP_APPROVED: 'document.step_approved', // 중간 단계 승인 → 기안자에게 진행 알림
  DOCUMENT_BOUNCED: 'document.bounced', // 부서수신 반송 → 기안자 통지

  // 시스템 — API 에러 감지(GlobalExceptionFilter 발행 → ErrorAnalysisService 구독)
  API_ERROR_DETECTED: 'system.api_error_detected',
} as const

export type DomainEvent = (typeof EVENTS)[keyof typeof EVENTS]
