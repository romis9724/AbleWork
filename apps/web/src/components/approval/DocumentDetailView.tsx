'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import ApprovalActionDialog, { type ApprovalActionOption } from './ApprovalActionDialog'
import AddCcDialog from './AddCcDialog'
import { useConfirm } from '@/hooks/useConfirm'
import { useSnackbar } from '@/hooks/useSnackbar'
import { useAuthStore } from '@/stores/auth.store'
import {
  useDocument,
  useDocumentForms,
  useDocumentStepAction,
  useRecallDocument,
  type ApprovalStepDetail,
  type StepAction,
} from '@/lib/query/documents'
import { readFormFields, DocumentFieldType } from '@ablework/shared-constants'
import ApprovalTimeline from './ApprovalTimeline'
import AttachmentPanel from './AttachmentPanel'
import RichTextView from './RichTextView'
import { DocStatusChip } from './StatusChips'
import { HISTORY_ACTION_LABEL, dateTimeText } from './approval-constants'

const ACTED_STATUSES = ['APPROVED', 'PRE_APPROVED', 'PROXY_APPROVED', 'REJECTED', 'RETURNED']
/** 결재하기 팝업(라디오 결정)으로 처리하는 역할 — 그 외(확인/수신)는 직접 버튼 */
const DECISION_ROLES = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']
/** 의견 입력 필수 액션 (카카오워크: 반려/전단계반려/전결/반송) */
const COMMENT_REQUIRED_ACTIONS: StepAction[] = ['reject', 'return-prev', 'pre-approve', 'bounce']

interface Props {
  documentId: string
  /** 목록(뒤로) 경로 */
  backPath: string
  /**
   * 재상신/재기안 시 작성 페이지 base (drafter 셸: /me/documents·/admin/approval/inbox).
   * 미지정이면 해당 버튼을 숨긴다(관리자 모니터링 뷰: 결재현황·문서대장).
   */
  composeBase?: string
  /** drafter.id 미제공 응답 시 본인 문서 여부 힌트 (기안함/진행중/완료함 등) */
  isMineHint?: boolean
}

interface ActionDef {
  action: StepAction
  label: string
  color: 'primary' | 'error' | 'warning' | 'info'
  needsConfirm?: boolean
}

function buildStepActions(step: ApprovalStepDetail, allowPreApproval: boolean): ActionDef[] {
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
    case 'DEPT_COLLABORATOR':
      return [
        { action: 'dept-collab', label: '부서협조 완료', color: 'primary' },
        { action: 'reject', label: '반려', color: 'error', needsConfirm: true },
      ]
    case 'REFERENCE':
    case 'VIEWER':
      return [{ action: 'view', label: '확인', color: 'info' }]
    case 'RECEIVER':
      return [{ action: 'receive', label: '수신 처리', color: 'primary' }]
    case 'DEPT_RECEIVER':
      return [
        { action: 'receive', label: '수신확인', color: 'primary' },
        { action: 'bounce', label: '반송', color: 'error', needsConfirm: true },
      ]
    default:
      return []
  }
}

/** 역할별 액션 노출 문서 상태 — 수신류는 APPROVED, 참조/공람은 무관, 결재 흐름은 PENDING */
function actionsVisibleForStatus(role: ApprovalStepDetail['role'], status?: string): boolean {
  if (role === 'RECEIVER' || role === 'DEPT_RECEIVER') return status === 'APPROVED'
  if (role === 'REFERENCE' || role === 'VIEWER') return true
  return status === 'PENDING'
}

/** table 필드 값(string[][]) 읽기 전용 표 렌더 */
function FieldTable({ columns, rows }: { columns?: string[]; rows: string[][] }) {
  const cols = columns?.length ? columns : ['항목', '내용']
  if (!rows.length) return <Typography variant="body2" color="text.secondary">—</Typography>
  return (
    <Box
      component="table"
      sx={{
        borderCollapse: 'collapse',
        width: '100%',
        fontSize: 13,
        '& td, & th': { border: '1px solid', borderColor: 'divider', p: 0.5, textAlign: 'left' },
        '& th': { bgcolor: 'background.default', fontWeight: 600 },
      }}
    >
      <thead>
        <tr>{cols.map((c, i) => <th key={i}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>{cols.map((_, ci) => <td key={ci}>{row[ci] ?? ''}</td>)}</tr>
        ))}
      </tbody>
    </Box>
  )
}

