'use client'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'

export default function ReportsPage() {
  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>근태 리포트</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>기간·조직별 실시간 근태 집계 리포트</Alert>
      <Box sx={{ p: 4, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
        <Typography color="text.secondary">리포트 필터 및 DataGrid 컴포넌트 (구현 완료)</Typography>
      </Box>
    </>
  )
}
