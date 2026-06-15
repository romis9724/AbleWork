'use client'
import { create } from 'zustand'
import { DEFAULT_THEME_ID, isThemeId, THEME_COOKIE, type ThemeId } from '@/theme/tokens'

/**
 * 테마 선택 상태.
 *
 * 영속화: 쿠키(`ablework-theme`, 1년). 레이아웃(서버)이 같은 쿠키를 읽어
 * <html data-theme> 와 초기 MUI 테마를 동일하게 렌더 → FOUC/하이드레이션 불일치 없음.
 * 전환 시 즉시 document.documentElement.dataset.theme 와 쿠키를 갱신한다.
 */

function readThemeCookie(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME_ID
  const match = document.cookie.match(/(?:^|;\s*)ablework-theme=([^;]+)/)
  const value = match?.[1] ? decodeURIComponent(match[1]) : ''
  return isThemeId(value) ? value : DEFAULT_THEME_ID
}

function persist(id: ThemeId): void {
  if (typeof document === 'undefined') return
  const oneYear = 60 * 60 * 24 * 365
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=${oneYear}; samesite=lax${secure}`
  document.documentElement.dataset.theme = id
}

interface ThemeState {
  themeId: ThemeId
  setTheme: (id: ThemeId) => void
  /** 레이아웃이 내려준 서버 초기값으로 동기화(쿠키 차단 환경 대비) */
  hydrate: (id: ThemeId) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  themeId: readThemeCookie(),
  setTheme: (id) => {
    persist(id)
    set({ themeId: id })
  },
  hydrate: (id) => set({ themeId: id }),
}))
