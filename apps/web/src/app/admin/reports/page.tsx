'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
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
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DownloadIcon from '@mui/icons-material/Download'
import SearchIcon from '@mui/icons-material/Search'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import { useEmployees, type Employee } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import apiClient from '@/lib/api-client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function minutesToHours(minutes: number): string {
  if (!minutes) return '0h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function flattenOrgs(orgs: Organization[]): Organization[] {
  return orgs.flatMap((o) => [o, ...flattenOrgs(o.children ?? [])])
}

// ── Types ─────────────────────────────────────────────────────────────────────

// BE EmployeeReportRow(apps/api/src/modules/reports/reports.service.ts)와 동일한 계약
interface ReportRow {
  employeeId: string
  employeeName: string
  totalWorkDays: number
  normalCount: number
  lateCount: number
  earlyLeaveCount: number
  absentCount: number
  noScheduleCount: number
  totalWorkMinutes: number
  overtimeMinutes: number
  usedLeaveDays: number
}

const LATE_OPTIONS = [0, 5, 10, 15, 30]

// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: employeesData } = useEmployees({ isActive: true })
  const employees: Employee[] = employeesData?.items ?? []

  const { data: orgsRaw = [] } = useOrganizations()
  const organizations = flattenOrgs(orgsRaw)

  // Filters
  const [startDate, setStartDate] = useState(startOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [orgFilter, setOrgFilter] = useState<Organization | null>(null)
  const [employeeFilter, setEmployeeFilter] = useState<Employee | null>(null)
  const [lateThreshold, setLateThreshold] = useState(0)
  const [earlyLeaveThreshold, setEarlyLeaveThreshold] = useState(0)

  // Result state
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)

  // Pagination
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  // Snackbar
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  async function handleSearch() {
    setLoading(true)
    setPage(0)
    try {
      const params: Record<string, string | undefined> = {
        startDate,
        endDate,
        organizationId: orgFilter?.id,
        employeeId: employeeFilter?.id,
        lateThresholdMinutes: lateThreshold > 0 ? String(lateThreshold) : undefined,
        earlyLeaveThresholdMinutes: earlyLeaveThreshold > 0 ? String(earlyLeaveThreshold) : undefined,
      }
      const result = await apiClient.get('/reports/realtime', { params }) as ReportRow[] | { items: ReportRow[] }
      const data = Array.isArray(result) ? result : result.items ?? []
      setRows(data)
    } catch {
      setSnack({ open: true, message: '리포트 조회에 실패했습니다.', severity: 'error' })
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  function handleExport() {
    const headers = [
      '직원명', '근로일수', '정상출근', '근로시간', '연장근로시간',
      '지각횟수', '조퇴횟수', '결근횟수', '무일정근무', '휴가사용일수',
    ]
    const csvRows = rows.map((r) => [
      r.employeeName,
      r.totalWorkDays,
      r.normalCount,
      minutesToHours(r.totalWorkMinutes),
      minutesToHours(r.overtimeMinutes),
      r.lateCount,
      r.earlyLeaveCount,
      r.absentCount,
      r.noScheduleCount,
      r.usedLeaveDays,
    ])
    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `근태리포트_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const paginatedRows = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <>
      <PageHeader
        title="근태 리포트"
        actions={
          rows.length > 0 && (
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}>
              엑셀 다운로드
            </Button>
          )
        }
      />

      {/* Filter bar */}
      <Paper
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', p: 2, mb: 3, borderRadius: 2 }}
      >
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            label="시작일"
            type="date"
            size="small"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />
          <TextField
            label="종료일"
            type="date"
            size="small"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 160 }}
          />

          <Autocomplete
            size="small"
            sx={{ minWidth: 200 }}
            options={organizations}
            getOptionLabel={(o) => o.name}
            value={orgFilter}
            onChange={(_, v) => setOrgFilter(v)}
            renderInput={(params) => <TextField {...params} label="조직" />}
          />

          <Autocomplete
            size="small"
            sx={{ minWidth: 200 }}
            options={employees}
            getOptionLabel={(e) => e.name}
            value={employeeFilter}
            onChange={(_, v) => setEmployeeFilter(v)}
            renderInput={(params) => <TextField {...params} label="직원" />}
          />

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>지각 표시 범위</InputLabel>
            <Select
              value={lateThreshold}
              label="지각 표시 범위"
              onChange={(e) => setLateThreshold(Number(e.target.value))}
            >
              <MenuItem value={0}>전체</MenuItem>
              {LATE_OPTIONS.filter((v) => v > 0).map((v) => (
                <MenuItem key={v} value={v}>
                  {v}분 이상
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>조퇴 표시 범위</InputLabel>
            <Select
              value={earlyLeaveThreshold}
              label="조퇴 표시 범위"
              onChange={(e) => setEarlyLeaveThreshold(Number(e.target.value))}
            >
              <MenuItem value={0}>전체</MenuItem>
              {LATE_OPTIONS.filter((v) => v > 0).map((v) => (
                <MenuItem key={v} value={v}>
                  {v}분 이상
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
            onClick={handleSearch}
            disabled={loading}
          >
            조회
          </Button>
        </Box>
      </Paper>

      {/* Results */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <EmptyState message="조회 버튼을 눌러 리포트를 생성하세요." />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            총 {rows.length}명
          </Typography>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider' }}
          >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell>직원명</TableCell>
                  <TableCell align="right">근로일수</TableCell>
                  <TableCell align="right">정상출근</TableCell>
                  <TableCell align="right">근로시간</TableCell>
                  <TableCell align="right">연장근로시간</TableCell>
                  <TableCell align="right">지각</TableCell>
                  <TableCell align="right">조퇴</TableCell>
                  <TableCell align="right">결근</TableCell>
                  <TableCell align="right">무일정근무</TableCell>
                  <TableCell align="right">휴가사용</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedRows.map((row) => (
                  <TableRow key={row.employeeId} hover>
                    <TableCell sx={{ fontWeight: 500 }}>{row.employeeName}</TableCell>
                    <TableCell align="right">{row.totalWorkDays}일</TableCell>
                    <TableCell align="right">{row.normalCount}회</TableCell>
                    <TableCell align="right">{minutesToHours(row.totalWorkMinutes)}</TableCell>
                    <TableCell align="right">{minutesToHours(row.overtimeMinutes)}</TableCell>
                    <TableCell align="right">{row.lateCount}회</TableCell>
                    <TableCell align="right">{row.earlyLeaveCount}회</TableCell>
                    <TableCell align="right">{row.absentCount}일</TableCell>
                    <TableCell align="right">{row.noScheduleCount}회</TableCell>
                    <TableCell align="right">{row.usedLeaveDays}일</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TablePagination
                    count={rows.length}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                      setRowsPerPage(Number(e.target.value))
                      setPage(0)
                    }}
                    rowsPerPageOptions={[25, 50, 100]}
                    labelRowsPerPage="페이지당 행수:"
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                  />
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        </>
      )}

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
