'use client'
import { useState } from 'react'
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
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import Autocomplete from '@mui/material/Autocomplete'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PageHeader from '@/components/common/PageHeader'
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
})

type OrgFormValues = z.infer<typeof orgSchema>

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
              getOptionLabel={(o) => ' '.repeat(o.depth * 4) + o.name}
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>취소</Button>
        <Button onClick={handleSubmit(onSubmit)} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : initial ? '수정' : '추가'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ──────────────────────────────────────────────
// Main Page
// ──────────────────────────────────────────────
export default function OrganizationsPage() {
  const { data: orgs = [], isLoading } = useOrganizations()
  const { data: empData } = useEmployees({ isActive: true })
  const employees = empData?.items ?? []

  const createMutation = useCreateOrganization()
  const updateMutation = useUpdateOrganization()
  const deleteMutation = useDeleteOrganization()

  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Organization | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const flatOrgs = flattenTree(orgs)

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
  const parentName = (org: Organization) =>
    flatOrgs.find((o) => o.id === org.parentId)?.name ?? '—'

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <PageHeader
        title="조직 관리"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            조직 추가
          </Button>
        }
      />

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
          {/* 좌측: 조직 트리 */}
          <Grid item xs={12} md={5}>
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ px: 2, py: 1.5, bgcolor: 'background.default' }}>
                조직 목록
              </Typography>
              <Divider />
              <List disablePadding>
                {flatOrgs.map((org) => (
                  <ListItemButton
                    key={org.id}
                    selected={selectedOrg?.id === org.id}
                    onClick={() => setSelectedOrg(org)}
                    sx={{ pl: 2 + org.depth * 3 }}
                  >
                    <ListItemText
                      primary={org.name}
                      primaryTypographyProps={{ fontWeight: org.depth === 0 ? 700 : 400 }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); setEditTarget(org) }}
                      sx={{ mr: 0.5 }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(org) }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemButton>
                ))}
              </List>
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
                    <Typography variant="body2" color="text.secondary" sx={{ minWidth: 80 }}>계층 깊이</Typography>
                    <Typography variant="body2">{selectedOrg.depth}단계</Typography>
                  </Box>
                </Box>
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
    </>
  )
}
