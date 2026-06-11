'use client'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Alert from '@mui/material/Alert'

export default function NotificationsSettingsPage() {
  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>Discord 알림 설정</Typography>
      <Alert severity="info" sx={{ mb: 3 }}>
        Discord Webhook URL을 등록하면 출퇴근·결재·휴가 이벤트 알림을 Discord 채널로 받을 수 있습니다.
      </Alert>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {['#근태-알림', '#결재-알림', '#휴가-알림'].map((channel) => (
          <Card key={channel}>
            <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography fontWeight={600}>{channel}</Typography>
              <Typography variant="body2" color="text.secondary">Webhook URL 미설정</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </>
  )
}
