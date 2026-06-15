'use client'
import Chip from '@mui/material/Chip'
import type { SxProps, Theme } from '@mui/material/styles'
import type { DocumentStatus, StepStatus, StepRole } from '@/lib/query/documents'
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_STYLE,
  STEP_STATUS_LABEL,
  STEP_STATUS_STYLE,
  STEP_ROLE_LABEL,
  DOC_PHASE_LABEL,
  DOC_PHASE_STYLE,
  type DocPhase,
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

interface DocPhaseChipProps {
  status: DocumentStatus
  /** 진행 파생값 — 'IN_PROGRESS'면 진행중으로 표시 */
  phase?: string | null
  size?: 'small' | 'medium'
}

/** 결재현황 목록용 칩 — 반려 > 진행중 > 상신 순으로 판정 */
export function DocPhaseChip({ status, phase, size = 'small' }: DocPhaseChipProps) {
  const key: DocPhase =
    status === 'REJECTED' ? 'REJECTED' : phase === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'SUBMITTED'
  const style = DOC_PHASE_STYLE[key]
  return (
    <Chip
      label={DOC_PHASE_LABEL[key]}
      size={size}
      sx={{ bgcolor: style.bg, color: style.fg, fontWeight: 600 }}
    />
  )
}

interface RoleChipProps {
  role: StepRole
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}

/**
 * 결재선 역할 칩 — 결재(APPROVER)는 primary/filled, 그 외는 default/outlined.
 * 결재선 빌더·작성 폼·타임라인 등 여러 곳의 인라인 칩 정의를 단일화한다.
 */
export function RoleChip({ role, size = 'small', sx }: RoleChipProps) {
  const isApprover = role === 'APPROVER'
  return (
    <Chip
      label={STEP_ROLE_LABEL[role] ?? role}
      size={size}
      color={isApprover ? 'primary' : 'default'}
      variant={isApprover ? 'filled' : 'outlined'}
      sx={sx}
    />
  )
}
