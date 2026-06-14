'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import DocumentDetailDialog from '@/components/approval/DocumentDetailDialog'
import { DocStatusChip } from '@/components/approval/StatusChips'
import { DOC_STATUS_LABEL, dateTimeText } from '@/components/approval/approval-constants'
import {
  useDocuments,
  useForceDeleteDocument,
  type DocumentStatus,
  type DocumentListItem,
} from '@/lib/query/documents'
import { useSnackbar } from '@/hooks/useSnackbar'
import { getApiErrorMessage } from '@/lib/api-error'

const STATUS_OPTIONS: DocumentStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RECALLED']

export default function ApprovalStatusPage() {
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(20)
  const [status, setStatus] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DocumentListItem | null>(null)
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  // 결재 현황은 ledger(회사 전체·전 상태) 조회를 재사용한다.
  const { data, isLoading } = useDocuments('ledger', {
    page: page + 1,
    limit,
    ...(status ? { status } : {}),
  })
  const forceDelete = useForceDeleteDocument()

  const items = data?.items ?? []
  const total = data?.total ?? 0

  function handleConfirmDelete() {
    if (!deleteTarget) return
    forceDelete.mutate(deleteTarget.id, {
      onSuccess: () => {
        showSnackbar('문서를 강제 삭제했습니다.')
        setDeleteTarget(null)
      },
      onError: (err) => {
        showSnackbar(getApiErrorMessage(err, '강제 삭제에 실패했습니다.'), 'error')
        setDeleteTarget(null)
      },
    })
  }

  return (
    <>
      <PageHeader
        title="결재 현황"
        subtitle="회사 전체 전자결재 문서를 조회하고, 오류·중단된 문서를 강제 삭제합니다."
        actions={
          <TextField
            select
            size="small"
            label="상태"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(0)
            }}
            sx={{ width: 160 }}
          >
            <MenuItem value="">전체</MenuItem>
            {STATUS_OPTIONS.map((s) => (
              <MenuItem key={s} value={s}>{DOC_STATUS_LABEL[s]}</MenuItem>
            ))}
          </TextField>
        }
      />

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
                <TableCell>문서번호</TableCell>
                <TableCell>제목</TableCell>
                <TableCell>양식</TableCell>
                <TableCell>기안자</TableCell>
                <TableCell>상태</TableCell>
                <TableCell>상신일</TableCell>
                <TableCell align="right">작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => setDetailId(item.id)}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.docNumber ?? '—'}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{item.title}</TableCell>
                  <TableCell>{item.form?.name ?? '—'}</TableCell>
                  <TableCell>{item.drafter?.name ?? '—'}</TableCell>
                  <TableCell>
                    <DocStatusChip status={item.status} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTimeText(item.submittedAt)}</TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget(item)
                      }}
                    >
                      강제 삭제
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={limit}
            rowsPerPageOptions={[10, 20, 50]}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(0)
            }}
            labelRowsPerPage="페이지당 행 수"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
          />
        </TableContainer>
      )}

      <DocumentDetailDialog
        open={!!detailId}
        documentId={detailId}
        onClose={() => setDetailId(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="문서 강제 삭제"
        message={`'${deleteTarget?.title ?? ''}' 문서를 강제로 삭제하시겠습니까? 되돌릴 수 없습니다. (HR 요청과 연결된 문서는 삭제할 수 없습니다.)`}
        confirmLabel="강제 삭제"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
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
