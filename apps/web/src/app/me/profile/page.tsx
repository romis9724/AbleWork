'use client'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Button from '@mui/material/Button'
import Avatar from '@mui/material/Avatar'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth.store'

export default function ProfilePage() {
  const router = useRouter()
  const { user, clearUser } = useAuthStore()

  const handleLogout = () => {
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    clearUser()
    router.push('/login')
  }

  return (
    <>
      <Typography variant="h6" fontWeight={700} mb={2}>내 프로필</Typography>
      <Card>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, gap: 2 }}>
          <Avatar sx={{ width: 64, height: 64, bgcolor: 'primary.main', fontSize: 28 }}>
            {user?.accessLevel?.[0] ?? '?'}
          </Avatar>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">{user?.accessLevel}</Typography>
            <Typography variant="caption" color="text.secondary">ID: {user?.employeeId ?? '—'}</Typography>
          </Box>
          <Button variant="outlined" color="error" onClick={handleLogout} sx={{ mt: 2 }}>
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </>
  )
}
