'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import apiClient from '@/lib/api-client'

interface Attendance {
  id: string
  clockInAt: string
  clockOutAt: string | null
  status: string
  employee?: { name: string }
}

const STATUS_LABEL: Record<string, string> = {
  normal: '정상', late: '지각', early_leave: '조퇴', absent: '결근', oncall: '무일정',
}
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  normal: 'success', late: 'warning', early_leave: 'warning', absent: 'error', oncall: 'default',
}

export default function AttendancesPage() {
  const [records, setRecords] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    apiClient.get(`/attendances?startDate=${today}&endDate=${today}`).then((res: unknown) => {
      const data = res as { items?: Attendance[] }
      setRecords(data.items ?? (Array.isArray(res) ? res as Attendance[] : []))
    }).finally(() => setLoading(false))
  }, [today])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>출퇴근 기록 (오늘)</Typography>
      {records.length === 0 ? (
        <Typography color="text.secondary">오늘 출퇴근 기록이 없습니다.</Typography>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>직원명</TableCell>
                <TableCell>출근 시간</TableCell>
                <TableCell>퇴근 시간</TableCell>
                <TableCell>상태</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.employee?.name ?? '—'}</TableCell>
                  <TableCell>{new Date(r.clockInAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell>{r.clockOutAt ? new Date(r.clockOutAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '—'}</TableCell>
                  <TableCell>
                    <Chip label={STATUS_LABEL[r.status] ?? r.status} color={STATUS_COLOR[r.status] ?? 'default'} size="small" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
