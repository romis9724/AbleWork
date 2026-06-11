'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import apiClient from '@/lib/api-client'

interface Request { id: string; type: string; status: string; createdAt: string }

const TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청', SHIFT_CREATE: '근무일정 추가', ATTENDANCE_EDIT: '출퇴근 정정',
}
const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'error', CANCELLED: 'default',
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/requests').then((res: unknown) => {
      const data = res as { items?: Request[] }
      setRequests(data.items ?? [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h6" fontWeight={700} mb={2}>내 요청</Typography>
      {requests.length === 0 ? (
        <Typography color="text.secondary">요청 내역이 없습니다.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: '12px !important' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>{TYPE_LABEL[r.type] ?? r.type}</Typography>
                  <Typography variant="caption" color="text.secondary">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</Typography>
                </Box>
                <Chip label={r.status} color={STATUS_COLOR[r.status] ?? 'default'} size="small" />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </>
  )
}
