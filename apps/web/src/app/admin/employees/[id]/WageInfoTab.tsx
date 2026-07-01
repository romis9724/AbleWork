'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormLabel from '@mui/material/FormLabel'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import {
  useWageInfos,
  useCreateWageInfo,
  useUpdateWageInfo,
  useDeleteWageInfo,
} from '@/lib/query/employees'

interface WageInfoForm {
  hourlyWage: string
  contractedWorkDays: string[]
  contractedHoursPerWeek: string
  maxHoursPerWeek: string
  effectiveFrom: string
}

interface WageInfo {
  id: string
  effectiveFrom: string
  hourlyWage: number
  contractedWorkDays: string
  contractedHoursPerWeek: number | string
  maxHoursPerWeek: number | string
}

const WORK_DAYS: { value: string; label: string }[] = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
]

const DEFAULT_WORK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']

const WORK_DAY_LABEL: Record<string, string> = Object.fromEntries(
  WORK_DAYS.map((d) => [d.value, d.label]),
)

function formatWorkDays(days: string): string {
  if (!days) return '—'
  return days
    .split(',')
    .map((d) => WORK_DAY_LABEL[d.trim()] ?? d.trim())
    .join(', ')
}

type NotifySeverity = 'success' | 'error'

interface WageInfoTabProps {
  employeeId: string
  canManageWage: boolean
  onNotify: (message: string, severity: NotifySeverity) => void
}

