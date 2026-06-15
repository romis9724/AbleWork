/**
 * AbleWork 모바일 디자인 토큰.
 * 브랜드색 #f36f20 기준. RN에는 CSS 변수가 없으므로 단일 출처 상수로 관리한다.
 */
export const colors = {
  brand: '#f36f20',
  brandDark: '#d65f15',
  brandSoft: '#fdeee3',
  bg: '#f5f5f5',
  surface: '#ffffff',
  border: '#e6e6e6',
  text: '#1a1a1a',
  textSub: '#666666',
  textMuted: '#9a9a9a',
  white: '#ffffff',
  // 상태 색상 (배지/칩)
  success: '#1f9d55',
  successSoft: '#e3f5ec',
  warning: '#c77700',
  warningSoft: '#fdf1dd',
  danger: '#d64545',
  dangerSoft: '#fbe6e6',
  info: '#2f6fd6',
  infoSoft: '#e6eefb',
  neutral: '#6b7280',
  neutralSoft: '#eef0f2',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const

export const fontSize = {
  xs: 12,
  sm: 13,
  base: 15,
  lg: 18,
  xl: 22,
  hero: 28,
} as const
