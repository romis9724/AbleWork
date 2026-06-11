'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import apiClient from '@/lib/api-client'

interface Attendance { id: string; clockInAt: string; clockOutAt: string | null; status: string }

const STATUS_LABEL: Record<string, string> = { normal: '정상', late: '지각', early_leave: '조퇴', absent: '결근' }
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error'> = {
  normal: 'success', late: 'warning', early_leave: 'warning', absent: 'error',
}

export default function AttendancesPage() {
  const [records, setRecords] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const end = now.toISOString().split('T')[0]
    apiClient.get(`/attendances?startDate=${start}&endDate=${end}`).then((res: unknown) => {
      const data = res as { items?: Attendance[] }
      setRecords(data.items ?? [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h6" fontWeight={700} mb={2}>내 출퇴근 기록 (이번 달)</Typography>
      {records.length === 0 ? (
        <Typography color="text.secondary">이번 달 출퇴근 기록이 없습니다.</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {records.map((r) => (
            <Card key={r.id}>
              <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: '12px !important' }}>
                <Box>
                  <Typography variant="body2" fontWeight={600}>
                    출근: {new Date(r.clockInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    {r.clockOutAt && ` · 퇴근: ${new Date(r.clockOutAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.clockInAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                  </Typography>
                </Box>
                <Chip label={STATUS_LABEL[r.status] ?? r.status} color={STATUS_COLOR[r.status] ?? 'default'} size="small" />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </>
  )
}
