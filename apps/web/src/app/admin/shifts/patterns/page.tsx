'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import IconButton from '@mui/material/IconButton'
import Grid from '@mui/material/Grid'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import apiClient from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error'
import { useShiftTemplates } from '@/lib/query/shifts'
import { useEmployees, type Employee } from '@/lib/query/employees'

interface SchedulePattern {
  id: string
  name: string
  description?: string
  repeatCycleDays: number
  /** 날짜 인덱스(0-based 문자열) → shiftTemplateId. 키가 없는 인덱스는 휴무 */
  patternDefinition: Record<string, string>
  holidayHandling: string
  isActive: boolean
}

const HOLIDAY_OPTS = [
  { value: 'skip_and_shift', label: '휴일 건너뛰고 패턴 밀기' },
  { value: 'skip_and_keep', label: '휴일 건너뛰고 패턴 유지' },
  { value: 'no_skip', label: '휴일 건너뛰지 않음' },
]

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const REST_VALUE = '' // 휴무 — patternDefinition에서 키 제외
const DEFAULT_CYCLE = '7'
const MAX_EDITABLE_CYCLE_DAYS = 56

const todayStr = new Date().toISOString().split('T')[0]

/** dayTemplates 배열(''=휴무) → BE patternDefinition(JSONB) */
function toPatternDefinition(dayTemplates: string[]): Record<string, string> {
  return dayTemplates.reduce<Record<string, string>>((acc, templateId, index) => {
    if (!templateId) return acc
    return { ...acc, [String(index)]: templateId }
  }, {})
}

/** BE patternDefinition → 길이 cycleDays의 dayTemplates 배열 */
function toDayTemplates(definition: Record<string, string> | undefined, cycleDays: number): string[] {
  return Array.from({ length: cycleDays }, (_, i) => definition?.[String(i)] ?? REST_VALUE)
}

function dayLabel(index: number, cycleDays: number): string {
  if (cycleDays === 7) return `${index + 1}일차 (${WEEKDAY_LABELS[index]})`
  return `${index + 1}일차`
}

