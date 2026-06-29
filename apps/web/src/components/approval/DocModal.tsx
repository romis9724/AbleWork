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
import { useEffect, useState } from 'react'
import { useToast } from '@/components/ab/Toast'
import { I } from '@/components/ab/icons'
import { Badge, type BadgeKind } from '@/components/ab/atoms'
import { useAuthStore } from '@/stores/auth.store'
import { readFormFields, readFormHelpText, readFormDefaultContent } from '@ablework/shared-constants'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useAddDocumentOpinion,
  useCreateDocument,
  useDocument,
  useDocumentCategories,
  useDocumentForms,
  useDocumentStepAction,
  useRecallDocument,
  useSharedApprovalLines,
  useSubmitDocument,
  useUpdateDocument,
  type ApprovalStepDetail,
  type ApprovalStepInput,
  type DocumentStatus,
  type StepAction,
  type StepStatus,
} from '@/lib/query/documents'
import { useEmployees } from '@/lib/query/employees'
import DraftApprovalCards from './DraftApprovalCards'
import DocApprovalView from './DocApprovalView'
import DynamicFormFields from './DynamicFormFields'
import RichTextEditor from './RichTextEditor'
import RichTextView from './RichTextView'
import AttachmentPanel from './AttachmentPanel'
import {
  DOC_STATUS_LABEL,
  HISTORY_ACTION_LABEL,
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
  OPINION: 'b-prog',
}

const ACTED_STATUSES: StepStatus[] = ['APPROVED', 'PRE_APPROVED', 'PROXY_APPROVED', 'REJECTED', 'RETURNED']
const FLOW_ROLES = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']

