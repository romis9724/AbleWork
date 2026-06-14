'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import RefreshIcon from '@mui/icons-material/Refresh'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { dateTimeText } from '@/components/approval/approval-constants'
import {
  useDocuments,
  useDocumentForms,
  useBulkForceDeleteDocuments,
  type DocumentListItem,
} from '@/lib/query/documents'
import { useSnackbar } from '@/hooks/useSnackbar'
import { getApiErrorMessage } from '@/lib/api-error'

// 결재 현황 상태 필터 — 카카오워크 동일(상신/진행중/반려만)
const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'SUBMITTED', label: '상신' },
  { value: 'IN_PROGRESS', label: '진행중' },
  { value: 'REJECTED', label: '반려' },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['value']

interface FilterForm {
  dateFrom: string
  dateTo: string
  formId: string
  status: StatusFilter
  search: string
}

const EMPTY_FILTER: FilterForm = { dateFrom: '', dateTo: '', formId: '', status: '', search: '' }

/** 상신/진행중/반려 표시 칩 — phase(상신/진행중) + REJECTED */
function PhaseChip({ item }: { item: DocumentListItem }) {
  if (item.status === 'REJECTED') {
    return <Chip size="small" label="반려" sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 600 }} />
  }
  if (item.phase === 'IN_PROGRESS') {
    return <Chip size="small" label="진행중" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 600 }} />
  }
  return <Chip size="small" label="상신" sx={{ bgcolor: '#e3f2fd', color: '#1565c0', fontWeight: 600 }} />
}

export default function ApprovalStatusPage() {
  const router = useRouter()
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(20)
  // 필터: 입력값(form) / 적용값(applied) 분리 — [조회] 버튼으로 적용
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTER)
  const [applied, setApplied] = useState<FilterForm>(EMPTY_FILTER)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmBulk, setConfirmBulk] = useState(false)
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  const { data: forms } = useDocumentForms()
  const { data, isLoading, isFetching, refetch } = useDocuments('status', {
    page: page + 1,
    limit,
    ...(applied.status ? { status: applied.status } : {}),
    ...(applied.formId ? { formId: applied.formId } : {}),
    ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
    ...(applied.dateTo ? { dateTo: applied.dateTo } : {}),
    ...(applied.search ? { search: applied.search } : {}),
  })
  const bulkDelete = useBulkForceDeleteDocuments()

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const pageIds = useMemo(() => items.map((i) => i.id), [items])
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const someChecked = selected.length > 0 && !allChecked

  function applyFilter() {
    setApplied(form)
    setPage(0)
    setSelected([])
  }

  function resetFilter() {
    setForm(EMPTY_FILTER)
    setApplied(EMPTY_FILTER)
    setPage(0)
    setSelected([])
  }

  function toggleAll() {
    setSelected(allChecked ? [] : pageIds)
  }

  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleBulkDelete() {
    if (selected.length === 0) return
    bulkDelete.mutate(selected, {
      onSuccess: (res) => {
        const skippedMsg = res.skipped.length
          ? ` (제외 ${res.skipped.length}건 — HR연동/삭제불가 상태)`
          : ''
        showSnackbar(`${res.deletedCount}건 삭제했습니다.${skippedMsg}`)
        setSelected([])
        setConfirmBulk(false)
      },
      onError: (err) => {
        showSnackbar(getApiErrorMessage(err, '선택 삭제에 실패했습니다.'), 'error')
        setConfirmBulk(false)
      },
    })
  }

  return (
    <>
      <PageHeader
        title="결재 현황"
        subtitle="진행 중인 전자결재 문서(상신·진행중·반려)를 조회하고, 오류·중단된 문서를 선택 삭제합니다."
      />

      {/* 필터 바 */}
      <Paper
        elevation={0}
        sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="flex-end">
          <TextField
            type="date"
            size="small"
            label="상신일(시작)"
            value={form.dateFrom}
            onChange={(e) => setForm((f) => ({ ...f, dateFrom: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 170 }}
          />
          <TextField
            type="date"
            size="small"
            label="상신일(종료)"
            value={form.dateTo}
            onChange={(e) => setForm((f) => ({ ...f, dateTo: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 170 }}
          />
          <TextField
            select
            size="small"
            label="기안양식"
            value={form.formId}
            onChange={(e) => setForm((f) => ({ ...f, formId: e.target.value }))}
            sx={{ width: 180 }}
          >
            <MenuItem value="">전체</MenuItem>
            {(forms ?? []).map((fm) => (
              <MenuItem key={fm.id} value={fm.id}>{fm.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="결재상태"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as StatusFilter }))}
            sx={{ width: 130 }}
          >
            {STATUS_FILTERS.map((s) => (
              <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="제목/문서번호"
            value={form.search}
            onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyFilter()
            }}
            sx={{ width: 220 }}
          />
          <Button variant="contained" onClick={applyFilter}>조회</Button>
          <Button variant="text" color="inherit" onClick={resetFilter}>초기화</Button>
        </Stack>
      </Paper>

      {/* 액션 바 */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            총 <b>{total.toLocaleString()}</b>건
            {selected.length > 0 && <> · 선택 {selected.length}건</>}
          </Typography>
          <Tooltip title="새로고침">
            <IconButton size="small" onClick={() => refetch()}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {isFetching && <CircularProgress size={16} />}
        </Stack>
        <Button
          size="small"
          color="error"
          variant="outlined"
          disabled={selected.length === 0 || bulkDelete.isPending}
          onClick={() => setConfirmBulk(true)}
        >
          선택 삭제
        </Button>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <EmptyState message="조회된 문서가 없습니다." />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell padding="checkbox">
                  <Checkbox
                    size="small"
                    checked={allChecked}
                    indeterminate={someChecked}
                    onChange={toggleAll}
                  />
                </TableCell>
                <TableCell>기안양식</TableCell>
                <TableCell>기안 제목</TableCell>
                <TableCell>기안자</TableCell>
                <TableCell>상신일시</TableCell>
                <TableCell>현재 결재자</TableCell>
                <TableCell>결재상태</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const checked = selected.includes(item.id)
                return (
                  <TableRow key={item.id} hover selected={checked}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={checked}
                        onChange={() => toggleOne(item.id)}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.form?.name ?? '—'}</TableCell>
                    <TableCell
                      sx={{ fontWeight: 600, cursor: 'pointer', color: 'primary.main' }}
                      onClick={() => router.push(`/admin/approval/status/${item.id}`)}
                    >
                      {item.title}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.drafter?.name ?? '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTimeText(item.submittedAt)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {item.status === 'REJECTED' ? '—' : (item.currentApprover?.name ?? '—')}
                    </TableCell>
                    <TableCell>
                      <PhaseChip item={item} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={limit}
            rowsPerPageOptions={[10, 20, 50]}
            onPageChange={(_, p) => {
              setPage(p)
              setSelected([])
            }}
            onRowsPerPageChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(0)
              setSelected([])
            }}
            labelRowsPerPage="페이지당 행 수"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
          />
        </TableContainer>
      )}

      <ConfirmDialog
        open={confirmBulk}
        title="선택 문서 삭제"
        message={`선택한 ${selected.length}건의 문서를 삭제하시겠습니까? 되돌릴 수 없습니다. (HR 요청과 연결된 문서는 자동 제외됩니다.)`}
        confirmLabel="선택 삭제"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={hideSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={hideSnackbar} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  )
}
