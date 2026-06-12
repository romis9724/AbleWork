'use client'
import { useState, useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
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
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import {
  useLeaveBalance,
  useLeaveTypes,
  useManualAccrual,
  type LeaveBalance,
  type LeaveType,
} from '@/lib/query/leaves'
import { useEmployees, type Employee } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenOrgs(orgs: Organization[]): Organization[] {
  return orgs.flatMap((o) => [o, ...flattenOrgs(o.children ?? [])])
}

// ── Single employee balance loader ────────────────────────────────────────────

function EmployeeBalanceRows({
  employee,
  orgFilter,
}: {
  employee: Employee
  orgFilter: string
}) {
  // 훅은 항상 최상단에서 호출 (조건부 early return 이전)
  const { data: balances = [] } = useLeaveBalance(employee.id)

  const orgIds = employee.organizations?.map((o) => o.organization.id) ?? []
  if (orgFilter && !orgIds.includes(orgFilter)) return null

  return (
    <>
      {balances.map((b: LeaveBalance) => (
        <TableRow key={b.id} hover>
          <TableCell sx={{ fontWeight: 500 }}>{employee.name}</TableCell>
          <TableCell>{b.leaveType?.name ?? '—'}</TableCell>
          <TableCell align="right">{b.accruedDays}일</TableCell>
          <TableCell align="right">{b.usedDays}일</TableCell>
          <TableCell align="right" sx={{ fontWeight: 600 }}>
            {b.remainingDays}일
          </TableCell>
          <TableCell sx={{ color: 'text.secondary' }}>
            {b.expiresAt ? new Date(b.expiresAt).toLocaleDateString('ko-KR') : '—'}
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}

// ── Accrual form ──────────────────────────────────────────────────────────────

interface AccrualForm {
  employeeIds: Employee[]
  leaveTypeId: string
  days: string
  note: string
}

const defaultAccrualForm: AccrualForm = {
  employeeIds: [],
  leaveTypeId: '',
  days: '',
  note: '',
}

// ─────────────────────────────────────────────────────────────────────────────

export default function LeaveStatusPage() {
  const { data: employeesData } = useEmployees({ isActive: true })
  const employees: Employee[] = employeesData?.items ?? []

  const { data: orgsRaw = [] } = useOrganizations()
  const organizations = useMemo(() => flattenOrgs(orgsRaw), [orgsRaw])

  const { data: leaveTypes = [] } = useLeaveTypes()
  const manualAccrualMutation = useManualAccrual()

  // Filters
  const [orgFilter, setOrgFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState<Employee | null>(null)

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<AccrualForm>(defaultAccrualForm)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  function openDialog() {
    setForm(defaultAccrualForm)
    setDialogOpen(true)
  }

  async function handleGrant() {
    if (form.employeeIds.length === 0 || !form.leaveTypeId || !form.days) return
    try {
      await manualAccrualMutation.mutateAsync({
        employeeIds: form.employeeIds.map((e) => e.id),
        leaveTypeId: form.leaveTypeId,
        days: Number(form.days),
        note: form.note || undefined,
      })
      setDialogOpen(false)
      showSnack(`${form.employeeIds.length}명에게 휴가가 부여되었습니다.`)
    } catch {
      showSnack('휴가 부여에 실패했습니다.', 'error')
    }
  }

  // Determine which employees to show in table
  const displayEmployees = employeeFilter
    ? employees.filter((e) => e.id === employeeFilter.id)
    : employees

  return (
    <>
      <PageHeader
        title="휴가 현황"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openDialog}>
            휴가 부여
          </Button>
        }
      />

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>조직 선택</InputLabel>
          <Select
            value={orgFilter}
            label="조직 선택"
            onChange={(e) => setOrgFilter(e.target.value)}
          >
            <MenuItem value="">전체</MenuItem>
            {organizations.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {'　'.repeat(o.depth)}{o.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Autocomplete
          size="small"
          sx={{ minWidth: 240 }}
          options={employees}
          getOptionLabel={(e) => e.name}
          value={employeeFilter}
          onChange={(_, v) => setEmployeeFilter(v)}
          renderInput={(params) => <TextField {...params} label="직원 선택" />}
        />
      </Box>

      {employees.length === 0 ? (
        <EmptyState message="등록된 직원이 없습니다." />
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider' }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>직원명</TableCell>
                <TableCell>유형명</TableCell>
                <TableCell align="right">발생 일수</TableCell>
                <TableCell align="right">사용 일수</TableCell>
                <TableCell align="right">잔여 일수</TableCell>
                <TableCell>유효기간</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayEmployees.map((emp) => (
                <EmployeeBalanceRows
                  key={emp.id}
                  employee={emp}
                  orgFilter={orgFilter}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Grant Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>휴가 부여</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Autocomplete
            multiple
            options={employees}
            getOptionLabel={(e) => e.name}
            value={form.employeeIds}
            onChange={(_, v) => setForm((f) => ({ ...f, employeeIds: v }))}
            renderInput={(params) => (
              <TextField {...params} label="직원 선택 (다중)" required />
            )}
          />
          <FormControl fullWidth required>
            <InputLabel>휴가 유형</InputLabel>
            <Select
              value={form.leaveTypeId}
              label="휴가 유형"
              onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
            >
              {(leaveTypes as LeaveType[]).map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.displayName ?? t.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="발생 일수"
            type="number"
            required
            value={form.days}
            onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
            inputProps={{ min: 0.5, step: 0.5 }}
            fullWidth
          />
          <TextField
            label="사유 (선택)"
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleGrant}
            disabled={
              manualAccrualMutation.isPending ||
              form.employeeIds.length === 0 ||
              !form.leaveTypeId ||
              !form.days
            }
          >
            부여
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
