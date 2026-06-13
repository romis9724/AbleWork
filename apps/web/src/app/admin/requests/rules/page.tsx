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
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import IconButton from '@mui/material/IconButton'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import {
  useApprovalRules,
  useCreateApprovalRule,
  useUpdateApprovalRule,
  useDeleteApprovalRule,
  type ApprovalRule,
} from '@/lib/query/requests'

// ── Constants ─────────────────────────────────────────────────────────────────

const REQUEST_TYPES = [
  { value: 'LEAVE_CREATE', label: '휴가 신청' },
  { value: 'SHIFT_CREATE', label: '근무일정 추가' },
  { value: 'ATTENDANCE_EDIT', label: '출퇴근 정정' },
  { value: 'DEVICE_CHANGE', label: '기기 변경' },
  { value: 'OFFSITE_WORK', label: '외근 신청' },
] as const

type RequestTypeValue = (typeof REQUEST_TYPES)[number]['value'] | ''

const TYPE_FILTER_ALL = '전체'

// ── Form state ────────────────────────────────────────────────────────────────

interface RuleForm {
  name: string
  requestType: RequestTypeValue
  maxApprovalRounds: string
  isAutoApprove: boolean
}

const defaultRuleForm: RuleForm = {
  name: '',
  requestType: '',
  maxApprovalRounds: '1',
  isAutoApprove: false,
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ApprovalRulesPage() {
  const { data: rules = [], isLoading } = useApprovalRules()
  const createMutation = useCreateApprovalRule()
  const updateMutation = useUpdateApprovalRule()
  const deleteMutation = useDeleteApprovalRule()

  const [typeFilter, setTypeFilter] = useState<string>(TYPE_FILTER_ALL)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null)
  const [deletingRule, setDeletingRule] = useState<ApprovalRule | null>(null)
  const [form, setForm] = useState<RuleForm>(defaultRuleForm)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  function openAdd() {
    setEditingRule(null)
    setForm(defaultRuleForm)
    setDialogOpen(true)
  }

  function openEdit(rule: ApprovalRule) {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      requestType: rule.requestType as RequestTypeValue,
      maxApprovalRounds: String(rule.maxApprovalRounds),
      isAutoApprove: rule.isAutoApprove,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.requestType) return
    const payload = {
      name: form.name.trim(),
      requestType: form.requestType,
      maxApprovalRounds: Number(form.maxApprovalRounds),
      isAutoApprove: form.isAutoApprove,
    }
    try {
      if (editingRule) {
        await updateMutation.mutateAsync({ id: editingRule.id, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      setDialogOpen(false)
      showSnack(editingRule ? '규칙이 수정되었습니다.' : '규칙이 추가되었습니다.')
    } catch {
      showSnack('저장에 실패했습니다.', 'error')
    }
  }

  async function handleDelete() {
    if (!deletingRule) return
    try {
      await deleteMutation.mutateAsync(deletingRule.id)
      setDeletingRule(null)
      showSnack('규칙이 삭제되었습니다.')
    } catch {
      showSnack('삭제에 실패했습니다.', 'error')
    }
  }

  const filteredRules =
    typeFilter === TYPE_FILTER_ALL
      ? rules
      : rules.filter((r) => r.requestType === typeFilter)

  const typeLabel = (type: string) =>
    REQUEST_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <>
      <PageHeader
        title="승인 규칙"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
            규칙 추가
          </Button>
        }
      />

      {/* Type filter */}
      <Box sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>요청 유형 필터</InputLabel>
          <Select
            value={typeFilter}
            label="요청 유형 필터"
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <MenuItem value={TYPE_FILTER_ALL}>전체</MenuItem>
            {REQUEST_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredRules.length === 0 ? (
        <EmptyState
          message="등록된 승인 규칙이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openAdd}>
              규칙 추가
            </Button>
          }
        />
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider' }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>규칙명</TableCell>
                <TableCell>요청 유형</TableCell>
                <TableCell>최대 차수</TableCell>
                <TableCell>자동 승인</TableCell>
                <TableCell align="right">액션</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRules.map((rule: ApprovalRule) => (
                <TableRow key={rule.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{rule.name}</TableCell>
                  <TableCell>
                    <Chip label={typeLabel(rule.requestType)} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{rule.maxApprovalRounds}차</TableCell>
                  <TableCell>
                    <Chip
                      label={rule.isAutoApprove ? '자동 승인' : '수동'}
                      color={rule.isAutoApprove ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(rule)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeletingRule(rule)}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Add/Edit Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingRule ? '승인 규칙 수정' : '승인 규칙 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="규칙명"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <FormControl fullWidth required>
            <InputLabel>요청 유형</InputLabel>
            <Select
              value={form.requestType}
              label="요청 유형"
              onChange={(e) => setForm((f) => ({ ...f, requestType: e.target.value as RequestTypeValue }))}
            >
              {REQUEST_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="최대 승인 차수"
            type="number"
            required
            value={form.maxApprovalRounds}
            onChange={(e) => setForm((f) => ({ ...f, maxApprovalRounds: e.target.value }))}
            inputProps={{ min: 1, max: 7 }}
            helperText="1 ~ 7차 사이로 설정하세요."
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.isAutoApprove}
                onChange={(e) => setForm((f) => ({ ...f, isAutoApprove: e.target.checked }))}
              />
            }
            label="자동 승인"
          />
          {!form.isAutoApprove && Number(form.maxApprovalRounds) > 1 && (
            <Typography variant="caption" color="text.secondary">
              자동 승인이 꺼진 경우, 차수별 승인자 직무는 조직 설정에서 별도로 구성할 수 있습니다.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              createMutation.isPending ||
              updateMutation.isPending ||
              !form.name.trim() ||
              !form.requestType
            }
          >
            {editingRule ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm Dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!deletingRule} onClose={() => setDeletingRule(null)} maxWidth="xs" fullWidth>
        <DialogTitle>승인 규칙 삭제</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {`'${deletingRule?.name ?? ''}' 규칙을 삭제하시겠습니까? 삭제된 규칙은 더 이상 요청 승인에 적용되지 않습니다.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingRule(null)}>취소</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
