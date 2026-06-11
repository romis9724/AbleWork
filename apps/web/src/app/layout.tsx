import type { Metadata } from 'next'
import { ThemeRegistry } from '@/components/providers/ThemeRegistry'
import { QueryProvider } from '@/components/providers/QueryProvider'

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
