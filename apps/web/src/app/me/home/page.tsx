'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import apiClient from '@/lib/api-client'

export default function HomePage() {
  const [clocking, setClocking] = useState<'in' | 'out' | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const handleClock = async (type: 'in' | 'out') => {
    setClocking(type)
    try {
      if (!navigator.geolocation) throw new Error('위치 서비스를 사용할 수 없습니다.')

      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      )
      await apiClient.post(type === 'in' ? '/attendances/clock-in' : '/attendances/clock-out', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        method: 'gps',
      })
      setSnack({ open: true, message: type === 'in' ? '출근 기록이 완료됐습니다.' : '퇴근 기록이 완료됐습니다.', severity: 'success' })
    } catch (err) {
      setSnack({ open: true, message: err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.', severity: 'error' })
    } finally {
      setClocking(null)
    }
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} mb={2}>홈</Typography>
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <AccessTimeIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="body1" color="text.secondary" mb={3}>
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="contained" size="large" onClick={() => handleClock('in')} disabled={clocking !== null} sx={{ minWidth: 120 }}>
              {clocking === 'in' ? <CircularProgress size={24} color="inherit" /> : '출근'}
            </Button>
            <Button variant="outlined" size="large" onClick={() => handleClock('out')} disabled={clocking !== null} sx={{ minWidth: 120 }}>
              {clocking === 'out' ? <CircularProgress size={24} color="inherit" /> : '퇴근'}
            </Button>
          </Box>
        </CardContent>
      </Card>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  )
}
