'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import NextLink from 'next/link'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Link from '@mui/material/Link'
import apiClient from '@/lib/api-client'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('비밀번호는 8자 이상이며 영문자와 숫자를 포함해야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    setLoading(true)
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword, confirmPassword })
      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch {
      setError('유효하지 않거나 만료된 재설정 링크입니다. 다시 요청해주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <>
        <Alert severity="error" sx={{ mb: 2 }}>
          재설정 토큰이 없습니다. 메일의 링크를 통해 접속해주세요.
        </Alert>
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link component={NextLink} href="/forgot-password" variant="body2" underline="hover">
            재설정 메일 다시 요청하기
          </Link>
        </Box>
      </>
    )
  }

  if (done) {
    return (
      <>
        <Alert severity="success" sx={{ mb: 2 }}>
          비밀번호가 재설정되었습니다. 잠시 후 로그인 페이지로 이동합니다.
        </Alert>
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Link component={NextLink} href="/login" variant="body2" underline="hover">
            바로 로그인하기
          </Link>
        </Box>
      </>
    )
  }

  return (
    <>
      <Typography variant="body2" color="text.secondary" mb={1}>
        새로 사용할 비밀번호를 입력해주세요.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <TextField
          label="새 비밀번호"
          type="password"
          fullWidth
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          margin="normal"
          required
          autoComplete="new-password"
          helperText="8자 이상, 영문자와 숫자 포함"
        />
        <TextField
          label="새 비밀번호 확인"
          type="password"
          fullWidth
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          margin="normal"
          required
          autoComplete="new-password"
        />
        <Button
          type="submit"
          variant="contained"
          fullWidth
          size="large"
          disabled={loading}
          sx={{ mt: 2 }}
        >
          {loading ? <CircularProgress size={24} color="inherit" /> : '비밀번호 재설정'}
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
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
              새 비밀번호 설정
            </Typography>
          </Box>

          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </Box>
  )
}
