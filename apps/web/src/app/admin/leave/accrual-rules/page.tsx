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
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import {
  useAccrualRules,
  useCreateAccrualRule,
  useRunAccrualRule,
  useLeaveGroups,
  type AccrualRule,
  type LeaveGroup,
} from '@/lib/query/leaves'
import { useEmployees } from '@/lib/query/employees'

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
const defaultYearlyRow: YearlyRow = { tenureYears: '', days: '' }

const defaultRuleForm: RuleForm = {
  name: '',
  note: '',
  groupId: '',
  monthlyRows: [{ ...defaultMonthlyRow }],
  yearlyRows: [{ ...defaultYearlyRow }],
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AccrualRulesPage() {
  const { data: rawRules, isLoading } = useAccrualRules()
  const rules: AccrualRule[] = Array.isArray(rawRules) ? rawRules : []

  const { data: groups = [] } = useLeaveGroups()
  const { data: employeeData } = useEmployees({ isActive: true })
  const employees = employeeData?.items ?? []

  const createRuleMutation = useCreateAccrualRule()
  const runRuleMutation = useRunAccrualRule()

  // Add rule dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState<RuleForm>(defaultRuleForm)

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
    const payload = {
      name: ruleForm.name.trim(),
      note: ruleForm.note.trim() || undefined,
      groupId: ruleForm.groupId || undefined,
      monthlyAccruals: ruleForm.monthlyRows
        .filter((r) => r.tenureMonths && r.days)
        .map((r) => ({
          tenureMonths: Number(r.tenureMonths),
          days: Number(r.days),
          validMonths: Number(r.validMonths) || 0,
        })),
      yearlyAccruals: ruleForm.yearlyRows
        .filter((r) => r.tenureYears && r.days)
        .map((r) => ({
          tenureYears: Number(r.tenureYears),
          days: Number(r.days),
        })),
    }
    try {
      await createRuleMutation.mutateAsync(payload)
      setAddDialogOpen(false)
      setRuleForm(defaultRuleForm)
      showSnack('발생 규칙이 추가되었습니다.')
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
    <>
      <PageHeader
        title="휴가 발생 규칙"
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
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
              onClick={() => {
                setRuleForm(defaultRuleForm)
                setAddDialogOpen(true)
              }}
            >
              규칙 추가
            </Button>
          </Box>
        }
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : rules.length === 0 ? (
        <EmptyState
          message="등록된 발생 규칙이 없습니다."
          action={
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setRuleForm(defaultRuleForm)
                setAddDialogOpen(true)
              }}
            >
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
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule: AccrualRule) => (
                <TableRow key={rule.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{rule.name}</TableCell>
                  <TableCell>{rule.group?.name ?? '—'}</TableCell>
                  <TableCell>{rule.note ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={rule.isActive ? '활성' : '비활성'}
                      color={rule.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
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
        onClose={() => setAddDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}
      >
        <DialogTitle>발생 규칙 추가</DialogTitle>
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
          <FormControl fullWidth>
            <InputLabel>휴가 그룹</InputLabel>
            <Select
              value={ruleForm.groupId}
              label="휴가 그룹"
              onChange={(e) => setRuleForm((f) => ({ ...f, groupId: e.target.value }))}
            >
              <MenuItem value="">없음</MenuItem>
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
          <Button onClick={() => setAddDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveRule}
            disabled={createRuleMutation.isPending || !ruleForm.name.trim()}
          >
            추가
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
