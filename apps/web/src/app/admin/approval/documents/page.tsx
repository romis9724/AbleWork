'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
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
import { DocStatusChip } from '@/components/approval/StatusChips'
import { DOC_STATUS_LABEL, dateTimeText } from '@/components/approval/approval-constants'
import { useDocuments, type DocumentStatus } from '@/lib/query/documents'

const STATUS_OPTIONS: DocumentStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RECALLED']

export default function DocumentLedgerPage() {
  const router = useRouter()
  const [page, setPage] = useState(0)
  const [limit, setLimit] = useState(20)
  const [status, setStatus] = useState('')

  const { data, isLoading } = useDocuments('ledger', {
    page: page + 1,
    limit,
    ...(status ? { status } : {}),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <>
      <PageHeader
        title="문서대장"
        subtitle="회사 전체 전자결재 문서를 조회합니다."
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
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/admin/approval/documents/${item.id}`)}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.docNumber ?? '—'}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{item.title}</TableCell>
                  <TableCell>{item.form?.name ?? '—'}</TableCell>
                  <TableCell>{item.drafter?.name ?? '—'}</TableCell>
                  <TableCell>
                    <DocStatusChip status={item.status} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{dateTimeText(item.submittedAt)}</TableCell>
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
    </>
  )
}
