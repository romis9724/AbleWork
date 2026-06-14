'use client'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import type { ApprovalStepDetail } from '@/lib/query/documents'
import { STEP_ROLE_LABEL, STEP_STATUS_STYLE, dateTimeText } from './approval-constants'
import { StepStatusChip } from './StatusChips'

interface Props {
  steps: ApprovalStepDetail[]
}

/** 결재선 세로 타임라인 — 단계별 역할·담당자·상태·코멘트·처리시각, 대결 표시 */
export default function ApprovalTimeline({ steps }: Props) {
  if (steps.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        결재선 정보가 없습니다.
      </Typography>
    )
  }

  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)

  return (
    <Box>
      {sorted.map((step, index) => {
        const style = STEP_STATUS_STYLE[step.status] ?? STEP_STATUS_STYLE.WAITING
        const isLast = index === sorted.length - 1
        return (
          <Box key={step.id} sx={{ display: 'flex', gap: 1.5 }}>
            {/* 타임라인 점 + 연결선 */}
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: style.fg,
                  border: '2px solid',
                  borderColor: style.bg,
                  boxShadow: step.status === 'PENDING' ? `0 0 0 3px ${style.bg}` : 'none',
                  flexShrink: 0,
                }}
              />
              {!isLast && (
                <Box sx={{ width: 2, flexGrow: 1, bgcolor: 'divider', my: 0.5 }} />
              )}
            </Box>

            {/* 단계 내용 */}
            <Box sx={{ pb: isLast ? 0 : 2, minWidth: 0, flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  label={STEP_ROLE_LABEL[step.role] ?? step.role}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22 }}
                />
                <Typography variant="body2" fontWeight={600}>
                  {step.organization?.name
                    ? `${step.organization.name}${step.assignee?.name ? ` · ${step.assignee.name}` : ''}`
                    : (step.assignee?.name ?? '—')}
                </Typography>
                <StepStatusChip status={step.status} />
                {step.isProxy && step.proxy && (
                  <Chip
                    label={`대결: ${step.proxy.name}`}
                    size="small"
                    sx={{ height: 22, bgcolor: '#e0f2f1', color: '#00695c' }}
                  />
                )}
              </Box>
              {step.actedAt && (
                <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>
                  {dateTimeText(step.actedAt)}
                </Typography>
              )}
              {step.comment && (
                <Typography
                  variant="body2"
                  sx={{
                    mt: 0.5,
                    px: 1.25,
                    py: 0.75,
                    bgcolor: 'background.default',
                    borderRadius: 1,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {step.comment}
                </Typography>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
