'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Autocomplete from '@mui/material/Autocomplete'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import DownloadIcon from '@mui/icons-material/Download'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import {
  useAttendances,
  useCreateAttendance,
  useUpdateAttendance,
  useUpdateAttendanceBreaks,
  useDeleteAttendance,
  useConfirmPeriod,
  useUnconfirmAttendances,
  type Attendance,
} from '@/lib/query/attendances'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations } from '@/lib/query/organizations'
import { useAuthStore } from '@/stores/auth.store'
import { ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'

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

const BREAK_TYPE_LABEL: Record<string, string> = {
  rest: '휴게',
  meal: '식사',
  other: '기타',
}

function getThisMonthRange() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate()
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDay}` }
}

function toDatetimeLocal(iso?: string | null) {
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
  note: string
}

interface BreakRow {
  id?: string
  breakType: string
  startAt: string
  endAt: string
}

interface CreateForm {
  employeeId: string
  clockInAt: string
  clockOutAt: string
  status: string // '' = 자동 판정
  note: string
}

const EMPTY_CREATE_FORM: CreateForm = {
  employeeId: '',
  clockInAt: '',
  clockOutAt: '',
  status: '',
  note: '',
}

export default function AttendancesPage() {
  const defaultRange = getThisMonthRange()
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [orgId, setOrgId] = useState<string | undefined>(undefined)
  const [missingOnly, setMissingOnly] = useState(false)
  const [queryParams, setQueryParams] = useState<Record<string, string | undefined>>({
    startDate: defaultRange.start,
    endDate: defaultRange.end,
  })

  const { data: rawData, isLoading } = useAttendances(queryParams)
  const { data: orgs = [] } = useOrganizations()
  const { data: employeesData } = useEmployees({ limit: 200 })
  const employees = employeesData?.items ?? []

  const createMutation = useCreateAttendance()
  const updateMutation = useUpdateAttendance()
  const updateBreaksMutation = useUpdateAttendanceBreaks()
  const deleteMutation = useDeleteAttendance()
  const confirmPeriodMutation = useConfirmPeriod()
  const unconfirmMutation = useUnconfirmAttendances()

  const { user } = useAuthStore()
  const canUnconfirm =
    !!user &&
    ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY.GENERAL_ADMIN

  const records: Attendance[] = Array.isArray(rawData)
    ? rawData
    : (rawData as { items?: Attendance[] })?.items ?? []

  // ── 다중 선택 ───────────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const visibleIds = records.map((r) => r.id)
  const selectedVisible = selectedIds.filter((id) => visibleIds.includes(id))
  const isAllSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length

  function toggleSelectAll() {
    setSelectedIds(isAllSelected ? [] : visibleIds)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    )
  }

  // ── 다이얼로그 상태 ─────────────────────────────────────────────────────────
  const [editRow, setEditRow] = useState<Attendance | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    clockInAt: '',
    clockOutAt: '',
    status: 'normal',
    note: '',
  })
  const [breakRows, setBreakRows] = useState<BreakRow[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM)

  const [confirmPeriodOpen, setConfirmPeriodOpen] = useState(false)
  const [confirmStart, setConfirmStart] = useState(defaultRange.start)
  const [confirmEnd, setConfirmEnd] = useState(defaultRange.end)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  function openEdit(row: Attendance) {
    setEditRow(row)
    setEditForm({
      clockInAt: toDatetimeLocal(row.clockInAt),
      clockOutAt: toDatetimeLocal(row.clockOutAt),
      status: row.status,
      note: row.note ?? '',
    })
    setBreakRows(
      (row.breaks ?? []).map((b) => ({
        id: b.id,
        breakType: b.breakType,
        startAt: toDatetimeLocal(b.startAt),
        endAt: toDatetimeLocal(b.endAt),
      })),
    )
  }

  function handleSearch() {
    setSelectedIds([])
    setQueryParams({
      startDate,
      endDate,
      organizationId: orgId,
      ...(missingOnly ? { missingClockOut: 'true' } : {}),
    })
  }

  function handleMissingToggle(checked: boolean) {
    setMissingOnly(checked)
    setSelectedIds([])
    setQueryParams((prev) => {
      const next = { ...prev }
      if (checked) next.missingClockOut = 'true'
      else delete next.missingClockOut
      return next
    })
  }

  // ── 저장 (수정 + 휴게 교체) ─────────────────────────────────────────────────
  async function handleSave() {
    if (!editRow) return
    try {
      await updateMutation.mutateAsync({
        id: editRow.id,
        clockInAt: editForm.clockInAt ? new Date(editForm.clockInAt).toISOString() : undefined,
        clockOutAt: editForm.clockOutAt ? new Date(editForm.clockOutAt).toISOString() : undefined,
        status: editForm.status,
        note: editForm.note || undefined,
      })
      await updateBreaksMutation.mutateAsync({
        id: editRow.id,
        breaks: breakRows
          .filter((b) => b.startAt)
          .map((b) => ({
            id: b.id,
            breakType: b.breakType,
            startAt: new Date(b.startAt).toISOString(),
            endAt: b.endAt ? new Date(b.endAt).toISOString() : undefined,
          })),
      })
      setEditRow(null)
      showSnack('저장되었습니다.', 'success')
    } catch {
      showSnack('저장에 실패했습니다.', 'error')
    }
  }

  // ── 기록 추가 ───────────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!createForm.employeeId || !createForm.clockInAt) {
      showSnack('직원과 출근 시각을 입력하세요.', 'error')
      return
    }
    try {
      await createMutation.mutateAsync({
        employeeId: createForm.employeeId,
        clockInAt: new Date(createForm.clockInAt).toISOString(),
        clockOutAt: createForm.clockOutAt
          ? new Date(createForm.clockOutAt).toISOString()
          : undefined,
        status: createForm.status || undefined,
        note: createForm.note || undefined,
      })
      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      showSnack('기록이 추가되었습니다.', 'success')
    } catch {
      showSnack('기록 추가에 실패했습니다.', 'error')
    }
  }

  // ── 일괄 작업 ───────────────────────────────────────────────────────────────
  async function handleBulkConfirm() {
    try {
      await confirmPeriodMutation.mutateAsync({ attendanceIds: selectedVisible })
      setSelectedIds([])
      showSnack('선택한 기록이 확정되었습니다.', 'success')
    } catch {
      showSnack('일괄 확정에 실패했습니다.', 'error')
    }
  }

  async function handleBulkUnconfirm() {
    try {
      await unconfirmMutation.mutateAsync({ attendanceIds: selectedVisible })
      setSelectedIds([])
      showSnack('선택한 기록의 확정이 해제되었습니다.', 'success')
    } catch {
      showSnack('일괄 해제에 실패했습니다.', 'error')
    }
  }

  async function handleBulkDelete() {
    if (!window.confirm(`선택한 ${selectedVisible.length}건을 삭제하시겠습니까?`)) return
    const results = await Promise.allSettled(
      selectedVisible.map((id) => deleteMutation.mutateAsync(id)),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    setSelectedIds([])
    if (failed > 0) {
      showSnack(`${results.length - failed}건 삭제, ${failed}건 실패 (확정 기록은 삭제할 수 없습니다)`, 'error')
    } else {
      showSnack('선택한 기록이 삭제되었습니다.', 'success')
    }
  }

  async function handleUnconfirm(row: Attendance) {
    try {
      await unconfirmMutation.mutateAsync({ attendanceIds: [row.id] })
      showSnack('확정이 해제되었습니다.', 'success')
    } catch {
      showSnack('확정 해제에 실패했습니다.', 'error')
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
      showSnack('기간 확정이 완료되었습니다.', 'success')
    } catch {
      showSnack('기간 확정에 실패했습니다.', 'error')
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

  const isBulkPending =
    confirmPeriodMutation.isPending || unconfirmMutation.isPending || deleteMutation.isPending

  return (
    <>
      <PageHeader
        title="출퇴근 기록"
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              기록 추가
            </Button>
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
        <FormControlLabel
          control={
            <Switch
              checked={missingOnly}
              onChange={(e) => handleMissingToggle(e.target.checked)}
              size="small"
            />
          }
          label="퇴근 누락만"
        />
      </Paper>

      {/* Bulk action toolbar */}
      {selectedVisible.length > 0 && (
        <Toolbar
          variant="dense"
          disableGutters
          sx={{
            mb: 1,
            px: 2,
            gap: 1,
            bgcolor: 'action.selected',
            borderRadius: 1,
            minHeight: 48,
          }}
        >
          <Typography variant="body2" sx={{ flexGrow: 1, fontWeight: 600 }}>
            {selectedVisible.length}건 선택됨
          </Typography>
          <Button
            size="small"
            startIcon={<CheckCircleOutlineIcon />}
            disabled={isBulkPending}
            onClick={handleBulkConfirm}
          >
            일괄 확정
          </Button>
          {canUnconfirm && (
            <Button
              size="small"
              color="warning"
              startIcon={<LockOpenIcon />}
              disabled={isBulkPending}
              onClick={handleBulkUnconfirm}
            >
              일괄 해제
            </Button>
          )}
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={isBulkPending}
            onClick={handleBulkDelete}
          >
            일괄 삭제
          </Button>
        </Toolbar>
      )}

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
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={selectedVisible.length > 0 && !isAllSelected}
                    onChange={toggleSelectAll}
                    inputProps={{ 'aria-label': '전체 선택' }}
                  />
                </TableCell>
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
                  selected={selectedIds.includes(r.id)}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => openEdit(r)}
                >
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      inputProps={{ 'aria-label': '기록 선택' }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{r.employee?.name ?? '—'}</TableCell>
                  <TableCell>{r.clockInAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    {new Date(r.clockInAt).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell>
                    {r.clockOutAt ? (
                      new Date(r.clockOutAt).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    ) : (
                      <Chip label="퇴근 누락" color="warning" size="small" variant="outlined" />
                    )}
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={r.isConfirmed ? '확정' : '미확정'}
                        color={r.isConfirmed ? 'primary' : 'default'}
                        size="small"
                        variant={r.isConfirmed ? 'filled' : 'outlined'}
                      />
                      {r.isConfirmed && canUnconfirm && (
                        <Button
                          size="small"
                          color="warning"
                          disabled={unconfirmMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleUnconfirm(r)
                          }}
                        >
                          확정 해제
                        </Button>
                      )}
                    </Box>
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
          <TextField
            label="근무 노트"
            value={editForm.note}
            onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
            multiline
            rows={2}
            fullWidth
          />

          <Divider />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2">휴게 기록</Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() =>
                setBreakRows((rows) => [
                  ...rows,
                  { breakType: 'rest', startAt: '', endAt: '' },
                ])
              }
            >
              휴게 추가
            </Button>
          </Box>
          {breakRows.length === 0 && (
            <Typography variant="caption" color="text.secondary">
              등록된 휴게 기록이 없습니다.
            </Typography>
          )}
          {breakRows.map((b, idx) => (
            <Box key={b.id ?? `new-${idx}`} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 90 }}>
                <InputLabel>유형</InputLabel>
                <Select
                  value={b.breakType}
                  label="유형"
                  onChange={(e) =>
                    setBreakRows((rows) =>
                      rows.map((row, i) =>
                        i === idx ? { ...row, breakType: e.target.value } : row,
                      ),
                    )
                  }
                >
                  {Object.entries(BREAK_TYPE_LABEL).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="시작"
                type="datetime-local"
                size="small"
                value={b.startAt}
                onChange={(e) =>
                  setBreakRows((rows) =>
                    rows.map((row, i) => (i === idx ? { ...row, startAt: e.target.value } : row)),
                  )
                }
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <TextField
                label="종료"
                type="datetime-local"
                size="small"
                value={b.endAt}
                onChange={(e) =>
                  setBreakRows((rows) =>
                    rows.map((row, i) => (i === idx ? { ...row, endAt: e.target.value } : row)),
                  )
                }
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1 }}
              />
              <IconButton
                size="small"
                aria-label="휴게 삭제"
                onClick={() => setBreakRows((rows) => rows.filter((_, i) => i !== idx))}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={updateMutation.isPending || updateBreaksMutation.isPending}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>출퇴근 기록 추가</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}
        >
          <Autocomplete
            options={employees}
            getOptionLabel={(e) =>
              e.employeeNumber ? `${e.name} (${e.employeeNumber})` : e.name
            }
            value={employees.find((e) => e.id === createForm.employeeId) ?? null}
            onChange={(_, v) => setCreateForm((f) => ({ ...f, employeeId: v?.id ?? '' }))}
            renderInput={(params) => <TextField {...params} label="직원" required />}
          />
          <TextField
            label="출근 시각"
            type="datetime-local"
            value={createForm.clockInAt}
            onChange={(e) => setCreateForm((f) => ({ ...f, clockInAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
          />
          <TextField
            label="퇴근 시각 (선택)"
            type="datetime-local"
            value={createForm.clockOutAt}
            onChange={(e) => setCreateForm((f) => ({ ...f, clockOutAt: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>상태</InputLabel>
            <Select
              value={createForm.status}
              label="상태"
              onChange={(e) => setCreateForm((f) => ({ ...f, status: e.target.value }))}
            >
              <MenuItem value="">자동 판정</MenuItem>
              <MenuItem value="normal">정상</MenuItem>
              <MenuItem value="late">지각</MenuItem>
              <MenuItem value="early_leave">조퇴</MenuItem>
              <MenuItem value="absent">결근</MenuItem>
              <MenuItem value="oncall">무일정</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="근무 노트"
            value={createForm.note}
            onChange={(e) => setCreateForm((f) => ({ ...f, note: e.target.value }))}
            multiline
            rows={2}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>취소</Button>
          <Button variant="contained" onClick={handleCreate} disabled={createMutation.isPending}>
            추가
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
