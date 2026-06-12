'use client'
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'
import { useEmployee, useUpdateEmployee } from '@/lib/query/employees'
import apiClient from '@/lib/api-client'

export default function ProfilePage() {
  const router = useRouter()
  const { user, clearUser } = useAuthStore()

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const { data: employee, isLoading } = useEmployee(user?.employeeId ?? '')
  const updateEmployee = useUpdateEmployee()

  useEffect(() => {
    if (employee) {
      setName(employee.name ?? '')
      setPhone(employee.phone ?? '')
    }
  }, [employee])

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const handleSaveProfile = async () => {
    if (!user?.employeeId) return
    try {
      await updateEmployee.mutateAsync({ id: user.employeeId, name, phone })
      showSnack('프로필이 저장됐습니다.', 'success')
    } catch {
      showSnack('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      showSnack('모든 비밀번호 항목을 입력해 주세요.', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      showSnack('새 비밀번호가 일치하지 않습니다.', 'error')
      return
    }
    if (newPassword.length < 8) {
      showSnack('새 비밀번호는 8자 이상이어야 합니다.', 'error')
      return
    }
    setChangingPassword(true)
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      showSnack('비밀번호가 변경됐습니다.', 'success')
    } catch {
      showSnack('비밀번호 변경 중 오류가 발생했습니다.', 'error')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogout = () => {
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    clearUser()
    router.push('/login')
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" fontWeight={700}>내 프로필</Typography>

      {/* Profile card */}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontSize: 24 }}>
              {user?.accessLevel?.[0] ?? '?'}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight={600}>{user?.accessLevel}</Typography>
              <Typography variant="caption" color="text.secondary">ID: {user?.employeeId ?? '—'}</Typography>
            </Box>
          </Box>

          <TextField
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <TextField
            label="전화번호"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
            placeholder="010-0000-0000"
          />

          <Button
            variant="contained"
            onClick={handleSaveProfile}
            disabled={updateEmployee.isPending}
            fullWidth
          >
            {updateEmployee.isPending ? <CircularProgress size={20} color="inherit" /> : '저장'}
          </Button>
        </CardContent>
      </Card>

      {/* Password change card */}
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle2" fontWeight={600}>비밀번호 변경</Typography>
          <Divider />
          <TextField
            label="현재 비밀번호"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            fullWidth
            autoComplete="current-password"
          />
          <TextField
            label="새 비밀번호"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            autoComplete="new-password"
            helperText="8자 이상"
          />
          <TextField
            label="새 비밀번호 확인"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            fullWidth
            autoComplete="new-password"
            error={confirmPassword.length > 0 && newPassword !== confirmPassword}
            helperText={confirmPassword.length > 0 && newPassword !== confirmPassword ? '비밀번호가 일치하지 않습니다.' : undefined}
          />
          <Button
            variant="outlined"
            onClick={handleChangePassword}
            disabled={changingPassword}
            fullWidth
          >
            {changingPassword ? <CircularProgress size={20} color="inherit" /> : '비밀번호 변경'}
          </Button>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button variant="outlined" color="error" onClick={handleLogout} fullWidth>
        로그아웃
      </Button>

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
