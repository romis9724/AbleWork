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
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import {
  useAccrualRules,
  useCreateAccrualRule,
  useUpdateAccrualRule,
  useDeleteAccrualRule,
  useRunAccrualRule,
  useLeaveGroups,
  type AccrualRule,
  type AccrualRuleItem,
  type LeaveGroup,
} from '@/lib/query/leaves'
import { useEmployees } from '@/lib/query/employees'
import { getApiErrorMessage } from '@/lib/api-error'

// ── Monthly accrual row ────────────────────────────────────────────────────────

interface MonthlyRow {
  tenureMonths: string
  days: string
  validMonths: string
}

// ── Yearly accrual row ─────────────────────────────────────────────────────────

interface YearlyRow {
  tenureYears: string
  days: string
  periodStartMd: string
  periodEndMd: string
}

// ── Form state ─────────────────────────────────────────────────────────────────

interface RuleForm {
  name: string
  note: string
  groupId: string
  monthlyRows: MonthlyRow[]
  yearlyRows: YearlyRow[]
}

const defaultMonthlyRow: MonthlyRow = { tenureMonths: '', days: '', validMonths: '' }
const defaultYearlyRow: YearlyRow = {
  tenureYears: '',
  days: '',
  periodStartMd: '',
  periodEndMd: '',
}

const MD_REGEX = /^\d{2}-\d{2}$/

