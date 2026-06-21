'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import AddIcon from '@mui/icons-material/Add'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import apiClient from '@/lib/api-client'
import { useLeaveTypes } from '@/lib/query/leaves'
import { useMessageTemplates, type MessageTemplate } from '@/lib/query/messages'

interface MessageAutomation { id: string; name: string; automationType: string; triggerBasis: string; offsetDays: number; sendTime: string; isActive: boolean; templateId?: string; leaveTypeId?: string | null; leaveType?: { name: string }; template?: { name: string } }

export default function MessageAutomationsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [trigger, setTrigger] = useState('leave_start')
  const [offset, setOffset] = useState('-1')
  const [sendTime, setSendTime] = useState('09:00')
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  const { data: rawAutomations, isLoading } = useQuery({
    queryKey: ['message-automations'],
    queryFn: () => apiClient.get('/messages/automations'),
    staleTime: 30_000,
  })
  const automations: MessageAutomation[] = Array.isArray(rawAutomations)
    ? rawAutomations
    : ((rawAutomations as { items?: MessageAutomation[] })?.items ?? [])

  const { data: rawLeaveTypes } = useLeaveTypes()
  const leaveTypes = Array.isArray(rawLeaveTypes)
    ? rawLeaveTypes
    : (((rawLeaveTypes as unknown) as { items?: typeof rawLeaveTypes })?.items ?? [])

  const { data: rawTemplates } = useMessageTemplates()
  const templates: MessageTemplate[] = Array.isArray(rawTemplates)
    ? rawTemplates
    : (((rawTemplates as unknown) as { items?: MessageTemplate[] })?.items ?? [])

  const createMutation = useMutation({
    mutationFn: (d: unknown) => apiClient.post('/messages/automations', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['message-automations'] }); setOpen(false); setSnack({ open: true, msg: '자동화 규칙이 추가됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.patch(`/messages/automations/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['message-automations'] }),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: { id: string } & Record<string, unknown>) => apiClient.patch(`/messages/automations/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['message-automations'] }); setOpen(false); setEditingId(null); setSnack({ open: true, msg: '자동화 규칙을 수정했습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/messages/automations/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['message-automations'] }); setDeleteId(null); setSnack({ open: true, msg: '자동화 규칙을 삭제했습니다.', sev: 'success' }) },
    onError: () => { setDeleteId(null); setSnack({ open: true, msg: '삭제에 실패했습니다.', sev: 'error' }) },
  })

  function handleSave() {
    if (!name.trim() || !templateId) return
    const payload = {
      name: name.trim(),
      automationType: 'leave_reminder',
      templateId,
      leaveTypeId: leaveTypeId || undefined,
      triggerBasis: trigger,
      offsetDays: Number(offset),
      sendTime,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...payload })
    } else {
      createMutation.mutate({ ...payload, startsAt: new Date().toISOString(), isActive: true })
    }
  }

  function openAdd() { setEditingId(null); setName(''); setTemplateId(''); setLeaveTypeId(''); setTrigger('leave_start'); setOffset('-1'); setSendTime('09:00'); setOpen(true) }
  function openEdit(a: MessageAutomation) {
    setEditingId(a.id)
    setName(a.name)
    setTemplateId(a.templateId ?? '')
    setLeaveTypeId(a.leaveTypeId ?? '')
    setTrigger(a.triggerBasis)
    setOffset(String(a.offsetDays))
    setSendTime(a.sendTime?.slice(11, 16) || '09:00')
    setOpen(true)
  }

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <PageHeader title="메시지 자동화" subtitle="조건에 따라 자동으로 메시지를 발송합니다." actions={<Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>자동화 추가</Button>} />
      {automations.length === 0 ? <EmptyState message="자동화 규칙이 없습니다." action={<Button variant="outlined" onClick={openAdd}>자동화 추가</Button>} /> : (
        <Grid container spacing={2}>
          {automations.map(a => (
            <Grid item xs={12} sm={6} md={4} key={a.id}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                <CardContent>
                  <Typography fontWeight={700}>{a.name}</Typography>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {a.leaveType && <Chip label={a.leaveType.name} size="small" />}
                    <Chip label={`${a.triggerBasis === 'leave_start' ? '시작일' : '종료일'} 기준 ${a.offsetDays}일`} size="small" variant="outlined" />
                    <Chip label={`${a.sendTime} 발송`} size="small" variant="outlined" />
                  </Box>
                </CardContent>
                <CardActions sx={{ justifyContent: 'space-between' }}>
                  <FormControlLabel control={<Switch checked={a.isActive} size="small" onChange={e => toggleMutation.mutate({ id: a.id, isActive: e.target.checked })} />} label={a.isActive ? '활성' : '비활성'} />
                  <Box>
                    <Button size="small" onClick={() => openEdit(a)}>수정</Button>
                    <Button size="small" color="error" onClick={() => setDeleteId(a.id)}>삭제</Button>
                  </Box>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingId ? '자동화 규칙 수정' : '자동화 규칙 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="규칙명" required value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus />
          <TextField label="메시지 템플릿" required select value={templateId} onChange={e => setTemplateId(e.target.value)} fullWidth helperText={templates.length === 0 ? '먼저 메시지 템플릿을 생성하세요.' : undefined}>
            {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField label="휴가 유형 (선택)" select value={leaveTypeId} onChange={e => setLeaveTypeId(e.target.value)} fullWidth>
            <MenuItem value="">모든 유형</MenuItem>
            {leaveTypes.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
          </TextField>
          <TextField label="트리거 기준" select value={trigger} onChange={e => setTrigger(e.target.value)} fullWidth>
            <MenuItem value="leave_start">휴가 시작일 기준</MenuItem>
            <MenuItem value="leave_end">휴가 종료일 기준</MenuItem>
          </TextField>
          <TextField label="알림 시점 (일, -90~90)" type="number" value={offset} onChange={e => setOffset(e.target.value)} inputProps={{ min: -90, max: 90 }} fullWidth helperText="음수: 이전 / 양수: 이후" />
          <TextField label="발송 시각" type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 1800 }} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={handleSave} variant="contained" disabled={createMutation.isPending || updateMutation.isPending || !name.trim() || !templateId}>{editingId ? '수정' : '추가'}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>자동화 규칙 삭제</DialogTitle>
        <DialogContent>이 자동화 규칙을 삭제하시겠습니까? 되돌릴 수 없습니다.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>취소</Button>
          <Button onClick={() => deleteId && deleteMutation.mutate(deleteId)} color="error" variant="contained" disabled={deleteMutation.isPending}>삭제</Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}><Alert severity={snack.sev}>{snack.msg}</Alert></Snackbar>
    </>
  )
}
