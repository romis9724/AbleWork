'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import { Sigil } from '@/components/ab/icons'
import { ThemeSwitcher } from '@/components/ab/ThemeSwitcher'
import { parseJwt, writeAuthCookies } from '@/lib/auth-session'
import { isMobileViewport } from '@/lib/device'

interface LoginResponse {
  accessToken: string
  refreshToken: string
}

export default function LoginPage() {
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
      const { accessToken, refreshToken } = res as unknown as LoginResponse

      writeAuthCookies(accessToken, refreshToken)

      const claims = parseJwt(accessToken)
      setUser({
        userId: claims.sub,
        employeeId: claims.employeeId,
        companyId: claims.companyId,
        accessLevel: claims.accessLevel,
      })

      // 모바일은 관리자라도 무조건 직원 모드로(관리자 화면은 PC 전용)
      const adminLevels = ['SUPER_ADMIN', 'GENERAL_ADMIN', 'ORG_ADMIN']
      const goAdmin = adminLevels.includes(claims.accessLevel) && !isMobileViewport()
      router.push(goAdmin ? '/admin/dashboard' : '/me/home')
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 10 }}>
        <ThemeSwitcher showLabel />
      </div>
      <div className="auth-card">
        <div className="auth-brand">
          <Sigil size={26} />
          <span className="hd-wordmark tek">AbleWork</span>
        </div>
        <div className="auth-eyebrow">Sign in</div>
        <h1 className="auth-title">로그인</h1>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleLogin}>
          <div className="auth-field">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              className="inp-block"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="name@company.com"
            />
          </div>
          <div className="auth-field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              className="inp-block"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          <div className="auth-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? '로그인 중…' : '로그인'}
            </button>
          </div>
        </form>

        <div className="auth-foot">
          <a onClick={() => router.push('/forgot-password')}>비밀번호를 잊으셨나요?</a>
        </div>
      </div>
    </div>
  )
}
