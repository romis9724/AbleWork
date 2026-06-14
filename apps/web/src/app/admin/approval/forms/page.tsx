'use client'
import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import Divider from '@mui/material/Divider'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import TagIcon from '@mui/icons-material/Tag'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { useSnackbar } from '@/hooks/useSnackbar'
import { getApiErrorMessage } from '@/lib/api-error'
import { useConfirm } from '@/hooks/useConfirm'
import {
  useDocumentForms,
  useCreateDocumentForm,
  useUpdateDocumentForm,
  useDeleteDocumentForm,
  useDocumentNumberRule,
  useSaveDocumentNumberRule,
  useSharedApprovalLines,
  type DocumentForm,
} from '@/lib/query/documents'
import FormFieldsBuilder from '@/components/approval/FormFieldsBuilder'
import { readFormFields, type DocumentFieldDef } from '@ablework/shared-constants'

const schema = z.object({
  name: z.string().min(1, '양식명을 입력해주세요'),
  category: z.string().optional(),
  defaultLineId: z.string().optional(),
  sortOrder: z.number().int().min(0),
  allowReDraft: z.boolean(),
  allowPreApproval: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = {
  name: '',
  category: '',
  defaultLineId: '',
  sortOrder: 0,
  allowReDraft: true,
  allowPreApproval: false,
}

const DEFAULT_PATTERN = 'HR-{YYYY}-{SEQ:4}'

/** 문서번호 패턴 미리보기 — {YYYY},{MM},{SEQ:n} 토큰 치환 */
function previewNumber(pattern: string): string {
  const now = new Date()
  return pattern
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ:(\d+)\}/g, (_m, digits: string) => '1'.padStart(Number(digits), '0'))
}

interface NumberRuleDialogProps {
  form: DocumentForm
  onClose: () => void
  onSuccess: (message: string) => void
}

