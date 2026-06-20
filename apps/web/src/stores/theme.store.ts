'use client'
import { create } from 'zustand'
import { DEFAULT_THEME_ID, THEME_COOKIE, type ThemeId } from '@/theme/tokens'

/**
 * 테마 선택 상태.
 *
 * 영속화: 쿠키(`ablework-theme`, 1년). 레이아웃(서버)이 같은 쿠키를 읽어
 * <html data-theme> 와 초기 MUI 테마를 동일하게 렌더 → FOUC 없음.
 *
 * 초기값은 반드시 결정적(DEFAULT_THEME_ID)이어야 한다 — 서버 렌더와 클라이언트
 * 첫 렌더가 동일해야 하이드레이션 불일치가 없다. 클라이언트에서 cookie 를 직접 읽어
 * 초기화하면 서버(DEFAULT)와 어긋나 ThemeSwitcher 라벨 등에서 하이드레이션 에러가
 * 발생하고, 그 트리 재생성 과정에서 첫 상호작용(예: 로그인 클릭)이 유실된다.
 * 쿠키 테마 복원은 ThemeRegistry 가 마운트 후 hydrate(initialThemeId) 로 수행한다.
 */

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
  themeId: DEFAULT_THEME_ID,
  setTheme: (id) => {
    persist(id)
    set({ themeId: id })
  },
  hydrate: (id) => set({ themeId: id }),
}))
