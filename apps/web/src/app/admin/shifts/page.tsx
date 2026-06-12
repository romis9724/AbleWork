'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Autocomplete from '@mui/material/Autocomplete'
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
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CalendarViewWeekOutlinedIcon from '@mui/icons-material/CalendarViewWeekOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import FilterListIcon from '@mui/icons-material/FilterList'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd'
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import { useSnackbar } from '@/hooks/useSnackbar'
import {
  useShifts,
  useShiftTypes,
  useShiftTemplates,
  useCreateShift,
  useUpdateShift,
  useConfirmShift,
  useUnconfirmShift,
  type Shift,
} from '@/lib/query/shifts'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations } from '@/lib/query/organizations'
import { useAuthStore } from '@/stores/auth.store'
import { ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import WeeklyCalendar, { addDays, getMonday, toLocalDateStr } from './WeeklyCalendar'
import BulkCreateDialog from './BulkCreateDialog'

const STATUS_LABEL: Record<string, string> = {
  confirmed: '확정', pending: '미확정', draft: '임시',
}
const STATUS_COLOR: Record<string, 'success' | 'warning' | 'default'> = {
  confirmed: 'success', pending: 'warning', draft: 'default',
}

function formatDateKR(iso: string) {
  return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}
function formatTimeKR(iso: string) {
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
}
/** ISO 문자열 → 24시간 HH:MM (폼 입력용, TIME_REGEX 호환) */
function toHHMM(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const today = new Date().toISOString().split('T')[0]
const weekLater = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

const shiftSchema = z
  .object({
    employeeId: z.string().min(1, '직원을 선택해주세요'),
    organizationId: z.string().min(1, '조직을 선택해주세요'),
    date: z.string().min(1, '날짜를 선택해주세요'),
    templateId: z.string().optional(),
    startTime: z.string().regex(TIME_REGEX, 'HH:MM 형식으로 입력해주세요').optional().or(z.literal('')),
    endTime: z.string().regex(TIME_REGEX, 'HH:MM 형식으로 입력해주세요').optional().or(z.literal('')),
    shiftTypeId: z.string().min(1, '근무 유형을 선택해주세요'),
  })
  .superRefine((values, ctx) => {
    if (!values.templateId) {
      if (!values.startTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['startTime'], message: '시작 시간을 입력해주세요' })
      }
      if (!values.endTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endTime'], message: '종료 시간을 입력해주세요' })
      }
    }
  })

type ShiftFormValues = z.infer<typeof shiftSchema>

interface DialogState {
  open: boolean
  editing: Shift | null
}

type ViewMode = 'calendar' | 'list'

