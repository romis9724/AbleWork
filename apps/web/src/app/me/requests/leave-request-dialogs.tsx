'use client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useLeaves, type Leave } from '@/lib/query/leaves'
import type { RequestFormDialogProps } from './dialog-props'

const leaveOptionLabel = (leave: Leave): string => {
  const typeName = leave.leaveType?.displayName ?? leave.leaveType?.name ?? '휴가'
  const start = leave.startDate.slice(0, 10)
  const end = leave.endDate.slice(0, 10)
  return `${typeName} · ${start} ~ ${end}`
}

/**
 * 내 APPROVED 휴가 목록 조회 (취소 대상 선택용)
 * — 다이얼로그는 열릴 때만 마운트되므로 불필요한 조회가 발생하지 않는다.
 *
 * 참고: 휴가 신청(LEAVE_CREATE)·수정(LEAVE_MODIFY)은 '휴가 > 휴가 신청'과 동일한
 * 공용 모달 `@/components/leave/LeaveFormModal`로 통일되었다. 여기서는 취소(삭제)만 다룬다.
 */
const useMyApprovedLeaves = (employeeId: string) => {
  const { data, isLoading } = useLeaves({ employeeId, limit: 50 })
  const leaves = (data?.items ?? []).filter((l) => l.status === 'APPROVED')
  return { leaves, isLoading }
}

// ── LEAVE_DELETE ──────────────────────────────────────────────────────────────

export function LeaveDeleteDialog({ open, employeeId, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const { leaves, isLoading } = useMyApprovedLeaves(employeeId)
  const [leaveId, setLeaveId] = useState('')
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>휴가 취소(삭제) 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          select
          label="대상 휴가"
          value={leaveId}
          onChange={(e) => setLeaveId(e.target.value)}
          fullWidth
          required
          helperText={!isLoading && leaves.length === 0 ? '취소 가능한 승인된 휴가가 없습니다.' : undefined}
        >
          {leaves.map((l) => (
            <MenuItem key={l.id} value={l.id}>{leaveOptionLabel(l)}</MenuItem>
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
          disabled={!leaveId || submitting}
          onClick={() => onSubmit('LEAVE_DELETE', { leaveId, ...(reason && { reason }) })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
