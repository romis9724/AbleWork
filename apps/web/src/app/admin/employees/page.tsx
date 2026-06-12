'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
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
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import PageHeader from '@/components/common/PageHeader'
import { useDebounce } from '@/hooks/useDebounce'
import {
  useEmployees,
  useCreateEmployee,
  useActivateEmployee,
  type Employee,
} from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { usePositions } from '@/lib/query/positions'
import EmployeeCreateDialog, { type CreateEmployeeFormValues } from './EmployeeCreateDialog'

const LEVEL_LABEL: Record<string, string> = {
  SUPER_ADMIN: '최고관리자', GENERAL_ADMIN: '총괄관리자', ORG_ADMIN: '조직관리자', EMPLOYEE: '직원',
}
const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  regular: '정규직', contract: '계약직', part_time: '파트타임', daily: '일용직',
}
const LEVEL_COLOR: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  SUPER_ADMIN: 'error', GENERAL_ADMIN: 'warning', ORG_ADMIN: 'info', EMPLOYEE: 'default',
}

const SEARCH_DEBOUNCE_MS = 300
const DEFAULT_ROWS_PER_PAGE = 20

function flattenOrgs(orgs: Organization[], depth = 0): (Organization & { depth: number })[] {
  return orgs.flatMap((o) => [
    { ...o, depth },
    ...(o.children ? flattenOrgs(o.children, depth + 1) : []),
  ])
}

/** 본조직(isPrimary) 우선 + 그 외 조직 수 요약 */
function formatOrganizations(emp: Employee): { primary: string; others: number } {
  const orgs = emp.organizations ?? []
  if (orgs.length === 0) return { primary: '—', others: 0 }
  const primary = orgs.find((o) => o.isPrimary) ?? orgs[0]
  return { primary: primary.organization.name, others: orgs.length - 1 }
}

