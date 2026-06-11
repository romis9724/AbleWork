import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

export default function MessagesPage() {
  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>메시지 관리</Typography>
      <Alert severity="info">메시지 템플릿 등록, 수동 발송, 자동화 규칙 관리 페이지입니다.</Alert>
    </>
  )
}
