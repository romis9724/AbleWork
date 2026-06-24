'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useAttendances, type Attendance } from '@/lib/query/attendances'
import type { RequestFormDialogProps } from './dialog-props'

/** 삭제 대상 출퇴근 기록 조회 개수 */
const ATTENDANCE_FETCH_LIMIT = '50'

const attendanceOptionLabel = (att: Attendance): string => {
  const date = att.clockInAt.slice(0, 10)
  const clockIn = att.clockInAt.slice(11, 16)
  const clockOut = att.clockOutAt ? att.clockOutAt.slice(11, 16) : '미퇴근'
  return `${date} ${clockIn}~${clockOut}`
}

/**
 * 내 출퇴근 기록 조회 (삭제 대상 선택용)
 * — 다이얼로그는 열릴 때만 마운트되므로 불필요한 조회가 발생하지 않는다.
 */
const useMyAttendances = (employeeId: string) => {
  const { data, isLoading } = useAttendances({ employeeId, limit: ATTENDANCE_FETCH_LIMIT })
  const attendances = Array.isArray(data) ? data : (data?.items ?? [])
  return { attendances, isLoading }
}

// ── 공통 폼 (ATTENDANCE_EDIT / ATTENDANCE_CREATE) ─────────────────────────────

interface AttendanceTimeFormDialogProps extends RequestFormDialogProps {
  title: string
  requestType: 'ATTENDANCE_EDIT' | 'ATTENDANCE_CREATE'
}

function AttendanceTimeFormDialog({
  open,
  submitting,
  onClose,
  onSubmit,
  title,
  requestType,
}: AttendanceTimeFormDialogProps) {
  const [date, setDate] = useState('')
  const [clockInAt, setClockInAt] = useState('')
  const [clockOutAt, setClockOutAt] = useState('')
  const [reason, setReason] = useState('')

  const canSubmit = !!date && !!clockInAt && !!clockOutAt

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="출근 시간" type="time" value={clockInAt} onChange={(e) => setClockInAt(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
          <TextField label="퇴근 시간" type="time" value={clockOutAt} onChange={(e) => setClockOutAt(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
        </Box>
        <TextField label="사유" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth multiline rows={3} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          data-testid="req-submit-btn"
          variant="contained"
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit(requestType, { date, clockInAt, clockOutAt, ...(reason && { reason }) })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── ATTENDANCE_EDIT ───────────────────────────────────────────────────────────

export function AttendanceEditDialog(props: RequestFormDialogProps) {
  return <AttendanceTimeFormDialog {...props} title="출퇴근 정정 요청" requestType="ATTENDANCE_EDIT" />
}

// ── ATTENDANCE_CREATE ─────────────────────────────────────────────────────────

export function AttendanceCreateDialog(props: RequestFormDialogProps) {
  return <AttendanceTimeFormDialog {...props} title="출퇴근 기록 생성 요청" requestType="ATTENDANCE_CREATE" />
}

// ── ATTENDANCE_DELETE ─────────────────────────────────────────────────────────

export function AttendanceDeleteDialog({ open, employeeId, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const { attendances, isLoading } = useMyAttendances(employeeId)
  const [attendanceId, setAttendanceId] = useState('')
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>출퇴근 기록 삭제 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          select
          label="대상 기록"
          value={attendanceId}
          onChange={(e) => setAttendanceId(e.target.value)}
          fullWidth
          required
          helperText={!isLoading && attendances.length === 0 ? '삭제 가능한 출퇴근 기록이 없습니다.' : undefined}
        >
          {attendances.map((a) => (
            <MenuItem key={a.id} value={a.id}>{attendanceOptionLabel(a)}</MenuItem>
          ))}
        </TextField>
        <TextField label="사유" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth multiline rows={3} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          data-testid="req-submit-btn"
          variant="contained"
          color="error"
          disabled={!attendanceId || submitting}
          onClick={() => onSubmit('ATTENDANCE_DELETE', { attendanceId, ...(reason && { reason }) })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
