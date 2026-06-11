import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'

export default function CompanySettingsPage() {
  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>회사 설정</Typography>
      <Alert severity="info" sx={{ mb: 3 }}>근태·출퇴근·휴가·결재 관련 회사 정책을 설정합니다.</Alert>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {['일반 설정', '출퇴근 설정', '근무일정 설정', '휴가 설정', '결재 설정'].map((s) => (
          <Card key={s}>
            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography fontWeight={600}>{s}</Typography>
              <Typography variant="body2" color="text.secondary">설정 보기 →</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </>
  )
}