/**
 * 기안 문서 상세 풀페이지 — 내용 + 결재선 타임라인 + 이력 + 내 차례 결재 액션(하단 sticky 푸터).
 * 카카오워크 PDF 정합으로 모달에서 페이지로 승격. 결재 처리 통합 팝업(C1/C2)은 후속.
 */
export default function DocumentDetailView({
  documentId,
  backPath,
  composeBase,
  isMineHint = false,
}: Props) {
  const router = useRouter()
  const myEmployeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const { data: doc, isLoading } = useDocument(documentId)
  const { data: forms = [] } = useDocumentForms()
  const stepAction = useDocumentStepAction()
  const recallMutation = useRecallDocument()
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()
  // 통합 결재하기 팝업 / 반송 팝업 / 공람·참조 추가 팝업 열림 상태
  const [decisionOpen, setDecisionOpen] = useState(false)
  const [bounceOpen, setBounceOpen] = useState(false)
  const [ccOpen, setCcOpen] = useState(false)

  const steps: ApprovalStepDetail[] = doc?.approvalLines?.flatMap((l) => l.steps) ?? []
  const formFields = readFormFields(forms.find((f) => f.id === doc?.form?.id)?.fieldsSchema)
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
    !!composeBase &&
    isDrafter &&
    (doc?.status === 'REJECTED' || doc?.status === 'RECALLED') &&
    doc?.form?.allowReDraft !== false
  const canRedraft =
    !!composeBase &&
    isDrafter &&
    doc?.status === 'APPROVED' &&
    doc?.form?.allowReDraft === true
  // AP-02-08 공람/참조 사후 추가 — 진행중·완료 문서에 기안자/결재 참여자가 지정
  const isParticipant = steps.some(
    (s) => ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR'].includes(s.role) && s.assignee?.id === myEmployeeId,
  )
  const canAddCc =
    !isHrLinked &&
    (doc?.status === 'PENDING' || doc?.status === 'APPROVED') &&
    (isDrafter || isParticipant)

  const stepActions =
    !isHrLinked && myPendingStep && actionsVisibleForStatus(myPendingStep.role, doc?.status)
      ? buildStepActions(myPendingStep, doc?.form?.allowPreApproval ?? false)
      : []
  // 결재하기 팝업(라디오 결정) vs 직접 버튼(확인/수신/반송)
  const isDecisionStep =
    !!myPendingStep && stepActions.length > 0 && DECISION_ROLES.includes(myPendingStep.role)
  const directActions = isDecisionStep ? [] : stepActions

  const hasFooterAction =
    stepActions.length > 0 ||
    canRecall ||
    (canCancelApproval && !isHrLinked) ||
    canResubmit ||
    canRedraft ||
    canAddCc
  const busy = stepAction.isPending || recallMutation.isPending

  // L5 전단계 반려 시 결재권이 돌아갈 직전 결재자 이름
  const previousApproverName = (() => {
    if (!myPendingStep) return null
    const flowRoles = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']
    const prev = steps
      .filter(
        (s) =>
          flowRoles.includes(s.role) &&
          s.stepOrder < myPendingStep.stepOrder &&
          (s.status === 'APPROVED' || s.status === 'PROXY_APPROVED'),
      )
      .sort((a, b) => b.stepOrder - a.stepOrder)[0]
    return prev?.assignee?.name ?? null
  })()

  /** 결재하기/반송 팝업·직접 버튼에서 호출 — step 액션 처리 */
  const submitAction = async (action: StepAction, actionComment: string) => {
    if (!doc || !myPendingStep) return
    try {
      await stepAction.mutateAsync({
        documentId: doc.id,
        stepId: myPendingStep.id,
        action,
        comment: actionComment || undefined,
      })
      setDecisionOpen(false)
      setBounceOpen(false)
      const label = stepActions.find((a) => a.action === action)?.label ?? '처리'
      showSnackbar(`${label} 처리가 완료됐습니다.`)
    } catch {
      showSnackbar('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  // 결재하기 팝업 라디오 옵션 (전단계 반려는 결재권 반환 안내 표시)
  const decisionOptions: ApprovalActionOption[] = stepActions.map((a) => ({
    action: a.action,
    label: a.label,
    helper:
      a.action === 'return-prev'
        ? `직전 결재자${previousApproverName ? `(${previousApproverName})` : ''}에게 결재권을 반환합니다.`
        : undefined,
  }))

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
      })
      showSnackbar('결재를 취소했습니다.')
    } catch {
      showSnackbar('처리 중 오류가 발생했습니다.', 'error')
    }
  }

  if (isLoading || !doc) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ pb: hasFooterAction ? 10 : 2 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push(backPath)} color="inherit">
          목록
        </Button>
        <Typography variant="h6" fontWeight={700}>문서 상세</Typography>
        <DocStatusChip status={doc.status} />
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 920 }}>
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
          <Typography variant="h5" fontWeight={700}>{doc.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            기안자 {doc.drafter?.name ?? '—'} · 상신일 {dateTimeText(doc.submittedAt)}
          </Typography>
        </Box>

        {/* 양식 동적 필드 값 (AP-01-02) */}
        {formFields.length > 0 && (
          <Box
            sx={{
              p: 1.5,
              bgcolor: 'background.default',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {formFields.map((f) => {
              const v = (doc.content as Record<string, unknown> | undefined)?.[f.key]
              return (
                <Box key={f.key} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ minWidth: 96, fontWeight: 600, pt: 0.25 }}>
                    {f.label}
                  </Typography>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    {f.type === DocumentFieldType.RICHTEXT ? (
                      <RichTextView html={typeof v === 'string' ? v : ''} emptyText="—" />
                    ) : f.type === DocumentFieldType.TABLE ? (
                      <FieldTable columns={f.columns} rows={Array.isArray(v) ? (v as string[][]) : []} />
                    ) : (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                        {v === undefined || v === null || v === '' ? '—' : String(v)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )
            })}
          </Box>
        )}

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
          <RichTextView html={typeof doc.content?.body === 'string' ? doc.content.body : ''} />
        </Box>

        {/* 첨부파일 (AP-02-01) */}
        <AttachmentPanel documentId={documentId} onError={(m) => showSnackbar(m, 'error')} />

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
      </Box>

      {/* 하단 sticky 푸터 — 결재/회수/재상신/재기안 액션 */}
      {hasFooterAction && (
        <Paper
          elevation={3}
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: (t) => t.zIndex.appBar,
            px: 3,
            py: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ flexGrow: 1 }} />
          {canResubmit && (
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => router.push(`${composeBase}/${documentId}/edit`)}
            >
              재상신
            </Button>
          )}
          {canRedraft && (
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => router.push(`${composeBase}/new?from=${documentId}`)}
            >
              재기안
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

          {/* AP-02-08 공람·참조 사후 추가 */}
          {canAddCc && (
            <Button variant="outlined" disabled={busy} onClick={() => setCcOpen(true)}>
              공람·참조 추가
            </Button>
          )}

          {/* 결재 결정 역할 → 통합 [결재] 버튼(결재하기 팝업) */}
          {isDecisionStep && (
            <Button variant="contained" disabled={busy} onClick={() => setDecisionOpen(true)}>
              결재
            </Button>
          )}

          {/* 확인/수신/반송 등 직접 액션 */}
          {directActions.map((def) =>
            def.action === 'bounce' ? (
              <Button key={def.action} variant="outlined" color="error" disabled={busy} onClick={() => setBounceOpen(true)}>
                {def.label}
              </Button>
            ) : (
              <Button
                key={def.action}
                variant={['receive', 'view'].includes(def.action) ? 'contained' : 'outlined'}
                color={def.color}
                disabled={busy}
                onClick={() => submitAction(def.action, '')}
              >
                {def.label}
              </Button>
            ),
          )}
        </Paper>
      )}

      {/* C1 통합 결재하기 팝업 */}
      <ApprovalActionDialog
        open={decisionOpen}
        title="결재하기"
        options={decisionOptions}
        commentRequiredFor={COMMENT_REQUIRED_ACTIONS}
        busy={busy}
        submitLabel="결재"
        onClose={() => setDecisionOpen(false)}
        onSubmit={submitAction}
      />

      {/* C2 반송 팝업 (의견 필수) */}
      <ApprovalActionDialog
        open={bounceOpen}
        title="반송"
        options={[{ action: 'bounce', label: '반송' }]}
        commentRequiredFor={['bounce']}
        busy={busy}
        submitLabel="반송"
        onClose={() => setBounceOpen(false)}
        onSubmit={submitAction}
      />

      {/* C4/C6/C7 공람·참조 사후 추가 팝업 */}
      <AddCcDialog
        open={ccOpen}
        documentId={documentId}
        onClose={() => setCcOpen(false)}
        onResult={(msg, severity) => showSnackbar(msg, severity)}
      />

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
    </Box>
  )
}
