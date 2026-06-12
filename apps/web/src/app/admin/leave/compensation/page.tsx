'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Autocomplete from '@mui/material/Autocomplete'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import PageHeader from '@/components/common/PageHeader'
import { useCompensationAccrual, useLeaveTypes, type LeaveType } from '@/lib/query/leaves'
import { useEmployees, type Employee } from '@/lib/query/employees'

export default function CompensationLeavePage() {
  const { data: employeesData } = useEmployees({ isActive: true })
  const employees: Employee[] = employeesData?.items ?? []
  const { data: leaveTypes = [] } = useLeaveTypes()
  const compensationAccrual = useCompensationAccrual()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [days, setDays] = useState('1')
  const [reason, setReason] = useState('')
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  async function handleSubmit() {
    if (!employee || !leaveTypeId || !days) {
      setSnack({ open: true, msg: '필수 항목을 입력해 주세요.', sev: 'error' })
      return
    }
    try {
      await compensationAccrual.mutateAsync({
        employeeId: employee.id,
        leaveTypeId,
        days: Number(days),
        reason: reason || undefined,
      })
      setSnack({ open: true, msg: '보상휴가가 발생됐습니다.', sev: 'success' })
      setEmployee(null)
      setDays('1')
      setReason('')
    } catch {
      setSnack({ open: true, msg: '처리 중 오류가 발생했습니다.', sev: 'error' })
    }
  }

  return (
    <>
      <PageHeader title="보상휴가 발생" subtitle="휴일근로 등에 대한 보상휴가를 발생합니다." />
      <Alert severity="info" sx={{ mb: 3 }}>
        보상휴가는 직원의 휴가 잔여일수에 직접 추가됩니다. 취소는 관리자가 수동으로 조정해야 합니다.
      </Alert>
      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 480 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Autocomplete
            options={employees}
            getOptionLabel={(e) => e.name}
            value={employee}
            onChange={(_, v) => setEmployee(v)}
            renderInput={(params) => <TextField {...params} label="직원" required />}
          />
          <TextField
            label="휴가 유형"
            select
            required
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            fullWidth
          >
            {(leaveTypes as LeaveType[]).map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.displayName ?? t.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="발생 일수"
            type="number"
            required
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputProps={{ min: 0.5, step: 0.5 }}
            fullWidth
            helperText="0.5 단위로 입력"
          />
          <TextField
            label="발생 사유"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            fullWidth
            placeholder="예: 2026년 6월 특근 보상"
          />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={compensationAccrual.isPending || !employee || !leaveTypeId || !days}
            >
              보상휴가 발생
            </Button>
          </Box>
        </CardContent>
      </Card>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.sev}>{snack.msg}</Alert>
      </Snackbar>
    </>
  )
}
