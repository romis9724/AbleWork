/**
 * AB 전자결재 — 결재 문서 모달 (상세 view · 수정 edit · 등록 create).
 * 핸드오프 hr/doc_modal.jsx 네이티브 포팅. 전역 .modal/.doc/.aline/.acol/.doc-field/.doc-meta/.chips/.attach
 * 클래스로 시각 셸을 구성하고, 데이터/워크플로는 documents.ts 훅 + DocumentDetailView 권한 로직을 그대로 사용한다.
 *
 * - 깊은 위젯은 기존 MUI 컴포넌트(ApprovalLineBuilder/DynamicFormFields/RichTextEditor/RichTextView/AttachmentPanel)를
 *   .doc-section 셸 안에 임베드(다크 테마라 자연스럽게 섞임).
 * - 라벨 SSOT: approval-constants 맵 사용(하드코딩 라벨 금지).
 */
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ab/Toast'
import { I } from '@/components/ab/icons'
import { Badge, type BadgeKind } from '@/components/ab/atoms'
import { useAuthStore } from '@/stores/auth.store'
import { readFormFields } from '@ablework/shared-constants'
import {
  useAddCcSteps,
  useCreateDocument,
  useDocument,
  useDocumentForms,
  useDocumentStepAction,
  useRecallDocument,
  useSharedApprovalLines,
  useSubmitDocument,
  useUpdateDocument,
  type ApprovalStepDetail,
  type ApprovalStepInput,
  type DocumentDetail,
  type DocumentStatus,
  type StepAction,
  type StepStatus,
} from '@/lib/query/documents'
import { useEmployees } from '@/lib/query/employees'
import ApprovalLineBuilder from './ApprovalLineBuilder'
import DynamicFormFields from './DynamicFormFields'
import RichTextEditor from './RichTextEditor'
import RichTextView from './RichTextView'
import AttachmentPanel from './AttachmentPanel'
import {
  DOC_STATUS_LABEL,
  HISTORY_ACTION_LABEL,
  STEP_ROLE_LABEL,
  STEP_STATUS_LABEL,
  dateTimeText,
  isDeptRole,
} from './approval-constants'

type Mode = 'view' | 'edit' | 'create'

interface Props {
  documentId?: string | null
  mode: Mode
  onClose: () => void
}

/** 문서 상태 → 헤더 Badge 종류 */
const DOC_BADGE: Record<DocumentStatus, BadgeKind> = {
  DRAFT: 'b-wait',
  PENDING: 'b-prog',
  APPROVED: 'b-done',
  REJECTED: 'b-reject',
  RECALLED: 'b-submit',
}

/** 이력 action → Badge 종류 (결재 의견 타임라인) */
const HISTORY_BADGE: Record<string, BadgeKind> = {
  APPROVE: 'b-done',
  PRE_APPROVE: 'b-done',
  PROXY_APPROVE: 'b-done',
  AGREE: 'b-prog',
  REJECT: 'b-reject',
  RETURN_PREV: 'b-reject',
  BOUNCE: 'b-reject',
  RECALL: 'b-submit',
  CANCEL_APPROVAL: 'b-wait',
}

/** 단계 상태 → 도장 마크(ok/rej/wait) */
function markFor(status: StepStatus): 'ok' | 'rej' | 'wait' {
  if (status === 'APPROVED' || status === 'PRE_APPROVED' || status === 'PROXY_APPROVED' || status === 'VIEWED' || status === 'RECEIVED') {
    return 'ok'
  }
  if (status === 'REJECTED' || status === 'RETURNED' || status === 'BOUNCED') return 'rej'
  return 'wait'
}

interface StampStep {
  role: string
  name: string
  sub?: string
  mark: 'ok' | 'rej' | 'wait'
  markLabel: string
  date: string
  draft?: boolean
}

