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
import Chip from '@mui/material/Chip'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import apiClient from '@/lib/api-client'
import { getApiErrorMessage } from '@/lib/api-error'

interface CustomField { fieldName: string; fieldType: string; isRequired: boolean }
interface CustomRequestType { id: string; name: string; isActive: boolean; enablePdf: boolean; fields?: CustomField[] }

const FIELD_TYPES = [
  { value: 'text', label: '텍스트' }, { value: 'number', label: '숫자' }, { value: 'date', label: '날짜' },
  { value: 'checkbox', label: '체크박스' }, { value: 'select', label: '단일 선택' }, { value: 'multiselect', label: '복수 선택' },
]

/**
 * 커스텀 요청 유형 본문 패널.
 * 표준 라우트(/admin/requests/custom-types)와 회사 설정 임베드(설정 > 요청 > 커스텀 요청 유형) 양쪽에서 동일하게 사용.
 * PageHeader는 호출하는 page가 렌더하고, 패널은 자체 툴바(유형 추가)를 가진다.
 */
export default function RequestCustomTypesPanel() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [enablePdf, setEnablePdf] = useState(false)
  const [fields, setFields] = useState<CustomField[]>([])
  const [deleteTarget, setDeleteTarget] = useState<CustomRequestType | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  const { data: types = [], isLoading } = useQuery<CustomRequestType[]>({
    queryKey: ['custom-request-types'],
    queryFn: () => apiClient.get('/requests/custom-types') as Promise<CustomRequestType[]>,
    staleTime: 60_000,
  })

  const createMutation = useMutation({
    mutationFn: (d: unknown) => apiClient.post('/requests/custom-types', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-request-types'] }); setOpen(false); setSnack({ open: true, msg: '추가됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '저장에 실패했습니다.', sev: 'error' }),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiClient.patch(`/requests/custom-types/${id}`, { isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-request-types'] }); setSnack({ open: true, msg: '변경됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '변경에 실패했습니다.', sev: 'error' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/requests/custom-types/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['custom-request-types'] }); setDeleteTarget(null); setSnack({ open: true, msg: '삭제됐습니다.', sev: 'success' }) },
    onError: (e) => setSnack({ open: true, msg: getApiErrorMessage(e, '삭제에 실패했습니다.'), sev: 'error' }),
  })

  function addField() { setFields(f => [...f, { fieldName: '', fieldType: 'text', isRequired: false }]) }
  function removeField(i: number) { setFields(f => f.filter((_, idx) => idx !== i)) }
  function updateField(i: number, key: keyof CustomField, val: string | boolean) { setFields(f => f.map((field, idx) => idx === i ? { ...field, [key]: val } : field)) }

  function openAdd() { setName(''); setEnablePdf(false); setFields([]); setOpen(true) }

  function handleSave() {
    if (!name.trim()) return
    createMutation.mutate({ name: name.trim(), enablePdf, allowEmployeePdf: false, isActive: true, fields })
  }

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* 패널 툴바 — PageHeader 우측에 있던 유형 추가 액션을 임베드에서도 보이도록 패널 내부로 이동 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>유형 추가</Button>
      </Box>
      {types.length === 0 ? <EmptyState message="커스텀 요청 유형이 없습니다." action={<Button variant="outlined" onClick={openAdd}>유형 추가</Button>} /> : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead><TableRow sx={{ bgcolor: 'background.default' }}><TableCell>유형명</TableCell><TableCell>PDF</TableCell><TableCell>상태</TableCell><TableCell align="right">관리</TableCell></TableRow></TableHead>
            <TableBody>
              {types.map(t => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                  <TableCell>{t.enablePdf ? <Chip label="PDF 가능" size="small" color="info" /> : '—'}</TableCell>
                  <TableCell><Chip label={t.isActive ? '활성' : '비활성'} color={t.isActive ? 'success' : 'default'} size="small" variant="outlined" /></TableCell>
                  <TableCell align="right">
                    <Switch size="small" checked={t.isActive} onChange={e => toggleMutation.mutate({ id: t.id, isActive: e.target.checked })} inputProps={{ 'aria-label': `${t.name} 활성화 토글` }} />
                    <IconButton size="small" color="error" onClick={() => setDeleteTarget(t)} aria-label={`${t.name} 삭제`}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>커스텀 요청 유형 추가</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="유형명" required value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus />
          <FormControlLabel control={<Switch checked={enablePdf} onChange={e => setEnablePdf(e.target.checked)} />} label="PDF 추출 허용" />
          <Divider />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2">필드 정의</Typography>
            <Button size="small" startIcon={<AddIcon />} onClick={addField}>필드 추가</Button>
          </Box>
          {fields.map((f, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField label="필드명" value={f.fieldName} onChange={e => updateField(i, 'fieldName', e.target.value)} size="small" sx={{ flex: 2 }} />
              <TextField label="유형" select value={f.fieldType} onChange={e => updateField(i, 'fieldType', e.target.value)} size="small" sx={{ flex: 1.5 }}>
                {FIELD_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </TextField>
              <FormControlLabel control={<Switch checked={f.isRequired} size="small" onChange={e => updateField(i, 'isRequired', e.target.checked)} />} label="필수" sx={{ mx: 0 }} />
              <IconButton size="small" color="error" onClick={() => removeField(i)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={handleSave} variant="contained" disabled={createMutation.isPending}>추가</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!deleteTarget} title="커스텀 요청 유형 삭제" message={`'${deleteTarget?.name ?? ''}' 유형을 삭제(비활성화)하시겠습니까?`} confirmLabel="삭제" onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)} onCancel={() => setDeleteTarget(null)} />
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}><Alert severity={snack.sev}>{snack.msg}</Alert></Snackbar>
    </Box>
  )
}
