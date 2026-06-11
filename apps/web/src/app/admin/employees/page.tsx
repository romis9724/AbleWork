'use client'
import { useEffect, useState } from 'react'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import apiClient from '@/lib/api-client'

interface Employee {
  id: string
  name: string
  accessLevel: string
  employmentType: string
  joinedAt: string
  isActive: boolean
  user?: { email: string }
  organizations?: { organization: { name: string } }[]
}

const LEVEL_LABEL: Record<string, string> = {
  SUPER_ADMIN: '최고관리자', GENERAL_ADMIN: '총괄관리자', ORG_ADMIN: '조직관리자', EMPLOYEE: '직원',
}
const LEVEL_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  SUPER_ADMIN: 'error', GENERAL_ADMIN: 'warning', ORG_ADMIN: 'info', EMPLOYEE: 'default',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.get('/employees').then((res: unknown) => {
      const data = res as { items: Employee[] }
      setEmployees(data.items ?? [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <Typography variant="h5" fontWeight={700} mb={3}>직원 관리</Typography>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'background.default' }}>
              <TableCell>이름</TableCell>
              <TableCell>이메일</TableCell>
              <TableCell>조직</TableCell>
              <TableCell>고용 형태</TableCell>
              <TableCell>입사일</TableCell>
              <TableCell>권한</TableCell>
              <TableCell>상태</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((emp) => (
              <TableRow key={emp.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{emp.name}</TableCell>
                <TableCell>{emp.user?.email ?? '—'}</TableCell>
                <TableCell>{emp.organizations?.[0]?.organization.name ?? '—'}</TableCell>
                <TableCell>{emp.employmentType === 'regular' ? '정규직' : emp.employmentType}</TableCell>
                <TableCell>{new Date(emp.joinedAt).toLocaleDateString('ko-KR')}</TableCell>
                <TableCell>
                  <Chip label={LEVEL_LABEL[emp.accessLevel] ?? emp.accessLevel} color={LEVEL_COLOR[emp.accessLevel] ?? 'default'} size="small" />
                </TableCell>
                <TableCell>
                  <Chip label={emp.isActive ? '재직 중' : '퇴사'} color={emp.isActive ? 'success' : 'default'} size="small" variant="outlined" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
