'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  useCreateDocument,
  useDeleteDocument,
  useDocument,
  useDocumentForms,
  useFormCategories,
  useSharedApprovalLines,
  useSubmitDocument,
  useUpdateDocument,
  type FormVisibilityScope,
  type ApprovalStepInput,
} from '@/lib/query/documents'
import { useAuthStore } from '@/stores/auth.store'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { readFormFields } from '@ablework/shared-constants'
import ApprovalLineDialog from './ApprovalLineDialog'
import DynamicFormFields from './DynamicFormFields'
import AttachmentPanel from './AttachmentPanel'
import RichTextEditor from './RichTextEditor'
import Chip from '@mui/material/Chip'
import { isDeptRole, dateText, STEP_ROLE_LABEL } from './approval-constants'

const VISIBILITY_LABEL: Record<FormVisibilityScope, string> = {
  PUBLIC: '공개',
  DEPARTMENT: '부서 공개',
  PRIVATE: '비공개',
}

interface Props {
  /** 편집 대상 문서 id (DRAFT 이어쓰기 / REJECTED·RECALLED 재상신). 신규 작성 시 미지정 */
  editingId?: string | null
  /** 완료 문서 재기안 원본 id — 내용·결재선을 복제해 신규 문서로 작성 */
  redraftFromId?: string | null
  /** 신규 작성 시 미리 선택된 양식 id (양식함 진입) */
  initialFormId?: string | null
  /** 완료/취소 후 돌아갈 목록 경로 */
  listPath: string
}

/**
 * 기안 작성 풀페이지 폼 — 카카오워크 PDF 정합(메타 정보표 + 결재선 섹션 + 기안내용 + 하단 푸터).
 * 신규/이어쓰기/재상신/재기안을 모두 처리하며, 양식 미선택 신규는 양식함 카드 그리드를 먼저 보여준다.
 */
