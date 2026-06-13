'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Chip from '@mui/material/Chip'
import Fab from '@mui/material/Fab'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import EmptyState from '@/components/common/EmptyState'
import { useLeaveBalance, useLeaveTypes } from '@/lib/query/leaves'
import { useCreateRequest } from '@/lib/query/requests'
import { useAuthStore } from '@/stores/auth.store'

export default function LeavesPage() {
  const user = useAuthStore((s) => s.user)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const { data: balances = [], isLoading } = useLeaveBalance(user?.employeeId ?? '')
  const { data: leaveTypes = [] } = useLeaveTypes()
  const createRequest = useCreateRequest()

  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId)

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const resetDialog = () => {
    setDialogOpen(false)
    setLeaveTypeId('')
    setStartDate('')
    setEndDate('')
    setReason('')
  }

  const handleSubmit = async () => {
    if (!leaveTypeId || !startDate || !endDate) {
      showSnack('필수 항목을 모두 입력해 주세요.', 'error')
      return
    }
    try {
      await createRequest.mutateAsync({
        type: 'LEAVE_CREATE',
        payload: { leaveTypeId, startDate, endDate, reason },
      })
      showSnack('휴가 신청이 완료됐습니다.', 'success')
      resetDialog()
    } catch {
      showSnack('신청 중 오류가 발생했습니다.', 'error')
    }
  }

  return (
    <Box sx={{ position: 'relative', pb: 4 }}>
      <Typography variant="h6" fontWeight={700} mb={2}>내 휴가</Typography>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : balances.length === 0 ? (
        <EmptyState message="휴가 잔여 정보가 없습니다." />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {balances.map((b) => (
            <Card key={b.id}>
              <CardContent
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Box>
                  <Typography fontWeight={600}>{b.leaveType?.displayName ?? b.leaveType?.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {b.year}년 &middot; 발생 {b.accruedDays}일 &middot; 사용 {b.usedDays}일
                  </Typography>
                </Box>
                <Chip
                  label={`${b.remainingDays}일 남음`}
                  color={b.remainingDays > 0 ? 'primary' : 'default'}
                  variant="outlined"
                />
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        aria-label="휴가 신청"
        sx={{ position: 'fixed', bottom: 72, right: 16 }}
        onClick={() => setDialogOpen(true)}
      >
        <AddIcon />
      </Fab>

      {/* Leave request dialog */}
      <Dialog open={dialogOpen} onClose={resetDialog} fullWidth maxWidth="xs">
        <DialogTitle>휴가 신청</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            select
            label="휴가 유형"
            value={leaveTypeId}
            onChange={(e) => setLeaveTypeId(e.target.value)}
            fullWidth
            required
          >
            {leaveTypes.filter((lt) => lt.isActive).map((lt) => (
              <MenuItem key={lt.id} value={lt.id}>
                {lt.displayName ?? lt.name}
              </MenuItem>
            ))}
          </TextField>

          {selectedBalance && (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                bgcolor: 'primary.50',
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'primary.200',
              }}
            >
              <Typography variant="caption" color="primary.main">
                잔여 일수: <strong>{selectedBalance.remainingDays}일</strong>
              </Typography>
            </Box>
          )}

          <TextField
            label="시작일"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="종료일"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="사유"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={resetDialog}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={createRequest.isPending}
          >
            {createRequest.isPending ? <CircularProgress size={20} color="inherit" /> : '신청'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
