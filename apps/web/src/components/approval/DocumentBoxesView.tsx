'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Fab from '@mui/material/Fab'
import IconButton from '@mui/material/IconButton'
import Pagination from '@mui/material/Pagination'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount'
import EmptyState from '@/components/common/EmptyState'
import { useSnackbar } from '@/hooks/useSnackbar'
import { useDocuments, type DocumentBox, type DocumentListItem } from '@/lib/query/documents'
import { BOX_TABS, dateText } from './approval-constants'
import { DocStatusChip } from './StatusChips'
import DocumentComposeDialog from './DocumentComposeDialog'
import DocumentDetailDialog from './DocumentDetailDialog'
import ProxySettingsDialog from './ProxySettingsDialog'

const PAGE_LIMIT = 20
const MINE_BOXES: DocumentBox[] = ['draft', 'in_progress', 'completed']

interface Props {
  /** me: 모바일형(FAB), admin: 데스크톱형(헤더 버튼) */
  variant: 'me' | 'admin'
}

/** 직원 문서함 탭 뷰 — 기안함/진행중/완료/결재함/참조/공람/수신 + 기안 작성 + 대리결재 설정 */
export default function DocumentBoxesView({ variant }: Props) {
  const [box, setBox] = useState<DocumentBox>('draft')
  const [page, setPage] = useState(1)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [composeState, setComposeState] = useState<{ open: boolean; editingId: string | null }>({
    open: false,
    editingId: null,
  })
  const [proxyOpen, setProxyOpen] = useState(false)
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  const { data, isLoading } = useDocuments(box, { page, limit: PAGE_LIMIT })
  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_LIMIT))
  const isMineBox = MINE_BOXES.includes(box)

  const handleTabChange = (value: DocumentBox) => {
    setBox(value)
    setPage(1)
  }

  const handleItemClick = (item: DocumentListItem) => {
    if (item.status === 'DRAFT' && isMineBox) {
      setComposeState({ open: true, editingId: item.id })
      return
    }
    setDetailId(item.id)
  }

  const handleResubmit = (docId: string) => {
    setDetailId(null)
    setComposeState({ open: true, editingId: docId })
  }

  const openCompose = () => setComposeState({ open: true, editingId: null })
  const closeCompose = () => setComposeState({ open: false, editingId: null })

  return (
    <Box sx={{ position: 'relative', pb: variant === 'me' ? 4 : 0 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant={variant === 'me' ? 'h6' : 'h5'} fontWeight={700}>
          내 문서함
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Tooltip title="대리결재 설정">
            <IconButton size="small" onClick={() => setProxyOpen(true)} aria-label="대리결재 설정">
              <SupervisorAccountIcon />
            </IconButton>
          </Tooltip>
          {variant === 'admin' && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCompose}>
              기안 작성
            </Button>
          )}
        </Box>
      </Box>

      <Tabs
        value={box}
        onChange={(_, v) => handleTabChange(v as DocumentBox)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2 }}
      >
        {BOX_TABS.map((t) => (
          <Tab key={t.value} label={t.label} value={t.value} />
        ))}
      </Tabs>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <EmptyState
          message="문서가 없습니다."
          action={
            box === 'draft' ? (
              <Button variant="outlined" startIcon={<AddIcon />} onClick={openCompose}>
                기안 작성
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {items.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardActionArea onClick={() => handleItemClick(item)}>
                <CardContent sx={{ py: '12px !important' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {item.docNumber ?? '번호 미부여'}
                        {item.form?.name ? ` · ${item.form.name}` : ''}
                        {!isMineBox && item.drafter?.name ? ` · ${item.drafter.name}` : ''}
                      </Typography>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {item.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.submittedAt ? `상신 ${dateText(item.submittedAt)}` : '미상신'}
                      </Typography>
                    </Box>
                    <DocStatusChip status={item.status} />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
              <Pagination
                count={totalPages}
                page={page}
                onChange={(_, v) => setPage(v)}
                size="small"
              />
            </Box>
          )}
        </Box>
      )}

      {/* 기안 작성 FAB (직원용) */}
      {variant === 'me' && (
        <Fab
          color="primary"
          aria-label="기안 작성"
          sx={{ position: 'fixed', bottom: 72, right: 16 }}
          onClick={openCompose}
        >
          <AddIcon />
        </Fab>
      )}

      {/* 다이얼로그 — 열릴 때만 마운트해 내부 상태 초기화 */}
      {composeState.open && (
        <DocumentComposeDialog
          open
          editingId={composeState.editingId}
          onClose={closeCompose}
          onSuccess={(msg) => showSnackbar(msg)}
        />
      )}

      <DocumentDetailDialog
        open={!!detailId}
        documentId={detailId}
        onClose={() => setDetailId(null)}
        isMineHint={isMineBox}
        onResubmit={(doc) => handleResubmit(doc.id)}
      />

      {proxyOpen && (
        <ProxySettingsDialog
          open
          onClose={() => setProxyOpen(false)}
          onSuccess={(msg) => showSnackbar(msg)}
        />
      )}

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
    </Box>
  )
}
