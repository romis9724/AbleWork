'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useEmployees } from '@/lib/query/employees'
import {
  useProxySettings,
  useCreateProxySetting,
  useDeleteProxySetting,
} from '@/lib/query/documents'
import { dateText } from './approval-constants'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (message: string) => void
}

interface EmployeeOption {
  id: string
  name: string
}

/** 대리결재(대결) 설정 다이얼로그 — 내 대리인 지정 목록 + 추가 + 해제 */
export default function ProxySettingsDialog({ open, onClose, onSuccess }: Props) {
  const { data: settings = [], isLoading } = useProxySettings()
  const { data: employeeData } = useEmployees({ limit: 200, isActive: true })
  const createMutation = useCreateProxySetting()
  const deleteMutation = useDeleteProxySetting()

  const [proxy, setProxy] = useState<EmployeeOption | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const options: EmployeeOption[] = (employeeData?.items ?? []).map((e) => ({
    id: e.id,
    name: e.name,
  }))
  const employeeName = (id: string) => options.find((o) => o.id === id)?.name ?? id

  const busy = createMutation.isPending || deleteMutation.isPending

  const handleAdd = async () => {
    setErrorMessage('')
    if (!proxy || !startDate || !endDate) {
      setErrorMessage('대리인과 기간을 모두 입력해주세요.')
      return
    }
    if (startDate > endDate) {
      setErrorMessage('종료일은 시작일 이후여야 합니다.')
      return
    }
    try {
      await createMutation.mutateAsync({
        proxyId: proxy.id,
        startDate,
        endDate,
        reason: reason || undefined,
      })
      setProxy(null)
      setStartDate('')
      setEndDate('')
      setReason('')
      onSuccess('대리결재 설정이 추가되었습니다.')
    } catch {
      setErrorMessage('추가 중 오류가 발생했습니다.')
    }
  }

  const handleDelete = async (id: string) => {
    setErrorMessage('')
    try {
      await deleteMutation.mutateAsync(id)
      onSuccess('대리결재 설정이 해제되었습니다.')
    } catch {
      setErrorMessage('해제 중 오류가 발생했습니다.')
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>대리결재 설정</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          {/* 현재 설정 목록 */}
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : settings.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              지정된 대리인이 없습니다.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {settings.map((s) => (
                <Box
                  key={s.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 1.25,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {s.proxy?.name ?? employeeName(s.proxyId)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {dateText(s.startDate)} ~ {dateText(s.endDate)}
                      {s.reason ? ` · ${s.reason}` : ''}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={busy}
                    onClick={() => handleDelete(s.id)}
                    aria-label="대리인 해제"
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}

          <Divider />

          {/* 추가 폼 */}
          <Typography variant="subtitle2" fontWeight={700}>대리인 추가</Typography>
          <Autocomplete
            size="small"
            options={options}
            value={proxy}
            getOptionLabel={(o) => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            onChange={(_, value) => setProxy(value)}
            renderInput={(params) => <TextField {...params} label="대리인" />}
          />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              size="small"
              label="시작일"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <TextField
              size="small"
              label="종료일"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Box>
          <TextField
            size="small"
            label="사유"
            fullWidth
            placeholder="예: 휴가, 출장"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button variant="outlined" onClick={handleAdd} disabled={busy}>
            {createMutation.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            추가
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>닫기</Button>
      </DialogActions>
    </Dialog>
  )
}
