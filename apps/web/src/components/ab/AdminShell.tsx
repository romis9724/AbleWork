/**
 * AB Workforce 관리자 앱 셸 — 헤더(64px) + 사이드바(232px) + 메인 + 푸터.
 * 디자인 핸드오프 hr_app.jsx 의 App shell 포팅.
 */
'use client'
import { useRouter, usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Sigil, I } from './icons'
import { ADMIN_NAV, ADMIN_FOOT, activeNavId, ROLE_LABELS } from './nav'
import { useAuthStore } from '@/stores/auth.store'
import { canViewNav } from '@ablework/shared-constants'
import { ThemeSwitcher } from './ThemeSwitcher'
import { CompanySwitcher } from './CompanySwitcher'
import { clearAuthCookies } from '@/lib/auth-session'

function logout(push: (p: string) => void, clearUser: () => void) {
  clearAuthCookies()
  clearUser()
  push('/login')
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const user = useAuthStore((s) => s.user)
  const clearUser = useAuthStore((s) => s.clearUser)

  const active = activeNavId(pathname)
  const roleLabel = user?.accessLevel ? ROLE_LABELS[user.accessLevel] ?? user.accessLevel : ''

  // 접근 레벨에 따라 메뉴를 필터링한다 (빈 섹션 제거)
  const level = user?.accessLevel
  const visibleNav = ADMIN_NAV.map((sec) => ({
    ...sec,
    items: sec.items.filter((n) => canViewNav(level, n.id)),
  })).filter((sec) => sec.items.length > 0)
  const visibleFoot = ADMIN_FOOT.filter((f) => canViewNav(level, f.id))
  // 보이는 항목 기준으로 연속 번호를 매긴다
  const visibleFlat = visibleNav.flatMap((sec) => sec.items)

  return (
    <div className="app">
      <header className="hd">
        <div
          className="hd-brand"
          role="button"
          tabIndex={0}
          onClick={() => router.push('/admin/dashboard')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              router.push('/admin/dashboard')
            }
          }}
          style={{ cursor: 'pointer' }}
          title="관리자 홈"
        >
          <Sigil />
          <span className="hd-wordmark tek">AbleWork</span>
          <span className="hd-admin">Admin</span>
        </div>
        {/* 우측: 컨텍스트(회사·모드) → 환경(테마) → 계정(프로필·로그아웃) 순 */}
        <div className="hd-right">
          <CompanySwitcher />
          <div
            className="hd-lang"
            role="button"
            tabIndex={0}
            onClick={() => router.push('/me/home')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                router.push('/me/home')
              }
            }}
          >
            직원 모드로 전환
          </div>
          <ThemeSwitcher />
          <div
            className="hd-user"
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
            <span className="hd-user-name">
              <b>{user?.name ?? '관리자'}</b>
            </span>
            {roleLabel && <span className="hd-user-sep">|</span>}
            {roleLabel && <span className="hd-user-name">{roleLabel}</span>}
            <span className="hd-avatar">{I.user()}</span>
          </div>
          <button
            type="button"
            className="hd-logout"
            onClick={() => logout(router.push, clearUser)}
            title="로그아웃"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--fg-3)',
              border: '1px solid var(--line)',
              background: 'transparent',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="body">
        <aside className="sb">
          <div className="sb-eyebrow">
            <span className="eyebrow">Workspace</span>
          </div>
          <nav className="sb-nav">
            {visibleNav.map((sec) => (
              <div key={sec.title}>
                <div className="sb-section">{sec.title}</div>
                {sec.items.map((n) => {
                  const idx = visibleFlat.indexOf(n)
                  const on = active === n.id
                  return (
                    <button
                      key={n.id}
                      data-testid={`nav-${n.id}`}
                      className={'sb-item' + (on ? ' on' : '')}
                      onClick={() => router.push(n.path)}
                    >
                      <span className="num">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="sbi">{n.icon()}</span>
                      {n.label}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
          <div className="sb-gap" />
          <div className="sb-foot">
            {visibleFoot.length > 0 && (
            <div className="sb-foot-grp">
              <div className="t">부가 기능</div>
              {visibleFoot.map((f) => (
                <a
                  key={f.id}
                  data-testid={`nav-${f.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(f.path)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      router.push(f.path)
                    }
                  }}
                  style={active === f.id ? { color: 'var(--ab-orange)' } : undefined}
                >
                  {f.label}
                </a>
              ))}
            </div>
            )}
          </div>
        </aside>

        <main className="main">
          <div className="main-inner">{children}</div>
          <footer
            style={{
              marginTop: 'auto',
              padding: '26px 48px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              justifyContent: 'flex-end',
              fontSize: 12,
              color: 'var(--fg-5)',
            }}
          >
            <span>© ABWorks &amp; LABL</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
