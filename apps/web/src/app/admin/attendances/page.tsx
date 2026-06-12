'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import DownloadIcon from '@mui/icons-material/Download'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import {
  useAttendances,
  useUpdateAttendance,
  useConfirmPeriod,
  type Attendance,
} from '@/lib/query/attendances'
import { useOrganizations } from '@/lib/query/organizations'

const STATUS_LABEL: Record<string, string> = {
  normal: '정상',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
  oncall: '무일정',
}

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  normal: 'success',
  late: 'warning',
  early_leave: 'warning',
  absent: 'error',
  oncall: 'default',
}

function getThisMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
}

function toDatetimeLocal(iso?: string) {
  if (!iso) return ''
  return iso.slice(0, 16)
}

function calcWorkHours(clockIn: string, clockOut?: string) {
  if (!clockOut) return '—'
  const diff = (new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 1000 / 60
  if (diff < 0) return '—'
  const h = Math.floor(diff / 60)
  const m = Math.floor(diff % 60)
  return `${h}시간 ${m}분`
}

interface EditForm {
  clockInAt: string
  clockOutAt: string
  status: string
  isConfirmed: boolean
  note: string
}

export default function AttendancesPage() {
  const defaultRange = getThisMonthRange()
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
  const [queryParams, setQueryParams] = useState<Record<string, string | undefined>>({
    startDate: defaultRange.start,
    endDate: defaultRange.end,
  })

  const { data: rawData, isLoading } = useAttendances(queryParams)
  const { data: orgs = [] } = useOrganizations()
  const updateMutation = useUpdateAttendance()
  const confirmPeriodMutation = useConfirmPeriod()

  const records: Attendance[] = Array.isArray(rawData)
    ? rawData
    : (rawData as { items?: Attendance[] })?.items ?? []

  const [editRow, setEditRow] = useState<Attendance | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    clockInAt: '',
    clockOutAt: '',
    status: 'normal',
    isConfirmed: false,
    note: '',
  })

  const [confirmPeriodOpen, setConfirmPeriodOpen] = useState(false)
  const [confirmStart, setConfirmStart] = useState(defaultRange.start)
  const [confirmEnd, setConfirmEnd] = useState(defaultRange.end)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function openEdit(row: Attendance) {
    setEditRow(row)
    setEditForm({
      clockInAt: toDatetimeLocal(row.clockInAt),
      clockOutAt: toDatetimeLocal(row.clockOutAt),
      status: row.status,
      isConfirmed: row.isConfirmed,
      note: row.note ?? '',
    })
  }

  function handleSearch() {
    setQueryParams({ startDate, endDate, organizationId: orgId })
  }

  async function handleSave() {
    if (!editRow) return
    try {
      await updateMutation.mutateAsync({
        id: editRow.id,
        clockInAt: editForm.clockInAt ? new Date(editForm.clockInAt).toISOString() : undefined,
        clockOutAt: editForm.clockOutAt ? new Date(editForm.clockOutAt).toISOString() : undefined,
        status: editForm.status,
        isConfirmed: editForm.isConfirmed,
        note: editForm.note || undefined,
      })
      setEditRow(null)
      setSnack({ open: true, message: '저장되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' })
    }
  }

  async function handleConfirmPeriod() {
    try {
      await confirmPeriodMutation.mutateAsync({
        startDate: confirmStart,
        endDate: confirmEnd,
        organizationId: orgId,
      })
      setConfirmPeriodOpen(false)
      setSnack({ open: true, message: '기간 확정이 완료되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '기간 확정에 실패했습니다.', severity: 'error' })
    }
  }

  function handleExportDownload() {
    const params = new URLSearchParams({
      startDate: queryParams.startDate ?? '',
      endDate: queryParams.endDate ?? '',
      ...(queryParams.organizationId ? { organizationId: queryParams.organizationId } : {}),
    })
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/reports/export?${params}`
  }

  return (
    <>
      <PageHeader
        title="출퇴근 기록"
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<CheckCircleOutlineIcon />}
              onClick={() => setConfirmPeriodOpen(true)}
            >
              기간 확정
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportDownload}
            >
              엑셀 다운로드
            </Button>
          </Box>
        }
      />

      {/* Filter bar */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          p: 2,
          mb: 3,
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
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
          options={orgs}
          getOptionLabel={(o) => o.name}
          value={orgs.find((o) => o.id === orgId) ?? null}
          onChange={(_, v) => setOrgId(v?.id)}
          size="small"
          sx={{ width: 200 }}
          renderInput={(params) => <TextField {...params} label="조직 (전체)" />}
        />
        <Button variant="contained" onClick={handleSearch}>
          검색
        </Button>
      </Paper>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : records.length === 0 ? (
        <EmptyState message="조회된 출퇴근 기록이 없습니다." />
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
                <TableCell>날짜</TableCell>
                <TableCell>출근 시간</TableCell>
                <TableCell>퇴근 시간</TableCell>
                <TableCell>근로 시간</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>확정</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => openEdit(r)}
                >
                  <TableCell sx={{ fontWeight: 600 }}>{r.employee?.name ?? '—'}</TableCell>
                  <TableCell>{r.clockInAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    {new Date(r.clockInAt).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    {r.clockOutAt
                      ? new Date(r.clockOutAt).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </TableCell>
                  <TableCell>{calcWorkHours(r.clockInAt, r.clockOutAt)}</TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABEL[r.status] ?? r.status}
                      color={STATUS_COLOR[r.status] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={r.isConfirmed ? '확정' : '미확정'}
                      color={r.isConfirmed ? 'primary' : 'default'}
                      size="small"
                      variant={r.isConfirmed ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editRow} onClose={() => setEditRow(null)} maxWidth="sm" fullWidth>
        <DialogTitle>출퇴근 기록 수정</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="출근 시간"
            type="datetime-local"
            value={editForm.clockInAt}
            onChange={(e) => setEditForm((f) => ({ ...f, clockInAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="퇴근 시간"
            type="datetime-local"
            value={editForm.clockOutAt}
            onChange={(e) => setEditForm((f) => ({ ...f, clockOutAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>상태</InputLabel>
            <Select
              value={editForm.status}
              label="상태"
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
            >
              <MenuItem value="normal">정상</MenuItem>
              <MenuItem value="late">지각</MenuItem>
              <MenuItem value="early_leave">조퇴</MenuItem>
              <MenuItem value="absent">결근</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Checkbox
                checked={editForm.isConfirmed}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, isConfirmed: e.target.checked }))
                }
              />
            }
            label="확정됨"
          />
          <TextField
            label="근무 노트"
            value={editForm.note}
            onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
            multiline
            rows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Period Dialog */}
      <Dialog
        open={confirmPeriodOpen}
        onClose={() => setConfirmPeriodOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>기간 확정</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <TextField
            label="시작일"
            type="date"
            value={confirmStart}
            onChange={(e) => setConfirmStart(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="종료일"
            type="date"
            value={confirmEnd}
            onChange={(e) => setConfirmEnd(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPeriodOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleConfirmPeriod}
            disabled={confirmPeriodMutation.isPending}
          >
            확정 실행
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
