'use client'
import { useState } from 'react'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { type RequestFormDialogProps, todayString } from './dialog-props'

// ── OFFSITE_WORK 외근/출장 ─────────────────────────────────────────────────────

export function OffsiteWorkDialog({ open, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const [date, setDate] = useState(todayString())
  const [destination, setDestination] = useState('')
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>외근/출장 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          label="일자"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          fullWidth
          required
        />
        <TextField
          label="목적지"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          fullWidth
          required
          placeholder="예: 강남 고객사"
        />
        <TextField
          label="사유"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          required
          multiline
          rows={3}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          disabled={!date || !destination.trim() || !reason.trim() || submitting}
          onClick={() => onSubmit('OFFSITE_WORK', { date, destination: destination.trim(), reason: reason.trim() })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ── CUSTOM 기타 요청 ───────────────────────────────────────────────────────────

export function CustomRequestDialog({ open, submitting, onClose, onSubmit }: RequestFormDialogProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>기타 요청</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          label="제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          fullWidth
          required
          placeholder="예: 비품 신청"
        />
        <TextField
          label="내용"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          fullWidth
          required
          multiline
          rows={4}
          placeholder="요청 내용을 입력하세요"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          disabled={!title.trim() || !content.trim() || submitting}
          onClick={() => onSubmit('CUSTOM', { title: title.trim(), content: content.trim() })}
        >
          {submitting ? <CircularProgress size={20} color="inherit" /> : '신청'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
