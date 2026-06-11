export const ShiftStatus = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
} as const

export type ShiftStatus = (typeof ShiftStatus)[keyof typeof ShiftStatus]

export const ShiftTypeCategory = {
  REGULAR: 'REGULAR',
  OVERTIME: 'OVERTIME',
  NIGHT: 'NIGHT',
  HOLIDAY: 'HOLIDAY',
  REMOTE: 'REMOTE',
  OFFSITE: 'OFFSITE',
  PAID_LEAVE: 'PAID_LEAVE',
  UNPAID_LEAVE: 'UNPAID_LEAVE',
} as const

export type ShiftTypeCategory = (typeof ShiftTypeCategory)[keyof typeof ShiftTypeCategory]

export const HolidayHandling = {
  SKIP_AND_SHIFT: 'skip_and_shift',
  SKIP_AND_KEEP: 'skip_and_keep',
  NO_SKIP: 'no_skip',
} as const

export type HolidayHandling = (typeof HolidayHandling)[keyof typeof HolidayHandling]
