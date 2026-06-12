'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  useCompanyHolidays,
  useCreateCompanyHoliday,
  useDeleteCompanyHoliday,
} from '@/lib/query/companies'

interface HolidayForm {
  name: string
  holidayDate: string
  isAnnualRepeat: boolean
}

const EMPTY_FORM: HolidayForm = { name: '', holidayDate: '', isAnnualRepeat: false }

interface HolidaysTabProps {
  onResult: (message: string, severity: 'success' | 'error') => void
}

export default function HolidaysTab({ onResult }: HolidaysTabProps) {
  const { data: holidays, isLoading } = useCompanyHolidays()
  const createMutation = useCreateCompanyHoliday()
  const deleteMutation = useDeleteCompanyHoliday()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM)

  function handleCreate() {
    createMutation.mutate(
      {
        name: form.name.trim(),
        holidayDate: form.holidayDate,
        isAnnualRepeat: form.isAnnualRepeat,
      },
      {
        onSuccess: () => {
          setDialogOpen(false)
          setForm(EMPTY_FORM)
          onResult('휴일이 등록되었습니다.', 'success')
        },
        onError: () => onResult('휴일 등록에 실패했습니다.', 'error'),
      },
    )
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => onResult('휴일이 삭제되었습니다.', 'success'),
      onError: () => onResult('휴일 삭제에 실패했습니다.', 'error'),
    })
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={600}>
            회사 지정 휴일
          </Typography>
          <Button variant="contained" size="small" onClick={() => setDialogOpen(true)}>
            휴일 추가
          </Button>
        </Box>

        {(holidays ?? []).length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
            등록된 휴일이 없습니다.
          </Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>날짜</TableCell>
                <TableCell>이름</TableCell>
                <TableCell>연간 반복</TableCell>
                <TableCell align="right">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(holidays ?? []).map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell>{holiday.holidayDate.slice(0, 10)}</TableCell>
                  <TableCell>{holiday.name}</TableCell>
                  <TableCell>
                    {holiday.isAnnualRepeat ? (
                      <Chip label="매년 반복" size="small" color="primary" variant="outlined" />
                    ) : (
                      <Chip label="단일" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDelete(holiday.id)}
                      disabled={deleteMutation.isPending}
                    >
                      삭제
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>휴일 추가</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField
            label="휴일 이름"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            size="small"
            fullWidth
            autoFocus
          />
          <TextField
            label="날짜"
            type="date"
            value={form.holidayDate}
            onChange={(e) => setForm((prev) => ({ ...prev, holidayDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            size="small"
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.isAnnualRepeat}
                onChange={(e) => setForm((prev) => ({ ...prev, isAnnualRepeat: e.target.checked }))}
              />
            }
            label="매년 반복"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={form.name.trim() === '' || form.holidayDate === '' || createMutation.isPending}
          >
            추가
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}