/** 양식 정보 테이블 라벨 헬퍼 */
const retainText = (y?: number | null) => (y == null ? '—' : y === 0 ? '영구 보존' : `${y}년 보존`)
const VISIBILITY_TEXT: Record<string, string> = {
  PUBLIC: '전체공개',
  DEPARTMENT: '부서공개',
  PRIVATE: '비공개',
}

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
  const { data: docCategories = [] } = useDocumentCategories()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const { data: empData } = useEmployees({ isActive: true, limit: 200 })
  const employees = empData?.items ?? []

  const createMutation = useCreateDocument()
  const updateMutation = useUpdateDocument()
  const submitMutation = useSubmitDocument()
  const stepAction = useDocumentStepAction()
  const recallMutation = useRecallDocument()
  const addOpinionMutation = useAddDocumentOpinion()

  // ----- 편집/작성 폼 상태 -----
  const [formId, setFormId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [steps, setSteps] = useState<ApprovalStepInput[]>([])
  const [comment, setComment] = useState('')
  // 결재 종료/진행 후 사후 의견
  const [opinionText, setOpinionText] = useState('')
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  // 작성 중 임시저장으로 생성된 문서 id — 설정되면 모달을 닫지 않고 첨부파일 등록을 활성화한다
  const [localDocId, setLocalDocId] = useState<string | null>(null)

  // 편집 모드 진입 시 원본으로 폼 채우기 (1회)
  useEffect(() => {
    if (!editable || !doc || initializedFor === `${doc.id}:${mode}`) return
    setFormId(doc.form?.id ?? '')
    setCategoryId(doc.category?.id ?? '')
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
  // 임시저장(DRAFT) 문서 편집 = 작성(create)과 동일한 화면으로 취급한다(양식정보·결재선 카드·[임시저장][상신]).
  const isDraftDoc = !isCreate && doc?.status === 'DRAFT'
  const compose = isCreate || isDraftDoc
  // 현재 작업 중 문서 id — 작성 모드(신규/복사)는 localDocId, 그 외(edit/view)는 prop
  const workingDocId = isCreate ? localDocId : documentId ?? localDocId
  const selectedForm = forms.find((f) => f.id === (compose ? formId : doc?.form?.id)) ?? null
  const dynamicFields = readFormFields(selectedForm?.fieldsSchema)
  // 양식 도움말 (기안 작성 안내) — 작성/편집 화면 상단에 표시
  const formHelpText = readFormHelpText(selectedForm?.fieldsSchema)

  // 기안자 본인 정보 (이름·대표 소속 부서) — 양식 정보 테이블·결재선 카드의 기안 칸에 표시
  const myEmployee = employees.find((e) => e.id === myEmployeeId)
  const drafterName = myEmployee?.name ?? '기안자'
  const drafterOrgName =
    (myEmployee?.organizations?.find((o) => o.isPrimary) ?? myEmployee?.organizations?.[0])?.organization.name

  // 조회(view): 기안자는 본인이 아닐 수 있으므로 문서의 기안자(doc.drafter)로 이름·부서를 해석
  const viewDrafter = doc?.drafter ? employees.find((e) => e.id === doc.drafter?.id) : undefined
  const viewDrafterName = doc?.drafter?.name ?? '—'
  const viewDrafterOrgName =
    (viewDrafter?.organizations?.find((o) => o.isPrimary) ?? viewDrafter?.organizations?.[0])?.organization.name
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
  // 회수/반려된 기안은 수정·재상신할 수 없다(읽기전용). 다시 올리려면 '복사하여 새 기안'으로 재작성.
  const canCopyToNew = isDrafter && (doc?.status === 'RECALLED' || doc?.status === 'REJECTED')
  // 결재 종료/진행 후 사후 의견 — 상신된 문서의 기안자/결재 관계자(assignee·proxy)
  const isAnyParticipant = detailSteps.some(
    (s) => s.assignee?.id === myEmployeeId || s.proxy?.id === myEmployeeId,
  )
  const isSubmittedDoc = !isCreate && !!doc && doc.status !== 'DRAFT'
  // 결재 차례가 아닐 때만 사후 의견 입력 노출(첨부는 임시저장에서만 — 상신 후 잠금)
  const canAddOpinion =
    isSubmittedDoc && (isDrafter || isAnyParticipant) && !canApprove && !canConfirmView && !canReceive

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending ||
    stepAction.isPending ||
    recallMutation.isPending ||
    addOpinionMutation.isPending

  // 결재 의견 타임라인 (comment 있는 이력)
  const comments = (doc?.history ?? []).filter((h) => h.comment)

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

  /** 결재 종료/진행 후 사후 의견 등록 */
  const handleAddOpinion = async () => {
    if (!doc || !opinionText.trim()) return
    try {
      await addOpinionMutation.mutateAsync({ documentId: doc.id, comment: opinionText.trim() })
      toast('의견을 등록했습니다')
      setOpinionText('')
    } catch {
      toast('의견 등록 중 오류가 발생했습니다')
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

  /**
   * 회수/반려 문서를 복사하여 새 기안으로 — 제목·본문·양식·동적항목·결재선을 새 DRAFT로 복제하고,
   * 모달을 작성 모드로 전환해 이어서 수정·상신할 수 있게 한다 (원본은 그대로 보존).
   */
  const handleCopyToNew = async () => {
    if (!doc) return
    const content = (doc.content ?? {}) as Record<string, unknown>
    const { body: bodyVal, ...fieldRest } = content
    const copiedSteps: ApprovalStepInput[] = (doc.approvalLines?.flatMap((l) => l.steps) ?? [])
      .slice()
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .filter((s) => (isDeptRole(s.role) ? !!s.organization?.id : !!s.assignee?.id))
      .map((s, i) =>
        isDeptRole(s.role)
          ? { role: s.role, organizationId: s.organization!.id, stepOrder: i + 1 }
          : { role: s.role, assigneeId: s.assignee!.id, stepOrder: i + 1 },
      )
    try {
      const created = await createMutation.mutateAsync({
        formId: doc.form?.id ?? '',
        categoryId: doc.category?.id ?? null,
        title: doc.title,
        content,
        steps: copiedSteps,
      })
      // 새 DRAFT를 작성 모드로 전환 (폼 prefill, 모달 유지)
      setLocalDocId(created.id)
      setFormId(doc.form?.id ?? '')
      setCategoryId(doc.category?.id ?? '')
      setTitle(doc.title)
      setBody(typeof bodyVal === 'string' ? bodyVal : '')
      setFieldValues(fieldRest)
      setSteps(copiedSteps)
      setInitializedFor('copied') // create 모드라 doc 복원 useEffect는 동작하지 않음
      setMode('create')
      toast('복사하여 새 기안을 임시저장했습니다. 이어서 수정·상신할 수 있습니다.')
    } catch (e) {
      toast(getApiErrorMessage(e, '복사 중 오류가 발생했습니다'))
    }
  }

  /**
   * 작성 시 양식 선택 — 양식의 기본 결재선(defaultLineId)을 자동 적용하고,
   * 본문이 비어 있으면 양식의 기본 본문으로 채운다 (입력 보존).
   */
  const handleSelectForm = (id: string) => {
    setFormId(id)
    const form = forms.find((x) => x.id === id)
    // 공용 결재선 자동 설정 — 양식에 기본 결재선이 지정돼 있으면 결재선을 채운다
    if (form?.defaultLineId) {
      const line = sharedLines.find((l) => l.id === form.defaultLineId)
      if (line) setSteps(line.steps.map((s, i) => ({ ...s, stepOrder: i + 1 })))
    }
    const dc = readFormDefaultContent(form?.fieldsSchema)
    if (dc) setBody((prev) => (prev.trim() ? prev : dc))
  }

  /** 미입력 필수 동적 항목의 라벨 목록 (상신 전 검증용) */
  const findMissingRequired = (): string[] =>
    dynamicFields
      .filter((f) => f.required && !String(fieldValues[f.key] ?? '').trim())
      .map((f) => f.label)

  /**
   * 작성: 문서 저장(id 확보). 최초엔 생성(localDocId 세팅), 이미 임시저장됐으면 내용만 갱신.
   * 임시저장 후 모달을 닫지 않고 첨부파일을 등록할 수 있게 localDocId를 유지한다.
   */
  const createDraft = async (): Promise<string | null> => {
    // 결재선·수신/참조/공람을 함께 저장해 다시 열 때 복원되게 한다 (DRAFT 보존)
    const orderedSteps = steps.map((s, i) => ({ ...s, stepOrder: i + 1 }))
    try {
      if (workingDocId) {
        // 기존(임시저장본/DRAFT) 갱신 — 양식 변경 포함
        await updateMutation.mutateAsync({
          id: workingDocId,
          formId,
          categoryId: categoryId || null,
          title: title.trim(),
          content: { body, ...fieldValues },
          steps: orderedSteps,
        })
        return workingDocId
      }
      const created = await createMutation.mutateAsync({
        formId,
        categoryId: categoryId || null,
        title: title.trim(),
        content: { body, ...fieldValues },
        steps: orderedSteps,
      })
      setLocalDocId(created.id)
      return created.id
    } catch (e) {
      toast(getApiErrorMessage(e, '저장 중 오류가 발생했습니다'))
      return null
    }
  }

  const handleSaveDraft = async () => {
    if (!formId || !title.trim()) {
      toast('양식과 제목을 입력해 주세요')
      return
    }
    const id = await createDraft()
    // 모달을 닫지 않고 그대로 유지 — 이어서 첨부파일을 등록할 수 있다
    if (id) toast('임시저장했습니다. 이제 첨부파일을 등록할 수 있습니다.')
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
    const missing = findMissingRequired()
    if (missing.length) {
      toast(`필수 항목을 입력해 주세요: ${missing.join(', ')}`)
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
    } catch (e) {
      toast(getApiErrorMessage(e, '상신 중 오류가 발생했습니다'))
    }
  }

  // ----- 헤더 텍스트 -----
  const eyebrow = isCreate ? 'New Draft' : mode === 'edit' ? 'Edit Document' : 'Approval Document'
  const heading = isCreate ? '기안 등록' : (editable ? title : doc?.title) || '제목 없음'

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
          {canCopyToNew && (
            <button className="btn btn-ghost" disabled={busy} onClick={handleCopyToNew}>
              {I.edit({ style: { marginRight: 7 } })}복사하여 새 기안
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
    // 작성/임시저장 편집(compose): 임시저장 / 상신
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
              {/* 양식 정보 (작성: 양식 선택 + 정보 테이블 / 조회: 메타) */}
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">양식 정보</span><span className="en">Form Info</span></div>
                {compose ? (
                  <>
                    <div className="doc-field">
                      <span className="fk">기안양식<span className="req">*</span></span>
                      <span className="fv">
                        <select className="sel" value={formId} onChange={(e) => handleSelectForm(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                          <option value="">양식을 선택하세요</option>
                          {forms.filter((f) => f.isActive).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </span>
                    </div>
                    {selectedForm ? (
                      <>
                        <div className="doc-meta">
                          <div className="cell"><div className="k">문서번호</div><div className="v num">{selectedForm.abbreviation ? `${selectedForm.abbreviation}-YY-0000` : '상신 시 자동 부여'}</div></div>
                          <div className="cell"><div className="k">보존연한</div><div className="v">{retainText(selectedForm.retentionYears)}</div></div>
                          <div className="cell"><div className="k">공개여부</div><div className="v">{VISIBILITY_TEXT[selectedForm.visibilityScope ?? 'PUBLIC'] ?? '—'}</div></div>
                          <div className="cell"><div className="k">기안자</div><div className="v">{drafterName}</div></div>
                          <div className="cell"><div className="k">기안부서</div><div className="v">{drafterOrgName ?? '—'}</div></div>
                        </div>
                        {docCategories.length > 0 && (
                          <div className="doc-field">
                            <span className="fk">문서성격</span>
                            <span className="fv">
                              <select className="sel" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={{ borderBottom: '1px solid var(--warm-500)' }}>
                                <option value="">선택 안 함</option>
                                {docCategories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.abbreviation})</option>)}
                              </select>
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="muted" style={{ fontSize: 13, paddingTop: 4 }}>기안양식을 먼저 선택하면 결재선과 작성 항목이 표시됩니다.</div>
                    )}
                  </>
                ) : (
                  <div className="doc-meta">
                    <div className="cell"><div className="k">Doc No.</div><div className="v num">{doc?.docNumber ?? '미부여'}</div></div>
                    {doc?.category && <div className="cell"><div className="k">문서성격</div><div className="v">{doc.category.name}</div></div>}
                    <div className="cell"><div className="k">기안양식</div><div className="v">{doc?.form?.name ?? '—'}</div></div>
                    <div className="cell"><div className="k">기안자</div><div className="v">{doc?.drafter?.name ?? '—'}</div></div>
                    <div className="cell"><div className="k">상신일시</div><div className="v">{dateTimeText(doc?.submittedAt)}</div></div>
                  </div>
                )}
              </div>

              {/* 결재선 — 작성/임시저장: 카드 UI(양식 선택 후) / 조회: 도장 */}
              {(!compose || formId) && (
                <div className="doc-section">
                  <div className="doc-sec-head"><span className="dot" /><span className="t">결재선</span><span className="en">Approval Line</span></div>
                  {compose ? (
                    <DraftApprovalCards
                      steps={steps}
                      onChange={setSteps}
                      employees={employees}
                      drafterName={drafterName}
                      drafterOrgName={drafterOrgName}
                      disabled={busy}
                    />
                  ) : (
                    <DocApprovalView
                      steps={detailSteps}
                      drafterName={viewDrafterName}
                      drafterOrgName={viewDrafterOrgName}
                      drafterDate={doc?.submittedAt}
                    />
                  )}
                </div>
              )}

              {/* 기안 내용 — 작성/임시저장 시 양식 선택 후에만 노출 */}
              {(!compose || formId) && (
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">기안 내용</span><span className="en">Content</span></div>
                {editable && formHelpText.trim() && (
                  <div
                    style={{
                      margin: '0 0 14px',
                      padding: '12px 14px',
                      borderRadius: 6,
                      background: 'color-mix(in srgb, var(--ab-orange) 10%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--ab-orange) 30%, transparent)',
                      color: 'var(--fg-2)',
                      fontSize: 13,
                      lineHeight: 1.7,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {formHelpText}
                  </div>
                )}
                <div className="doc-field">
                  <span className="fk">제목<span className="req">{editable ? '*' : ''}</span></span>
                  <span className="fv">
                    {editable
                      ? <input className="inp-block" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="기안 제목을 입력하세요" />
                      : (doc?.title ?? '—')}
                  </span>
                </div>


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
              )}

              {/* 첨부파일 — 작성/임시저장: 양식 선택 후(임시저장하면 등록 가능) / 조회·편집 시 항상 */}
              {(!compose || formId) && (
              <div className="doc-section">
                <div className="doc-sec-head"><span className="dot" /><span className="t">첨부파일</span><span className="en">Attachments</span></div>
                {compose ? (
                  workingDocId ? (
                    <AttachmentPanel
                      documentId={workingDocId}
                      editable
                      allowZipUpload={selectedForm?.allowZipUpload}
                      onError={(m) => toast(m)}
                    />
                  ) : (
                    <div className="muted" style={{ fontSize: 13 }}>제목을 입력하고 임시저장하면 첨부파일을 등록할 수 있습니다.</div>
                  )
                ) : doc ? (
                  // 상신 이후(진행 중·완료·회수·반려)에는 첨부 읽기전용 — 추가/수정 불가
                  <AttachmentPanel
                    documentId={doc.id}
                    editable={false}
                    allowZipUpload={doc.form?.allowZipUpload}
                    onError={(m) => toast(m)}
                  />
                ) : null}
              </div>
              )}

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

                  {/* 사후 의견 등록 — 결재 차례가 아닌 관계자/기안자 (계약 완료 후 코멘트 등) */}
                  {canAddOpinion && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                      <input
                        className="inp-block"
                        placeholder="의견을 남기세요 (첨부는 위 첨부파일 영역에서)"
                        value={opinionText}
                        onChange={(e) => setOpinionText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddOpinion()
                        }}
                      />
                      <button
                        className="btn btn-line btn-sm"
                        disabled={busy || !opinionText.trim()}
                        onClick={handleAddOpinion}
                      >
                        의견 등록
                      </button>
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