export default function EmployeesPage() {
  const router = useRouter()

  // ── 필터 상태 ──────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_ROWS_PER_PAGE)

  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS)

  const [createOpen, setCreateOpen] = useState(false)
  const [activateTarget, setActivateTarget] = useState<Employee | null>(null)
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })
  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  // ── 데이터 ────────────────────────────────────────────────
  const { data, isLoading, isFetching } = useEmployees({
    search: debouncedSearch || undefined,
    organizationId: organizationId || undefined,
    positionId: positionId || undefined,
    isActive: !showInactive,
    page: page + 1,
    limit: rowsPerPage,
  })
  const employees = data?.items ?? []
  const total = data?.total ?? 0

  const { data: orgsRaw = [] } = useOrganizations()
  const { data: positions = [] } = usePositions()
  const flatOrgs = flattenOrgs(orgsRaw)

  const createMutation = useCreateEmployee()
  const activateMutation = useActivateEmployee()

  const hasFilter = !!debouncedSearch || !!organizationId || !!positionId

  // ── 핸들러 ────────────────────────────────────────────────
  const resetPage = () => setPage(0)

  const handleCreate = (values: CreateEmployeeFormValues) => {
    createMutation.mutate(values, {
      onSuccess: () => {
        setCreateOpen(false)
        showSnack(`직원이 추가되었습니다. 합류코드가 ${values.email}로 발송됩니다.`, 'success')
      },
      onError: () => showSnack('직원 추가에 실패했습니다.', 'error'),
    })
  }

  const handleActivate = () => {
    if (!activateTarget) return
    activateMutation.mutate(activateTarget.id, {
      onSuccess: () => {
        setActivateTarget(null)
        showSnack('직원이 재활성화되었습니다.', 'success')
      },
      onError: () => showSnack('재활성화에 실패했습니다.', 'error'),
    })
  }

  return (
    <>
      <PageHeader
        title="직원 관리"
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            직원 추가
          </Button>
        }
      />

      {/* 검색 / 필터 바 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="이름 / 사번 / 전화번호 검색"
          value={searchInput}
          onChange={(e) => { setSearchInput(e.target.value); resetPage() }}
          sx={{ width: 260 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>조직</InputLabel>
          <Select
            value={organizationId}
            label="조직"
            onChange={(e) => { setOrganizationId(e.target.value); resetPage() }}
          >
            <MenuItem value="">전체</MenuItem>
            {flatOrgs.map((o) => (
              <MenuItem key={o.id} value={o.id} sx={{ pl: 2 + o.depth * 2 }}>
                {o.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>직무</InputLabel>
          <Select
            value={positionId}
            label="직무"
            onChange={(e) => { setPositionId(e.target.value); resetPage() }}
          >
            <MenuItem value="">전체</MenuItem>
            {positions.map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showInactive}
              onChange={(e) => { setShowInactive(e.target.checked); resetPage() }}
            />
          }
          label={<Typography variant="body2">비활성(퇴사) 직원 보기</Typography>}
        />
        {isFetching && !isLoading && <CircularProgress size={18} />}
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : employees.length === 0 ? (
        <EmptyState
          message={
            hasFilter
              ? '조건에 맞는 직원이 없습니다.'
              : showInactive
                ? '비활성(퇴사) 직원이 없습니다.'
                : '등록된 직원이 없습니다.'
          }
          action={
            !hasFilter && !showInactive ? (
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
                첫 번째 직원 추가
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>사원번호</TableCell>
                <TableCell>이름</TableCell>
                <TableCell>이메일</TableCell>
                <TableCell>조직</TableCell>
                <TableCell>고용 형태</TableCell>
                <TableCell>입사일</TableCell>
                <TableCell>권한</TableCell>
                <TableCell>상태</TableCell>
                {showInactive && <TableCell align="right" />}
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.map((emp) => {
                const { primary, others } = formatOrganizations(emp)
                return (
                  <TableRow
                    key={emp.id}
                    hover
                    sx={{ cursor: 'pointer', ...(emp.isActive ? {} : { opacity: 0.65 }) }}
                    onClick={() => router.push(`/admin/employees/${emp.id}`)}
                  >
                    <TableCell sx={{ color: 'text.secondary' }}>{emp.employeeNumber ?? '—'}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{emp.name}</TableCell>
                    <TableCell>{emp.user?.email ?? '—'}</TableCell>
                    <TableCell>
                      <Tooltip
                        title={(emp.organizations ?? []).map((o) => o.organization.name).join(', ')}
                        disableHoverListener={others === 0}
                      >
                        <span>
                          {primary}
                          {others > 0 && (
                            <Typography component="span" variant="caption" color="text.secondary">
                              {` 외 ${others}`}
                            </Typography>
                          )}
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{EMPLOYMENT_TYPE_LABEL[emp.employmentType] ?? emp.employmentType}</TableCell>
                    <TableCell>{new Date(emp.joinedAt).toLocaleDateString('ko-KR')}</TableCell>
                    <TableCell>
                      <Chip
                        label={LEVEL_LABEL[emp.accessLevel] ?? emp.accessLevel}
                        color={LEVEL_COLOR[emp.accessLevel] ?? 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={emp.isActive ? '재직 중' : '퇴사'}
                        color={emp.isActive ? 'success' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    {showInactive && (
                      <TableCell align="right">
                        {!emp.isActive && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => { e.stopPropagation(); setActivateTarget(emp) }}
                          >
                            재활성화
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); resetPage() }}
            rowsPerPageOptions={[10, 20, 50, 100]}
            labelRowsPerPage="페이지당 행 수"
            labelDisplayedRows={({ from, to, count }) => `${count}명 중 ${from}–${to}`}
          />
        </TableContainer>
      )}

      {/* 직원 추가 Dialog */}
      {createOpen && (
        <EmployeeCreateDialog
          open={createOpen}
          loading={createMutation.isPending}
          onSubmit={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {/* 재활성화 Confirm */}
      <ConfirmDialog
        open={!!activateTarget}
        title="직원 재활성화"
        message={`${activateTarget?.name} 직원을 재활성화하시겠습니까? 재직 상태로 전환되고 퇴사일이 초기화됩니다.`}
        confirmLabel="재활성화"
        confirmColor="primary"
        loading={activateMutation.isPending}
        onConfirm={handleActivate}
        onCancel={() => setActivateTarget(null)}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
