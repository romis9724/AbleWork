'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Fab from '@mui/material/Fab'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import Pagination from '@mui/material/Pagination'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount'
import EmptyState from '@/components/common/EmptyState'
import { useSnackbar } from '@/hooks/useSnackbar'
import { useDocuments, type DocumentBox, type DocumentListItem } from '@/lib/query/documents'
import { BOX_TABS, dateText } from './approval-constants'
import { DocStatusChip } from './StatusChips'
import ProxySettingsDialog from './ProxySettingsDialog'

const PAGE_LIMIT = 20
const MINE_BOXES: DocumentBox[] = ['draft', 'in_progress', 'completed']

/** 기안 작성/편집 페이지 베이스 경로 — me/admin 각 셸의 라우트 */
const COMPOSE_BASE: Record<'me' | 'admin', string> = {
  me: '/me/documents',
  admin: '/admin/approval/inbox',
}

interface Props {
  /** me: 모바일형(FAB), admin: 데스크톱형(헤더 버튼) */
  variant: 'me' | 'admin'
}

/** 직원 문서함 탭 뷰 — 기안함/진행중/완료/결재함/참조/공람/수신 + 기안 작성 + 대리결재 설정 */
export default function DocumentBoxesView({ variant }: Props) {
  const router = useRouter()
  const composeBase = COMPOSE_BASE[variant]
  const [box, setBox] = useState<DocumentBox>('draft')
  const [page, setPage] = useState(1)
  const [proxyOpen, setProxyOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()

  // 검색어 디바운스 — 입력 멈춤 후 300ms에 적용, 페이지 초기화
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading } = useDocuments(box, {
    page,
    limit: PAGE_LIMIT,
    ...(appliedSearch ? { search: appliedSearch } : {}),
  })
  const items = data?.items ?? []
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_LIMIT))
  const isMineBox = MINE_BOXES.includes(box)

  const handleTabChange = (value: DocumentBox) => {
    setBox(value)
    setPage(1)
  }

  const handleItemClick = (item: DocumentListItem) => {
    if (item.status === 'DRAFT' && isMineBox) {
      router.push(`${composeBase}/${item.id}/edit`)
      return
    }
    router.push(`${composeBase}/${item.id}`)
  }

  const openCompose = () => router.push(`${composeBase}/new`)

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

      <TextField
        size="small"
        fullWidth
        placeholder="제목 · 문서번호 검색"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
      />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <EmptyState
          message={appliedSearch ? '검색 결과가 없습니다.' : '문서가 없습니다.'}
          action={
            box === 'draft' && !appliedSearch ? (
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
