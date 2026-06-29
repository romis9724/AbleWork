'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import EmptyState from '@/components/common/EmptyState'
import { FILTER_BAR_SX } from '@/components/common/ui'
import CreateLeaveDialog from '@/components/leave/CreateLeaveDialog'
import { useLeaves, type Leave } from '@/lib/query/leaves'
import { useEmployees, type Employee } from '@/lib/query/employees'

// ── 상태 표시 ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  APPROVED: { label: '승인', color: 'success' },
  PENDING: { label: '대기', color: 'warning' },
  REJECTED: { label: '반려', color: 'error' },
  CANCELLED: { label: '취소', color: 'default' },
}

function statusChip(status: string) {
  const entry = STATUS_LABELS[status] ?? { label: status, color: 'default' as const }
  return <Chip label={entry.label} color={entry.color} size="small" variant="outlined" />
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR')
}

const DEFAULT_LIMIT = 20

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 휴가 목록(신청 내역) 본문 패널.
 * 표준 라우트(/admin/leave/list)와 회사 설정 임베드(설정 > 휴가 > 목록) 양쪽에서 동일하게 사용.
 * PageHeader는 호출하는 page가 렌더하고, 패널은 자체 툴바(휴가 추가)를 가진다.
 */
export default function LeaveListPanel() {
  const { data: employeesData } = useEmployees({ isActive: true, excludeSuperAdmin: true, limit: 500 })
  const employees: Employee[] = employeesData?.items ?? []

  // Filters
  const [employeeFilter, setEmployeeFilter] = useState<Employee | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(0) // 0-based (MUI TablePagination)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)

  const { data, isLoading } = useLeaves({
    employeeId: employeeFilter?.id,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page: page + 1,
    limit,
  })
  const leaves: Leave[] = data?.items ?? []
  const total = data?.total ?? 0

  // Leave create dialog (공용 컴포넌트)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  function resetPage() {
    setPage(0)
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* 패널 툴바 — PageHeader 우측에 있던 액션을 임베드에서도 보이도록 패널 내부로 이동 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<EventAvailableIcon />}
          onClick={() => setLeaveDialogOpen(true)}
        >
          휴가 추가
        </Button>
      </Box>

      {/* Filters */}
      <Paper elevation={0} sx={FILTER_BAR_SX}>
        <Autocomplete
          size="small"
          sx={{ minWidth: 240 }}
          options={employees}
          getOptionLabel={(e) => e.name}
          value={employeeFilter}
          onChange={(_, v) => {
            setEmployeeFilter(v)
            resetPage()
          }}
          renderInput={(params) => <TextField {...params} label="직원 검색" />}
        />
        <TextField
          size="small"
          label="시작일 (이후)"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value)
            resetPage()
          }}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="종료일 (이전)"
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value)
            resetPage()
          }}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: startDate || undefined }}
        />
      </Paper>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : leaves.length === 0 ? (
        <EmptyState message="조회된 휴가 내역이 없습니다." />
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
                <TableCell>유형</TableCell>
                <TableCell>기간</TableCell>
                <TableCell align="right">일수</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>사유</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {leaves.map((leave) => (
                <TableRow key={leave.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{leave.employee?.name ?? '—'}</TableCell>
                  <TableCell>
                    {leave.leaveType?.displayName ?? leave.leaveType?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    {formatDate(leave.startDate)} ~ {formatDate(leave.endDate)}
                  </TableCell>
                  <TableCell align="right">{leave.daysUsed}일</TableCell>
                  <TableCell>{statusChip(leave.status)}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{leave.reason ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={limit}
            onRowsPerPageChange={(e) => {
              setLimit(Number(e.target.value))
              resetPage()
            }}
            rowsPerPageOptions={[10, 20, 50, 100]}
            labelRowsPerPage="페이지당 행 수"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
          />
        </TableContainer>
      )}

      {/* ── Create Leave Dialog (공용) ────────────────────────────────────────── */}
      <CreateLeaveDialog
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onResult={showSnack}
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
