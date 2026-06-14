'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Snackbar from '@mui/material/Snackbar'
import Typography from '@mui/material/Typography'
import PageHeader from '@/components/common/PageHeader'
import apiClient from '@/lib/api-client'

interface ApprovalSettings {
  approvalServiceEnabled?: boolean
}

/** AP 서비스 사용 설정 — 전자결재 서비스 on/off (카카오워크 PDF: 좌측 네비 독립 페이지 + 라디오) */
export default function ApprovalServiceSettingPage() {
  const [enabled, setEnabled] = useState(true)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const { data, isLoading } = useQuery<ApprovalSettings>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<ApprovalSettings>,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data) setEnabled(data.approvalServiceEnabled ?? true)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (value: boolean) => apiClient.patch('/company-settings', { approvalServiceEnabled: value }),
    onSuccess: () => setSnack({ open: true, message: '저장되었습니다.', severity: 'success' }),
    onError: () => setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' }),
  })

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <PageHeader title="서비스 사용 설정" subtitle="전자결재 서비스 사용 여부를 설정합니다." />

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 720 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Typography variant="subtitle2" sx={{ minWidth: 120, fontWeight: 700 }}>
              서비스 사용 설정
            </Typography>
            <RadioGroup
              row
              value={enabled ? 'on' : 'off'}
              onChange={(e) => setEnabled(e.target.value === 'on')}
            >
              <FormControlLabel value="on" control={<Radio />} label="사용" />
              <FormControlLabel value="off" control={<Radio />} label="사용 안 함" />
            </RadioGroup>
          </Box>
          <Alert severity="info">
            ‘사용 안 함’으로 설정하면 기안 작성·결재함·양식·결재선 등 전자결재 기능 전체가
            비활성화됩니다. (인사/근태 요청의 결재 처리는 영향받지 않습니다.)
          </Alert>
          <Box>
            <Button
              variant="contained"
              onClick={() => saveMutation.mutate(enabled)}
              disabled={saveMutation.isPending}
            >
              저장
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
