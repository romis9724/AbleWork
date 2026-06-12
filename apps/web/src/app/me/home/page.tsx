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
import FreeBreakfastIcon from '@mui/icons-material/FreeBreakfast'
import { useClockIn, useClockOut, useBreakStart, useBreakEnd } from '@/lib/query/attendances'

export default function HomePage() {
  const [clockedIn, setClockedIn] = useState(false)
  const [onBreak, setOnBreak] = useState(false)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const clockInMutation = useClockIn()
  const clockOutMutation = useClockOut()
  const breakStartMutation = useBreakStart()
  const breakEndMutation = useBreakEnd()

  const isLoading =
    clockInMutation.isPending ||
    clockOutMutation.isPending ||
    breakStartMutation.isPending ||
    breakEndMutation.isPending

  const handleClockIn = async () => {
    if (!navigator.geolocation) {
      showSnack('위치 서비스를 사용할 수 없습니다.', 'error')
      return
    }
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      )
      await clockInMutation.mutateAsync({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        method: 'gps',
      })
      setClockedIn(true)
      showSnack('출근 기록이 완료됐습니다.', 'success')
    } catch (err) {
      showSnack(err instanceof Error ? err.message : '출근 처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleClockOut = async () => {
    if (!navigator.geolocation) {
      showSnack('위치 서비스를 사용할 수 없습니다.', 'error')
      return
    }
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      )
      await clockOutMutation.mutateAsync({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        method: 'gps',
      })
      setClockedIn(false)
      setOnBreak(false)
      showSnack('퇴근 기록이 완료됐습니다.', 'success')
    } catch (err) {
      showSnack(err instanceof Error ? err.message : '퇴근 처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleBreakStart = async () => {
    try {
      await breakStartMutation.mutateAsync()
      setOnBreak(true)
      showSnack('휴게 시간이 시작됐습니다.', 'success')
    } catch (err) {
      showSnack(err instanceof Error ? err.message : '휴게 처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleBreakEnd = async () => {
    try {
      await breakEndMutation.mutateAsync()
      setOnBreak(false)
      showSnack('휴게 시간이 종료됐습니다.', 'success')
    } catch (err) {
      showSnack(err instanceof Error ? err.message : '휴게 종료 처리 중 오류가 발생했습니다.', 'error')
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

          {!clockedIn && (
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleClockIn}
              disabled={isLoading}
              sx={{ minWidth: 120 }}
            >
              {clockInMutation.isPending ? <CircularProgress size={24} color="inherit" /> : '출근'}
            </Button>
          )}

          {clockedIn && !onBreak && (
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                color="warning"
                size="large"
                onClick={handleBreakStart}
                disabled={isLoading}
                startIcon={<FreeBreakfastIcon />}
                sx={{ minWidth: 130 }}
              >
                {breakStartMutation.isPending ? <CircularProgress size={24} color="inherit" /> : '휴게 시작'}
              </Button>
              <Button
                variant="outlined"
                size="large"
                onClick={handleClockOut}
                disabled={isLoading}
                sx={{ minWidth: 120 }}
              >
                {clockOutMutation.isPending ? <CircularProgress size={24} color="inherit" /> : '퇴근'}
              </Button>
            </Box>
          )}

          {clockedIn && onBreak && (
            <Button
              variant="contained"
              color="warning"
              size="large"
              onClick={handleBreakEnd}
              disabled={isLoading}
              startIcon={<FreeBreakfastIcon />}
              sx={{ minWidth: 130 }}
            >
              {breakEndMutation.isPending ? <CircularProgress size={24} color="inherit" /> : '휴게 종료'}
            </Button>
          )}

          {clockedIn && (
            <Typography variant="caption" color="text.secondary" display="block" mt={2}>
              {onBreak ? '휴게 중입니다.' : '근무 중입니다.'}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
