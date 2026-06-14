'use client'
import { useState } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { useEmployees } from '@/lib/query/employees'
import { useAddCcSteps } from '@/lib/query/documents'
import { getApiErrorMessage } from '@/lib/api-error'

type CcRole = 'VIEWER' | 'REFERENCE'

interface Props {
  open: boolean
  documentId: string
  onClose: () => void
  onResult: (message: string, severity?: 'success' | 'error') => void
}

/**
 * 공람/참조 사후 추가 LAYER_POPUP — 진행중·완료 문서에 공람자(VIEWER)·참조자(REFERENCE)를
 * 사후 지정한다 (카카오워크 PDF: 결재 완료 후 공람자 지정).
 */
export default function AddCcDialog({ open, documentId, onClose, onResult }: Props) {
  const { data: employeeData } = useEmployees({ limit: 500, isActive: true })
  const options = (employeeData?.items ?? []).map((e) => ({ id: e.id, name: e.name }))
  const addMutation = useAddCcSteps()

  const [role, setRole] = useState<CcRole>('VIEWER')
  const [selected, setSelected] = useState<{ id: string; name: string }[]>([])

  const reset = () => {
    setRole('VIEWER')
    setSelected([])
  }

  const handleSubmit = async () => {
    if (selected.length === 0) {
      onResult('대상을 선택하세요.', 'error')
      return
    }
    try {
      await addMutation.mutateAsync({
        documentId,
        steps: selected.map((s) => ({ role, assigneeId: s.id })),
      })
      onResult(role === 'VIEWER' ? '공람자가 추가되었습니다.' : '참조자가 추가되었습니다.')
      reset()
      onClose()
    } catch (e) {
      onResult(getApiErrorMessage(e, '추가 중 오류가 발생했습니다.'), 'error')
    }
  }

  return (
    <Dialog open={open} onClose={addMutation.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box sx={{ flexGrow: 1 }}>공람·참조 추가</Box>
        <IconButton size="small" onClick={onClose} disabled={addMutation.isPending} aria-label="닫기">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5, fontWeight: 600 }}>
            구분
          </Typography>
          <RadioGroup row value={role} onChange={(e) => setRole(e.target.value as CcRole)}>
            <FormControlLabel value="VIEWER" control={<Radio size="small" />} label="공람" />
            <FormControlLabel value="REFERENCE" control={<Radio size="small" />} label="참조" />
          </RadioGroup>
        </Box>
        <Autocomplete
          multiple
          size="small"
          options={options}
          value={selected}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          onChange={(_, value) => setSelected(value)}
          renderInput={(params) => <TextField {...params} label="대상자" placeholder="이름 검색" />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={addMutation.isPending}>취소</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={addMutation.isPending || selected.length === 0}>
          {addMutation.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          추가
        </Button>
      </DialogActions>
    </Dialog>
  )
}
