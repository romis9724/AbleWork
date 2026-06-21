/**
 * AB Workforce 직원(me) 셀프서비스 셸 — 모바일 우선: 헤더 + 본문 + 하단 탭 네비.
 * 핸드오프 디자인 토큰(다크·오렌지)으로 구성.
 */
'use client'
import { useRouter, usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sigil, I, HRI } from './icons'
import { useAuthStore } from '@/stores/auth.store'
import { ThemeSwitcher } from './ThemeSwitcher'

const ME_NAV = [
  { label: '홈', icon: HRI.home, path: '/me/home' },
  { label: '근무', icon: HRI.schedule, path: '/me/shifts' },
  { label: '휴가', icon: HRI.leave, path: '/me/leaves' },
  { label: '요청', icon: HRI.request, path: '/me/requests' },
  { label: '결재', icon: HRI.approval, path: '/me/documents' },
  { label: '프로필', icon: HRI.profile, path: '/me/profile' },
]

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'GENERAL_ADMIN', 'ORG_ADMIN'])

export function MeShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.accessLevel ? ADMIN_ROLES.has(user.accessLevel) : false

  return (
    <div className="me-shell">
      <header className="me-head">
        <Sigil size={22} />
        <span className="hd-wordmark tek">AbleWork</span>
        <div className="me-head-right">
          {isAdmin && (
            <span
              className="me-head-switch"
              role="button"
              tabIndex={0}
              onClick={() => router.push('/admin/dashboard')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push('/admin/dashboard')
                }
              }}
            >
              관리자 모드
            </span>
          )}
          <ThemeSwitcher className="me-head-switch" />
          <span className="me-head-avatar">{I.user()}</span>
        </div>
      </header>

      {/* 모바일: 본문만 흐르고 네비는 fixed bottom. PC: .me-body가 [사이드바 | 본문] 행이 된다 */}
      <div className="me-body">
        <main className="me-main">{children}</main>

        <nav className="me-nav">
          {ME_NAV.map((n) => {
            const on = pathname === n.path || pathname.startsWith(n.path + '/')
            return (
              <button
                key={n.path}
                type="button"
                className={'me-nav-item' + (on ? ' on' : '')}
                onClick={() => router.push(n.path)}
              >
                <span className="ic">{n.icon()}</span>
                {n.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
