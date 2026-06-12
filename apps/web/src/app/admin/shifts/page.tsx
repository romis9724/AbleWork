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
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import FilterListIcon from '@mui/icons-material/FilterList'
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
  type Shift,
} from '@/lib/query/shifts'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations } from '@/lib/query/organizations'

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

const today = new Date().toISOString().split('T')[0]
const weekLater = new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0]

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

const shiftSchema = z.object({
  employeeId: z.string().min(1, '직원을 선택해주세요'),
  date: z.string().min(1, '날짜를 선택해주세요'),
  templateId: z.string().optional(),
  startTime: z.string().regex(TIME_REGEX, 'HH:MM 형식으로 입력해주세요').optional().or(z.literal('')),
  endTime: z.string().regex(TIME_REGEX, 'HH:MM 형식으로 입력해주세요').optional().or(z.literal('')),
  shiftTypeId: z.string().optional(),
})

type ShiftFormValues = z.infer<typeof shiftSchema>

interface DialogState {
  open: boolean
  editing: Shift | null
}

export default function ShiftsPage() {
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(weekLater)
  const [orgFilter, setOrgFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [dialog, setDialog] = useState<DialogState>({ open: false, editing: null })

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  const shiftsParams: Record<string, string | undefined> = {
    startDate,
    endDate,
    ...(orgFilter ? { organizationId: orgFilter } : {}),
  }

  const { data: shifts = [], isLoading: loadingShifts } = useShifts(shiftsParams)
  const { data: shiftTypes = [] } = useShiftTypes()
  const { data: templates = [] } = useShiftTemplates()
  const { data: employeeData } = useEmployees()
  const employees = employeeData?.items ?? []
  const { data: organizations = [] } = useOrganizations()

  const createMutation = useCreateShift()
  const updateMutation = useUpdateShift()
  const confirmMutation = useConfirmShift()

  const { control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ShiftFormValues>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      employeeId: '',
      date: today,
      templateId: '',
      startTime: '',
      endTime: '',
      shiftTypeId: '',
    },
  })

  const selectedTemplate = watch('templateId')

  const openCreate = () => {
    reset({ employeeId: '', date: today, templateId: '', startTime: '', endTime: '', shiftTypeId: '' })
    setDialog({ open: true, editing: null })
  }

  const openEdit = (shift: Shift) => {
    const date = shift.startAt.split('T')[0]
    const startTime = formatTimeKR(shift.startAt)
    const endTime = formatTimeKR(shift.endAt)
    reset({
      employeeId: shift.employeeId,
      date,
      templateId: '',
      startTime,
      endTime,
      shiftTypeId: shift.shiftType?.id ?? '',
    })
    setDialog({ open: true, editing: shift })
  }

  const closeDialog = () => setDialog({ open: false, editing: null })

  const onSubmit = async (values: ShiftFormValues) => {
    const template = templates.find((t) => t.id === values.templateId)

    const resolvedStart = template ? `${values.date}T${template.startTime}:00` : `${values.date}T${values.startTime}:00`
    const resolvedEnd = template ? `${values.date}T${template.endTime}:00` : `${values.date}T${values.endTime}:00`

    const payload = {
      employeeId: values.employeeId,
      startAt: resolvedStart,
      endAt: resolvedEnd,
      ...(values.templateId ? { templateId: values.templateId } : {}),
      ...(values.shiftTypeId ? { shiftTypeId: values.shiftTypeId } : {}),
    }

    try {
      if (dialog.editing) {
        await updateMutation.mutateAsync({ id: dialog.editing.id, ...payload })
        showSnackbar('근무일정이 수정되었습니다.')
      } else {
        await createMutation.mutateAsync(payload)
        showSnackbar('근무일정이 추가되었습니다.')
      }
      closeDialog()
    } catch {
      showSnackbar('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleConfirmSelected = async () => {
    if (selected.size === 0) return
    try {
      await Promise.all([...selected].map((id) => confirmMutation.mutateAsync(id)))
      showSnackbar(`${selected.size}건이 확정되었습니다.`)
      setSelected(new Set())
    } catch {
      showSnackbar('확정 중 오류가 발생했습니다.', 'error')
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            근무일정 추가
          </Button>
        }
      />

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider', p: 2, mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <FilterListIcon sx={{ color: 'text.secondary' }} />
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
          options={organizations}
          getOptionLabel={(o) => o.name}
          value={organizations.find((o) => o.id === orgFilter) ?? null}
          onChange={(_, val) => setOrgFilter(val?.id ?? null)}
          renderInput={(params) => <TextField {...params} label="조직" />}
          sx={{ width: 200 }}
          clearOnEscape
        />
      </Paper>

      {/* Bulk action bar */}
      {selected.size > 0 && (
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

      {loadingShifts ? (
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
                  label="근무 유형 (선택)"
                  fullWidth
                >
                  <MenuItem value=""><em>없음</em></MenuItem>
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