export default function DocumentComposeForm({
  editingId = null,
  redraftFromId = null,
  initialFormId = null,
  listPath,
}: Props) {
  const router = useRouter()
  const currentEmployeeId = useAuthStore((s) => s.user?.employeeId)
  const currentUserName = useAuthStore((s) => s.user?.name)

  const { data: forms = [] } = useDocumentForms()
  const { data: categories = [] } = useFormCategories()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const { data: orgData } = useOrganizations()
  const { data: empData } = useEmployees({ limit: 500, isActive: true })
  // 편집/재기안 원본 로드
  const sourceId = editingId ?? redraftFromId
  const { data: sourceDoc, isLoading: isLoadingDoc } = useDocument(sourceId)

  const createMutation = useCreateDocument()
  const updateMutation = useUpdateDocument()
  const submitMutation = useSubmitDocument()
  const deleteMutation = useDeleteDocument()

  const [formId, setFormId] = useState(initialFormId ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})
  const [steps, setSteps] = useState<ApprovalStepInput[]>([])
  const [sharedLineId, setSharedLineId] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  const [lineDialogOpen, setLineDialogOpen] = useState(false)

  // 결재선 요약 카드용 이름 해석 맵
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>()
    const walk = (nodes: Organization[]) => {
      for (const n of nodes) {
        map.set(n.id, n.name)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(orgData ?? [])
    return map
  }, [orgData])
  const empNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of empData?.items ?? []) map.set(e.id, e.name)
    return map
  }, [empData])
  const stepName = (s: ApprovalStepInput): string =>
    isDeptRole(s.role)
      ? (orgNameById.get(s.organizationId ?? '') ?? '부서')
      : (empNameById.get(s.assigneeId ?? '') ?? '직원')

  const activeForms = useMemo(() => forms.filter((f) => f.isActive), [forms])
  const selectedForm = forms.find((f) => f.id === formId) ?? null
  const dynamicFields = readFormFields(selectedForm?.fieldsSchema)
  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    submitMutation.isPending ||
    deleteMutation.isPending ||
    !!successMessage

  // 신규 작성에서 양식별 기본 결재선 자동 로드
  const applyDefaultLine = (nextFormId: string) => {
    const defaultLineId = forms.find((f) => f.id === nextFormId)?.defaultLineId
    if (defaultLineId && steps.length === 0) {
      const line = sharedLines.find((l) => l.id === defaultLineId)
      if (line) {
        setSharedLineId(defaultLineId)
        setSteps(line.steps.map((s, i) => ({ ...s, stepOrder: i + 1 })))
      }
    }
  }

  // 편집/재기안 원본 로드 시 값 채우기 (1회)
  useEffect(() => {
    if (!sourceDoc || initializedFor === sourceDoc.id) return
    setFormId(sourceDoc.form?.id ?? '')
    setTitle(sourceDoc.title)
    setBody(typeof sourceDoc.content?.body === 'string' ? sourceDoc.content.body : '')
    {
      const content = (sourceDoc.content ?? {}) as Record<string, unknown>
      const { body: _body, ...rest } = content
      void _body
      setFieldValues(rest)
    }
    setSteps(
      (sourceDoc.approvalLines?.flatMap((l) => l.steps) ?? [])
        .filter((s) => (isDeptRole(s.role) ? !!s.organization?.id : !!s.assignee?.id))
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((s, i) =>
          isDeptRole(s.role)
            ? { role: s.role, organizationId: s.organization!.id, stepOrder: i + 1 }
            : { role: s.role, assigneeId: s.assignee!.id, stepOrder: i + 1 },
        ),
    )
    setSharedLineId('')
    setInitializedFor(sourceDoc.id)
  }, [sourceDoc, initializedFor])

  const goToList = () => router.push(listPath)

  const finishWith = (message: string) => {
    setSuccessMessage(message)
    // 스낵바를 잠깐 노출한 뒤 목록으로 이동
    window.setTimeout(goToList, 700)
  }

  const validateBase = (): boolean => {
    if (!formId) {
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

  /** 문서를 생성/갱신해 id를 확보 (재기안·신규는 create, 이어쓰기는 update) */
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
      finishWith('임시저장되었습니다.')
    } catch {
      setErrorMessage('임시저장 중 오류가 발생했습니다.')
    }
  }

  const handleSubmit = async () => {
    setErrorMessage('')
    if (!validateBase()) return
    const incomplete = (s: ApprovalStepInput) =>
      isDeptRole(s.role) ? !s.organizationId : !s.assigneeId
    if (steps.length === 0 || steps.some(incomplete)) {
      setErrorMessage('결재선 단계의 담당자(또는 부서)를 모두 지정해주세요.')
      return
    }
    if (!steps.some((s) => s.role === 'APPROVER')) {
      setErrorMessage('결재(승인) 역할 단계가 최소 1개 필요합니다.')
      return
    }
    // 기안자는 본인을 결재자로 지정할 수 없습니다 (카카오워크 PDF 규칙)
    if (
      currentEmployeeId &&
      steps.some((s) => s.role === 'APPROVER' && s.assigneeId === currentEmployeeId)
    ) {
      setErrorMessage('기안자 본인은 결재자로 지정할 수 없습니다.')
      return
    }
    try {
      const id = await ensureDocumentId()
      await submitMutation.mutateAsync({
        id,
        steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
        sharedLineId: sharedLineId || undefined,
      })
      finishWith(isResubmit ? '재상신되었습니다.' : '문서가 상신되었습니다.')
    } catch {
      setErrorMessage('상신 중 오류가 발생했습니다.')
    }
  }

  const handleDeleteDraft = async () => {
    if (!editingId) return
    try {
      await deleteMutation.mutateAsync(editingId)
      finishWith('임시저장 문서가 삭제되었습니다.')
    } catch {
      setErrorMessage('삭제 중 오류가 발생했습니다.')
    }
  }

  const isResubmit = sourceDoc?.status === 'REJECTED' || sourceDoc?.status === 'RECALLED'
  const isDraftEdit = sourceDoc?.status === 'DRAFT'
  const isRedraft = !!redraftFromId
  const pageTitle = isRedraft
    ? '재기안'
    : isResubmit
      ? '재상신'
      : editingId
        ? '기안 이어쓰기'
        : '기안 작성'

  // 양식 선택 단계 (신규 + 양식 미선택)
  const showFormPicker = !editingId && !redraftFromId && !formId

  // ----- 렌더 -----

  if (sourceId && isLoadingDoc) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (showFormPicker) {
    const filtered = activeForms.filter(
      (f) => !categoryFilter || f.categoryId === categoryFilter,
    )
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={goToList} color="inherit">
              목록
            </Button>
            <Typography variant="h6" fontWeight={700}>기안 양식함</Typography>
            <Typography variant="body2" color="text.secondary">기안 양식 {filtered.length}</Typography>
          </Box>
          <TextField
            select
            size="small"
            label="분류"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">전체 분류</MenuItem>
            {categories
              .filter((c) => c.isActive)
              .map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
          </TextField>
        </Box>

        {filtered.length === 0 ? (
          <Alert severity="info">사용 가능한 기안 양식이 없습니다.</Alert>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 1.5,
            }}
          >
            {filtered.map((f) => (
              <Card key={f.id} variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea
                  sx={{ height: '100%', alignItems: 'stretch' }}
                  onClick={() => {
                    setFormId(f.id)
                    setFieldValues({})
                    applyDefaultLine(f.id)
                  }}
                >
                  <CardContent>
                    <Typography variant="subtitle2" fontWeight={700} noWrap>{f.name}</Typography>
                    {f.category && (
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {f.category}
                      </Typography>
                    )}
                    {f.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {f.description}
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ pb: 10 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={goToList} color="inherit">
          목록
        </Button>
        <Typography variant="h6" fontWeight={700}>{pageTitle}</Typography>
      </Box>

      {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}

      {/* 양식 제목 */}
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1.5 }}>
        {selectedForm?.name ?? sourceDoc?.form?.name ?? '기안'}
      </Typography>

      {/* 메타 정보표 */}
      <MetaTable
        rows={[
          ['기안자', currentUserName ?? '—', '기안일시', dateText(sourceDoc?.submittedAt) === '—' ? '작성 중' : dateText(sourceDoc?.submittedAt)],
          ['문서번호', sourceDoc?.docNumber ?? '상신 시 부여', '양식', selectedForm?.name ?? sourceDoc?.form?.name ?? '—'],
          [
            '보존연한',
            selectedForm?.retentionYears ? `${selectedForm.retentionYears}년` : '—',
            '공개범위',
            selectedForm?.visibilityScope ? VISIBILITY_LABEL[selectedForm.visibilityScope] : '—',
          ],
        ]}
      />

      {/* 결재선 섹션 — [결재선 설정] 팝업(조직 트리)으로 편집 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <SectionTitle>결재선 *</SectionTitle>
        <Button variant="outlined" size="small" onClick={() => setLineDialogOpen(true)} disabled={busy}>
          결재선 설정
        </Button>
      </Box>
      {steps.length === 0 ? (
        <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            결재선이 설정되지 않았습니다. [결재선 설정]에서 결재자·협조·참조·공람을 지정하세요.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {steps.map((s, i) => (
            <Box
              key={`${s.role}-${i}`}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                minWidth: 96,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                px: 1.5,
                py: 1,
              }}
            >
              <Chip
                size="small"
                label={STEP_ROLE_LABEL[s.role]}
                color={s.role === 'APPROVER' ? 'primary' : 'default'}
                variant={s.role === 'APPROVER' ? 'filled' : 'outlined'}
                sx={{ mb: 0.5 }}
              />
              <Typography variant="body2" fontWeight={600} noWrap>{stepName(s)}</Typography>
            </Box>
          ))}
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      {/* 기안내용 섹션 */}
      <SectionTitle>기안내용</SectionTitle>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <TextField
          label="제목"
          required
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <DynamicFormFields
          fields={dynamicFields}
          values={fieldValues}
          onChange={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
          disabled={busy}
        />

        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            본문
          </Typography>
          <RichTextEditor value={body} onChange={setBody} disabled={busy} />
        </Box>

        {/* 첨부 — 저장된 문서에만 (신규는 임시저장 후) */}
        {editingId ? (
          <AttachmentPanel
            documentId={editingId}
            editable
            allowZipUpload={sourceDoc?.form?.allowZipUpload}
            onError={setErrorMessage}
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            첨부파일은 임시저장 후 등록할 수 있습니다.
          </Typography>
        )}
      </Box>

      {/* 하단 sticky 푸터 */}
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
        }}
      >
        {isDraftEdit && (
          <Button color="error" onClick={handleDeleteDraft} disabled={busy}>
            삭제
          </Button>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={goToList} disabled={busy}>취소</Button>
        {!isResubmit && (
          <Button variant="outlined" onClick={handleSaveDraft} disabled={busy}>
            임시저장
          </Button>
        )}
        <Button variant="contained" onClick={handleSubmit} disabled={busy}>
          {busy && !successMessage ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          {isRedraft ? '재기안 상신' : isResubmit ? '재상신' : '상신하기'}
        </Button>
      </Paper>

      {/* C3 결재선 설정 LAYER_POPUP */}
      <ApprovalLineDialog
        open={lineDialogOpen}
        steps={steps}
        sharedLines={sharedLines}
        drafterName={currentUserName}
        onApply={(next, lineId) => {
          setSteps(next)
          setSharedLineId(lineId ?? '')
          setLineDialogOpen(false)
        }}
        onClose={() => setLineDialogOpen(false)}
      />

      <Snackbar
        open={!!successMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled">{successMessage}</Alert>
      </Snackbar>
    </Box>
  )
}

/** 섹션 소제목 */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
      {children}
    </Typography>
  )
}

/** 메타 정보 2×2 라벨/값 표 (카카오워크 기안 작성 상단 표) */
function MetaTable({ rows }: { rows: [string, string, string, string][] }) {
  const cellLabel = {
    bgcolor: 'background.default',
    fontWeight: 700,
    fontSize: 13,
    color: 'text.secondary',
    px: 1.5,
    py: 1,
    width: { xs: '30%', sm: '15%' },
    borderBottom: '1px solid',
    borderColor: 'divider',
    verticalAlign: 'middle' as const,
  }
  const cellValue = {
    fontSize: 14,
    px: 1.5,
    py: 1,
    borderBottom: '1px solid',
    borderColor: 'divider',
    verticalAlign: 'middle' as const,
  }
  return (
    <Box
      component="table"
      sx={{
        width: '100%',
        borderCollapse: 'collapse',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        mb: 3,
        tableLayout: 'fixed',
      }}
    >
      <Box component="tbody">
        {rows.map((r, i) => (
          <Box component="tr" key={i}>
            <Box component="td" sx={cellLabel}>{r[0]}</Box>
            <Box component="td" sx={cellValue}>{r[1]}</Box>
            <Box component="td" sx={cellLabel}>{r[2]}</Box>
            <Box component="td" sx={cellValue}>{r[3]}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
