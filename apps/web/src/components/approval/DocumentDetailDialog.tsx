'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { useConfirm } from '@/hooks/useConfirm'
import { useSnackbar } from '@/hooks/useSnackbar'
import { useAuthStore } from '@/stores/auth.store'
import {
  useDocument,
  useDocumentStepAction,
  useRecallDocument,
  type ApprovalStepDetail,
  type DocumentDetail,
  type StepAction,
} from '@/lib/query/documents'
import ApprovalTimeline from './ApprovalTimeline'
import { DocStatusChip } from './StatusChips'
import { HISTORY_ACTION_LABEL, dateTimeText } from './approval-constants'

const ACTED_STATUSES = ['APPROVED', 'PRE_APPROVED', 'PROXY_APPROVED', 'REJECTED', 'RETURNED']

interface Props {
  open: boolean
  documentId: string | null
  onClose: () => void
  /** REJECTED/RECALLED 문서 재상신 — 기안 작성 다이얼로그로 연결 */
  onResubmit?: (doc: DocumentDetail) => void
  /** drafter.id 미제공 응답 시 본인 문서 여부 힌트 (기안함/진행중/완료함 등) */
  isMineHint?: boolean
}

interface ActionDef {
  action: StepAction
  label: string
  color: 'primary' | 'error' | 'warning' | 'info'
  needsConfirm?: boolean
}

function buildStepActions(
  step: ApprovalStepDetail,
  allowPreApproval: boolean,
): ActionDef[] {
  switch (step.role) {
    case 'APPROVER': {
      const actions: ActionDef[] = [
        { action: 'approve', label: '승인', color: 'primary' },
        { action: 'reject', label: '반려', color: 'error', needsConfirm: true },
      ]
      if (allowPreApproval) {
        actions.push({ action: 'pre-approve', label: '전결', color: 'warning' })
      }
      if (step.stepOrder > 1) {
        actions.push({ action: 'return-prev', label: '전단계 반려', color: 'error', needsConfirm: true })
      }
      return actions
    }
    case 'AGREEMENT':
      return [{ action: 'agree', label: '협조', color: 'primary' }]
    case 'REFERENCE':
    case 'VIEWER':
      return [{ action: 'view', label: '확인', color: 'info' }]
    case 'RECEIVER':
      return [{ action: 'receive', label: '수신 처리', color: 'primary' }]
    default:
      return []
  }
}

