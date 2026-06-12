'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Fab from '@mui/material/Fab'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import BeachAccessIcon from '@mui/icons-material/BeachAccess'
import ScheduleIcon from '@mui/icons-material/Schedule'
import EditCalendarIcon from '@mui/icons-material/EditCalendar'
import EmptyState from '@/components/common/EmptyState'
import { useRequests, useCreateRequest } from '@/lib/query/requests'
import { useLeaveTypes } from '@/lib/query/leaves'

type TabValue = 'ALL' | 'PENDING' | 'DONE'
type DialogMode = null | 'menu' | 'leave' | 'shift' | 'attendance'

const TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  SHIFT_CREATE: '근무일정 변경 요청',
  ATTENDANCE_EDIT: '출퇴근 정정 요청',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기중',
  APPROVED: '승인',
  REJECTED: '거절',
  CANCELLED: '취소',
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
}

const MENU_ITEMS = [
  { mode: 'leave' as const, icon: <BeachAccessIcon fontSize="small" />, label: '휴가 신청' },
  { mode: 'shift' as const, icon: <ScheduleIcon fontSize="small" />, label: '근무일정 변경 요청' },
  { mode: 'attendance' as const, icon: <EditCalendarIcon fontSize="small" />, label: '출퇴근 정정 요청' },
]

