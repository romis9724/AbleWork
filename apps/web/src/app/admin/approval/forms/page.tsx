'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
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
  useUpdateDocumentForm,
  useDeleteDocumentForm,
  useDocumentNumberRule,
  useSaveDocumentNumberRule,
  useFormCategories,
  type DocumentForm,
} from '@/lib/query/documents'
import FormCategoryManagerDialog from '@/components/approval/FormCategoryManagerDialog'

const DEFAULT_PATTERN = 'HR-{YYYY}-{SEQ:4}'

/** 문서번호 패턴 미리보기 — {YYYY},{MM},{ABBR},{SEQ:n} 토큰 치환 */
function previewNumber(pattern: string, abbr = ''): string {
  const now = new Date()
  return pattern
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/\{ABBR\}/g, abbr)
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
              helperText="사용 가능 토큰: {YYYY} 연도, {MM} 월, {ABBR} 양식 약어, {SEQ:4} 일련번호(자릿수)"
            />
            <FormControlLabel
              control={
                <Switch checked={resetYearly} onChange={(e) => setResetYearly(e.target.checked)} />
              }
              label="매년 일련번호 초기화"
            />
            <Box sx={{ p: 1.5, bgcolor: 'background.default', borderRadius: 1 }}>
              <Typography variant="caption" color="text.secondary">미리보기</Typography>
              <Typography variant="body1" fontWeight={700}>{previewNumber(pattern, form.abbreviation ?? '')}</Typography>
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

/** 기안양식 관리 — 목록 + 문서번호 규칙 + 분류 관리. 등록·수정은 위저드 PAGE로 라우팅 */
export default function ApprovalFormsPage() {
  const router = useRouter()
  const { data: forms = [], isLoading } = useDocumentForms()
  const { data: categories = [] } = useFormCategories()
  const updateMutation = useUpdateDocumentForm()
  const deleteMutation = useDeleteDocumentForm()

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()

  const [catManagerOpen, setCatManagerOpen] = useState(false)
  const [ruleTarget, setRuleTarget] = useState<DocumentForm | null>(null)

  const sortedForms = [...forms].sort((a, b) => a.sortOrder - b.sortOrder)

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
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" onClick={() => setCatManagerOpen(true)}>
              분류 관리
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => router.push('/admin/approval/forms/new')}
            >
              양식 추가
            </Button>
          </Box>
        }
      />

      {sortedForms.length === 0 ? (
        <EmptyState
          message="등록된 기안양식이 없습니다."
          action={
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => router.push('/admin/approval/forms/new')}
            >
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
                    {(() => {
                      const catName =
                        categories.find((c) => c.id === form.categoryId)?.name ?? form.category
                      return catName ? (
                        <Chip label={catName} size="small" variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.disabled">—</Typography>
                      )
                    })()}
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
                    <IconButton
                      size="small"
                      onClick={() => router.push(`/admin/approval/forms/${form.id}/edit`)}
                      aria-label="수정"
                    >
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

      {/* 문서번호 규칙 다이얼로그 */}
      {ruleTarget && (
        <NumberRuleDialog
          form={ruleTarget}
          onClose={() => setRuleTarget(null)}
          onSuccess={(msg) => showSnackbar(msg)}
        />
      )}

      {/* 양식함(분류) 관리 다이얼로그 */}
      <FormCategoryManagerDialog
        open={catManagerOpen}
        onClose={() => setCatManagerOpen(false)}
        onResult={(msg, severity) => showSnackbar(msg, severity)}
      />

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
