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
import Link from '@mui/material/Link'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/common/PageHeader'
import apiClient from '@/lib/api-client'

interface ApprovalCommonSettings {
  approvalPrevStepReject?: boolean
}

/** 라벨-컨트롤 2열 행 (PDF 공통 관리 정책설정 레이아웃) */
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', py: 1 }}>
      <Typography variant="subtitle2" sx={{ minWidth: 140, fontWeight: 700 }}>
        {label}
      </Typography>
      <Box sx={{ flexGrow: 1 }}>{children}</Box>
    </Box>
  )
}

/** AP 공통 관리 — 문서채번 안내 + 정책설정(전단계 반려 등). 카카오워크 PDF: 좌측 네비 독립 페이지 */
export default function ApprovalCommonPage() {
  const router = useRouter()
  const [prevReject, setPrevReject] = useState(true)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const { data, isLoading } = useQuery<ApprovalCommonSettings>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<ApprovalCommonSettings>,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data) setPrevReject(data.approvalPrevStepReject ?? true)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => apiClient.patch('/company-settings', { approvalPrevStepReject: prevReject }),
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
      <PageHeader title="공통 관리" subtitle="전자결재 문서채번·정책을 설정합니다." />

      <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 860 }}>
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" color="text.secondary">문서채번</Typography>
          <SettingRow label="문서번호 형식">
            <Box>
              <Typography variant="body2">
                양식별 채번 패턴에 토큰 사용: <code>{'{ABBR}'}</code>(양식 약어)·<code>{'{YYYY}'}</code>·
                <code>{'{MM}'}</code>·<code>{'{SEQ:4}'}</code>. 예: <code>{'{ABBR}-{YYYY}-{SEQ:4}'}</code>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                양식 약어·채번 규칙은{' '}
                <Link component="button" type="button" onClick={() => router.push('/admin/approval/forms')}>
                  기안양식 관리
                </Link>
                에서 설정합니다.
              </Typography>
            </Box>
          </SettingRow>

          <Typography variant="overline" color="text.secondary" sx={{ mt: 1 }}>정책설정</Typography>
          <SettingRow label="전단계 반려">
            <RadioGroup
              row
              value={prevReject ? 'on' : 'off'}
              onChange={(e) => setPrevReject(e.target.value === 'on')}
            >
              <FormControlLabel value="on" control={<Radio />} label="사용" />
              <FormControlLabel value="off" control={<Radio />} label="사용 안 함" />
            </RadioGroup>
          </SettingRow>
          <Alert severity="info">
            전단계 반려는 결재자가 직전 결재자에게 결재를 되돌리는 기능입니다. ‘사용 안 함’이면 결재
            처리 시 전단계 반려가 차단됩니다.
          </Alert>

          <Box sx={{ mt: 1 }}>
            <Button
              variant="contained"
              onClick={() => saveMutation.mutate()}
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
