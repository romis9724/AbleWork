'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import AddIcon from '@mui/icons-material/Add'
import LockIcon from '@mui/icons-material/Lock'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import apiClient from '@/lib/api-client'

interface ReportSnapshot { id: string; name?: string | null; periodStart: string; periodEnd: string; isLocked: boolean; createdAt: string }
interface SnapshotRow { employeeId: string; employeeName?: string; totalWorkDays?: number; lateCount?: number; earlyLeaveCount?: number; absentCount?: number; totalWorkMinutes?: number }

export default function ReportSnapshotsPage() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [name, setName] = useState('')
  const [lockTarget, setLockTarget] = useState<ReportSnapshot | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; msg: string; sev: 'success' | 'error' }>({ open: false, msg: '', sev: 'success' })

  const { data: rawSnapshots, isLoading } = useQuery({
    queryKey: ['report-snapshots'],
    queryFn: () => apiClient.get('/reports/snapshots'),
    staleTime: 30_000,
  })
  const snapshots: ReportSnapshot[] = Array.isArray(rawSnapshots)
    ? rawSnapshots
    : ((rawSnapshots as { items?: ReportSnapshot[] })?.items ?? [])

  const createMutation = useMutation({
    mutationFn: (d: unknown) => apiClient.post('/reports/snapshots', d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-snapshots'] }); setOpen(false); setName(''); setSnack({ open: true, msg: '스냅샷이 생성됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '생성에 실패했습니다.', sev: 'error' }),
  })

  const lockMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/reports/snapshots/${id}/lock`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['report-snapshots'] }); setLockTarget(null); setSnack({ open: true, msg: '스냅샷이 마감됐습니다.', sev: 'success' }) },
    onError: () => setSnack({ open: true, msg: '마감에 실패했습니다.', sev: 'error' }),
  })

  // 행 보기 (저장된 직원별 집계)
  const [viewTarget, setViewTarget] = useState<ReportSnapshot | null>(null)
  const { data: rowsData, isLoading: rowsLoading } = useQuery({
    queryKey: ['snapshot-rows', viewTarget?.id],
    queryFn: () => apiClient.get(`/reports/snapshots/${viewTarget!.id}/rows`) as Promise<{ rows: SnapshotRow[] }>,
    enabled: !!viewTarget,
  })
  const snapshotRows: SnapshotRow[] = rowsData?.rows ?? []

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}><CircularProgress /></Box>

  return (
    <>
      <PageHeader title="리포트 스냅샷" subtitle="특정 기간의 근태 데이터를 저장·마감합니다." actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>스냅샷 생성</Button>} />
      {snapshots.length === 0 ? <EmptyState message="생성된 스냅샷이 없습니다." action={<Button variant="outlined" onClick={() => setOpen(true)}>스냅샷 생성</Button>} /> : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead><TableRow sx={{ bgcolor: 'background.default' }}><TableCell>이름</TableCell><TableCell>기간</TableCell><TableCell>생성일</TableCell><TableCell>상태</TableCell><TableCell /></TableRow></TableHead>
            <TableBody>
              {snapshots.map(s => (
                <TableRow key={s.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{s.name ?? '—'}</TableCell>
                  <TableCell>{s.periodStart?.slice(0,10)} ~ {s.periodEnd?.slice(0,10)}</TableCell>
                  <TableCell>{new Date(s.createdAt).toLocaleDateString('ko-KR')}</TableCell>
                  <TableCell><Chip label={s.isLocked ? '마감' : '열림'} color={s.isLocked ? 'default' : 'success'} size="small" /></TableCell>
                  <TableCell>
                    <Button size="small" onClick={() => setViewTarget(s)}>행 보기</Button>
                    {!s.isLocked && <Button size="small" startIcon={<LockIcon />} onClick={() => setLockTarget(s)}>마감</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>스냅샷 생성</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="스냅샷 이름"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={startDate && endDate ? `${startDate}~${endDate} 스냅샷` : '예: 2026-01 근태 스냅샷'}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField label="시작일" type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          <TextField label="종료일" type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>취소</Button>
          <Button
            onClick={() => createMutation.mutate({
              name: name.trim() || `${startDate}~${endDate} 스냅샷`,
              periodStart: startDate,
              periodEnd: endDate,
              columnConfig: {},
            })}
            variant="contained"
            disabled={createMutation.isPending || !startDate || !endDate}
          >
            생성
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog open={!!lockTarget} title="스냅샷 마감" message="마감 후에는 수정할 수 없습니다. 계속하시겠습니까?" confirmLabel="마감" onConfirm={() => lockTarget && lockMutation.mutate(lockTarget.id)} onCancel={() => setLockTarget(null)} />

      <Dialog open={!!viewTarget} onClose={() => setViewTarget(null)} maxWidth="md" fullWidth>
        <DialogTitle>{viewTarget?.name ?? '스냅샷'} — 직원별 집계</DialogTitle>
        <DialogContent>
          {rowsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
          ) : snapshotRows.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center', color: 'text.secondary' }}>저장된 집계 행이 없습니다.</Box>
          ) : (
            <Table size="small">
              <TableHead><TableRow><TableCell>직원</TableCell><TableCell align="right">근무일</TableCell><TableCell align="right">지각</TableCell><TableCell align="right">조퇴</TableCell><TableCell align="right">결근</TableCell><TableCell align="right">실근무(h)</TableCell></TableRow></TableHead>
              <TableBody>
                {snapshotRows.map((r) => (
                  <TableRow key={r.employeeId}>
                    <TableCell>{r.employeeName ?? r.employeeId}</TableCell>
                    <TableCell align="right">{r.totalWorkDays ?? 0}</TableCell>
                    <TableCell align="right">{r.lateCount ?? 0}</TableCell>
                    <TableCell align="right">{r.earlyLeaveCount ?? 0}</TableCell>
                    <TableCell align="right">{r.absentCount ?? 0}</TableCell>
                    <TableCell align="right">{Math.round((r.totalWorkMinutes ?? 0) / 6) / 10}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
        <DialogActions><Button onClick={() => setViewTarget(null)}>닫기</Button></DialogActions>
      </Dialog>
      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack(s => ({ ...s, open: false }))}><Alert severity={snack.sev}>{snack.msg}</Alert></Snackbar>
    </>
  )
}
