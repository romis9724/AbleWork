import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { ThemeRegistry } from '@/components/providers/ThemeRegistry'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { buildThemeCss, DEFAULT_THEME_ID, isThemeId, THEME_COOKIE } from '@/theme/tokens'
import '@/styles/ab-admin.css'
import '@/styles/ab-hr.css'
import '@/styles/ab-app.css'

// 전 테마의 :root[data-theme] 토큰 블록 (한 번 생성, 정적)
const THEME_CSS = buildThemeCss()

// Claude Code 실행 환경에서 localStorage가 object로 존재하지만 getItem이 없는 경우 패치
if (typeof localStorage !== 'undefined' && typeof localStorage.getItem !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, length: 0, key: () => null },
    writable: true,
    configurable: true,
  })
}

export const metadata: Metadata = {
  title: 'AbleWork ERP',
  description: '중소기업을 위한 통합 HR/근태/전자결재 시스템',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const cookieTheme = cookieStore.get(THEME_COOKIE)?.value
  const themeId = isThemeId(cookieTheme) ? cookieTheme : DEFAULT_THEME_ID

  return (
    <html lang="ko" data-theme={themeId} suppressHydrationWarning>
      <head>
        {/* 테마 토큰: 서버 렌더 시 주입 → FOUC 없음. :root[data-theme] 특이도로 항상 적용 */}
        <style id="ab-theme-tokens" dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      </head>
      <body>
        <ThemeRegistry initialThemeId={themeId}>
          <QueryProvider>{children}</QueryProvider>
        </ThemeRegistry>
      </body>
    </html>
  )
}
