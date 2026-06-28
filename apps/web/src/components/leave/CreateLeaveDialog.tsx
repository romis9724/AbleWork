'use client'
import { useEffect, useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCreateLeave, useLeaveTypes, type LeaveType } from '@/lib/query/leaves'
import { useEmployees, type Employee } from '@/lib/query/employees'

// ── Form state ────────────────────────────────────────────────────────────────

interface LeaveForm {
  employee: Employee | null
  leaveTypeId: string
  startDate: string
  endDate: string
  reason: string
}

const defaultLeaveForm: LeaveForm = {
  employee: null,
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  reason: '',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CreateLeaveDialogProps {
  open: boolean
  onClose: () => void
  /** 저장 성공/실패 결과를 부모 Snackbar로 전달 */
  onResult: (message: string, severity: 'success' | 'error') => void
}

/**
 * 관리자 휴가 직접 추가 다이얼로그 (휴가 현황 / 휴가 목록 공용)
 * 직원·휴가유형 목록과 생성 뮤테이션을 내부에서 처리한다.
 */
export default function CreateLeaveDialog({ open, onClose, onResult }: CreateLeaveDialogProps) {
  const { data: employeesData } = useEmployees({ isActive: true, excludeSuperAdmin: true })
  const employees: Employee[] = employeesData?.items ?? []

  const { data: leaveTypes = [] } = useLeaveTypes()
  const createLeaveMutation = useCreateLeave()

  const [form, setForm] = useState<LeaveForm>(defaultLeaveForm)

  // 열릴 때마다 폼 초기화
  useEffect(() => {
    if (open) setForm(defaultLeaveForm)
  }, [open])

  async function handleSubmit() {
    if (!form.employee || !form.leaveTypeId || !form.startDate || !form.endDate) return
    try {
      await createLeaveMutation.mutateAsync({
        employeeId: form.employee.id,
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim() || undefined,
      })
      onClose()
      onResult(`${form.employee.name}님의 휴가가 추가되었습니다.`, 'success')
    } catch {
      onResult('휴가 추가에 실패했습니다. 잔액과 유효기간을 확인하세요.', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>휴가 추가</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <Autocomplete
          options={employees}
          getOptionLabel={(e) => e.name}
          value={form.employee}
          onChange={(_, v) => setForm((f) => ({ ...f, employee: v }))}
          renderInput={(params) => <TextField {...params} label="직원 선택" required />}
        />
        <FormControl fullWidth required>
          <InputLabel>휴가 유형</InputLabel>
          <Select
            value={form.leaveTypeId}
            label="휴가 유형"
            onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
          >
            {(leaveTypes as LeaveType[])
              .filter((t) => t.isActive)
              .map((t) => (
                <MenuItem key={t.id} value={t.id}>
                  {t.displayName ?? t.name}
                </MenuItem>
              ))}
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="시작일"
            type="date"
            required
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="종료일"
            type="date"
            required
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: form.startDate || undefined }}
            fullWidth
          />
        </Box>
        <TextField
          label="사유 (선택)"
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          fullWidth
          multiline
          rows={2}
        />
        <Typography variant="caption" color="text.secondary">
          기간 일수 × 유형별 차감 단위만큼 잔여 휴가에서 차감됩니다.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            createLeaveMutation.isPending ||
            !form.employee ||
            !form.leaveTypeId ||
            !form.startDate ||
            !form.endDate
          }
        >
          추가
        </Button>
      </DialogActions>
    </Dialog>
  )
}