export default function ShiftsPage() {
  const [view, setView] = useState<ViewMode>('list')
  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()))
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(weekLater)
  const [orgFilter, setOrgFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [dialog, setDialog] = useState<DialogState>({ open: false, editing: null })
  const [bulkOpen, setBulkOpen] = useState(false)

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  const { user } = useAuthStore()
  const canUnconfirm =
    !!user &&
    ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY.GENERAL_ADMIN

  // BE ShiftFilterDto는 startAt/endAt (YYYY-MM-DD) 파라미터를 사용
  // 달력 뷰는 현재 주(월~일), 목록 뷰는 필터의 기간을 따른다
  const shiftsParams: Record<string, string | undefined> = {
    startAt: view === 'calendar' ? toLocalDateStr(weekStart) : startDate,
    endAt: view === 'calendar' ? toLocalDateStr(addDays(weekStart, 6)) : endDate,
    ...(orgFilter ? { organizationId: orgFilter } : {}),
  }

  const { data: shifts = [], isLoading: loadingShifts } = useShifts(shiftsParams)
  const { data: shiftTypes = [] } = useShiftTypes()
  const { data: templates = [] } = useShiftTemplates()
  const { data: employeeData } = useEmployees()
  const employees = employeeData?.items ?? []
  const { data: organizations = [] } = useOrganizations()

  // 달력 행: 조직 필터가 있으면 해당 조직 소속 직원만 표시
  const calendarEmployees = orgFilter
    ? employees.filter((e) =>
        e.organizations?.some((o) => o.organization.id === orgFilter),
      )
    : employees

  const createMutation = useCreateShift()
  const updateMutation = useUpdateShift()
  const confirmMutation = useConfirmShift()
  const unconfirmMutation = useUnconfirmShift()

  const { control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      employeeId: '',
      organizationId: '',
      date: today,
      templateId: '',
      startTime: '',
      endTime: '',
      shiftTypeId: '',
    },
  })

  const selectedTemplate = watch('templateId')

  const openCreate = () => {
    reset({ employeeId: '', organizationId: '', date: today, templateId: '', startTime: '', endTime: '', shiftTypeId: '' })
    setDialog({ open: true, editing: null })
  }

  /** 달력 셀 클릭 — 직원/날짜 프리필 생성 (직원의 대표 조직 자동 선택) */
  const openCreateAt = (employeeId: string, date: string) => {
    const employee = employees.find((e) => e.id === employeeId)
    const primaryOrgId =
      employee?.organizations?.find((o) => o.isPrimary)?.organization.id ??
      employee?.organizations?.[0]?.organization.id ??
      orgFilter ??
      ''
    reset({ employeeId, organizationId: primaryOrgId, date, templateId: '', startTime: '', endTime: '', shiftTypeId: '' })
    setDialog({ open: true, editing: null })
  }

  const openEdit = (shift: Shift) => {
    const date = shift.startAt.split('T')[0]
    reset({
      employeeId: shift.employeeId,
      organizationId: shift.organizationId,
      date,
      templateId: '',
      startTime: toHHMM(shift.startAt),
      endTime: toHHMM(shift.endAt),
      shiftTypeId: shift.shiftType?.id ?? '',
    })
    setDialog({ open: true, editing: shift })
  }

  const closeDialog = () => setDialog({ open: false, editing: null })

  const onSubmit = async (values: ShiftFormValues) => {
    const template = templates.find((t) => t.id === values.templateId)

    const startTime = template ? template.startTime : values.startTime
    const endTime = template ? template.endTime : values.endTime
    // BE CreateShiftSchema는 ISO 8601(datetime) 형식 요구 → 로컬 시간 기준 ISO 변환
    const resolvedStart = new Date(`${values.date}T${startTime}:00`).toISOString()
    const resolvedEnd = new Date(`${values.date}T${endTime}:00`).toISOString()

    const payload = {
      employeeId: values.employeeId,
      organizationId: values.organizationId,
      shiftTypeId: values.shiftTypeId,
      startAt: resolvedStart,
      endAt: resolvedEnd,
      ...(values.templateId ? { templateId: values.templateId } : {}),
    }

    try {
      if (dialog.editing) {
        await updateMutation.mutateAsync({ id: dialog.editing.id, ...payload })
        showSnackbar('근무일정이 수정되었습니다.')
      } else {
        const result = await createMutation.mutateAsync(payload)
        if (result.warning) {
          showSnackbar(result.warning, 'warning')
        } else {
          showSnackbar('근무일정이 추가되었습니다.')
        }
      }
      closeDialog()
    } catch {
      showSnackbar('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleConfirmSelected = async () => {
    if (selected.size === 0) return
    try {
      const results = await Promise.all([...selected].map((id) => confirmMutation.mutateAsync(id)))
      const warnings = results.map((r) => r.warning).filter((w): w is string => !!w)
      if (warnings.length > 0) {
        showSnackbar(`${selected.size}건 확정 완료 — ${warnings[0]}`, 'warning')
      } else {
        showSnackbar(`${selected.size}건이 확정되었습니다.`)
      }
      setSelected(new Set())
    } catch {
      showSnackbar('확정 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleUnconfirm = async (shift: Shift) => {
    try {
      await unconfirmMutation.mutateAsync(shift.id)
      showSnackbar('확정이 해제되었습니다.')
    } catch {
      showSnackbar('확정 해제 중 오류가 발생했습니다.', 'error')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === shifts.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(shifts.map((s) => s.id)))
    }
  }

  const pendingShifts = (shifts as Shift[]).filter(
    (s) => selected.has(s.id) && s.status !== 'confirmed',
  )

  return (
    <>
      <PageHeader
        title="근무일정 관리"
        subtitle="직원별 근무일정을 조회하고 관리합니다."
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<PlaylistAddIcon />} onClick={() => setBulkOpen(true)}>
              일괄 생성
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              근무일정 추가
            </Button>
          </Box>
        }
      />

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <FilterListIcon sx={{ color: 'text.secondary' }} />
        {view === 'list' && (
          <>
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
          </>
        )}
        <Autocomplete
          size="small"
          options={organizations}
          getOptionLabel={(o) => o.name}
          value={organizations.find((o) => o.id === orgFilter) ?? null}
          onChange={(_, val) => setOrgFilter(val?.id ?? null)}
          renderInput={(params) => <TextField {...params} label="조직" />}
          sx={{ width: 200 }}
          clearOnEscape
        />
        <Box sx={{ flexGrow: 1 }} />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_, next: ViewMode | null) => {
            if (next) setView(next)
          }}
          aria-label="보기 전환"
        >
          <ToggleButton value="calendar" aria-label="주간 달력">
            <CalendarViewWeekOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} />
            주간 달력
          </ToggleButton>
          <ToggleButton value="list" aria-label="목록">
            <TableRowsOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} />
            목록
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      {/* Bulk action bar */}
      {view === 'list' && selected.size > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, px: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {selected.size}건 선택됨
          </Typography>
          <Tooltip title={pendingShifts.length === 0 ? '이미 모두 확정된 일정입니다' : ''}>
            <span>
              <Button
                size="small"
                variant="outlined"
                color="success"
                startIcon={<CheckCircleOutlineIcon />}
                onClick={handleConfirmSelected}
                disabled={pendingShifts.length === 0 || confirmMutation.isPending}
              >
                확정하기
              </Button>
            </span>
          </Tooltip>
          <Button size="small" onClick={() => setSelected(new Set())}>
            선택 해제
          </Button>
        </Box>
      )}

      {view === 'calendar' ? (
        loadingShifts ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <WeeklyCalendar
            weekStart={weekStart}
            shifts={shifts as Shift[]}
            employees={calendarEmployees}
            canUnconfirm={canUnconfirm}
            isUnconfirming={unconfirmMutation.isPending}
            onWeekChange={setWeekStart}
            onCellClick={openCreateAt}
            onShiftClick={openEdit}
            onUnconfirm={handleUnconfirm}
          />
        )
      ) : loadingShifts ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : shifts.length === 0 ? (
        <EmptyState
          message="해당 기간에 근무일정이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              근무일정 추가
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.size > 0 && selected.size < shifts.length}
                    checked={shifts.length > 0 && selected.size === shifts.length}
                    onChange={toggleSelectAll}
                    size="small"
                  />
                </TableCell>
                <TableCell>직원명</TableCell>
                <TableCell>날짜</TableCell>
                <TableCell>근무 유형</TableCell>
                <TableCell>시작 — 종료</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(shifts as Shift[]).map((shift) => (
                <TableRow
                  key={shift.id}
                  hover
                  selected={selected.has(shift.id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.has(shift.id)}
                      onChange={() => toggleSelect(shift.id)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>
                    {shift.employee?.name ?? '—'}
                  </TableCell>
                  <TableCell>{formatDateKR(shift.startAt)}</TableCell>
                  <TableCell>
                    {shift.shiftType ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {shift.shiftType.color && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: shift.shiftType.color,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Typography variant="body2">{shift.shiftType.name}</Typography>
                      </Box>
                    ) : shift.template ? (
                      <Typography variant="body2" color="text.secondary">{shift.template.name}</Typography>
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {formatTimeKR(shift.startAt)} — {formatTimeKR(shift.endAt)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABEL[shift.status] ?? shift.status}
                      color={STATUS_COLOR[shift.status] ?? 'default'}
                      size="small"
                      variant={shift.status === 'confirmed' ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="right">
                    {shift.status === 'confirmed' && canUnconfirm && (
                      <Tooltip title="확정 해제">
                        <span>
                          <IconButton
                            size="small"
                            color="warning"
                            onClick={() => handleUnconfirm(shift)}
                            disabled={unconfirmMutation.isPending}
                          >
                            <LockOpenIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    <IconButton size="small" onClick={() => openEdit(shift)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.editing ? '근무일정 수정' : '근무일정 추가'}</DialogTitle>
        <DialogContent dividers>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            <Controller
              name="employeeId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={employees}
                  getOptionLabel={(e) => e.name}
                  value={employees.find((e) => e.id === field.value) ?? null}
                  onChange={(_, val) => field.onChange(val?.id ?? '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="직원"
                      required
                      error={!!errors.employeeId}
                      helperText={errors.employeeId?.message}
                    />
                  )}
                />
              )}
            />

            <Controller
              name="organizationId"
              control={control}
              render={({ field }) => (
                <Autocomplete
                  options={organizations}
                  getOptionLabel={(o) => o.name}
                  value={organizations.find((o) => o.id === field.value) ?? null}
                  onChange={(_, val) => field.onChange(val?.id ?? '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="조직"
                      required
                      error={!!errors.organizationId}
                      helperText={errors.organizationId?.message}
                    />
                  )}
                />
              )}
            />

            <Controller
              name="date"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="날짜"
                  type="date"
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  error={!!errors.date}
                  helperText={errors.date?.message}
                />
              )}
            />

            <Divider>
              <Typography variant="caption" color="text.secondary">템플릿 또는 직접 입력</Typography>
            </Divider>

            <Controller
              name="templateId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="근무일정 템플릿"
                  fullWidth
                  onChange={(e) => {
                    field.onChange(e.target.value)
                    const tmpl = templates.find((t) => t.id === e.target.value)
                    if (tmpl) {
                      setValue('startTime', tmpl.startTime)
                      setValue('endTime', tmpl.endTime)
                      if (tmpl.shiftTypeId) setValue('shiftTypeId', tmpl.shiftTypeId)
                    }
                  }}
                >
                  <MenuItem value=""><em>템플릿 없이 직접 입력</em></MenuItem>
                  {templates.map((tmpl) => (
                    <MenuItem key={tmpl.id} value={tmpl.id}>
                      {tmpl.name} ({tmpl.startTime}–{tmpl.endTime})
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Controller
                name="startTime"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="시작 시간"
                    fullWidth
                    placeholder="09:00"
                    disabled={!!selectedTemplate}
                    error={!!errors.startTime}
                    helperText={errors.startTime?.message ?? 'HH:MM'}
                  />
                )}
              />
              <Controller
                name="endTime"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="종료 시간"
                    fullWidth
                    placeholder="18:00"
                    disabled={!!selectedTemplate}
                    error={!!errors.endTime}
                    helperText={errors.endTime?.message ?? 'HH:MM'}
                  />
                )}
              />
            </Box>

            <Controller
              name="shiftTypeId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="근무 유형"
                  required
                  fullWidth
                  error={!!errors.shiftTypeId}
                  helperText={errors.shiftTypeId?.message}
                >
                  <MenuItem value=""><em>선택하세요</em></MenuItem>
                  {shiftTypes.map((type) => (
                    <MenuItem key={type.id} value={type.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {type.color && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: type.color,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {type.name}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={isSubmitting}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {dialog.editing ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 일괄 생성 다이얼로그 */}
      <BulkCreateDialog
        open={bulkOpen}
        templates={templates}
        organizations={organizations}
        defaultStartDate={view === 'calendar' ? toLocalDateStr(weekStart) : startDate}
        defaultEndDate={view === 'calendar' ? toLocalDateStr(addDays(weekStart, 6)) : endDate}
        onClose={() => setBulkOpen(false)}
        onResult={showSnackbar}
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
