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
import { useShifts, type Shift } from '@/lib/query/shifts'
import { todayString, type RequestFormDialogProps } from './dialog-props'

const DEFAULT_START_TIME = '09:00'
const DEFAULT_END_TIME = '18:00'
/** 수정/삭제 대상 일정 조회 범위 — 오늘부터 90일 */
const FUTURE_RANGE_DAYS = 90

const futureDateString = (daysAhead: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

const shiftOptionLabel = (shift: Shift): string => {
  const date = shift.startAt.slice(0, 10)
  const start = shift.startAt.slice(11, 16)
  const end = shift.endAt.slice(11, 16)
  const typeName = shift.shiftType?.name ? ` · ${shift.shiftType.name}` : ''
  return `${date} ${start}~${end}${typeName}`
}

/**
 * 내 미래(오늘 이후) 근무일정 조회 (수정/삭제 대상 선택용)
 * — 다이얼로그는 열릴 때만 마운트되므로 불필요한 조회가 발생하지 않는다.
 */
const useMyUpcomingShifts = (employeeId: string) => {
  const { data, isLoading } = useShifts({
    employeeId,
    startAt: todayString(),
    endAt: futureDateString(FUTURE_RANGE_DAYS),
  })
  return { shifts: data ?? [], isLoading }
}

// ── SHIFT_CREATE ──────────────────────────────────────────────────────────────

export function ShiftCreateDialog({ open, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME)
  const [endTime, setEndTime] = useState(DEFAULT_END_TIME)
  const [reason, setReason] = useState('')

  const canSubmit = !!date && !!startTime && !!endTime

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>근무일정 신청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label="날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="시작 시간" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
          <TextField label="종료 시간" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
        </Box>
        <TextField label="사유" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth multiline rows={3} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          data-testid="req-submit-btn"
          variant="contained"
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit('SHIFT_CREATE', { date, startTime, endTime, ...(reason && { reason }) })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── SHIFT_MODIFY ──────────────────────────────────────────────────────────────

export function ShiftModifyDialog({ open, employeeId, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const { shifts, isLoading } = useMyUpcomingShifts(employeeId)
  const [shiftId, setShiftId] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')

  const handleSelect = (id: string) => {
    setShiftId(id)
    const shift = shifts.find((s) => s.id === id)
    if (shift) {
      setDate(shift.startAt.slice(0, 10))
      setStartTime(shift.startAt.slice(11, 16))
      setEndTime(shift.endAt.slice(11, 16))
    }
  }

  const canSubmit = !!shiftId && !!date && !!startTime && !!endTime

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>근무일정 수정 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          select
          label="대상 일정"
          value={shiftId}
          onChange={(e) => handleSelect(e.target.value)}
          fullWidth
          required
          helperText={!isLoading && shifts.length === 0 ? '수정 가능한 예정된 일정이 없습니다.' : undefined}
        >
          {shifts.map((s) => (
            <MenuItem key={s.id} value={s.id}>{shiftOptionLabel(s)}</MenuItem>
          ))}
        </TextField>
        <TextField label="새 날짜" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField label="새 시작 시간" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
          <TextField label="새 종료 시간" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} fullWidth required InputLabelProps={{ shrink: true }} />
        </Box>
        <TextField label="사유" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth multiline rows={3} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          data-testid="req-submit-btn"
          variant="contained"
          disabled={!canSubmit || submitting}
          onClick={() => onSubmit('SHIFT_MODIFY', { shiftId, date, startTime, endTime, ...(reason && { reason }) })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── SHIFT_DELETE ──────────────────────────────────────────────────────────────

export function ShiftDeleteDialog({ open, employeeId, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const { shifts, isLoading } = useMyUpcomingShifts(employeeId)
  const [shiftId, setShiftId] = useState('')
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>근무일정 삭제 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          select
          label="대상 일정"
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
          fullWidth
          required
          helperText={!isLoading && shifts.length === 0 ? '삭제 가능한 예정된 일정이 없습니다.' : undefined}
        >
          {shifts.map((s) => (
            <MenuItem key={s.id} value={s.id}>{shiftOptionLabel(s)}</MenuItem>
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
          disabled={!shiftId || submitting}
          onClick={() => onSubmit('SHIFT_DELETE', { shiftId, ...(reason && { reason }) })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