export default function RequestsPage() {
  const [tab, setTab] = useState<TabValue>('ALL')
  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  // Leave form state
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [leaveStartDate, setLeaveStartDate] = useState('')
  const [leaveEndDate, setLeaveEndDate] = useState('')
  const [leaveReason, setLeaveReason] = useState('')

  // Shift form state
  const [shiftDate, setShiftDate] = useState('')
  const [shiftStartTime, setShiftStartTime] = useState('09:00')
  const [shiftEndTime, setShiftEndTime] = useState('18:00')
  const [shiftReason, setShiftReason] = useState('')

  // Attendance form state
  const [attDate, setAttDate] = useState('')
  const [attClockIn, setAttClockIn] = useState('')
  const [attClockOut, setAttClockOut] = useState('')
  const [attReason, setAttReason] = useState('')

  const queryParams = tab === 'ALL'
    ? undefined
    : tab === 'PENDING'
    ? { status: 'PENDING' }
    : { status: 'APPROVED,REJECTED,CANCELLED' }

  const { data, isLoading } = useRequests(queryParams)
  const { data: leaveTypes = [] } = useLeaveTypes()
  const createRequest = useCreateRequest()

  const requests = Array.isArray(data) ? data : (data?.items ?? [])

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const resetDialogs = () => {
    setDialogMode(null)
    setLeaveTypeId('')
    setLeaveStartDate('')
    setLeaveEndDate('')
    setLeaveReason('')
    setShiftDate('')
    setShiftStartTime('09:00')
    setShiftEndTime('18:00')
    setShiftReason('')
    setAttDate('')
    setAttClockIn('')
    setAttClockOut('')
    setAttReason('')
  }

  const handleLeaveSubmit = async () => {
    if (!leaveTypeId || !leaveStartDate || !leaveEndDate) {
      showSnack('필수 항목을 모두 입력해 주세요.', 'error')
      return
    }
    try {
      await createRequest.mutateAsync({
        type: 'LEAVE_CREATE',
        payload: { leaveTypeId, startDate: leaveStartDate, endDate: leaveEndDate, reason: leaveReason },
      })
      showSnack('휴가 신청이 완료됐습니다.', 'success')
      resetDialogs()
    } catch {
      showSnack('신청 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleShiftSubmit = async () => {
    if (!shiftDate) {
      showSnack('날짜를 입력해 주세요.', 'error')
      return
    }
    try {
      await createRequest.mutateAsync({
        type: 'SHIFT_CREATE',
        payload: {
          date: shiftDate,
          startTime: shiftStartTime,
          endTime: shiftEndTime,
          reason: shiftReason,
        },
      })
      showSnack('근무일정 변경 요청이 완료됐습니다.', 'success')
      resetDialogs()
    } catch {
      showSnack('신청 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleAttendanceSubmit = async () => {
    if (!attDate || !attClockIn || !attClockOut) {
      showSnack('필수 항목을 모두 입력해 주세요.', 'error')
      return
    }
    try {
      await createRequest.mutateAsync({
        type: 'ATTENDANCE_EDIT',
        payload: { date: attDate, clockInAt: attClockIn, clockOutAt: attClockOut, reason: attReason },
      })
      showSnack('출퇴근 정정 요청이 완료됐습니다.', 'success')
      resetDialogs()
    } catch {
      showSnack('신청 중 오류가 발생했습니다.', 'error')
    }
  }

  return (
    <Box sx={{ position: 'relative', pb: 4 }}>
      <Typography variant="h6" fontWeight={700} mb={2}>내 요청</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v as TabValue)} sx={{ mb: 2 }}>
        <Tab label="전체" value="ALL" />
        <Tab label="대기중" value="PENDING" />
        <Tab label="완료" value="DONE" />
      </Tabs>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <EmptyState message="요청 내역이 없습니다." />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: '12px !important' }}
              >
                <Box>
                  <Typography variant="body2" fontWeight={600}>{TYPE_LABEL[r.type] ?? r.type}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(r.createdAt).toLocaleDateString('ko-KR')}
                  </Typography>
                </Box>
                <Chip
                  label={STATUS_LABEL[r.status] ?? r.status}
                  color={STATUS_COLOR[r.status] ?? 'default'}
                  size="small"
                />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        aria-label="요청 신청"
        sx={{ position: 'fixed', bottom: 72, right: 16 }}
        onClick={() => setDialogMode('menu')}
      >
        <AddIcon />
      </Fab>

      {/* Menu dialog */}
      <Dialog open={dialogMode === 'menu'} onClose={resetDialogs} fullWidth maxWidth="xs">
        <DialogTitle>요청 유형 선택</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <List disablePadding>
            {MENU_ITEMS.map((item) => (
              <ListItem key={item.mode} disablePadding divider>
                <ListItemButton onClick={() => setDialogMode(item.mode)}>
                  <Box sx={{ mr: 1.5, color: 'primary.main', display: 'flex' }}>{item.icon}</Box>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialogs}>취소</Button>
        </DialogActions>
      </Dialog>

      {/* Leave dialog */}
      <Dialog open={dialogMode === 'leave'} onClose={resetDialogs} fullWidth maxWidth="xs">
        <DialogTitle>휴가 신청</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            select
            label="휴가 유형"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            fullWidth
            required
          >
            {leaveTypes.map((lt) => (
              <MenuItem key={lt.id} value={lt.id}>{lt.displayName ?? lt.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="시작일"
            type="date"
            value={leaveStartDate}
            onChange={(e) => setLeaveStartDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="종료일"
            type="date"
            value={leaveEndDate}
            onChange={(e) => setLeaveEndDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="사유"
            value={leaveReason}
            onChange={(e) => setLeaveReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialogs}>취소</Button>
          <Button
            variant="contained"
            onClick={handleLeaveSubmit}
            disabled={createRequest.isPending}
          >
            {createRequest.isPending ? <CircularProgress size={20} color="inherit" /> : '신청'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Shift dialog */}
      <Dialog open={dialogMode === 'shift'} onClose={resetDialogs} fullWidth maxWidth="xs">
        <DialogTitle>근무일정 변경 요청</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="날짜"
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="시작 시간"
              type="time"
              value={shiftStartTime}
              onChange={(e) => setShiftStartTime(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="종료 시간"
              type="time"
              value={shiftEndTime}
              onChange={(e) => setShiftEndTime(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <TextField
            label="사유"
            value={shiftReason}
            onChange={(e) => setShiftReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialogs}>취소</Button>
          <Button
            variant="contained"
            onClick={handleShiftSubmit}
            disabled={createRequest.isPending}
          >
            {createRequest.isPending ? <CircularProgress size={20} color="inherit" /> : '신청'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attendance correction dialog */}
      <Dialog open={dialogMode === 'attendance'} onClose={resetDialogs} fullWidth maxWidth="xs">
        <DialogTitle>출퇴근 정정 요청</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="날짜"
            type="date"
            value={attDate}
            onChange={(e) => setAttDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="출근 시간"
            type="datetime-local"
            value={attClockIn}
            onChange={(e) => setAttClockIn(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="퇴근 시간"
            type="datetime-local"
            value={attClockOut}
            onChange={(e) => setAttClockOut(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="사유"
            value={attReason}
            onChange={(e) => setAttReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialogs}>취소</Button>
          <Button
            variant="contained"
            onClick={handleAttendanceSubmit}
            disabled={createRequest.isPending}
          >
            {createRequest.isPending ? <CircularProgress size={20} color="inherit" /> : '신청'}
          </Button>
        </DialogActions>
      </Dialog>

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
