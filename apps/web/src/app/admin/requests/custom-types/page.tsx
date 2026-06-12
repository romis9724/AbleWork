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
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import apiClient from '@/lib/api-client'

interface CustomField { fieldName: string; fieldType: string; isRequired: boolean }
interface CustomRequestType { id: string; name: string; isActive: boolean; enablePdf: boolean; fields?: CustomField[] }

const FIELD_TYPES = [
  { value: 'text', label: '텍스트' }, { value: 'number', label: '숫자' }, { value: 'date', label: '날짜' },
  { value: 'checkbox', label: '체크박스' }, { value: 'select', label: '단일 선택' }, { value: 'multiselect', label: '복수 선택' },
]

export default function CustomRequestTypesPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [enablePdf, setEnablePdf] = useState(false)
  const [fields, setFields] = useState<CustomField[]>([])
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
    <>
      <PageHeader title="커스텀 요청 유형" subtitle="회사 고유 요청 양식을 정의합니다." actions={<Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>유형 추가</Button>} />
      {types.length === 0 ? <EmptyState message="커스텀 요청 유형이 없습니다." action={<Button variant="outlined" onClick={openAdd}>유형 추가</Button>} /> : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead><TableRow sx={{ bgcolor: 'background.default' }}><TableCell>유형명</TableCell><TableCell>PDF</TableCell><TableCell>상태</TableCell></TableRow></TableHead>
            <TableBody>
              {types.map(t => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                  <TableCell>{t.enablePdf ? <Chip label="PDF 가능" size="small" color="info" /> : '—'}</TableCell>
                  <TableCell><Chip label={t.isActive ? '활성' : '비활성'} color={t.isActive ? 'success' : 'default'} size="small" variant="outlined" /></TableCell>
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
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}><Alert severity={snack.sev}>{snack.msg}</Alert></Snackbar>
    </>
  )
}
