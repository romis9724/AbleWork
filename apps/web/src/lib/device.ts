/**
 * 모바일(좁은 화면) 여부. 관리자 모드는 PC 전용이므로 모바일에서는 직원 모드로 강제한다.
 * 768px 이하를 모바일로 본다(관리자 화면은 데스크톱 폭 전제).
 */
export const MOBILE_MAX_WIDTH = 768

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches
}