export default function WageInfoTab({ employeeId, canManageWage, onNotify }: WageInfoTabProps) {
  const [addWageOpen, setAddWageOpen] = useState(false)
  const [editingWageId, setEditingWageId] = useState<string | null>(null)
  const [deleteWageId, setDeleteWageId] = useState<string | null>(null)
  const [wageForm, setWageForm] = useState<WageInfoForm>({
    hourlyWage: '',
    contractedWorkDays: DEFAULT_WORK_DAYS,
    contractedHoursPerWeek: '',
    maxHoursPerWeek: '',
    effectiveFrom: '',
  })

  const { data: wageInfosRaw } = useWageInfos(employeeId)
  const createWageInfoMutation = useCreateWageInfo(employeeId)
  const updateWageInfoMutation = useUpdateWageInfo(employeeId)
  const deleteWageInfoMutation = useDeleteWageInfo(employeeId)

  const wageInfos: WageInfo[] = Array.isArray(wageInfosRaw)
    ? (wageInfosRaw as WageInfo[])
    : ((wageInfosRaw as { items?: WageInfo[] })?.items ?? [])

  function resetWageForm() {
    setEditingWageId(null)
    setWageForm({
      hourlyWage: '',
      contractedWorkDays: DEFAULT_WORK_DAYS,
      contractedHoursPerWeek: '',
      maxHoursPerWeek: '',
      effectiveFrom: '',
    })
  }

  function openWageAdd() {
    resetWageForm()
    setAddWageOpen(true)
  }

  function openWageEdit(w: WageInfo) {
    setEditingWageId(w.id)
    setWageForm({
      hourlyWage: String(w.hourlyWage ?? ''),
      contractedWorkDays: w.contractedWorkDays ? String(w.contractedWorkDays).split(',') : DEFAULT_WORK_DAYS,
      contractedHoursPerWeek: String(w.contractedHoursPerWeek ?? ''),
      maxHoursPerWeek: w.maxHoursPerWeek != null && w.maxHoursPerWeek !== '' ? String(w.maxHoursPerWeek) : '',
      effectiveFrom: w.effectiveFrom ? w.effectiveFrom.slice(0, 10) : '',
    })
    setAddWageOpen(true)
  }

  async function handleSaveWageInfo() {
    const payload = {
      hourlyWage: Number(wageForm.hourlyWage),
      contractedWorkDays: wageForm.contractedWorkDays.join(','),
      contractedHoursPerWeek: Number(wageForm.contractedHoursPerWeek),
      // 미입력 시 키 자체를 제외 (BE 기본값 52 적용)
      ...(wageForm.maxHoursPerWeek ? { maxHoursPerWeek: Number(wageForm.maxHoursPerWeek) } : {}),
      effectiveFrom: wageForm.effectiveFrom,
    }
    try {
      if (editingWageId) {
        await updateWageInfoMutation.mutateAsync({ wageId: editingWageId, ...payload })
        onNotify('근로정보가 수정되었습니다.', 'success')
      } else {
        await createWageInfoMutation.mutateAsync(payload)
        onNotify('근로정보가 추가되었습니다.', 'success')
      }
      setAddWageOpen(false)
      resetWageForm()
    } catch {
      onNotify('저장에 실패했습니다.', 'error')
    }
  }

  async function handleDeleteWageInfo() {
    if (!deleteWageId) return
    try {
      await deleteWageInfoMutation.mutateAsync(deleteWageId)
      setDeleteWageId(null)
      onNotify('근로정보가 삭제되었습니다.', 'success')
    } catch {
      setDeleteWageId(null)
      onNotify('삭제에 실패했습니다.', 'error')
    }
  }

  function toggleWorkDay(day: string) {
    setWageForm((f) => ({
      ...f,
      contractedWorkDays: f.contractedWorkDays.includes(day)
        ? f.contractedWorkDays.filter((d) => d !== day)
        : WORK_DAYS.filter((d) => f.contractedWorkDays.includes(d.value) || d.value === day).map((d) => d.value),
    }))
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        {canManageWage && (
          <Button data-testid="emp-detail-wage-add-btn" variant="outlined" onClick={openWageAdd}>
            + 근로정보 추가
          </Button>
        )}
      </Box>
      <TableContainer
        component={Paper}
        elevation={0}
        sx={{ border: '1px solid', borderColor: 'divider' }}
      >
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'background.default' }}>
              <TableCell>적용시점</TableCell>
              <TableCell align="right">시급 (원)</TableCell>
              <TableCell>계약 근무요일</TableCell>
              <TableCell align="right">주 계약시간 (h)</TableCell>
              <TableCell align="right">주 최대시간 (h)</TableCell>
              {canManageWage && <TableCell align="right" />}
            </TableRow>
          </TableHead>
          <TableBody>
            {wageInfos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManageWage ? 6 : 5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  근로정보가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              wageInfos.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    {new Date(w.effectiveFrom).toLocaleDateString('ko-KR')}
                  </TableCell>
                  <TableCell align="right">
                    {Number(w.hourlyWage).toLocaleString('ko-KR')}
                  </TableCell>
                  <TableCell>{formatWorkDays(w.contractedWorkDays)}</TableCell>
                  <TableCell align="right">{Number(w.contractedHoursPerWeek)}</TableCell>
                  <TableCell align="right">{Number(w.maxHoursPerWeek)}</TableCell>
                  {canManageWage && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="small" aria-label="수정" onClick={() => openWageEdit(w)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton size="small" color="error" aria-label="삭제" onClick={() => setDeleteWageId(w.id)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 근로정보 추가/수정 Dialog */}
      <Dialog open={addWageOpen} onClose={() => { setAddWageOpen(false); resetWageForm() }} maxWidth="xs" fullWidth>
        <DialogTitle>{editingWageId ? '근로정보 수정' : '근로정보 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="시급 (원)"
            type="number"
            value={wageForm.hourlyWage}
            onChange={(e) => setWageForm((f) => ({ ...f, hourlyWage: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
          />
          <FormControl size="small">
            <FormLabel required sx={{ fontSize: '0.8rem' }}>계약 근무요일</FormLabel>
            <FormGroup row>
              {WORK_DAYS.map((day) => (
                <FormControlLabel
                  key={day.value}
                  control={
                    <Checkbox
                      size="small"
                      checked={wageForm.contractedWorkDays.includes(day.value)}
                      onChange={() => toggleWorkDay(day.value)}
                    />
                  }
                  label={day.label}
                />
              ))}
            </FormGroup>
          </FormControl>
          <TextField
            label="주 계약시간 (시간/주)"
            type="number"
            value={wageForm.contractedHoursPerWeek}
            onChange={(e) => setWageForm((f) => ({ ...f, contractedHoursPerWeek: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
            required
          />
          <TextField
            label="주 최대시간 (시간/주)"
            type="number"
            value={wageForm.maxHoursPerWeek}
            onChange={(e) => setWageForm((f) => ({ ...f, maxHoursPerWeek: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
            helperText="미입력 시 52시간이 적용됩니다."
          />
          <TextField
            label="적용시점"
            type="date"
            value={wageForm.effectiveFrom}
            onChange={(e) => setWageForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddWageOpen(false); resetWageForm() }}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveWageInfo}
            disabled={
              createWageInfoMutation.isPending ||
              updateWageInfoMutation.isPending ||
              !wageForm.hourlyWage ||
              wageForm.contractedWorkDays.length === 0 ||
              !wageForm.contractedHoursPerWeek ||
              !wageForm.effectiveFrom
            }
          >
            {editingWageId ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteWageId}
        title="근로정보 삭제"
        message="이 근로정보를 삭제하시겠습니까? 되돌릴 수 없습니다."
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleteWageInfoMutation.isPending}
        onConfirm={handleDeleteWageInfo}
        onCancel={() => setDeleteWageId(null)}
      />
    </>
  )
}
