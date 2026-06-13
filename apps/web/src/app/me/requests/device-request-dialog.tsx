'use client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import type { RequestFormDialogProps } from './dialog-props'

// ── DEVICE_CHANGE ─────────────────────────────────────────────────────────────

export function DeviceChangeDialog({ open, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>기기 변경 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <DialogContentText variant="body2">
          승인되면 기존 기기 등록이 해제되며, 다음 출근 시 새 기기가 등록됩니다.
        </DialogContentText>
        <TextField
          label="사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          required
          multiline
          rows={3}
          placeholder="예: 휴대폰 교체"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          disabled={!reason.trim() || submitting}
          onClick={() => onSubmit('DEVICE_CHANGE', { reason: reason.trim() })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