function NumberRuleDialog({ form, onClose, onSuccess }: NumberRuleDialogProps) {
  const { data: rule, isLoading } = useDocumentNumberRule(form.id)
  const saveMutation = useSaveDocumentNumberRule()
  const [pattern, setPattern] = useState(DEFAULT_PATTERN)
  const [resetYearly, setResetYearly] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (isLoading || initialized) return
    if (rule) {
      setPattern(rule.pattern || DEFAULT_PATTERN)
      setResetYearly(rule.resetYearly)
    }
    setInitialized(true)
  }, [rule, isLoading, initialized])

  const handleSave = async () => {
    setErrorMessage('')
    if (!pattern.includes('{SEQ:')) {
      setErrorMessage('패턴에 {SEQ:n} 토큰이 필요합니다. 예: HR-{YYYY}-{SEQ:4}')
      return
    }
    try {
      await saveMutation.mutateAsync({ formId: form.id, pattern, resetYearly })
      onSuccess('문서번호 규칙이 저장되었습니다.')
      onClose()
    } catch {
      setErrorMessage('저장 중 오류가 발생했습니다.')
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>문서번호 규칙 — {form.name}</DialogTitle>
      <DialogContent dividers>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
            <TextField
              label="패턴"
              fullWidth
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              helperText="사용 가능 토큰: {YYYY} 연도, {MM} 월, {SEQ:4} 일련번호(자릿수)"
            />
            <FormControlLabel
              control={
                <Switch checked={resetYearly} onChange={(e) => setResetYearly(e.target.checked)} />
              }
              label="매년 일련번호 초기화"
            />
            <Box sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">미리보기</Typography>
              <Typography variant="body1" fontWeight={700}>{previewNumber(pattern)}</Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saveMutation.isPending}>취소</Button>
        <Button variant="contained" onClick={handleSave} disabled={saveMutation.isPending || isLoading}>
          {saveMutation.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          저장
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function ApprovalFormsPage() {
  const { data: forms = [], isLoading } = useDocumentForms()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const createMutation = useCreateDocumentForm()
  const updateMutation = useUpdateDocumentForm()
  const deleteMutation = useDeleteDocumentForm()

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()

  const [dialog, setDialog] = useState<{ open: boolean; editing: DocumentForm | null }>({
    open: false,
    editing: null,
  })
  const [ruleTarget, setRuleTarget] = useState<DocumentForm | null>(null)

  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })
  // 동적 입력 필드(fieldsSchema)는 RHF 밖에서 별도 관리 (중첩 동적 배열)
  const [fields, setFields] = useState<DocumentFieldDef[]>([])

  const sortedForms = [...forms].sort((a, b) => a.sortOrder - b.sortOrder)

  const openCreate = () => {
    reset(DEFAULT_VALUES)
    setFields([])
    setDialog({ open: true, editing: null })
  }

  const openEdit = (form: DocumentForm) => {
    reset({
      name: form.name,
      category: form.category ?? '',
      defaultLineId: form.defaultLineId ?? '',
      sortOrder: form.sortOrder,
      allowReDraft: form.allowReDraft,
      allowPreApproval: form.allowPreApproval,
    })
    setFields(readFormFields(form.fieldsSchema))
    setDialog({ open: true, editing: form })
  }

  const closeDialog = () => setDialog({ open: false, editing: null })

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      sortOrder: values.sortOrder,
      allowReDraft: values.allowReDraft,
      allowPreApproval: values.allowPreApproval,
      ...(values.category ? { category: values.category } : {}),
      // AP-01-03 양식별 기본 결재선 (빈 값=해제 → null)
      defaultLineId: values.defaultLineId || null,
      // 동적 입력 필드 설계 저장 (AP-01-02)
      fieldsSchema: { fields },
    }
    try {
      if (dialog.editing) {
        await updateMutation.mutateAsync({ id: dialog.editing.id, ...payload })
        showSnackbar('양식이 수정되었습니다.')
      } else {
        await createMutation.mutateAsync(payload)
        showSnackbar('양식이 추가되었습니다.')
      }
      closeDialog()
    } catch {
      showSnackbar('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleToggleActive = async (form: DocumentForm) => {
    try {
      await updateMutation.mutateAsync({ id: form.id, isActive: !form.isActive })
      showSnackbar(form.isActive ? '양식이 비활성화되었습니다.' : '양식이 활성화되었습니다.')
    } catch {
      showSnackbar('상태 변경 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleDelete = async (form: DocumentForm) => {
    const ok = await confirm({
      title: '양식 삭제',
      message: `"${form.name}" 양식을 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      confirmColor: 'error',
    })
    if (!ok) return
    try {
      await deleteMutation.mutateAsync(form.id)
      showSnackbar('삭제되었습니다.')
    } catch (e) {
      showSnackbar(getApiErrorMessage(e, '삭제 중 오류가 발생했습니다.'), 'error')
    }
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <PageHeader
        title="기안양식 관리"
        subtitle="전자결재 기안양식과 문서번호 규칙을 관리합니다."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            양식 추가
          </Button>
        }
      />

      {sortedForms.length === 0 ? (
        <EmptyState
          message="등록된 기안양식이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              첫 양식 추가
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>양식명</TableCell>
                <TableCell>카테고리</TableCell>
                <TableCell>옵션</TableCell>
                <TableCell>정렬</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedForms.map((form) => (
                <TableRow key={form.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{form.name}</TableCell>
                  <TableCell>
                    {form.category ? (
                      <Chip label={form.category} size="small" variant="outlined" />
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {form.allowReDraft && <Chip label="재기안" size="small" color="info" variant="outlined" />}
                      {form.allowPreApproval && <Chip label="전결" size="small" color="warning" variant="outlined" />}
                      {!form.allowReDraft && !form.allowPreApproval && (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{form.sortOrder}</TableCell>
                  <TableCell>
                    <Switch
                      size="small"
                      checked={form.isActive}
                      onChange={() => handleToggleActive(form)}
                      inputProps={{ 'aria-label': '활성 상태' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="문서번호 규칙">
                      <IconButton size="small" onClick={() => setRuleTarget(form)}>
                        <TagIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <IconButton size="small" onClick={() => openEdit(form)} aria-label="수정">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(form)} aria-label="삭제">
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog.editing ? '양식 수정' : '양식 추가'}</DialogTitle>
        <DialogContent dividers>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="양식명"
                  required
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <TextField {...field} label="카테고리" fullWidth placeholder="예: 인사, 총무" />
              )}
            />
            <Controller
              name="defaultLineId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="기본 결재선"
                  fullWidth
                  helperText="작성 시 결재선을 비워두면 이 공용 결재선이 기본 적용됩니다 (선택)"
                >
                  <MenuItem value="">지정 안 함</MenuItem>
                  {sharedLines.map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="sortOrder"
              control={control}
              render={({ field }) => (
                <TextField
                  label="정렬 순서"
                  type="number"
                  fullWidth
                  inputProps={{ min: 0 }}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                  error={!!errors.sortOrder}
                  helperText={errors.sortOrder?.message}
                />
              )}
            />
            <Controller
              name="allowReDraft"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="재기안 허용 (반려/회수 후 재상신)"
                />
              )}
            />
            <Controller
              name="allowPreApproval"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="전결 허용"
                />
              )}
            />

            <Divider sx={{ my: 0.5 }} />
            <FormFieldsBuilder fields={fields} onChange={setFields} disabled={isSubmitting} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={isSubmitting}>취소</Button>
          <Button variant="contained" onClick={handleSubmit(onSubmit)} disabled={isSubmitting}>
            {isSubmitting ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {dialog.editing ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 문서번호 규칙 다이얼로그 */}
      {ruleTarget && (
        <NumberRuleDialog
          form={ruleTarget}
          onClose={() => setRuleTarget(null)}
          onSuccess={(msg) => showSnackbar(msg)}
        />
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        confirmColor={confirmState.confirmColor}
        loading={deleteMutation.isPending}
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
