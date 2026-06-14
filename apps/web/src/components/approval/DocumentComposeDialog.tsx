'use client'
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  useCreateDocument,
  useDeleteDocument,
  useDocument,
  useDocumentForms,
  useSharedApprovalLines,
  useSubmitDocument,
  useUpdateDocument,
  type ApprovalStepInput,
} from '@/lib/query/documents'
import ApprovalLineBuilder from './ApprovalLineBuilder'
import DynamicFormFields from './DynamicFormFields'
import { readFormFields } from '@ablework/shared-constants'

interface Props {
  open: boolean
  /** DRAFT 이어쓰기 또는 REJECTED/RECALLED 재상신 대상 문서 ID (신규 작성 시 null) */
  editingId?: string | null
  onClose: () => void
  /** 저장/상신 성공 시 부모 스낵바 메시지 */
  onSuccess: (message: string) => void
}

/** 기안 작성 다이얼로그 — 양식 선택 + 제목/내용 + 결재선 편집(공용 결재선 불러오기) → 임시저장/상신 */
export default function DocumentComposeDialog({ open, editingId = null, onClose, onSuccess }: Props) {
  const { data: forms = [] } = useDocumentForms()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const { data: editingDoc, isLoading: isLoadingDoc } = useDocument(open ? editingId : null)

  const createMutation = useCreateDocument()
  const updateMutation = useUpdateDocument()
  const submitMutation = useSubmitDocument()
  const deleteMutation = useDeleteDocument()

  const [formId, setFormId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [steps, setSteps] = useState<ApprovalStepInput[]>([])
  const [sharedLineId, setSharedLineId] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [initializedFor, setInitializedFor] = useState<string | null>(null)

  const activeForms = forms.filter((f) => f.isActive)
  // 선택한 양식의 동적 입력 필드 (AP-01-02)
  const dynamicFields = readFormFields(forms.find((f) => f.id === formId)?.fieldsSchema)
  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending ||
    deleteMutation.isPending

  // 신규 작성 시 초기화
  useEffect(() => {
    if (open && !editingId) {
      setFormId('')
      setTitle('')
      setBody('')
      setFieldValues({})
      setSteps([])
      setSharedLineId('')
      setErrorMessage('')
      setInitializedFor(null)
    }
  }, [open, editingId])

  // 기존 문서 로드 시 값 채우기 (1회)
  useEffect(() => {
    if (!open || !editingDoc || initializedFor === editingDoc.id) return
    setFormId(editingDoc.form?.id ?? '')
    setTitle(editingDoc.title)
    setBody(typeof editingDoc.content?.body === 'string' ? editingDoc.content.body : '')
    // content에서 body를 제외한 나머지를 동적 필드 값으로 복원
    {
      const content = (editingDoc.content ?? {}) as Record<string, unknown>
      const { body: _body, ...rest } = content
      void _body
      setFieldValues(rest)
    }
    setSteps(
      (editingDoc.approvalLines?.flatMap((l) => l.steps) ?? [])
        .filter((s) => !!s.assignee?.id)
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((s, i) => ({ role: s.role, assigneeId: s.assignee!.id, stepOrder: i + 1 })),
    )
    setSharedLineId('')
    setErrorMessage('')
    setInitializedFor(editingDoc.id)
  }, [open, editingDoc, initializedFor])

  const loadSharedLine = () => {
    const line = sharedLines.find((l) => l.id === sharedLineId)
    if (!line) return
    setSteps(line.steps.map((s, i) => ({ ...s, stepOrder: i + 1 })))
  }

  const validateBase = (): boolean => {
    if (!editingId && !formId) {
      setErrorMessage('양식을 선택해주세요.')
      return false
    }
    if (!title.trim()) {
      setErrorMessage('제목을 입력해주세요.')
      return false
    }
    const missing = dynamicFields.find(
      (f) => f.required && !String(fieldValues[f.key] ?? '').trim(),
    )
    if (missing) {
      setErrorMessage(`'${missing.label}' 항목을 입력해주세요.`)
      return false
    }
    return true
  }

  const ensureDocumentId = async (): Promise<string> => {
    const content = { body, ...fieldValues }
    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, title: title.trim(), content })
      return editingId
    }
    const created = await createMutation.mutateAsync({
      formId,
      title: title.trim(),
      content,
    })
    return created.id
  }

  const handleSaveDraft = async () => {
    setErrorMessage('')
    if (!validateBase()) return
    try {
      await ensureDocumentId()
      onSuccess('임시저장되었습니다.')
      onClose()
    } catch {
      setErrorMessage('임시저장 중 오류가 발생했습니다.')
    }
  }

  const handleSubmit = async () => {
    setErrorMessage('')
    if (!validateBase()) return
    if (steps.length === 0 || steps.some((s) => !s.assigneeId)) {
      setErrorMessage('결재선 단계의 담당자를 모두 지정해주세요.')
      return
    }
    if (!steps.some((s) => s.role === 'APPROVER')) {
      setErrorMessage('결재(승인) 역할 단계가 최소 1개 필요합니다.')
      return
    }
    try {
      const id = await ensureDocumentId()
      await submitMutation.mutateAsync({
        id,
        steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
        sharedLineId: sharedLineId || undefined,
      })
      onSuccess('문서가 상신되었습니다.')
      onClose()
    } catch {
      setErrorMessage('상신 중 오류가 발생했습니다.')
    }
  }

  const handleDeleteDraft = async () => {
    if (!editingId) return
    try {
      await deleteMutation.mutateAsync(editingId)
      onSuccess('임시저장 문서가 삭제되었습니다.')
      onClose()
    } catch {
      setErrorMessage('삭제 중 오류가 발생했습니다.')
    }
  }

  const isResubmit = editingDoc?.status === 'REJECTED' || editingDoc?.status === 'RECALLED'
  const isDraftEdit = editingDoc?.status === 'DRAFT'

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {isResubmit ? '재상신' : editingId ? '기안 이어쓰기' : '기안 작성'}
      </DialogTitle>
      <DialogContent dividers>
        {editingId && isLoadingDoc ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

            {editingId ? (
              <TextField
                label="양식"
                value={editingDoc?.form?.name ?? ''}
                fullWidth
                disabled
              />
            ) : (
              <TextField
                select
                label="양식"
                required
                fullWidth
                value={formId}
                onChange={(e) => {
                  setFormId(e.target.value)
                  setFieldValues({}) // 양식 변경 시 동적 필드 값 초기화
                }}
              >
                {activeForms.length === 0 && (
                  <MenuItem value="" disabled>사용 가능한 양식이 없습니다</MenuItem>
                )}
                {activeForms.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}{f.category ? ` (${f.category})` : ''}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              label="제목"
              required
              fullWidth
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {/* 양식 동적 입력 필드 (AP-01-02) */}
            <DynamicFormFields
              fields={dynamicFields}
              values={fieldValues}
              onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
              disabled={busy}
            />

            <TextField
              label="내용"
              multiline
              rows={6}
              fullWidth
              placeholder="기안 내용을 입력하세요"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />

            <Divider />

            {/* 결재선 편집 */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700} mb={1}>결재선</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                <TextField
                  select
                  size="small"
                  label="공용 결재선"
                  value={sharedLineId}
                  onChange={(e) => setSharedLineId(e.target.value)}
                  sx={{ flexGrow: 1 }}
                >
                  {sharedLines.length === 0 && (
                    <MenuItem value="" disabled>등록된 공용 결재선이 없습니다</MenuItem>
                  )}
                  {sharedLines.map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                  ))}
                </TextField>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!sharedLineId}
                  onClick={loadSharedLine}
                >
                  불러오기
                </Button>
              </Box>
              <ApprovalLineBuilder steps={steps} onChange={setSteps} disabled={busy} />
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {isDraftEdit && (
          <Button color="error" onClick={handleDeleteDraft} disabled={busy}>
            삭제
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} disabled={busy}>취소</Button>
        {!isResubmit && (
          <Button variant="outlined" onClick={handleSaveDraft} disabled={busy}>
            임시저장
          </Button>
        )}
        <Button variant="contained" onClick={handleSubmit} disabled={busy}>
          {busy ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          {isResubmit ? '재상신' : '상신'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
