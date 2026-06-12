'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import {
  useRequests,
  useApproveRequest,
  useRejectRequest,
  useForceApproveRequest,
  useForceRejectRequest,
  useBulkApprove,
  type Request,
} from '@/lib/query/requests'
import { useAuthStore } from '@/stores/auth.store'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_TABS = ['전체', '승인필요', '완료', '거절됨'] as const
type StatusTab = (typeof STATUS_TABS)[number]

const STATUS_FILTER: Record<StatusTab, string | undefined> = {
  전체: undefined,
  승인필요: 'PENDING',
  완료: 'APPROVED',
  거절됨: 'REJECTED',
}

const STATUS_COLOR: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  FORCE_APPROVED: 'success',
  FORCE_REJECTED: 'error',
  CANCELLED: 'default',
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: '승인 대기',
  APPROVED: '승인됨',
  REJECTED: '거절됨',
  FORCE_APPROVED: '강제 승인',
  FORCE_REJECTED: '강제 거절',
  CANCELLED: '취소됨',
}

const TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  SHIFT_CREATE: '근무일정 추가',
  ATTENDANCE_EDIT: '출퇴근 정정',
  DEVICE_CHANGE: '기기 변경',
  OFFSITE_WORK: '외근 신청',
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.accessLevel === 'SUPER_ADMIN'

  // Filters
  const [statusTab, setStatusTab] = useState<StatusTab>('전체')
  const [showAll, setShowAll] = useState(false)

  const queryParams = {
    status: STATUS_FILTER[statusTab],
    allEmployees: showAll || undefined,
  }

  const { data, isLoading } = useRequests(queryParams)
  const requests: Request[] = Array.isArray(data)
    ? data
    : (data as { items?: Request[] })?.items ?? []

  // Selection
  const [selected, setSelected] = useState<string[]>([])

  // Detail dialog
  const [detail, setDetail] = useState<Request | null>(null)
  const [comment, setComment] = useState('')

  // Mutations
  const approveMutation = useApproveRequest()
  const rejectMutation = useRejectRequest()
  const forceApproveMutation = useForceApproveRequest()
  const forceRejectMutation = useForceRejectRequest()
  const bulkApproveMutation = useBulkApprove()

  // Snackbar
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  function openDetail(req: Request) {
    setDetail(req)
    setComment('')
  }

  function closeDetail() {
    setDetail(null)
    setComment('')
  }

  function toggleSelect(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  function toggleSelectAll() {
    const pending = requests.filter((r) => r.status === 'PENDING').map((r) => r.id)
    if (selected.length === pending.length) {
      setSelected([])
    } else {
      setSelected(pending)
    }
  }

  async function handleApprove() {
    if (!detail) return
    try {
      await approveMutation.mutateAsync({ id: detail.id, comment: comment || undefined })
      closeDetail()
      showSnack('요청이 승인되었습니다.')
    } catch {
      showSnack('승인에 실패했습니다.', 'error')
    }
  }

  async function handleReject() {
    if (!detail) return
    try {
      await rejectMutation.mutateAsync({ id: detail.id, comment: comment || undefined })
      closeDetail()
      showSnack('요청이 거절되었습니다.')
    } catch {
      showSnack('거절에 실패했습니다.', 'error')
    }
  }

  async function handleForceApprove() {
    if (!detail) return
    try {
      await forceApproveMutation.mutateAsync({ id: detail.id, comment: comment || undefined })
      closeDetail()
      showSnack('강제 승인되었습니다.')
    } catch {
      showSnack('강제 승인에 실패했습니다.', 'error')
    }
  }

  async function handleForceReject() {
    if (!detail) return
    try {
      await forceRejectMutation.mutateAsync({ id: detail.id, comment: comment || undefined })
      closeDetail()
      showSnack('강제 거절되었습니다.')
    } catch {
      showSnack('강제 거절에 실패했습니다.', 'error')
    }
  }

  async function handleBulkApprove() {
    if (selected.length === 0) return
    try {
      await bulkApproveMutation.mutateAsync(selected)
      setSelected([])
      showSnack(`${selected.length}건 일괄 승인되었습니다.`)
    } catch {
      showSnack('일괄 승인에 실패했습니다.', 'error')
    }
  }

  const pendingRequests = requests.filter((r) => r.status === 'PENDING')
  const allPendingSelected =
    pendingRequests.length > 0 && pendingRequests.every((r) => selected.includes(r.id))
  const isActionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    forceApproveMutation.isPending ||
    forceRejectMutation.isPending

  return (
    <>
      <PageHeader
        title="요청 관리"
        actions={
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
              />
            }
            label="모든 직원 요청 보기"
          />
        }
      />

      {/* Status tabs */}
      <Tabs
        value={statusTab}
        onChange={(_, v: StatusTab) => {
          setStatusTab(v)
          setSelected([])
        }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t} label={t} value={t} />
        ))}
      </Tabs>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {selected.length}건 선택됨
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={handleBulkApprove}
            disabled={bulkApproveMutation.isPending}
          >
            일괄 승인
          </Button>
          <Button size="small" onClick={() => setSelected([])}>
            선택 해제
          </Button>
        </Box>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : requests.length === 0 ? (
        <EmptyState message="요청 내역이 없습니다." />
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{ border: '1px solid', borderColor: 'divider' }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    indeterminate={selected.length > 0 && !allPendingSelected}
                    checked={allPendingSelected}
                    onChange={toggleSelectAll}
                  />
                </TableCell>
                <TableCell>신청자</TableCell>
                <TableCell>요청 유형</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>신청 일시</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {requests.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    // Don't open detail when clicking checkbox
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return
                    openDetail(r)
                  }}
                >
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'PENDING' && (
                      <Checkbox
                        size="small"
                        checked={selected.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{r.requester?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={TYPE_LABEL[r.type] ?? r.type}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={STATUS_LABEL[r.status] ?? r.status}
                      color={STATUS_COLOR[r.status] ?? 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>
                    {new Date(r.createdAt).toLocaleString('ko-KR')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Detail Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={!!detail} onClose={closeDetail} maxWidth="sm" fullWidth>
        <DialogTitle>
          요청 상세
          {detail && (
            <Chip
              label={STATUS_LABEL[detail.status] ?? detail.status}
              color={STATUS_COLOR[detail.status] ?? 'default'}
              size="small"
              sx={{ ml: 1.5 }}
            />
          )}
        </DialogTitle>
        {detail && (
          <>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">신청자</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {detail.requester?.name ?? '—'}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">유형</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {TYPE_LABEL[detail.type] ?? detail.type}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">신청일시</Typography>
                  <Typography variant="body2">
                    {new Date(detail.createdAt).toLocaleString('ko-KR')}
                  </Typography>
                </Box>
              </Box>

              {/* Payload */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                  요청 내용
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'background.default',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 1.5,
                    fontSize: '0.75rem',
                    overflow: 'auto',
                    maxHeight: 200,
                    m: 0,
                  }}
                >
                  {JSON.stringify(detail.payload, null, 2)}
                </Box>
              </Box>

              {/* Comment */}
              {detail.status === 'PENDING' && (
                <TextField
                  label="승인 의견 (선택)"
                  multiline
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  fullWidth
                />
              )}
            </DialogContent>
            <DialogActions sx={{ flexWrap: 'wrap', gap: 1, px: 3, pb: 2 }}>
              <Button onClick={closeDetail} sx={{ mr: 'auto' }}>
                닫기
              </Button>
              {detail.status === 'PENDING' && (
                <>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={handleReject}
                    disabled={isActionPending}
                  >
                    거절
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleApprove}
                    disabled={isActionPending}
                  >
                    승인
                  </Button>
                  {isSuperAdmin && (
                    <>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={handleForceReject}
                        disabled={isActionPending}
                      >
                        강제 거절
                      </Button>
                      <Button
                        variant="contained"
                        color="warning"
                        onClick={handleForceApprove}
                        disabled={isActionPending}
                      >
                        강제 승인
                      </Button>
                    </>
                  )}
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
