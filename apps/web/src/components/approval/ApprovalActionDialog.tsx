'use client'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import type { StepAction } from '@/lib/query/documents'

const COMMENT_MAX = 200

export interface ApprovalActionOption {
  action: StepAction
  label: string
  /** 선택 시 표시할 안내(예: 전단계 반려 시 결재권 반환 대상) */
  helper?: string
}

interface Props {
  open: boolean
  /** 팝업 제목 — "결재하기" / "반송" */
  title: string
  /** 결재 상태 라디오 옵션 (1개면 라디오 없이 라벨만 표시) */
  options: ApprovalActionOption[]
  /** 의견 입력이 필수인 액션 (반려·전단계반려·전결·반송 등) */
  commentRequiredFor?: StepAction[]
  busy?: boolean
  /** 제출 버튼 라벨 — 기본 "결재" */
  submitLabel?: string
  onClose: () => void
  onSubmit: (action: StepAction, comment: string) => void
}

/**
 * 통합 결재하기 LAYER_POPUP — 카카오워크 PDF 정합.
 * 결재 상태(승인/반려/전결/전단계반려) 라디오 + 결재 의견(200자, 반려류 필수) + [취소][결재].
 * 반송 모달(C2)도 동일 컴포넌트로 처리(옵션 1개·의견 필수).
 */
export default function ApprovalActionDialog({
  open,
  title,
  options,
  commentRequiredFor = [],
  busy = false,
  submitLabel = '결재',
  onClose,
  onSubmit,
}: Props) {
  const [action, setAction] = useState<StepAction>(options[0]?.action)
  const [comment, setComment] = useState('')
  const [touched, setTouched] = useState(false)

  // 팝업이 열릴 때 첫 옵션으로 초기화
  useEffect(() => {
    if (open) {
      setAction(options[0]?.action)
      setComment('')
      setTouched(false)
    }
    // options는 호출부에서 매 렌더 새 배열이라 의존성에서 제외 (open 토글로만 초기화)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const selected = options.find((o) => o.action === action) ?? options[0]
  const commentRequired = !!action && commentRequiredFor.includes(action)
  const commentMissing = commentRequired && !comment.trim()
  const overLimit = comment.length > COMMENT_MAX

  const handleSubmit = () => {
    setTouched(true)
    if (commentMissing || overLimit || !action) return
    onSubmit(action, comment.trim())
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box sx={{ flexGrow: 1 }}>{title}</Box>
        <IconButton size="small" onClick={onClose} disabled={busy} aria-label="닫기">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* 결재 상태 */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ minWidth: 64, fontWeight: 600 }}>
            결재 상태
          </Typography>
          {options.length > 1 ? (
            <RadioGroup
              row
              value={action ?? ''}
              onChange={(e) => setAction(e.target.value as StepAction)}
            >
              {options.map((o) => (
                <FormControlLabel
                  key={o.action}
                  value={o.action}
                  control={<Radio size="small" />}
                  label={o.label}
                  disabled={busy}
                />
              ))}
            </RadioGroup>
          ) : (
            <Typography variant="body2" fontWeight={600}>{selected?.label}</Typography>
          )}
        </Box>

        {selected?.helper && (
          <Typography variant="caption" color="text.secondary">
            {selected.helper}
          </Typography>
        )}

        {/* 결재 의견 */}
        <TextField
          label={`결재 의견${commentRequired ? ' *' : ''}`}
          placeholder={commentRequired ? '내용을 입력해주세요.' : '의견을 입력하세요 (선택)'}
          multiline
          rows={4}
          fullWidth
          value={comment}
          disabled={busy}
          onChange={(e) => setComment(e.target.value)}
          error={(touched && commentMissing) || overLimit}
          helperText={
            <Box component="span" sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box component="span">
                {touched && commentMissing
                  ? '결재 의견을 입력해주세요.'
                  : overLimit
                    ? `${COMMENT_MAX}자 이내로 입력해주세요.`
                    : ''}
              </Box>
              <Box component="span">{comment.length}/{COMMENT_MAX}</Box>
            </Box>
          }
          inputProps={{ maxLength: COMMENT_MAX + 50 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>취소</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={busy}>
          {busy ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          {submitLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
