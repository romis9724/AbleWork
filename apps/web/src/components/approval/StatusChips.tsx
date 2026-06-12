'use client'
import Chip from '@mui/material/Chip'
import type { DocumentStatus, StepStatus } from '@/lib/query/documents'
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_STYLE,
  STEP_STATUS_LABEL,
  STEP_STATUS_STYLE,
} from './approval-constants'

interface DocStatusChipProps {
  status: DocumentStatus
  size?: 'small' | 'medium'
}

export function DocStatusChip({ status, size = 'small' }: DocStatusChipProps) {
  const style = DOC_STATUS_STYLE[status] ?? DOC_STATUS_STYLE.DRAFT
  return (
    <Chip
      label={DOC_STATUS_LABEL[status] ?? status}
      size={size}
      sx={{ bgcolor: style.bg, color: style.fg, fontWeight: 600 }}
    />
  )
}

interface StepStatusChipProps {
  status: StepStatus
  size?: 'small' | 'medium'
}

export function StepStatusChip({ status, size = 'small' }: StepStatusChipProps) {
  const style = STEP_STATUS_STYLE[status] ?? STEP_STATUS_STYLE.WAITING
  return (
    <Chip
      label={STEP_STATUS_LABEL[status] ?? status}
      size={size}
      sx={{ bgcolor: style.bg, color: style.fg, fontWeight: 600 }}
    />
  )
}
