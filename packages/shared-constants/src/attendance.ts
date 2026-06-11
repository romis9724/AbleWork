export const AttendanceStatus = {
  NORMAL: 'normal',
  LATE: 'late',
  EARLY_LEAVE: 'early_leave',
  ABSENT: 'absent',
} as const

export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus]

export const ClockMethod = {
  GPS: 'gps',
  WIFI: 'wifi',
  MANUAL: 'manual',
  WEB: 'web',
} as const

export type ClockMethod = (typeof ClockMethod)[keyof typeof ClockMethod]

export const TimeclockAuthMethod = {
  GPS: 'gps',
  WIFI: 'wifi',
  GPS_OR_WIFI: 'gps_or_wifi',
  GPS_AND_WIFI: 'gps_and_wifi',
  NONE: 'none',
} as const

export type TimeclockAuthMethod = (typeof TimeclockAuthMethod)[keyof typeof TimeclockAuthMethod]
