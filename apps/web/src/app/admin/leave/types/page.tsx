'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import CircularProgress from '@mui/material/CircularProgress'
import apiClient from '@/lib/api-client'

interface LeaveType { id: string; name: string; displayName?: string; timeOption: string; isActive: boolean }

export default function LeaveTypesPage() {
  const [types, setTypes] = useState<LeaveType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/leaves/types').then((res: unknown) => {
      setTypes(Array.isArray(res) ? res : [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>휴가 유형 관리</Typography>
      {types.length === 0 ? (
        <Typography color="text.secondary">등록된 휴가 유형이 없습니다.</Typography>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>유형명</TableCell>
                <TableCell>표시 이름</TableCell>
                <TableCell>단위</TableCell>
                <TableCell>상태</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {types.map((t) => (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                  <TableCell>{t.displayName ?? '—'}</TableCell>
                  <TableCell>{t.timeOption === 'full_day' ? '하루' : '시간 단위'}</TableCell>
                  <TableCell>
                    <Chip label={t.isActive ? '활성' : '비활성'} color={t.isActive ? 'success' : 'default'} size="small" variant="outlined" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
