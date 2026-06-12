'use client'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useNowAtWork, useAttendances } from '@/lib/query/attendances'
import { useRequests } from '@/lib/query/requests'
import type { Attendance } from '@/lib/query/attendances'
import type { Request } from '@/lib/query/requests'

const REQUEST_STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  FORCE_APPROVED: 'success',
  FORCE_REJECTED: 'error',
  CANCELLED: 'default',
}

const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: '검토 중',
  APPROVED: '승인',
  REJECTED: '거절',
  FORCE_APPROVED: '강제 승인',
  FORCE_REJECTED: '강제 거절',
  CANCELLED: '취소',
}

const REQUEST_TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  SHIFT_CREATE: '근무일정 추가',
  ATTENDANCE_EDIT: '출퇴근 정정',
  DEVICE_CHANGE: '기기 변경',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

interface StatCardProps {
  label: string
  value: number | string
  color?: string
  loading?: boolean
}

function StatCard({ label, value, color = 'primary.main', loading = false }: StatCardProps) {
  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" mb={1}>
          {label}
        </Typography>
        {loading ? (
          <CircularProgress size={28} />
        ) : (
          <Typography variant="h4" fontWeight={700} color={color}>
            {value}
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const todayStr = today()

  const { data: nowAtWork = [], isLoading: nowLoading } = useNowAtWork()

  const { data: rawAttendances, isLoading: attLoading } = useAttendances({
    startDate: todayStr,
    endDate: todayStr,
  })

  const { data: rawRequests, isLoading: reqLoading } = useRequests({
    status: 'PENDING',
  })

  const attendanceItems: Attendance[] = Array.isArray(rawAttendances)
    ? (rawAttendances as Attendance[])
    : ((rawAttendances as { items?: Attendance[] })?.items ?? [])

  const requestItems: Request[] = Array.isArray(rawRequests)
    ? (rawRequests as Request[])
    : ((rawRequests as { items?: Request[] })?.items ?? [])

  const todayClockInCount = attendanceItems.length
  const todayLateCount = attendanceItems.filter((a) => a.status === 'late').length
  const pendingRequestCount = requestItems.length

  const recentRequests = requestItems.slice(0, 5)

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>
        대시보드
      </Typography>

      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="현재 근무 중"
            value={nowAtWork.length}
            color="success.main"
            loading={nowLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="오늘 출근"
            value={todayClockInCount}
            color="primary.main"
            loading={attLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="오늘 지각"
            value={todayLateCount}
            color="warning.main"
            loading={attLoading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            label="진행 중 요청"
            value={pendingRequestCount}
            color="text.primary"
            loading={reqLoading}
          />
        </Grid>
      </Grid>

      <Typography variant="subtitle1" fontWeight={700} mb={2}>
        최근 요청 (진행 중)
      </Typography>

      {reqLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider' }}
        >
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>직원명</TableCell>
                <TableCell>요청 유형</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>신청일</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {recentRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    진행 중인 요청이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                recentRequests.map((req) => (
                  <TableRow key={req.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {req.requester?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      {REQUEST_TYPE_LABEL[req.type] ?? req.type}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={REQUEST_STATUS_LABEL[req.status] ?? req.status}
                        color={REQUEST_STATUS_COLOR[req.status] ?? 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(req.createdAt).toLocaleDateString('ko-KR')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
