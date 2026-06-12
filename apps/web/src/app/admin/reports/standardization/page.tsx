'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import apiClient from '@/lib/api-client'

interface StandardizationRule { id: string; name: string; calculationBasis: string; startTimeRule: string; endTimeRule: string; isDefault: boolean; isActive: boolean }

const TIME_RULES = [
  { value: 'actual', label: '실제 기록' },
  { value: 'shift_start', label: '근무일정 시작/종료' },
  { value: 'round_up_5', label: '5분 단위 올림' },
  { value: 'round_down_5', label: '5분 단위 내림' },
  { value: 'round_up_10', label: '10분 단위 올림' },
  { value: 'round_down_10', label: '10분 단위 내림' },
  { value: 'round_up_30', label: '30분 단위 올림' },
]

const defaultForm = { name: '', calculationBasis: 'attendance', startTimeRule: 'actual', endTimeRule: 'actual', isDefault: false }

export default function StandardizationPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<StandardizationRule | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  const { data: rules = [], isLoading } = useQuery<StandardizationRule[]>({
    queryKey: ['standardization-rules'],
    queryFn: () => apiClient.get('/standardization-rules') as Promise<StandardizationRule[]>,
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: (d: unknown) => editing ? apiClient.patch(`/standardization-rules/${editing.id}`, d) : apiClient.post('/standardization-rules', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['standardization-rules'] }); setOpen(false); setSnack({ open: true, msg: '저장됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  function openAdd() { setEditing(null); setForm(defaultForm); setOpen(true) }
  function openEdit(r: StandardizationRule) { setEditing(r); setForm({ name: r.name, calculationBasis: r.calculationBasis, startTimeRule: r.startTimeRule, endTimeRule: r.endTimeRule, isDefault: r.isDefault }); setOpen(true) }

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <PageHeader title="표준화 규칙" subtitle="리포트 근태 시간 계산 기준을 설정합니다." actions={<Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>규칙 추가</Button>} />
      {rules.length === 0 ? <EmptyState message="표준화 규칙이 없습니다." action={<Button variant="outlined" onClick={openAdd}>규칙 추가</Button>} /> : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead><TableRow sx={{ bgcolor: 'background.default' }}>
              <TableCell>규칙명</TableCell><TableCell>계산 기준</TableCell><TableCell>시작시간</TableCell><TableCell>종료시간</TableCell><TableCell>기본</TableCell><TableCell />
            </TableRow></TableHead>
            <TableBody>
              {rules.map(r => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.name}</TableCell>
                  <TableCell><Chip label={r.calculationBasis === 'attendance' ? '출퇴근기록' : '근무일정'} size="small" /></TableCell>
                  <TableCell>{TIME_RULES.find(t => t.value === r.startTimeRule)?.label ?? r.startTimeRule}</TableCell>
                  <TableCell>{TIME_RULES.find(t => t.value === r.endTimeRule)?.label ?? r.endTimeRule}</TableCell>
                  <TableCell>{r.isDefault && <Chip label="기본" color="primary" size="small" />}</TableCell>
                  <TableCell><IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editing ? '표준화 규칙 수정' : '표준화 규칙 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="규칙명" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} fullWidth autoFocus />
          <TextField label="계산 기준" select value={form.calculationBasis} onChange={e => setForm(f => ({ ...f, calculationBasis: e.target.value }))} fullWidth>
            <MenuItem value="attendance">출퇴근기록 기준</MenuItem>
            <MenuItem value="shift">근무일정 기준</MenuItem>
          </TextField>
          <TextField label="시작시간 처리" select value={form.startTimeRule} onChange={e => setForm(f => ({ ...f, startTimeRule: e.target.value }))} fullWidth>
            {TIME_RULES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <TextField label="종료시간 처리" select value={form.endTimeRule} onChange={e => setForm(f => ({ ...f, endTimeRule: e.target.value }))} fullWidth>
            {TIME_RULES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Switch checked={form.isDefault} onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))} />} label="기본 규칙으로 설정" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={() => saveMutation.mutate(form)} variant="contained" disabled={saveMutation.isPending}>저장</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}><Alert severity={snack.sev}>{snack.msg}</Alert></Snackbar>
    </>
  )
}
