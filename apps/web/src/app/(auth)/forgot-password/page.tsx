'use client'
import { useState } from 'react'
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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await apiClient.post('/auth/forgot-password', { email })
      setSent(true)
    } catch {
      setError('요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
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
              비밀번호 재설정
            </Typography>
          </Box>

          {sent ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                등록된 이메일이라면 비밀번호 재설정 안내 메일이 발송됩니다. 메일함을
                확인해주세요. (링크는 30분 후 만료됩니다)
              </Alert>
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Link component={NextLink} href="/login" variant="body2" underline="hover">
                  로그인으로 돌아가기
                </Link>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" mb={1}>
                가입한 이메일 주소를 입력하면 재설정 링크를 보내드립니다.
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
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
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  size="large"
                  disabled={loading}
                  sx={{ mt: 2 }}
                >
                  {loading ? <CircularProgress size={24} color="inherit" /> : '재설정 메일 받기'}
                </Button>
              </form>

              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Link component={NextLink} href="/login" variant="body2" underline="hover">
                  로그인으로 돌아가기
                </Link>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  )
}
