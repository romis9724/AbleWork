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
import { useToast } from './Toast'
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
  const toast = useToast()

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
        <div className="hd-brand">
          <Sigil />
          <span className="hd-wordmark tek">AbleWork</span>
          <span className="hd-admin">Admin</span>
        </div>
        <div className="hd-right">
          <CompanySwitcher />
          <div className="hd-user">
            <span className="hd-user-name">
              <b>{user?.name ?? '관리자'}</b>
            </span>
            {roleLabel && <span className="hd-user-sep">|</span>}
            {roleLabel && <span className="hd-user-name">{roleLabel}</span>}
            <span className="hd-avatar">{I.user()}</span>
          </div>
          <ThemeSwitcher />
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
            <div className="sb-foot-grp">
              <div className="t">계정</div>
              <a
                role="button"
                tabIndex={0}
                onClick={() => logout(router.push, clearUser)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    logout(router.push, clearUser)
                  }
                }}
              >
                로그아웃
              </a>
              <a
                role="button"
                tabIndex={0}
                onClick={() => toast('도움말 센터')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toast('도움말 센터')
                  }
                }}
              >
                도움말 센터 <span className="ext">{I.ext()}</span>
              </a>
            </div>
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
              justifyContent: 'space-between',
              fontSize: 12,
              color: 'var(--fg-5)',
            }}
          >
            <div style={{ display: 'flex', gap: 24 }}>
              <span>이용약관</span>
              <span>개인정보처리방침</span>
            </div>
            <span>© AB Media &amp; Works · ABLE + BOX</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