const defaultRuleForm: RuleForm = {
  name: '',
  note: '',
  groupId: '',
  monthlyRows: [{ ...defaultMonthlyRow }],
  yearlyRows: [{ ...defaultYearlyRow }],
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 휴가 발생 규칙 관리 본문 패널.
 * 표준 라우트(/admin/leave/accrual-rules)와 회사 설정 임베드(설정 > 휴가 > 발생 규칙) 양쪽에서 동일하게 사용.
 * PageHeader는 호출하는 page가 렌더하고, 패널은 자체 툴바(규칙 실행/규칙 추가)를 가진다.
 */
export default function LeaveAccrualRulesPanel() {
  const { data: rawRules, isLoading } = useAccrualRules()
  const rules: AccrualRule[] = Array.isArray(rawRules) ? rawRules : []

  const { data: groups = [] } = useLeaveGroups()
  const { data: employeeData } = useEmployees({ isActive: true })
  const employees = employeeData?.items ?? []

  const createRuleMutation = useCreateAccrualRule()
  const updateRuleMutation = useUpdateAccrualRule()
  const deleteRuleMutation = useDeleteAccrualRule()
  const runRuleMutation = useRunAccrualRule()

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AccrualRule | null>(null)

  // Add/Edit rule dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<AccrualRule | null>(null)
  const [ruleForm, setRuleForm] = useState<RuleForm>(defaultRuleForm)

  function openAddRule() {
    setEditingRule(null)
    setRuleForm(defaultRuleForm)
    setAddDialogOpen(true)
  }

  function openEditRule(rule: AccrualRule) {
    setEditingRule(rule)
    const items = rule.items ?? []
    const monthlyRows = items
      .filter((it: AccrualRuleItem) => it.accrualBasis === 'monthly')
      .map((it) => ({
        tenureMonths: String(it.tenureMonths ?? ''),
        days: String(it.accrualDays ?? ''),
        validMonths: it.validMonths != null ? String(it.validMonths) : '',
      }))
    const yearlyRows = items
      .filter((it: AccrualRuleItem) => it.accrualBasis === 'yearly')
      .map((it) => ({
        tenureYears: String(it.tenureYears ?? ''),
        days: String(it.accrualDays ?? ''),
        periodStartMd: it.periodStartMd ?? '',
        periodEndMd: it.periodEndMd ?? '',
      }))
    setRuleForm({
      name: rule.name,
      note: rule.memo ?? '',
      groupId: rule.leaveGroup?.id ?? '',
      monthlyRows: monthlyRows.length > 0 ? monthlyRows : [{ ...defaultMonthlyRow }],
      yearlyRows: yearlyRows.length > 0 ? yearlyRows : [{ ...defaultYearlyRow }],
    })
    setAddDialogOpen(true)
  }

  // Run rule dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [runRuleId, setRunRuleId] = useState('')
  const [runEmployeeIds, setRunEmployeeIds] = useState<string[]>([])

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  // ── Rule form helpers ─────────────────────────────────────────────────────────

  function addMonthlyRow() {
    setRuleForm((f) => ({ ...f, monthlyRows: [...f.monthlyRows, { ...defaultMonthlyRow }] }))
  }

  function removeMonthlyRow(i: number) {
    setRuleForm((f) => ({ ...f, monthlyRows: f.monthlyRows.filter((_, idx) => idx !== i) }))
  }

  function updateMonthlyRow(i: number, field: keyof MonthlyRow, value: string) {
    setRuleForm((f) => ({
      ...f,
      monthlyRows: f.monthlyRows.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    }))
  }

  function addYearlyRow() {
    setRuleForm((f) => ({ ...f, yearlyRows: [...f.yearlyRows, { ...defaultYearlyRow }] }))
  }

  function removeYearlyRow(i: number) {
    setRuleForm((f) => ({ ...f, yearlyRows: f.yearlyRows.filter((_, idx) => idx !== i) }))
  }

  function updateYearlyRow(i: number, field: keyof YearlyRow, value: string) {
    setRuleForm((f) => ({
      ...f,
      yearlyRows: f.yearlyRows.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    }))
  }

  // ── Save rule ─────────────────────────────────────────────────────────────────

  async function handleSaveRule() {
    if (!ruleForm.name.trim()) return
    if (!ruleForm.groupId) {
      showSnack('휴가 그룹을 선택하세요.', 'error')
      return
    }

    // BE CreateAccrualRuleSchema의 items[{accrualBasis,...}] 형식으로 변환
    const monthlyItems = ruleForm.monthlyRows
      .filter((r) => r.tenureMonths !== '' && r.days !== '')
      .map((r, i) => ({
        accrualBasis: 'monthly' as const,
        tenureMonths: Number(r.tenureMonths),
        accrualDays: Number(r.days),
        ...(Number(r.validMonths) > 0 && { validMonths: Number(r.validMonths) }),
        sortOrder: i,
      }))

    const yearlyItems = ruleForm.yearlyRows
      .filter((r) => r.tenureYears !== '' && r.days !== '')
      .map((r, i) => ({
        accrualBasis: 'yearly' as const,
        tenureYears: Number(r.tenureYears),
        accrualDays: Number(r.days),
        ...(MD_REGEX.test(r.periodStartMd) && { periodStartMd: r.periodStartMd }),
        ...(MD_REGEX.test(r.periodEndMd) && { periodEndMd: r.periodEndMd }),
        sortOrder: monthlyItems.length + i,
      }))

    const items = [...monthlyItems, ...yearlyItems]
    if (items.length === 0) {
      showSnack('발생 규칙 항목을 하나 이상 입력하세요.', 'error')
      return
    }

    const payload = {
      leaveGroupId: ruleForm.groupId,
      name: ruleForm.name.trim(),
      memo: ruleForm.note.trim() || undefined,
      isActive: true,
      items,
    }
    try {
      if (editingRule) {
        await updateRuleMutation.mutateAsync({ id: editingRule.id, ...payload })
      } else {
        await createRuleMutation.mutateAsync(payload)
      }
      setAddDialogOpen(false)
      setEditingRule(null)
      setRuleForm(defaultRuleForm)
      showSnack(editingRule ? '발생 규칙이 수정되었습니다.' : '발생 규칙이 추가되었습니다.')
    } catch {
      showSnack('저장에 실패했습니다.', 'error')
    }
  }

  // ── Run rule ──────────────────────────────────────────────────────────────────

  function openRunDialog() {
    setRunRuleId(rules[0]?.id ?? '')
    setRunEmployeeIds([])
    setRunDialogOpen(true)
  }

  async function handleDeleteRule() {
    if (!deleteTarget) return
    try {
      await deleteRuleMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      showSnack('발생 규칙이 삭제되었습니다.')
    } catch (e) {
      showSnack(getApiErrorMessage(e, '삭제에 실패했습니다.'), 'error')
    }
  }

  async function handleRunRule() {
    if (!runRuleId) return
    try {
      await runRuleMutation.mutateAsync({
        id: runRuleId,
        employeeIds: runEmployeeIds.length > 0 ? runEmployeeIds : undefined,
      })
      setRunDialogOpen(false)
      showSnack('규칙이 실행되었습니다.')
    } catch {
      showSnack('실행에 실패했습니다.', 'error')
    }
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* 패널 툴바 — PageHeader 우측에 있던 액션을 임베드에서도 보이도록 패널 내부로 이동 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<PlayArrowIcon />}
          onClick={openRunDialog}
          disabled={rules.length === 0}
        >
          규칙 실행
        </Button>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openAddRule}
        >
          규칙 추가
        </Button>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : rules.length === 0 ? (
        <EmptyState
          message="등록된 발생 규칙이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openAddRule}>
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
                <TableCell>그룹</TableCell>
                <TableCell>메모</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">액션</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule: AccrualRule) => (
                <TableRow key={rule.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{rule.name}</TableCell>
                  <TableCell>{rule.leaveGroup?.name ?? '—'}</TableCell>
                  <TableCell>{rule.memo ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={rule.isActive ? '활성' : '비활성'}
                      color={rule.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" aria-label="수정" onClick={() => openEditRule(rule)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(rule)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Add Rule Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={addDialogOpen}
        onClose={() => { setAddDialogOpen(false); setEditingRule(null) }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}
      >
        <DialogTitle>{editingRule ? '발생 규칙 수정' : '발생 규칙 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="규칙명"
            required
            value={ruleForm.name}
            onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="메모 (선택)"
            value={ruleForm.note}
            onChange={(e) => setRuleForm((f) => ({ ...f, note: e.target.value }))}
            fullWidth
            multiline
            rows={2}
          />
          <FormControl fullWidth required>
            <InputLabel>휴가 그룹</InputLabel>
            <Select
              value={ruleForm.groupId}
              label="휴가 그룹"
              onChange={(e) => setRuleForm((f) => ({ ...f, groupId: e.target.value }))}
            >
              {groups.map((g: LeaveGroup) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider />

          {/* Monthly accrual rows */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                월 기준 발생
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addMonthlyRow}>
                행 추가
              </Button>
            </Box>
            {ruleForm.monthlyRows.map((row, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <TextField
                  label="근속월수"
                  type="number"
                  size="small"
                  value={row.tenureMonths}
                  onChange={(e) => updateMonthlyRow(i, 'tenureMonths', e.target.value)}
                  inputProps={{ min: 0 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="발생일수"
                  type="number"
                  size="small"
                  value={row.days}
                  onChange={(e) => updateMonthlyRow(i, 'days', e.target.value)}
                  inputProps={{ min: 0, step: 0.5 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="유효개월수"
                  type="number"
                  size="small"
                  value={row.validMonths}
                  onChange={(e) => updateMonthlyRow(i, 'validMonths', e.target.value)}
                  inputProps={{ min: 0 }}
                  sx={{ flex: 1 }}
                />
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeMonthlyRow(i)}
                  disabled={ruleForm.monthlyRows.length === 1}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>

          <Divider />

          {/* Yearly accrual rows */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                연 기준 발생
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addYearlyRow}>
                행 추가
              </Button>
            </Box>
            {ruleForm.yearlyRows.map((row, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                <TextField
                  label="근속연수"
                  type="number"
                  size="small"
                  value={row.tenureYears}
                  onChange={(e) => updateYearlyRow(i, 'tenureYears', e.target.value)}
                  inputProps={{ min: 0 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="발생일수"
                  type="number"
                  size="small"
                  value={row.days}
                  onChange={(e) => updateYearlyRow(i, 'days', e.target.value)}
                  inputProps={{ min: 0, step: 0.5 }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="시작 월일 (MM-DD)"
                  size="small"
                  placeholder="01-01"
                  value={row.periodStartMd}
                  onChange={(e) => updateYearlyRow(i, 'periodStartMd', e.target.value)}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="종료 월일 (MM-DD)"
                  size="small"
                  placeholder="12-31"
                  value={row.periodEndMd}
                  onChange={(e) => updateYearlyRow(i, 'periodEndMd', e.target.value)}
                  sx={{ flex: 1 }}
                />
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeYearlyRow(i)}
                  disabled={ruleForm.yearlyRows.length === 1}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddDialogOpen(false); setEditingRule(null) }}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveRule}
            disabled={createRuleMutation.isPending || updateRuleMutation.isPending || !ruleForm.name.trim() || !ruleForm.groupId}
          >
            {editingRule ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Run Rule Dialog ─────────────────────────────────────────────────────── */}
      <Dialog
        open={runDialogOpen}
        onClose={() => setRunDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>규칙 실행</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl fullWidth>
            <InputLabel>규칙 선택</InputLabel>
            <Select
              value={runRuleId}
              label="규칙 선택"
              onChange={(e) => setRunRuleId(e.target.value)}
            >
              {rules.map((rule: AccrualRule) => (
                <MenuItem key={rule.id} value={rule.id}>
                  {rule.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            multiple
            options={employees}
            getOptionLabel={(e) => e.name}
            value={employees.filter((e) => runEmployeeIds.includes(e.id))}
            onChange={(_, selected) => setRunEmployeeIds(selected.map((e) => e.id))}
            renderInput={(params) => (
              <TextField {...params} label="직원 선택 (비워두면 전체)" placeholder="직원 검색..." />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRunDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleRunRule}
            disabled={runRuleMutation.isPending || !runRuleId}
          >
            실행
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm ──────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="발생 규칙 삭제"
        message={`"${deleteTarget?.name}" 규칙을 삭제하시겠습니까? 규칙 항목도 함께 삭제됩니다.`}
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleteRuleMutation.isPending}
        onConfirm={handleDeleteRule}
        onCancel={() => setDeleteTarget(null)}
      />

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
