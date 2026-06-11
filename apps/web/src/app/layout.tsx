import type { Metadata } from 'next'
import { ThemeRegistry } from '@/components/providers/ThemeRegistry'
import { QueryProvider } from '@/components/providers/QueryProvider'

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ThemeRegistry>
          <QueryProvider>{children}</QueryProvider>
        </ThemeRegistry>
      </body>
    </html>
  )
}
