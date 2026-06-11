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

interface Request {
  id: string
  type: string
  status: string
  createdAt: string
  requester?: { name: string }
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'error',
  FORCE_APPROVED: 'success', FORCE_REJECTED: 'error', CANCELLED: 'default',
}

const TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청', SHIFT_CREATE: '근무일정 추가', ATTENDANCE_EDIT: '출퇴근 정정',
  DEVICE_CHANGE: '기기 변경',
}

export default function RequestsPage() {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/requests').then((res: unknown) => {
      const data = res as { items?: Request[] }
      setRequests(data.items ?? (Array.isArray(res) ? res as Request[] : []))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>요청 관리</Typography>
      {requests.length === 0 ? (
        <Typography color="text.secondary">요청 내역이 없습니다.</Typography>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>신청자</TableCell>
                <TableCell>요청 유형</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>신청 일시</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.requester?.name ?? '—'}</TableCell>
                  <TableCell>{TYPE_LABEL[r.type] ?? r.type}</TableCell>
                  <TableCell>
                    <Chip label={r.status} color={STATUS_COLOR[r.status] ?? 'default'} size="small" />
                  </TableCell>
                  <TableCell>{new Date(r.createdAt).toLocaleString('ko-KR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
