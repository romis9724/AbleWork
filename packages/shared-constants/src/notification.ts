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
