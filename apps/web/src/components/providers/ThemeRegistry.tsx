'use client'
import { useEffect, useMemo, useState } from 'react'
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { buildMuiTheme } from '@/theme'
import { useThemeStore } from '@/stores/theme.store'
import { DEFAULT_THEME_ID, type ThemeId } from '@/theme/tokens'

/**
 * 활성 테마로 MUI 테마를 공급한다.
 *
 * 서버/클라이언트 첫 렌더는 레이아웃이 쿠키에서 읽어 내려준 initialThemeId 를 사용해
 * <html data-theme> 와 일치시킨다(FOUC·하이드레이션 불일치 방지). 마운트 이후에는
 * 스토어 값을 따르며, 전환 시 buildMuiTheme 가 재계산된다.
 */
export function ThemeRegistry({
  initialThemeId = DEFAULT_THEME_ID,
  children,
}: {
  initialThemeId?: ThemeId
  children: React.ReactNode
}) {
  const storeId = useThemeStore((s) => s.themeId)
  const hydrate = useThemeStore((s) => s.hydrate)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // 쿠키가 차단된 환경이면 스토어를 서버 초기값과 맞춘다.
    if (useThemeStore.getState().themeId !== initialThemeId) {
      hydrate(initialThemeId)
    }
    setMounted(true)
  }, [initialThemeId, hydrate])

  const themeId = mounted ? storeId : initialThemeId
  const muiTheme = useMemo(() => buildMuiTheme(themeId), [themeId])

  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  )
}
