import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'

export default function DashboardPage() {
  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>
        대시보드
      </Typography>
      <Grid container spacing={3}>
        {['현재 근무 중', '오늘 출근', '오늘 지각', '진행 중 결재'].map((label) => (
          <Grid item xs={12} sm={6} md={3} key={label}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="h4" fontWeight={700} color="primary">
                  —
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  )
}
