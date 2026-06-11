'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import type { AccessLevel } from '@ablework/shared-constants'

interface LoginResponse {
  accessToken: string
  refreshToken: string
}

interface JwtClaims {
  sub: string
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
}

function parseJwt(token: string): JwtClaims {
  const payload = token.split('.')[1]
  return JSON.parse(atob(payload))
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

      // 쿠키에 토큰 저장
      document.cookie = `accessToken=${accessToken}; path=/; max-age=${15 * 60}`
      document.cookie = `refreshToken=${refreshToken}; path=/; max-age=${7 * 24 * 60 * 60}`

      const claims = parseJwt(accessToken)
      setUser({
        userId: claims.sub,
        employeeId: claims.employeeId,
        companyId: claims.companyId,
        accessLevel: claims.accessLevel,
      })

      const adminLevels = ['SUPER_ADMIN', 'GENERAL_ADMIN', 'ORG_ADMIN']
      router.push(adminLevels.includes(claims.accessLevel) ? '/admin/dashboard' : '/me/home')
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ width: 400, p: 2 }}>
        <CardContent>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography variant="h5" fontWeight={700} color="primary">
              AbleWork
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              로그인하여 시작하세요
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleLogin}>
            <TextField
              label="이메일"
              type="email"
              fullWidth
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoComplete="email"
            />
            <TextField
              label="비밀번호"
              type="password"
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              autoComplete="current-password"
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : '로그인'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  )
}
