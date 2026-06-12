'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import IconButton from '@mui/material/IconButton'
import Grid from '@mui/material/Grid'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import apiClient from '@/lib/api-client'

interface SchedulePattern {
  id: string
  name: string
  description?: string
  repeatCycleDays: number
  holidayHandling: string
  isActive: boolean
}

const HOLIDAY_OPTS = [
  { value: 'skip_and_shift', label: '휴일 건너뛰고 패턴 밀기' },
  { value: 'skip_and_keep', label: '휴일 건너뛰고 패턴 유지' },
  { value: 'no_skip', label: '휴일 건너뛰지 않음' },
]

export default function SchedulePatternsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [cycle, setCycle] = useState('14')
  const [holiday, setHoliday] = useState('no_skip')
  const [deleteTarget, setDeleteTarget] = useState<SchedulePattern | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  const { data: patterns = [], isLoading } = useQuery<SchedulePattern[]>({
    queryKey: ['schedule-patterns'],
    queryFn: () => apiClient.get('/schedule-patterns') as Promise<SchedulePattern[]>,
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (d: unknown) => apiClient.post('/schedule-patterns', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-patterns'] }); setOpen(false); setSnack({ open: true, msg: '패턴이 추가됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/schedule-patterns/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-patterns'] }); setDeleteTarget(null); setSnack({ open: true, msg: '삭제됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '삭제에 실패했습니다.', sev: 'error' }),
  })

  function handleSave() {
    if (!name.trim()) return
    createMutation.mutate({ name: name.trim(), description: desc.trim() || undefined, repeatCycleDays: Number(cycle), holidayHandling: holiday, patternDefinition: {}, isActive: true })
  }

  function openAdd() { setName(''); setDesc(''); setCycle('14'); setHoliday('no_skip'); setOpen(true) }

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
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography fontWeight={700}>{p.name}</Typography>
                  {p.description && <Typography variant="body2" color="text.secondary">{p.description}</Typography>}
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip label={`${p.repeatCycleDays}일 주기`} size="small" />
                    <Chip label={HOLIDAY_OPTS.find(o => o.value === p.holidayHandling)?.label ?? p.holidayHandling} size="small" variant="outlined" />
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(p)}><DeleteIcon fontSize="small" /></IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>스케줄 패턴 추가</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="패턴명" required value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus />
          <TextField label="설명" value={desc} onChange={e => setDesc(e.target.value)} fullWidth />
          <TextField label="반복 주기 (일)" type="number" value={cycle} onChange={e => setCycle(e.target.value)} inputProps={{ min: 1, max: 365 }} fullWidth />
          <TextField label="휴일 처리" select value={holiday} onChange={e => setHoliday(e.target.value)} fullWidth>
            {HOLIDAY_OPTS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={handleSave} variant="contained" disabled={createMutation.isPending}>추가</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!deleteTarget} title="패턴 삭제" message={`"${deleteTarget?.name}"을 삭제하시겠습니까?`} onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} onCancel={() => setDeleteTarget(null)} />
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev}>{snack.msg}</Alert>
      </Snackbar>
    </>
  )
}
