'use client'
import { useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import {
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  type Organization,
} from '@/lib/query/organizations'
import { useEmployees } from '@/lib/query/employees'
import { getApiErrorMessage } from '@/lib/api-error'

// ──────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────
const orgSchema = z.object({
  name: z.string().min(1, '조직명을 입력해 주세요.'),
  parentId: z.string().nullable().optional(),
  approverId: z.string().nullable().optional(),
  // 문서담당자(docManagerId)는 '문서담당 관리' 메뉴에서 다중 지정 — 조직 다이얼로그에서 제거
  address: z.string().optional(),
})

type OrgFormValues = z.infer<typeof orgSchema>

// 트리 루트 헤더 노드의 펼침 상태 키 (실제 조직 id와 충돌하지 않는 예약값)
const ROOT_KEY = '__root__'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
function flattenTree(orgs: Organization[], depth = 0): (Organization & { depth: number })[] {
  return orgs.flatMap((o) => [
    { ...o, depth },
    ...(o.children ? flattenTree(o.children, depth + 1) : []),
  ])
}

// ──────────────────────────────────────────────
// OrgDialog — 추가 / 수정
// ──────────────────────────────────────────────
interface OrgDialogProps {
  open: boolean
  initial?: Organization | null
  organizations: Organization[]
  employees: { id: string; name: string }[]
  loading: boolean
  onSubmit: (values: OrgFormValues) => void
  onClose: () => void
}

function OrgDialog({ open, initial, organizations, employees, loading, onSubmit, onClose }: OrgDialogProps) {
  const { control, handleSubmit, formState: { errors } } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    values: {
      name: initial?.name ?? '',
      parentId: initial?.parentId ?? null,
      approverId: initial?.approverId ?? null,
      address: initial?.address ?? '',
    },
  })

  const flatOrgs = flattenTree(organizations)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? '조직 수정' : '조직 추가'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="조직명"
              required
              fullWidth
              error={!!errors.name}
              helperText={errors.name?.message}
            />
          )}
        />
        <Controller
          name="parentId"
          control={control}
          render={({ field }) => (
            <Autocomplete
              options={flatOrgs.filter((o) => o.id !== initial?.id)}
              getOptionLabel={(o) => ' '.repeat(o.depth * 4) + o.name}
              value={flatOrgs.find((o) => o.id === field.value) ?? null}
              onChange={(_, v) => field.onChange(v?.id ?? null)}
              renderInput={(params) => <TextField {...params} label="상위 조직" />}
              isOptionEqualToValue={(a, b) => a.id === b.id}
            />
          )}
        />
        <Controller
          name="approverId"
          control={control}
          render={({ field }) => (
            <Autocomplete
              options={employees}
              getOptionLabel={(e) => e.name}
              value={employees.find((e) => e.id === field.value) ?? null}
              onChange={(_, v) => field.onChange(v?.id ?? null)}
              renderInput={(params) => <TextField {...params} label="결재권자" />}
              isOptionEqualToValue={(a, b) => a.id === b.id}
            />
          )}
        />
        <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: 13 } }}>
          문서담당자는 <b>전자결재 &gt; 문서담당 관리</b> 메뉴에서 부서별 다중 지정합니다.
          미지정 시 결재권자(팀장)가 부서협조·부서수신을 처리합니다.
        </Alert>
        <Controller
          name="address"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="주소"
              fullWidth
              placeholder="부서 주소 (선택)"
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>취소</Button>
        <Button onClick={handleSubmit(onSubmit)} variant="contained" disabled={loading} data-testid="org-submit-btn">
          {loading ? <CircularProgress size={20} /> : initial ? '수정' : '추가'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ──────────────────────────────────────────────
// OrganizationsPanel — 본문 패널
// 표준 라우트(/admin/organizations)와 회사 설정 임베드(설정 > 조직) 양쪽에서 사용.
// PageHeader는 호출하는 page가 렌더하고, 패널은 자체 "조직 추가" 액션을 가진다.
// ──────────────────────────────────────────────
export default function OrganizationsPanel() {
  const router = useRouter()
  const { data: orgs = [], isLoading } = useOrganizations()
  // 결재권자 선택 + 조직별 직원 목록에 함께 쓰므로 전 직원을 로드한다(상한 500)
  const { data: empData } = useEmployees({ isActive: true, limit: 500 })
  const employees = useMemo(() => empData?.items ?? [], [empData])

  const createMutation = useCreateOrganization()
  const updateMutation = useUpdateOrganization()
  const deleteMutation = useDeleteOrganization()

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Organization | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null)

  // 트리 펼침 상태 — 접은(축소) 노드 id 집합. 비어 있으면 전체 펼침(기본).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleExpand = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const flatOrgs = useMemo(() => flattenTree(orgs), [orgs])

  // 선택한 조직 소속 직원(인사 목록 성격 — 최고관리자 제외)
  const orgEmployees = useMemo(
    () =>
      selectedOrg
        ? employees.filter(
            (e) =>
              e.accessLevel !== 'SUPER_ADMIN' &&
              (e.organizations ?? []).some((o) => o.organization.id === selectedOrg.id),
          )
        : [],
    [selectedOrg, employees],
  )

  // ── 추가
  const handleCreate = (values: OrgFormValues) => {
    // null 값 제거 — 백엔드 Zod UUID 검증이 null을 거부하므로 undefined로 변환
    createMutation.mutate({
      ...values,
      parentId: values.parentId ?? undefined,
      approverId: values.approverId ?? undefined,
    }, {
      onSuccess: () => { setDialogOpen(false); showSnack('조직이 추가되었습니다.', 'success') },
      onError: () => showSnack('조직 추가에 실패했습니다.', 'error'),
    })
  }

  // ── 수정
  const handleUpdate = (values: OrgFormValues) => {
    if (!editTarget) return
    updateMutation.mutate({ id: editTarget.id, ...values }, {
      onSuccess: () => { setEditTarget(null); showSnack('조직이 수정되었습니다.', 'success') },
      onError: () => showSnack('조직 수정에 실패했습니다.', 'error'),
    })
  }

  // ── 삭제
  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null)
        if (selectedOrg?.id === deleteTarget.id) setSelectedOrg(null)
        showSnack('조직이 삭제되었습니다.', 'success')
      },
      onError: (e) => showSnack(getApiErrorMessage(e, '조직 삭제에 실패했습니다.'), 'error'),
    })
  }

  const approverName = (org: Organization) =>
    employees.find((e) => e.id === org.approverId)?.name ?? '—'
  const docManagerName = (org: Organization) => {
    if (org.docManagerId) return employees.find((e) => e.id === org.docManagerId)?.name ?? '—'
    const lead = employees.find((e) => e.id === org.approverId)?.name
    return lead ? `${lead} (팀장 기본)` : '미지정'
  }
  const parentName = (org: Organization) =>
    flatOrgs.find((o) => o.id === org.parentId)?.name ?? '—'

  // ──────────────────────────────────────────────
  // 트리 재귀 렌더 — 핸드오프 다크 트리(.tree-node lvl1/2/3, .on, .tw)
  // 루트 "조직도" 헤더=lvl1, 최상위 조직=lvl2(depth 1로 진입), 그 하위=lvl3 클램프.
  // ──────────────────────────────────────────────
  const renderNode = (org: Organization, depth: number): ReactNode => {
    const children = org.children ?? []
    const hasChildren = children.length > 0
    const isExpanded = !collapsed.has(org.id)
    const lvl = Math.min(depth + 1, 3)
    const isSelected = selectedOrg?.id === org.id

    return (
      <div key={org.id}>
        <div
          className={`tree-node lvl${lvl}` + (isSelected ? ' on' : '')}
          data-testid="org-tree-node"
          onClick={() => setSelectedOrg(org)}
          role="treeitem"
          aria-selected={isSelected}
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          {hasChildren ? (
            <span
              className="tw"
              data-testid="org-expand-toggle"
              onClick={(e) => { e.stopPropagation(); toggleExpand(org.id) }}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              {isExpanded ? '▾' : '▸'}
            </span>
          ) : (
            <span className="tw" style={{ visibility: 'hidden' }}>▾</span>
          )}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {org.name}
          </span>
          <IconButton
            size="small"
            data-testid="org-edit-btn"
            onClick={(e) => { e.stopPropagation(); setEditTarget(org) }}
            sx={{ p: 0.25, color: 'inherit', opacity: 0.55, '&:hover': { opacity: 1 } }}
            aria-label={`${org.name} 수정`}
          >
            <EditIcon sx={{ fontSize: 15 }} />
          </IconButton>
          <IconButton
            size="small"
            data-testid="org-delete-btn"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(org) }}
            sx={{ p: 0.25, color: 'inherit', opacity: 0.55, '&:hover': { opacity: 1, color: 'error.main' } }}
            aria-label={`${org.name} 삭제`}
          >
            <DeleteIcon sx={{ fontSize: 15 }} />
          </IconButton>
        </div>
        {hasChildren && isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* 패널 툴바 — 임베드에서도 "조직 추가"가 보이도록 패널 내부에 배치 */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          data-testid="org-add-btn"
        >
          조직 추가
        </Button>
      </Box>

      {flatOrgs.length === 0 ? (
        <EmptyState
          message="등록된 조직이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              첫 번째 조직 추가
            </Button>
          }
        />
      ) : (
        <Grid container spacing={2}>
          {/* 좌측: 조직 트리 (핸드오프 다크 트리 — 네이티브 재귀 렌더) */}
          <Grid item xs={12} md={5}>
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, py: 1.5, bgcolor: 'background.default' }}>
                조직 목록
              </Typography>
              <Divider />
              <div className="tree" role="tree" aria-label="조직 트리">
                {/* 루트 헤더 노드 — 전체 최상위 조직을 묶는다(선택 불가, 펼침/접기만) */}
                <div
                  className="tree-node lvl1"
                  onClick={() => toggleExpand(ROOT_KEY)}
                  role="treeitem"
                  aria-selected={false}
                  aria-expanded={!collapsed.has(ROOT_KEY)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="tw" data-testid="org-expand-toggle" style={{ userSelect: 'none' }}>
                    {collapsed.has(ROOT_KEY) ? '▸' : '▾'}
                  </span>
                  <span style={{ flex: 1, fontWeight: 700 }}>조직도</span>
                </div>
                {!collapsed.has(ROOT_KEY) && orgs.map((org) => renderNode(org, 1))}
              </div>
            </Paper>
          </Grid>

          {/* 우측: 상세 패널 */}
          <Grid item xs={12} md={7}>
            {selectedOrg ? (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" fontWeight={700}>{selectedOrg.name}</Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => setEditTarget(selectedOrg)}
                  >
                    수정
                  </Button>
                </Box>
                <Divider sx={{ mb: 2 }} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>상위 조직</Typography>
                    <Typography variant="body2">{parentName(selectedOrg)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>결재권자</Typography>
                    <Typography variant="body2">{approverName(selectedOrg)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>문서담당자</Typography>
                    <Typography variant="body2">{docManagerName(selectedOrg)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>계층 깊이</Typography>
                    <Typography variant="body2">{selectedOrg.depth}단계</Typography>
                  </Box>
                </Box>

                {/* 소속 직원 목록 — 클릭 시 직원 상세로 이동 */}
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  소속 직원 <Typography component="span" variant="body2" color="text.secondary">{orgEmployees.length}명</Typography>
                </Typography>
                {orgEmployees.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">소속 직원이 없습니다.</Typography>
                ) : (
                  <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
                    {orgEmployees.map((emp, idx) => (
                      <Box
                        key={emp.id}
                        data-testid="org-employee-row"
                        onClick={() => router.push(`/admin/employees/${emp.id}`)}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          px: 1.5,
                          py: 1.25,
                          cursor: 'pointer',
                          borderBottom: idx < orgEmployees.length - 1 ? '1px solid' : 'none',
                          borderColor: 'divider',
                          '&:hover': { bgcolor: 'action.hover' },
                        }}
                      >
                        <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                          {emp.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {(emp.positions ?? []).map((p) => p.position.name).join(', ') || '—'}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Typography color="text.secondary" textAlign="center">
                  좌측 목록에서 조직을 선택하면 상세 정보를 확인할 수 있습니다.
                </Typography>
              </Paper>
            )}
          </Grid>
        </Grid>
      )}

      {/* 추가 Dialog */}
      {dialogOpen && (
        <OrgDialog
          open={dialogOpen}
          organizations={orgs}
          employees={employees}
          loading={createMutation.isPending}
          onSubmit={handleCreate}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {/* 수정 Dialog */}
      {editTarget && (
        <OrgDialog
          open={!!editTarget}
          initial={editTarget}
          organizations={orgs}
          employees={employees}
          loading={updateMutation.isPending}
          onSubmit={handleUpdate}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 삭제 Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="조직 삭제"
        message={`"${deleteTarget?.name}" 조직을 삭제하시겠습니까? 하위 조직이 있으면 삭제가 실패할 수 있습니다.`}
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
