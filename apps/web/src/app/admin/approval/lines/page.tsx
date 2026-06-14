'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import ApprovalLineBuilder from '@/components/approval/ApprovalLineBuilder'
import { STEP_ROLE_LABEL, isDeptRole } from '@/components/approval/approval-constants'
import { useSnackbar } from '@/hooks/useSnackbar'
import { getApiErrorMessage } from '@/lib/api-error'
import { useConfirm } from '@/hooks/useConfirm'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import {
  useSharedApprovalLines,
  useCreateSharedApprovalLine,
  useUpdateSharedApprovalLine,
  useDeleteSharedApprovalLine,
  type ApprovalStepInput,
  type SharedApprovalLine,
} from '@/lib/query/documents'

interface DialogState {
  open: boolean
  editing: SharedApprovalLine | null
}

export default function SharedApprovalLinesPage() {
  const { data: lines = [], isLoading } = useSharedApprovalLines()
  const { data: employeeData } = useEmployees({ limit: 200, isActive: true })
  const { data: orgTree = [] } = useOrganizations()
  const createMutation = useCreateSharedApprovalLine()
  const updateMutation = useUpdateSharedApprovalLine()
  const deleteMutation = useDeleteSharedApprovalLine()

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()

  const [dialog, setDialog] = useState<DialogState>({ open: false, editing: null })
  const [name, setName] = useState('')
  const [steps, setSteps] = useState<ApprovalStepInput[]>([])
  const [errorMessage, setErrorMessage] = useState('')

  const employeeName = (id?: string) =>
    employeeData?.items.find((e) => e.id === id)?.name ?? '미지정'

  // 조직 트리 평탄화 후 id→이름 조회
  const flatOrgs = (() => {
    const acc: Organization[] = []
    const walk = (nodes: Organization[]) => {
      for (const n of nodes) {
        acc.push(n)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(orgTree)
    return acc
  })()
  const orgName = (id?: string) => flatOrgs.find((o) => o.id === id)?.name ?? '미지정'

  /** 단계 표시 라벨 — 부서 단계는 부서명, 개인 단계는 직원명 */
  const stepTargetName = (s: ApprovalStepInput) =>
    isDeptRole(s.role) ? orgName(s.organizationId) : employeeName(s.assigneeId)

  const openCreate = () => {
    setName('')
    setSteps([])
    setErrorMessage('')
    setDialog({ open: true, editing: null })
  }

  const openEdit = (line: SharedApprovalLine) => {
    setName(line.name)
    setSteps(
      [...line.steps]
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((s, i) => ({ ...s, stepOrder: i + 1 })),
    )
    setErrorMessage('')
    setDialog({ open: true, editing: line })
  }

  const closeDialog = () => setDialog({ open: false, editing: null })

  const handleSave = async () => {
    setErrorMessage('')
    if (!name.trim()) {
      setErrorMessage('결재선 이름을 입력해주세요.')
      return
    }
    const incomplete = (s: ApprovalStepInput) =>
      isDeptRole(s.role) ? !s.organizationId : !s.assigneeId
    if (steps.length === 0 || steps.some(incomplete)) {
      setErrorMessage('모든 단계의 담당자(또는 부서)를 지정해주세요.')
      return
    }
    const payload = {
      name: name.trim(),
      steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
    }
    try {
      if (dialog.editing) {
        await updateMutation.mutateAsync({ id: dialog.editing.id, ...payload })
        showSnackbar('공용 결재선이 수정되었습니다.')
      } else {
        await createMutation.mutateAsync(payload)
        showSnackbar('공용 결재선이 추가되었습니다.')
      }
      closeDialog()
    } catch {
      setErrorMessage('저장 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (line: SharedApprovalLine) => {
    const ok = await confirm({
      title: '공용 결재선 삭제',
      message: `"${line.name}" 결재선을 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      confirmColor: 'error',
    })
    if (!ok) return
    try {
      await deleteMutation.mutateAsync(line.id)
      showSnackbar('삭제되었습니다.')
    } catch (e) {
      showSnackbar(getApiErrorMessage(e, '삭제 중 오류가 발생했습니다.'), 'error')
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending

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
        title="공용 결재선"
        subtitle="기안 작성 시 불러올 수 있는 공용 결재선을 관리합니다."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            결재선 추가
          </Button>
        }
      />

      {lines.length === 0 ? (
        <EmptyState
          message="등록된 공용 결재선이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              첫 결재선 추가
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>이름</TableCell>
                <TableCell>결재 단계</TableCell>
                <TableCell align="right">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.id} hover>
                  <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{line.name}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                      {[...line.steps]
                        .sort((a, b) => a.stepOrder - b.stepOrder)
                        .map((s, i) => (
                          <Box key={`${line.id}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {i > 0 && (
                              <Typography variant="caption" color="text.disabled">→</Typography>
                            )}
                            <Chip
                              size="small"
                              variant="outlined"
                              label={`${STEP_ROLE_LABEL[s.role] ?? s.role} · ${stepTargetName(s)}`}
                            />
                          </Box>
                        ))}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" onClick={() => openEdit(line)} aria-label="수정">
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(line)} aria-label="삭제">
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
      <Dialog open={dialog.open} onClose={saving ? undefined : closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.editing ? '공용 결재선 수정' : '공용 결재선 추가'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
            <TextField
              label="결재선 이름"
              required
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 인사팀 기본 결재선"
            />
            <Box>
              <Typography variant="subtitle2" fontWeight={700} mb={1}>단계 구성</Typography>
              <ApprovalLineBuilder steps={steps} onChange={setSteps} disabled={saving} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>취소</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {dialog.editing ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

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
