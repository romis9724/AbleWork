'use client'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'

export default function ShiftsPage() {
  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>근무일정 관리</Typography>
      <Alert severity="info">
        근무일정 달력 뷰 — 직원별·조직별 근무일정을 조회하고 관리합니다.
      </Alert>
      <Box sx={{ mt: 3, p: 4, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">달력 컴포넌트 (Phase 1 구현 목록 포함)</Typography>
      </Box>
    </>
  )
}