/** 문서 상세 다이얼로그 — 내용 + 결재선 타임라인 + 이력 + 내 차례 액션 */
export default function DocumentDetailDialog({
  open,
  documentId,
  onClose,
  onResubmit,
  isMineHint = false,
}: Props) {
  const myEmployeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const { data: doc, isLoading } = useDocument(open ? documentId : null)
  const stepAction = useDocumentStepAction()
  const recallMutation = useRecallDocument()
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()
  const [comment, setComment] = useState('')

  const steps: ApprovalStepDetail[] = doc?.approvalLines?.flatMap((l) => l.steps) ?? []
  const isHrLinked = !!doc?.requestId
  const isDrafter = doc?.drafter?.id ? doc.drafter.id === myEmployeeId : isMineHint

  const myPendingStep = steps.find(
    (s) => s.assignee?.id === myEmployeeId && s.status === 'PENDING',
  )
  const myApprovedStep = steps.find(
    (s) => s.assignee?.id === myEmployeeId && s.role === 'APPROVER' && s.status === 'APPROVED',
  )

  const hasActedStep = steps.some((s) => ACTED_STATUSES.includes(s.status))
  const canRecall = isDrafter && doc?.status === 'PENDING' && !hasActedStep
  const canCancelApproval =
    doc?.status === 'PENDING' &&
    !!myApprovedStep &&
    !steps.some(
      (s) => s.stepOrder > myApprovedStep.stepOrder && ACTED_STATUSES.includes(s.status),
    )
  const canResubmit =
    !!onResubmit &&
    isDrafter &&
    (doc?.status === 'REJECTED' || doc?.status === 'RECALLED') &&
    doc?.form?.allowReDraft !== false

  const stepActions =
    !isHrLinked && doc?.status === 'PENDING' && myPendingStep
      ? buildStepActions(myPendingStep, doc.form?.allowPreApproval ?? false)
      : []

  const hasAnyAction = stepActions.length > 0 || canRecall || (canCancelApproval && !isHrLinked)
  const busy = stepAction.isPending || recallMutation.isPending

  const runStepAction = async (def: ActionDef, stepId: string) => {
    if (!doc) return
    if (def.needsConfirm) {
      const ok = await confirm({
        title: def.label,
        message: `이 문서를 ${def.label} 처리하시겠습니까?`,
        confirmLabel: def.label,
        confirmColor: 'error',
      })
      if (!ok) return
    }
    try {
      await stepAction.mutateAsync({
        documentId: doc.id,
        stepId,
        action: def.action,
        comment: comment || undefined,
      })
      setComment('')
      showSnackbar(`${def.label} 처리가 완료됐습니다.`)
    } catch {
      showSnackbar('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleRecall = async () => {
    if (!doc) return
    const ok = await confirm({
      title: '문서 회수',
      message: '상신한 문서를 회수하시겠습니까?',
      confirmLabel: '회수',
      confirmColor: 'warning',
    })
    if (!ok) return
    try {
      await recallMutation.mutateAsync(doc.id)
      showSnackbar('문서를 회수했습니다.')
    } catch {
      showSnackbar('회수 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleCancelApproval = async () => {
    if (!doc || !myApprovedStep) return
    const ok = await confirm({
      title: '결재 취소',
      message: '승인한 결재를 취소하고 이전 상태로 되돌리시겠습니까?',
      confirmLabel: '결재 취소',
      confirmColor: 'warning',
    })
    if (!ok) return
    try {
      await stepAction.mutateAsync({
        documentId: doc.id,
        stepId: myApprovedStep.id,
        action: 'cancel-approval',
        comment: comment || undefined,
      })
      setComment('')
      showSnackbar('결재를 취소했습니다.')
    } catch {
      showSnackbar('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          문서 상세
          {doc && <DocStatusChip status={doc.status} />}
        </DialogTitle>
        <DialogContent dividers>
          {isLoading || !doc ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {isHrLinked && (
                <Alert severity="info">
                  HR 요청 연동 문서입니다 — 결재는 요청 관리에서 처리됩니다.
                </Alert>
              )}

              {/* 기본 정보 */}
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {doc.docNumber ?? '문서번호 미부여'} · {doc.form?.name ?? '양식 없음'}
                </Typography>
                <Typography variant="h6" fontWeight={700}>{doc.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  기안자 {doc.drafter?.name ?? '—'} · 상신일 {dateTimeText(doc.submittedAt)}
                </Typography>
              </Box>

              {/* 내용 */}
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: 'background.default',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                  {typeof doc.content?.body === 'string' && doc.content.body.length > 0
                    ? doc.content.body
                    : '내용이 없습니다.'}
                </Typography>
              </Box>

              {/* 결재선 타임라인 */}
              <Box>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>결재선</Typography>
                <ApprovalTimeline steps={steps} />
              </Box>

              {/* 이력 */}
              {(doc.history?.length ?? 0) > 0 && (
                <Box>
                  <Divider sx={{ mb: 1.5 }} />
                  <Typography variant="subtitle2" fontWeight={700} mb={1}>이력</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {doc.history!.map((h, i) => (
                      <Box key={`history-${i}`}>
                        <Typography variant="body2">
                          <strong>{HISTORY_ACTION_LABEL[h.action] ?? h.action}</strong>
                          {h.actor?.name ? ` · ${h.actor.name}` : ''}
                          <Typography component="span" variant="caption" color="text.secondary">
                            {' '}{dateTimeText(h.createdAt)}
                          </Typography>
                        </Typography>
                        {h.comment && (
                          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                            {h.comment}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}

              {/* 코멘트 입력 (액션 가능 시) */}
              {hasAnyAction && (
                <TextField
                  label="코멘트"
                  placeholder="처리 의견을 입력하세요 (선택)"
                  multiline
                  rows={2}
                  fullWidth
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          <Button onClick={onClose} disabled={busy}>닫기</Button>
          <Box sx={{ flexGrow: 1 }} />
          {canResubmit && doc && (
            <Button variant="outlined" onClick={() => onResubmit!(doc)} disabled={busy}>
              재상신
            </Button>
          )}
          {canRecall && (
            <Button variant="outlined" color="warning" onClick={handleRecall} disabled={busy}>
              회수
            </Button>
          )}
          {!isHrLinked && canCancelApproval && (
            <Button variant="outlined" color="warning" onClick={handleCancelApproval} disabled={busy}>
              결재 취소
            </Button>
          )}
          {stepActions.map((def) => (
            <Button
              key={def.action}
              variant={def.action === 'approve' || def.action === 'agree' || def.action === 'receive' || def.action === 'view' ? 'contained' : 'outlined'}
              color={def.color}
              disabled={busy}
              onClick={() => runStepAction(def, myPendingStep!.id)}
            >
              {def.label}
            </Button>
          ))}
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        confirmColor={confirmState.confirmColor}
        loading={busy}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