/** detail.approvalLines[].steps + 기안자 → 결재선 도장 행 */
function buildStampLine(doc: DocumentDetail): StampStep[] {
  const steps = (doc.approvalLines?.flatMap((l) => l.steps) ?? [])
    .slice()
    .sort((a, b) => a.stepOrder - b.stepOrder)
  const drafter: StampStep = {
    role: '기안',
    name: doc.drafter?.name ?? '—',
    mark: 'ok',
    markLabel: '기안',
    date: dateTimeText(doc.submittedAt),
    draft: true,
  }
  const stamps = steps.map((s: ApprovalStepDetail): StampStep => {
    const target = isDeptRole(s.role) ? s.organization?.name : s.assignee?.name
    return {
      role: STEP_ROLE_LABEL[s.role] ?? s.role,
      name: target ?? '미지정',
      sub: s.isProxy && s.proxy?.name ? `대결 ${s.proxy.name}` : undefined,
      mark: markFor(s.status),
      markLabel: STEP_STATUS_LABEL[s.status] ?? s.status,
      date: s.actedAt ? dateTimeText(s.actedAt) : s.status === 'PENDING' ? '결재 대기' : '—',
    }
  })
  return [drafter, ...stamps]
}

function ApprovalStamp({ s }: { s: StampStep }) {
  return (
    <div className={'acol' + (s.draft ? ' draft' : '')}>
      <div className="acol-role">{s.role}</div>
      <div className="acol-stamp">
        <div className={'acol-mark ' + s.mark}>{s.markLabel}</div>
        <div>
          <div className="acol-name">{s.name}</div>
          {s.sub && <div className="acol-sub">{s.sub}</div>}
        </div>
      </div>
      <div className="acol-date">{s.date}</div>
    </div>
  )
}

const ACTED_STATUSES: StepStatus[] = ['APPROVED', 'PRE_APPROVED', 'PROXY_APPROVED', 'REJECTED', 'RETURNED']
const FLOW_ROLES = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']

