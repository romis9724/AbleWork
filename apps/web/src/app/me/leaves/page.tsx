'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import apiClient from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'

interface LeaveBalance { leaveType: { name: string }; remainingDays: number; accruedDays: number; year: number }

export default function LeavesPage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([])
  const [loading, setLoading] = useState(true)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (!user?.employeeId) return
    apiClient.get(`/leaves/balance/${user.employeeId}`).then((res: unknown) => {
      setBalances(Array.isArray(res) ? res : [])
    }).finally(() => setLoading(false))
  }, [user?.employeeId])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h6" fontWeight={700} mb={2}>내 휴가</Typography>
      {balances.length === 0 ? (
        <Typography color="text.secondary">휴가 잔여 정보가 없습니다.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {balances.map((b, i) => (
            <Card key={i}>
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography fontWeight={600}>{b.leaveType?.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{b.year}년</Typography>
                </Box>
                <Chip label={`${b.remainingDays}일 남음`} color="primary" variant="outlined" />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </>
  )
}