export default function SchedulePatternsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SchedulePattern | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [cycle, setCycle] = useState(DEFAULT_CYCLE)
  const [holiday, setHoliday] = useState('no_skip')
  const [dayTemplates, setDayTemplates] = useState<string[]>(toDayTemplates(undefined, 7))
  const [deleteTarget, setDeleteTarget] = useState<SchedulePattern | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' | 'warning' }>({ open: false, msg: '', sev: 'success' })

  // 패턴 적용 다이얼로그 상태
  const [applyTarget, setApplyTarget] = useState<SchedulePattern | null>(null)
  const [applyEmployees, setApplyEmployees] = useState<Employee[]>([])
  const [applyStart, setApplyStart] = useState(todayStr)
  const [applyEnd, setApplyEnd] = useState(todayStr)

  const { data: patterns = [], isLoading } = useQuery<SchedulePattern[]>({
    queryKey: ['schedule-patterns'],
    queryFn: () => apiClient.get('/schedule-patterns') as Promise<SchedulePattern[]>,
    staleTime: 60_000,
  })

  const { data: templates = [] } = useShiftTemplates()
  const { data: employeeData } = useEmployees({ excludeSuperAdmin: true })
  const employees = employeeData?.items ?? []

  const createMutation = useMutation({
    mutationFn: (d: unknown) => apiClient.post('/schedule-patterns', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-patterns'] }); setOpen(false); setSnack({ open: true, msg: '패턴이 추가됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & Record<string, unknown>) =>
      apiClient.patch(`/schedule-patterns/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-patterns'] }); setOpen(false); setSnack({ open: true, msg: '패턴이 수정됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schedule-patterns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-patterns'] }); setDeleteTarget(null); setSnack({ open: true, msg: '삭제됐습니다.', sev: 'success' }) },
    onError: (e) => setSnack({ open: true, msg: getApiErrorMessage(e, '삭제에 실패했습니다.'), sev: 'error' }),
  })

  const applyMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string; employeeIds: string[]; startDate: string; endDate: string }) =>
      apiClient.post(`/schedule-patterns/${id}/apply`, d) as Promise<{ created: number }>,
    onSuccess: (result) => {
      setApplyTarget(null)
      if (result.created === 0) {
        setSnack({ open: true, msg: '생성된 근무일정이 없습니다. 패턴 정의와 기간을 확인해주세요.', sev: 'warning' })
      } else {
        setSnack({ open: true, msg: `근무일정 ${result.created}건이 생성됐습니다.`, sev: 'success' })
      }
    },
    onError: () => setSnack({ open: true, msg: '패턴 적용에 실패했습니다.', sev: 'error' }),
  })

  const cycleNum = Math.max(1, Math.min(365, Number(cycle) || 1))
  const editableDays = Math.min(cycleNum, MAX_EDITABLE_CYCLE_DAYS)
  const hasAnyTemplate = dayTemplates.some((t) => !!t)

  function handleCycleChange(value: string) {
    setCycle(value)
    const next = Math.max(1, Math.min(365, Number(value) || 1))
    // 기존 선택값을 보존하면서 길이만 조정
    setDayTemplates((prev) => Array.from({ length: next }, (_, i) => prev[i] ?? REST_VALUE))
  }

  function setDayTemplate(index: number, templateId: string) {
    setDayTemplates((prev) => prev.map((t, i) => (i === index ? templateId : t)))
  }

  function handleSave() {
    if (!name.trim() || !hasAnyTemplate) return
    const payload = {
      name: name.trim(),
      description: desc.trim() || undefined,
      repeatCycleDays: cycleNum,
      holidayHandling: holiday,
      patternDefinition: toPatternDefinition(dayTemplates),
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, ...payload })
    } else {
      createMutation.mutate({ ...payload, isActive: true })
    }
  }

  function openAdd() {
    setEditTarget(null)
    setName(''); setDesc(''); setCycle(DEFAULT_CYCLE); setHoliday('no_skip')
    setDayTemplates(toDayTemplates(undefined, 7))
    setOpen(true)
  }

  function openEdit(p: SchedulePattern) {
    setEditTarget(p)
    setName(p.name); setDesc(p.description ?? ''); setCycle(String(p.repeatCycleDays)); setHoliday(p.holidayHandling)
    setDayTemplates(toDayTemplates(p.patternDefinition, p.repeatCycleDays))
    setOpen(true)
  }

  function openApply(p: SchedulePattern) {
    setApplyTarget(p)
    setApplyEmployees([])
    setApplyStart(todayStr)
    setApplyEnd(todayStr)
  }

  const applyValid =
    applyEmployees.length > 0 && !!applyStart && !!applyEnd && applyStart <= applyEnd

  function handleApply() {
    if (!applyTarget || !applyValid) return
    applyMutation.mutate({
      id: applyTarget.id,
      employeeIds: applyEmployees.map((e) => e.id),
      startDate: applyStart,
      endDate: applyEnd,
    })
  }

  function templateName(id: string) {
    return templates.find((t) => t.id === id)?.name ?? '—'
  }

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <PageHeader title="스케줄 패턴" actions={<Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>패턴 추가</Button>} />
      {patterns.length === 0 ? (
        <EmptyState message="등록된 스케줄 패턴이 없습니다." action={<Button variant="outlined" onClick={openAdd}>첫 패턴 추가</Button>} />
      ) : (
        <Grid container spacing={2}>
          {patterns.map(p => (
            <Grid item xs={12} sm={6} md={4} key={p.id}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography fontWeight={700}>{p.name}</Typography>
                  {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={`${p.repeatCycleDays}일 주기`} size="small" />
                    <Chip
                      label={`근무 ${Object.keys(p.patternDefinition ?? {}).length}일 / 휴무 ${p.repeatCycleDays - Object.keys(p.patternDefinition ?? {}).length}일`}
                      size="small"
                      variant="outlined"
                    />
                    <Chip label={HOLIDAY_OPTS.find(o => o.value === p.holidayHandling)?.label ?? p.holidayHandling} size="small" variant="outlined" />
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                  <Button size="small" startIcon={<PlayArrowIcon />} onClick={() => openApply(p)}>적용</Button>
                  <IconButton size="small" onClick={() => openEdit(p)}><EditOutlinedIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}><DeleteIcon fontSize="small" /></IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 추가 / 수정 다이얼로그 */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? '스케줄 패턴 수정' : '스케줄 패턴 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="패턴명" required value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus />
          <TextField label="설명" value={desc} onChange={e => setDesc(e.target.value)} fullWidth />
          <TextField label="반복 주기 (일)" type="number" value={cycle} onChange={e => handleCycleChange(e.target.value)} inputProps={{ min: 1, max: 365 }} fullWidth />
          <TextField label="휴일 처리" select value={holiday} onChange={e => setHoliday(e.target.value)} fullWidth>
            {HOLIDAY_OPTS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>

          <Divider>
            <Typography variant="caption" color="text.secondary">일자별 근무 템플릿</Typography>
          </Divider>
          <Typography variant="caption" color="text.secondary">
            1일차 = 패턴 적용 시작일. {cycleNum === 7 ? '7일 주기는 적용 시작일을 월요일로 설정하면 요일과 일치합니다.' : ''}
          </Typography>
          {Array.from({ length: editableDays }, (_, i) => (
            <TextField
              key={i}
              select
              size="small"
              label={dayLabel(i, cycleNum)}
              value={dayTemplates[i] ?? REST_VALUE}
              onChange={(e) => setDayTemplate(i, e.target.value)}
              fullWidth
            >
              <MenuItem value={REST_VALUE}><em>휴무</em></MenuItem>
              {templates.map((tmpl) => (
                <MenuItem key={tmpl.id} value={tmpl.id}>
                  {tmpl.name} ({tmpl.startTime}–{tmpl.endTime})
                </MenuItem>
              ))}
            </TextField>
          ))}
          {cycleNum > MAX_EDITABLE_CYCLE_DAYS && (
            <Alert severity="info">
              {MAX_EDITABLE_CYCLE_DAYS}일차까지만 편집할 수 있습니다. 이후 일차는 휴무로 저장됩니다.
            </Alert>
          )}
          {!hasAnyTemplate && (
            <Alert severity="warning">최소 1일 이상 근무 템플릿을 지정해주세요.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>취소</Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!name.trim() || !hasAnyTemplate || createMutation.isPending || updateMutation.isPending}
          >
            {editTarget ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 패턴 적용 다이얼로그 */}
      <Dialog open={!!applyTarget} onClose={() => setApplyTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>패턴 적용 — {applyTarget?.name}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
          <Typography variant="body2" color="text.secondary">
            선택한 직원의 대표 조직 기준으로, 기간 내 패턴 정의에 따라 근무일정(임시 상태)이 생성됩니다.
            휴일 처리: {HOLIDAY_OPTS.find(o => o.value === applyTarget?.holidayHandling)?.label ?? '—'}
          </Typography>
          {applyTarget && Object.keys(applyTarget.patternDefinition ?? {}).length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {Object.entries(applyTarget.patternDefinition).map(([idx, tmplId]) => (
                <Chip key={idx} size="small" variant="outlined" label={`${Number(idx) + 1}일차 ${templateName(tmplId)}`} />
              ))}
            </Box>
          )}
          <Autocomplete
            multiple
            options={employees}
            getOptionLabel={(e) => e.name}
            value={applyEmployees}
            onChange={(_, val) => setApplyEmployees(val)}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField {...params} label="직원 (다중 선택)" required helperText={`${applyEmployees.length}명 선택됨`} />
            )}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="시작일"
              type="date"
              required
              fullWidth
              value={applyStart}
              onChange={(e) => setApplyStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="종료일"
              type="date"
              required
              fullWidth
              value={applyEnd}
              onChange={(e) => setApplyEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={!!applyStart && !!applyEnd && applyStart > applyEnd}
              helperText={!!applyStart && !!applyEnd && applyStart > applyEnd ? '종료일은 시작일 이후여야 합니다' : undefined}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApplyTarget(null)} disabled={applyMutation.isPending}>취소</Button>
          <Button variant="contained" onClick={handleApply} disabled={!applyValid || applyMutation.isPending}>
            {applyMutation.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            적용
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} title="패턴 삭제" message={`"${deleteTarget?.name}"을 삭제하시겠습니까?`} onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} onCancel={() => setDeleteTarget(null)} />
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev}>{snack.msg}</Alert>
      </Snackbar>
    </>
  )
}