export default function DocModal({ documentId = null, mode: initialMode, onClose }: Props) {
  const toast = useToast()
  const [mode, setMode] = useState<Mode>(initialMode)
  const isCreate = mode === 'create'
  const isView = mode === 'view'
  const editable = mode === 'edit' || mode === 'create'

  const myEmployeeId = useAuthStore((s) => s.user?.employeeId) ?? ''

  // 상세 (view/edit) — create는 미로드
  const { data: doc, isLoading } = useDocument(isCreate ? null : documentId)
  const { data: forms = [] } = useDocumentForms()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const { data: empData } = useEmployees({ isActive: true, limit: 200 })
  const employees = empData?.items ?? []

  const createMutation = useCreateDocument()
  const updateMutation = useUpdateDocument()
  const submitMutation = useSubmitDocument()
  const stepAction = useDocumentStepAction()
  const recallMutation = useRecallDocument()
  const addCcMutation = useAddCcSteps()

  // ----- 편집/작성 폼 상태 -----
  const [formId, setFormId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [steps, setSteps] = useState<ApprovalStepInput[]>([])
  const [comment, setComment] = useState('')
  // 공람/참조 사후 추가 picker (C-8) + 공용 결재선 선택 (C-6)
  const [ccEmpId, setCcEmpId] = useState('')
  const [ccRole, setCcRole] = useState<'VIEWER' | 'REFERENCE'>('VIEWER')
  const [sharedLineId, setSharedLineId] = useState('')
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  // 편집 모드 진입 시 원본으로 폼 채우기 (1회)
  useEffect(() => {
    if (!editable || !doc || initializedFor === `${doc.id}:${mode}`) return
    setFormId(doc.form?.id ?? '')
    setTitle(doc.title)
    setBody(typeof doc.content?.body === 'string' ? doc.content.body : '')
    const content = (doc.content ?? {}) as Record<string, unknown>
    const { body: _body, ...rest } = content
    void _body
    setFieldValues(rest)
    setSteps(
      (doc.approvalLines?.flatMap((l) => l.steps) ?? [])
        .filter((s) => (isDeptRole(s.role) ? !!s.organization?.id : !!s.assignee?.id))
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((s, i) =>
          isDeptRole(s.role)
            ? { role: s.role, organizationId: s.organization!.id, stepOrder: i + 1 }
            : { role: s.role, assigneeId: s.assignee!.id, stepOrder: i + 1 },
        ),
    )
    setInitializedFor(`${doc.id}:${mode}`)
  }, [editable, doc, mode, initializedFor])

  // ----- 파생: 권한/액션 (DocumentDetailView 로직 준수) -----
  const detailSteps: ApprovalStepDetail[] = doc?.approvalLines?.flatMap((l) => l.steps) ?? []
  const selectedForm = forms.find((f) => f.id === (isCreate ? formId : doc?.form?.id)) ?? null
  const dynamicFields = readFormFields(selectedForm?.fieldsSchema)
  const allowPreApproval = doc?.form?.allowPreApproval ?? false
  const isHrLinked = !!doc?.requestId
  const isDrafter = doc?.drafter?.id ? doc.drafter.id === myEmployeeId : false

  const myPendingStep = detailSteps.find(
    (s) => s.assignee?.id === myEmployeeId && s.status === 'PENDING',
  )
  const hasActedStep = detailSteps.some((s) => ACTED_STATUSES.includes(s.status))

  /** 역할별 액션 노출 문서 상태 */
  const actionsVisible = (() => {
    if (!myPendingStep) return false
    const role = myPendingStep.role
    if (role === 'RECEIVER' || role === 'DEPT_RECEIVER') return doc?.status === 'APPROVED'
    if (role === 'REFERENCE' || role === 'VIEWER') return true
    return doc?.status === 'PENDING'
  })()

  const canApprove =
    !isHrLinked && actionsVisible && !!myPendingStep && FLOW_ROLES.includes(myPendingStep.role)
  const canConfirmView =
    !isHrLinked && actionsVisible && !!myPendingStep && ['REFERENCE', 'VIEWER'].includes(myPendingStep.role)
  const canReceive =
    !isHrLinked && actionsVisible && !!myPendingStep && ['RECEIVER', 'DEPT_RECEIVER'].includes(myPendingStep.role)
  // 내가 이미 처리(승인/대결)한 단계 — 진행 중 문서면 결재취소 가능 (다음 단계 미처리 여부는 BE가 강제)
  const myActedStep = detailSteps.find(
    (s) => s.assignee?.id === myEmployeeId && (s.status === 'APPROVED' || s.status === 'PROXY_APPROVED'),
  )
  const canCancelApproval = !isHrLinked && !!myActedStep && doc?.status === 'PENDING'
  // 현재 결재 단계보다 앞선 결재(흐름) 단계가 있으면 전단계 반려 가능 (정책 off 시 BE가 거부)
  const hasPrevFlowStep =
    !!myPendingStep &&
    detailSteps.some((s) => FLOW_ROLES.includes(s.role) && s.stepOrder < myPendingStep.stepOrder)
  const canRecall = isDrafter && doc?.status === 'PENDING' && !hasActedStep
  // 기안자 본인이 수정 가능한 상태: DRAFT(임시저장) + RECALLED(회수) + REJECTED(반려)
  const isEditableMine = isDrafter && ['DRAFT', 'RECALLED', 'REJECTED'].includes(doc?.status ?? '')
  // 재상신 가능: RECALLED는 항상, REJECTED는 양식의 allowReDraft 허용 시 (BE 정책과 일치)
  const canReDraft =
    isDrafter &&
    (doc?.status === 'RECALLED' ||
      (doc?.status === 'REJECTED' && (doc?.form?.allowReDraft ?? false)))
  const isParticipant = detailSteps.some(
    (s) => FLOW_ROLES.includes(s.role) && s.assignee?.id === myEmployeeId,
  )
  const canAddCc =
    !isHrLinked &&
    (doc?.status === 'PENDING' || doc?.status === 'APPROVED') &&
    (isDrafter || isParticipant)

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending ||
    stepAction.isPending ||
    recallMutation.isPending ||
    addCcMutation.isPending

  const stampLine: StampStep[] = useMemo(() => (doc ? buildStampLine(doc) : []), [doc])

  // 결재 의견 타임라인 (comment 있는 이력)
  const comments = (doc?.history ?? []).filter((h) => h.comment)

  // 참조·공람 칩 (view) — REFERENCE/VIEWER step
  const ccChips = detailSteps
    .filter((s) => s.role === 'REFERENCE' || s.role === 'VIEWER')
    .map((s) => ({ label: STEP_ROLE_LABEL[s.role], name: s.assignee?.name ?? s.organization?.name ?? '미지정' }))

  // ----- 액션 핸들러 -----
  const runStepAction = async (action: StepAction, requireComment = false, targetStepId?: string) => {
    // 기본은 내 PENDING 단계. 결재취소(cancel-approval)처럼 이미 처리한 단계를 대상으로 할 때는 targetStepId 전달.
    const stepId = targetStepId ?? myPendingStep?.id
    if (!doc || !stepId) return
    if (requireComment && !comment.trim()) {
      toast('의견을 입력해 주세요')
      return
    }
    try {
      await stepAction.mutateAsync({
        documentId: doc.id,
        stepId,
        action,
        comment: comment.trim() || undefined,
      })
      toast('결재 처리가 완료됐습니다')
      onClose()
    } catch {
      toast('처리 중 오류가 발생했습니다')
    }
  }

  const handleRecall = async () => {
    if (!doc) return
    try {
      await recallMutation.mutateAsync(doc.id)
      toast('기안을 회수했습니다')
      onClose()
    } catch {
      toast('회수 중 오류가 발생했습니다')
    }
  }

  const handleSave = async () => {
    if (!doc) return
    try {
      await updateMutation.mutateAsync({
        id: doc.id,
        title: title.trim(),
        content: { body, ...fieldValues },
      })
      toast('문서를 수정했습니다')
      setMode('view')
    } catch {
      toast('수정 중 오류가 발생했습니다')
    }
  }

  /** 회수/반려 문서 재상신: 수정 내용 저장 후 기존 결재선으로 다시 상신 → PENDING */
  const handleResubmit = async () => {
    if (!doc) return
    if (steps.length === 0 || !steps.some((s) => s.role === 'APPROVER')) {
      toast('결재(승인) 단계가 없어 재상신할 수 없습니다')
      return
    }
    try {
      await updateMutation.mutateAsync({
        id: doc.id,
        title: title.trim(),
        content: { body, ...fieldValues },
      })
      await submitMutation.mutateAsync({
        id: doc.id,
        steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
      })
      toast('재상신했습니다')
      onClose()
    } catch {
      toast('재상신 중 오류가 발생했습니다')
    }
  }

  /** 작성: 문서 생성 (id 확보) */
  const createDraft = async (): Promise<string | null> => {
    try {
      const created = await createMutation.mutateAsync({
        formId,
        title: title.trim(),
        content: { body, ...fieldValues },
      })
      return created.id
    } catch {
      toast('저장 중 오류가 발생했습니다')
      return null
    }
  }

  const handleSaveDraft = async () => {
    if (!formId || !title.trim()) {
      toast('양식과 제목을 입력해 주세요')
      return
    }
    const id = await createDraft()
    if (id) {
      toast('임시저장했습니다')
      onClose()
    }
  }

  const handleCreateSubmit = async () => {
    if (!formId || !title.trim() || steps.length === 0) return
    const incomplete = (s: ApprovalStepInput) => (isDeptRole(s.role) ? !s.organizationId : !s.assigneeId)
    if (steps.some(incomplete)) {
      toast('결재선 단계의 담당자(또는 부서)를 모두 지정해 주세요')
      return
    }
    if (!steps.some((s) => s.role === 'APPROVER')) {
      toast('결재(승인) 역할 단계가 최소 1개 필요합니다')
      return
    }
    const id = await createDraft()
    if (!id) return
    try {
      await submitMutation.mutateAsync({
        id,
        steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
      })
      toast('기안을 상신했습니다')
      onClose()
    } catch {
      toast('상신 중 오류가 발생했습니다')
    }
  }

  /** 공람·참조 사후 추가 — 선택한 직원을 지정 역할(공람/참조)로 추가 (C-8) */
  const handleAddCc = async () => {
    if (!doc) return
    const assigneeId = ccEmpId || myEmployeeId
    if (!assigneeId) {
      toast('추가할 직원을 선택해 주세요')
      return
    }
    try {
      await addCcMutation.mutateAsync({
        documentId: doc.id,
        steps: [{ role: ccRole, assigneeId }],
      })
      toast(`${ccRole === 'REFERENCE' ? '참조' : '공람'} 대상에 추가했습니다`)
      setCcEmpId('')
    } catch {
      toast('추가 중 오류가 발생했습니다')
    }
  }

  /** 공용 결재선 선택 → 작성 중 결재선(steps) prefill (C-6) */
  const applySharedLine = (lineId: string) => {
    setSharedLineId(lineId)
    const line = sharedLines.find((l) => l.id === lineId)
    if (line) setSteps(line.steps.map((s, i) => ({ ...s, stepOrder: i + 1 })))
  }

  // ----- 헤더 텍스트 -----
  const eyebrow = isCreate ? 'New Draft' : mode === 'edit' ? 'Edit Document' : 'Approval Document'
  const heading = isCreate ? '기안 등록' : (editable ? title : doc?.title) || '제목 없음'

  // create 결재선 미설정 여부
  const lineSet = isCreate ? steps.length > 0 : stampLine.length > 1
  const canCreateSubmit = !!formId && !!title.trim() && steps.length > 0

  // ----- 푸터 -----
  const renderFoot = () => {
    if (isView && doc) {
      return (
        <>
          <button className="btn btn-line" onClick={() => { toast('문서를 인쇄합니다'); window.print() }}>
            {I.print({ style: { marginRight: 7 } })}인쇄
          </button>
          {canRecall && (
            <button className="btn btn-line" disabled={busy} onClick={handleRecall}>
              {I.undo({ style: { marginRight: 7 } })}회수
            </button>
          )}
          {isEditableMine && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => setMode('edit')}>
              {I.edit({ style: { marginRight: 7 } })}수정
            </button>
          )}
          {canConfirmView && (
            <button className="btn btn-primary" disabled={busy} onClick={() => runStepAction('view')}>확인 처리</button>
          )}
          {canReceive && (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={() => runStepAction('receive')}>수신 처리</button>
              {myPendingStep?.role === 'DEPT_RECEIVER' && (
                <button className="btn btn-line" style={{ color: 'var(--err)', borderColor: 'rgba(255,127,127,0.4)' }} disabled={busy} onClick={() => runStepAction('bounce', true)}>반송</button>
              )}
            </>
          )}
          {canCancelApproval && (
            <button className="btn btn-line" disabled={busy} onClick={() => runStepAction('cancel-approval', false, myActedStep?.id)}>결재 취소</button>
          )}
          {canApprove && (
            <>
              <button className="btn btn-line" style={{ color: 'var(--err)', borderColor: 'rgba(255,127,127,0.4)' }} disabled={busy} onClick={() => runStepAction('reject', true)}>반려</button>
              {hasPrevFlowStep && (
                <button className="btn btn-line" disabled={busy} onClick={() => runStepAction('return-prev', true)}>전단계 반려</button>
              )}
              {allowPreApproval && myPendingStep?.role === 'APPROVER' && (
                <button className="btn btn-line" disabled={busy} onClick={() => runStepAction('pre-approve', true)}>전결</button>
              )}
              <button className="btn btn-primary" disabled={busy} onClick={() => runStepAction(myPendingStep?.role === 'AGREEMENT' ? 'agree' : myPendingStep?.role === 'DEPT_COLLABORATOR' ? 'dept-collab' : 'approve')}>
                {myPendingStep?.role === 'AGREEMENT' ? '협조' : '승인'}
              </button>
            </>
          )}
          <button className="btn btn-primary" onClick={onClose}>확인</button>
        </>
      )
    }
    if (mode === 'edit') {
      return (
        <>
          <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy} onClick={() => setMode('view')}>취소</button>
          <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy || !title.trim()} onClick={handleSave}>저장</button>
          {canReDraft && (
            <button className="btn btn-primary" style={{ minWidth: 110 }} disabled={busy || !title.trim()} onClick={handleResubmit}>재상신</button>
          )}
        </>
      )
    }
    // create
    return (
      <>
        <button className="btn btn-line" style={{ minWidth: 110 }} disabled={busy || !formId || !title.trim()} onClick={handleSaveDraft}>임시저장</button>
        <button className="btn btn-primary" style={{ minWidth: 110 }} disabled={busy || !canCreateSubmit} onClick={handleCreateSubmit}>상신</button>
      </>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-wrap">
            <span className="modal-eyebrow">{eyebrow}</span>
            <span className="modal-title">{heading}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isView && doc && <Badge kind={DOC_BADGE[doc.status]}>{DOC_STATUS_LABEL[doc.status]}</Badge>}
            <button className="modal-x" onClick={onClose}>{I.x()}</button>
          </div>
        </div>

        <div className="modal-body doc">
          {!isCreate && isLoading ? (
            <div className="doc-section">
              <div className="ab-loading"><span className="ab-spin" />불러오는 중…</div>
            </div>
          ) : (
            <>
              {/* 결재선 */}
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">결재선</span><span className="en">Approval Line</span></div>
                {isCreate ? (
                  <>
                    {sharedLines.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <select
                          className="sel"
                          style={{ maxWidth: 320 }}
                          value={sharedLineId}
                          onChange={(e) => applySharedLine(e.target.value)}
                        >
                          <option value="">공용 결재선 선택 (선택 시 자동 구성)</option>
                          {sharedLines.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <ApprovalLineBuilder steps={steps} onChange={setSteps} disabled={busy} />
                  </>
                ) : lineSet ? (
                  <div className="aline">{stampLine.map((s, i) => <ApprovalStamp key={i} s={s} />)}</div>
                ) : (
                  <div className="muted" style={{ fontSize: 13 }}>결재선이 없습니다.</div>
                )}
              </div>

              {/* 문서 정보 */}
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">문서 정보</span><span className="en">Document Info</span></div>
                {isCreate ? (
                  <div className="doc-field">
                    <span className="fk">기안양식<span className="req">*</span></span>
                    <span className="fv">
                      <select className="sel" value={formId} onChange={(e) => setFormId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                        <option value="">양식 선택</option>
                        {forms.filter((f) => f.isActive).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </span>
                  </div>
                ) : (
                  <div className="doc-meta">
                    <div className="cell"><div className="k">Doc No.</div><div className="v num">{doc?.docNumber ?? '미부여'}</div></div>
                    <div className="cell"><div className="k">기안양식</div><div className="v">{doc?.form?.name ?? '—'}</div></div>
                    <div className="cell"><div className="k">기안자</div><div className="v">{doc?.drafter?.name ?? '—'}</div></div>
                    <div className="cell"><div className="k">상신일시</div><div className="v">{dateTimeText(doc?.submittedAt)}</div></div>
                  </div>
                )}
              </div>

              {/* 기안 내용 */}
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">기안 내용</span><span className="en">Content</span></div>
                <div className="doc-field">
                  <span className="fk">제목<span className="req">{editable ? '*' : ''}</span></span>
                  <span className="fv">
                    {editable
                      ? <input className="inp-block" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="기안 제목을 입력하세요" />
                      : (doc?.title ?? '—')}
                  </span>
                </div>

                {/* 참조·공람 (view) */}
                {isView && (
                  <div className="doc-field">
                    <span className="fk">참조 · 공람</span>
                    <span className="fv" style={{ width: '100%' }}>
                      <div className="chips">
                        {ccChips.length > 0
                          ? ccChips.map((c, i) => <span key={i} className="chip">{c.label} · {c.name}</span>)
                          : <span className="muted">없음</span>}
                      </div>
                      {canAddCc && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                          <select
                            className="sel"
                            style={{ maxWidth: 200 }}
                            value={ccEmpId}
                            onChange={(e) => setCcEmpId(e.target.value)}
                          >
                            <option value="">직원 선택</option>
                            {employees.map((emp) => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                          <select
                            className="sel"
                            style={{ maxWidth: 120 }}
                            value={ccRole}
                            onChange={(e) => setCcRole(e.target.value as 'VIEWER' | 'REFERENCE')}
                          >
                            <option value="VIEWER">공람</option>
                            <option value="REFERENCE">참조</option>
                          </select>
                          <button className="btn btn-line btn-sm" disabled={busy || !ccEmpId} onClick={handleAddCc}>추가</button>
                        </div>
                      )}
                    </span>
                  </div>
                )}

                {/* 동적 양식 필드 (편집) */}
                {editable && dynamicFields.length > 0 && (
                  <div className="doc-field">
                    <span className="fk">양식 항목</span>
                    <span className="fv" style={{ width: '100%' }}>
                      <DynamicFormFields
                        fields={dynamicFields}
                        values={fieldValues}
                        onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
                        disabled={busy}
                      />
                    </span>
                  </div>
                )}

                <div className="doc-field">
                  <span className="fk">본문</span>
                  <span className="fv" style={{ width: '100%' }}>
                    {editable
                      ? <RichTextEditor value={body} onChange={setBody} disabled={busy} />
                      : <RichTextView html={typeof doc?.content?.body === 'string' ? doc.content.body : ''} />}
                  </span>
                </div>
              </div>

              {/* 첨부파일 — 저장된 문서에만 (create 미저장 상태는 안내) */}
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">첨부파일</span><span className="en">Attachments</span></div>
                {isCreate ? (
                  <div className="muted" style={{ fontSize: 13 }}>첨부파일은 임시저장 후 등록할 수 있습니다.</div>
                ) : doc ? (
                  <AttachmentPanel
                    documentId={doc.id}
                    editable={mode === 'edit'}
                    allowZipUpload={doc.form?.allowZipUpload}
                    onError={(m) => toast(m)}
                  />
                ) : null}
              </div>

              {/* 결재 의견 (view) */}
              {isView && (
                <div className="doc-section">
                  <div className="doc-sec-head"><span className="dot" /><span className="t">결재 의견</span><span className="en">Comments</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {comments.length === 0 && <div className="muted" style={{ fontSize: 13 }}>등록된 의견이 없습니다.</div>}
                    {comments.map((c, i) => (
                      <div key={i} style={{ padding: '13px 0', borderBottom: '1px solid var(--line-soft)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.actor?.name ?? '—'}</span>
                          <Badge kind={HISTORY_BADGE[c.action] ?? 'b-submit'}>{HISTORY_ACTION_LABEL[c.action] ?? c.action}</Badge>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--fg-5)', fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 100" }}>{dateTimeText(c.createdAt)}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{c.comment}</p>
                      </div>
                    ))}
                  </div>
                  {/* 결재 의견 입력 — 내 차례면 승인/반려 시 함께 전송 */}
                  {(canApprove || canConfirmView || canReceive) && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <input
                        className="inp-block"
                        placeholder="결재 의견을 입력하세요 (반려·전결 시 필수)"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot">{renderFoot()}</div>
      </div>
    </div>
  )
}
