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
import EmptyState from '@/components/common/EmptyState'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useApprovalRules,
  useCreateApprovalRule,
  useUpdateApprovalRule,
  useDeleteApprovalRule,
  type ApprovalRule,
} from '@/lib/query/requests'
import { usePositions } from '@/lib/query/positions'

// ── Constants ─────────────────────────────────────────────────────────────────

const REQUEST_TYPES = [
  { value: 'LEAVE_CREATE', label: '휴가 신청' },
  { value: 'LEAVE_MODIFY', label: '휴가 변경' },
  { value: 'LEAVE_DELETE', label: '휴가 취소' },
  { value: 'SHIFT_CREATE', label: '근무일정 추가' },
  { value: 'SHIFT_MODIFY', label: '근무일정 변경' },
  { value: 'SHIFT_DELETE', label: '근무일정 삭제' },
  { value: 'ATTENDANCE_EDIT', label: '출퇴근 정정' },
  { value: 'ATTENDANCE_CREATE', label: '출퇴근 추가' },
  { value: 'ATTENDANCE_DELETE', label: '출퇴근 삭제' },
  { value: 'DEVICE_CHANGE', label: '기기 변경' },
  { value: 'OFFSITE_WORK', label: '외근 신청' },
  { value: 'CUSTOM', label: '커스텀 요청' },
] as const

type RequestTypeValue = (typeof REQUEST_TYPES)[number]['value'] | ''

const TYPE_FILTER_ALL = '전체'

// ── Form state ────────────────────────────────────────────────────────────────

interface RuleDetailForm {
  round: number
  requiredCount: number
  approverPositionId: string
}

interface RuleForm {
  name: string
  requestType: RequestTypeValue
  maxApprovalRounds: string
  isAutoApprove: boolean
  details: RuleDetailForm[]
}

const defaultRuleForm: RuleForm = {
  name: '',
  requestType: '',
  maxApprovalRounds: '1',
  isAutoApprove: false,
  details: [],
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 승인 규칙 본문 패널.
 * 표준 라우트(/admin/requests/rules)와 회사 설정 임베드(설정 > 요청 > 승인 규칙) 양쪽에서 동일하게 사용.
 * PageHeader는 호출하는 page가 렌더하고, 패널은 자체 툴바(규칙 추가)를 가진다.
 */
export default function RequestRulesPanel() {
  const { data: rules = [], isLoading } = useApprovalRules()
  const { data: positions = [] } = usePositions()
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
      details: (rule.details ?? []).map((d) => ({
        round: d.round,
        requiredCount: d.requiredCount,
        approverPositionId: d.approverPositionId ?? '',
      })),
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
      // M1 다결재자/병렬: 차수별 필수 승인 수(requiredCount)·승인 직무
      details: form.details.map((d) => ({
        round: d.round,
        requiredCount: d.requiredCount,
        ...(d.approverPositionId ? { approverPositionId: d.approverPositionId } : {}),
      })),
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
    } catch (e) {
      showSnack(getApiErrorMessage(e, '삭제에 실패했습니다.'), 'error')
    }
  }

  const filteredRules =
    typeFilter === TYPE_FILTER_ALL
      ? rules
      : rules.filter((r) => r.requestType === typeFilter)

  const typeLabel = (type: string) =>
    REQUEST_TYPES.find((t) => t.value === type)?.label ?? type

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* 패널 툴바 — PageHeader 우측에 있던 규칙 추가 액션을 임베드에서도 보이도록 패널 내부로 이동 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
        {/* Type filter */}
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
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
          규칙 추가
        </Button>
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
          {!form.isAutoApprove && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                차수별 결재 단계 (다결재자/병렬)
              </Typography>
              <Typography variant="caption" color="text.secondary">
                같은 차수에 여러 행을 추가하면 병렬 결재가 되며, 필수 승인 수(requiredCount)만큼 승인되면 다음 차수로 진행합니다.
                비워두면 차수당 관리자 1명 승인으로 동작합니다.
              </Typography>
              {form.details.map((d, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    label="차수"
                    type="number"
                    size="small"
                    value={d.round}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        details: f.details.map((x, j) =>
                          j === i ? { ...x, round: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      }))
                    }
                    inputProps={{ min: 1 }}
                    sx={{ width: 80 }}
                  />
                  <TextField
                    label="필수 승인 수"
                    type="number"
                    size="small"
                    value={d.requiredCount}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        details: f.details.map((x, j) =>
                          j === i ? { ...x, requiredCount: Math.max(1, Number(e.target.value) || 1) } : x,
                        ),
                      }))
                    }
                    inputProps={{ min: 1 }}
                    sx={{ width: 120 }}
                  />
                  <FormControl size="small" sx={{ flexGrow: 1, minWidth: 120 }}>
                    <InputLabel>승인 직무</InputLabel>
                    <Select
                      label="승인 직무"
                      value={d.approverPositionId}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          details: f.details.map((x, j) =>
                            j === i ? { ...x, approverPositionId: e.target.value } : x,
                          ),
                        }))
                      }
                    >
                      <MenuItem value="">관리자(기본)</MenuItem>
                      {positions.map((p) => (
                        <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      setForm((f) => ({ ...f, details: f.details.filter((_, j) => j !== i) }))
                    }
                  >
                    삭제
                  </Button>
                </Box>
              ))}
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    details: [
                      ...f.details,
                      { round: Number(f.maxApprovalRounds) || 1, requiredCount: 1, approverPositionId: '' },
                    ],
                  }))
                }
                sx={{ alignSelf: 'flex-start' }}
              >
                결재 단계 추가
              </Button>
            </Box>
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
    </Box>
  )
}
