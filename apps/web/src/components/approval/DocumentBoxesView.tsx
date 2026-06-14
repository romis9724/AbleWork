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
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Pagination from '@mui/material/Pagination'
import Paper from '@mui/material/Paper'
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

type BoxValue = Exclude<DocumentBox, 'ledger' | 'status'>

/** 좌측 계층 네비 그룹 (카카오워크 IA 정합) — 기존 box를 그룹핑만, 의미 변경 없음 */
const BOX_GROUPS: { title: string; items: { value: BoxValue; label: string }[] }[] = [
  {
    title: '기안함',
    items: [
      { value: 'draft', label: '기안함' },
      { value: 'in_progress', label: '진행중' },
      { value: 'completed', label: '완료' },
    ],
  },
  { title: '결재함', items: [{ value: 'pending_approval', label: '결재함' }] },
  {
    title: '수신·공람·참조',
    items: [
      { value: 'receiver', label: '수신함' },
      { value: 'viewer', label: '공람함' },
      { value: 'reference', label: '참조함' },
    ],
  },
  { title: '부서', items: [{ value: 'dept-docs', label: '부서서류함' }] },
]

interface Props {
  /** me: 모바일형(상단 탭+FAB), admin: 데스크톱형(좌측 네비+헤더 버튼) */
  variant: 'me' | 'admin'
}

/** 직원 문서함 — 기안함/진행중/완료/결재함/수신/공람/참조/부서함. me=탭, admin=좌측 계층 네비 */
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

  const selectBox = (value: DocumentBox) => {
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

  const searchBar = (
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
  )

  const content = isLoading ? (
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
          <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small" />
        </Box>
      )}
    </Box>
  )

  return (
    <Box sx={{ position: 'relative', pb: variant === 'me' ? 4 : 0 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
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

      {variant === 'admin' ? (
        /* 데스크톱 — 좌측 계층 네비 + 우측 콘텐츠 */
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
          <Paper
            elevation={0}
            sx={{ width: 200, flexShrink: 0, border: '1px solid', borderColor: 'divider', py: 0.5 }}
          >
            {BOX_GROUPS.map((group) => (
              <List
                key={group.title}
                dense
                disablePadding
                subheader={
                  <ListSubheader disableSticky sx={{ lineHeight: '32px', fontWeight: 700, color: 'text.secondary' }}>
                    {group.title}
                  </ListSubheader>
                }
              >
                {group.items.map((it) => (
                  <ListItemButton
                    key={it.value}
                    selected={box === it.value}
                    onClick={() => selectBox(it.value)}
                    sx={{ pl: 3, py: 0.5 }}
                  >
                    <ListItemText primary={it.label} primaryTypographyProps={{ fontSize: 14 }} />
                  </ListItemButton>
                ))}
              </List>
            ))}
          </Paper>

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            {searchBar}
            {content}
          </Box>
        </Box>
      ) : (
        /* 모바일 — 상단 스크롤 탭 */
        <>
          <Tabs
            value={box}
            onChange={(_, v) => selectBox(v as DocumentBox)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ mb: 2 }}
          >
            {BOX_TABS.map((t) => (
              <Tab key={t.value} label={t.label} value={t.value} />
            ))}
          </Tabs>
          {searchBar}
          {content}
        </>
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
