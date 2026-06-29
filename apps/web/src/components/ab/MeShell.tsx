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
import { useToast } from './Toast'
import { isMobileViewport } from '@/lib/device'

// 프로필은 헤더 우측 아바타 아이콘으로 접근하므로 네비에서 제외하고 '출퇴근기록'을 노출
const ME_NAV = [
  { label: '홈', icon: HRI.home, path: '/me/home' },
  { label: '근무', icon: HRI.schedule, path: '/me/shifts' },
  { label: '출퇴근', icon: HRI.clock, path: '/me/attendances' },
  { label: '휴가', icon: HRI.leave, path: '/me/leaves' },
  { label: '요청', icon: HRI.request, path: '/me/requests' },
  { label: '결재', icon: HRI.approval, path: '/me/documents' },
]

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'GENERAL_ADMIN', 'ORG_ADMIN'])

export function MeShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.accessLevel ? ADMIN_ROLES.has(user.accessLevel) : false

  // 관리자 모드는 PC 전용 — 모바일에서는 안내 메시지만 띄우고 이동하지 않는다.
  const goAdmin = () => {
    if (isMobileViewport()) {
      toast('관리자 모드는 PC에서 이용해 주세요')
      return
    }
    router.push('/admin/dashboard')
  }
  // 로고(홈): 모바일이거나 비관리자는 직원 홈으로, PC 관리자는 관리자 대시보드로.
  const goLogoHome = () => {
    if (isAdmin && !isMobileViewport()) router.push('/admin/dashboard')
    else router.push('/me/home')
  }

  return (
    <div className="me-shell">
      <header className="me-head">
        <div
          role="button"
          tabIndex={0}
          onClick={goLogoHome}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              goLogoHome()
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          title="홈"
        >
          <Sigil size={22} />
          <span className="hd-wordmark tek">AbleWork</span>
        </div>
        <div className="me-head-right">
          {isAdmin && (
            <span
              className="me-head-switch"
              role="button"
              tabIndex={0}
              onClick={goAdmin}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  goAdmin()
                }
              }}
            >
              관리자 모드
            </span>
          )}
          <ThemeSwitcher className="me-head-switch" />
          <span
            className="me-head-avatar"
            role="button"
            tabIndex={0}
            onClick={() => router.push('/me/profile')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                router.push('/me/profile')
              }
            }}
            style={{ cursor: 'pointer' }}
            title="내 프로필"
          >
            {I.user()}
          </span>
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
