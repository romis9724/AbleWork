'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Grid from '@mui/material/Grid'
import CircularProgress from '@mui/material/CircularProgress'
import apiClient from '@/lib/api-client'

interface Position { id: string; name: string; color?: string }

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/positions').then((res: unknown) => {
      setPositions(Array.isArray(res) ? res : [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>직무 관리</Typography>
      {positions.length === 0 ? (
        <Typography color="text.secondary">등록된 직무가 없습니다.</Typography>
      ) : (
        <Grid container spacing={2}>
          {positions.map((pos) => (
            <Grid item xs={12} sm={6} md={3} key={pos.id}>
              <Card>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {pos.color && <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: pos.color }} />}
                  <Typography fontWeight={600}>{pos.name}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </>
  )
}
