'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActions from '@mui/material/CardActions'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
  type Position,
} from '@/lib/query/positions'

// ──────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────
const positionSchema = z.object({
  name: z.string().min(1, '직무명을 입력해 주세요.'),
  color: z.string().optional(),
})

type PositionFormValues = z.infer<typeof positionSchema>

// ──────────────────────────────────────────────
// PositionDialog — 추가 / 수정
// ──────────────────────────────────────────────
interface PositionDialogProps {
  open: boolean
  initial?: Position | null
  loading: boolean
  onSubmit: (values: PositionFormValues) => void
  onClose: () => void
}

function PositionDialog({ open, initial, loading, onSubmit, onClose }: PositionDialogProps) {
  const { control, handleSubmit, formState: { errors } } = useForm<PositionFormValues>({
    resolver: zodResolver(positionSchema),
    values: {
      name: initial?.name ?? '',
      color: initial?.color ?? '#1976d2',
    },
  })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{initial ? '직무 수정' : '직무 추가'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="직무명"
              required
              fullWidth
              error={!!errors.name}
              helperText={errors.name?.message}
              autoFocus
            />
          )}
        />
        <Controller
          name="color"
          control={control}
          render={({ field }) => (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 48 }}>색상</Typography>
              <Box
                component="input"
                type="color"
                {...field}
                value={field.value ?? '#1976d2'}
                sx={{
                  width: 40,
                  height: 40,
                  border: 'none',
                  borderRadius: 1,
                  cursor: 'pointer',
                  p: 0,
                  bgcolor: 'transparent',
                }}
              />
              <Typography variant="body2" color="text.secondary">{field.value}</Typography>
            </Box>
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
// PositionsPanel — 직무 목록/추가/수정/삭제 (헤더 없는 임베드용 패널).
// 단독 페이지(/admin/positions)와 회사 설정 '직무' 탭에서 공통 사용한다.
// ──────────────────────────────────────────────
export default function PositionsPanel() {
  const { data: positions = [], isLoading } = usePositions()

  const createMutation = useCreatePosition()
  const updateMutation = useUpdatePosition()
  const deleteMutation = useDeletePosition()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Position | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Position | null>(null)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  const handleCreate = (values: PositionFormValues) => {
    createMutation.mutate(values, {
      onSuccess: () => { setDialogOpen(false); showSnack('직무가 추가되었습니다.', 'success') },
      onError: () => showSnack('직무 추가에 실패했습니다.', 'error'),
    })
  }

  const handleUpdate = (values: PositionFormValues) => {
    if (!editTarget) return
    updateMutation.mutate({ id: editTarget.id, ...values }, {
      onSuccess: () => { setEditTarget(null); showSnack('직무가 수정되었습니다.', 'success') },
      onError: () => showSnack('직무 수정에 실패했습니다.', 'error'),
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => { setDeleteTarget(null); showSnack('직무가 삭제되었습니다.', 'success') },
      onError: (e) => showSnack(getApiErrorMessage(e, '직무 삭제에 실패했습니다.'), 'error'),
    })
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          직무 추가
        </Button>
      </Box>

      {positions.length === 0 ? (
        <EmptyState
          message="등록된 직무가 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              첫 번째 직무 추가
            </Button>
          }
        />
      ) : (
        <Grid container spacing={2}>
          {positions.map((pos) => (
            <Grid item xs={12} sm={6} md={3} key={pos.id}>
              <Card variant="outlined">
                <CardContent sx={{ pb: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {pos.color && (
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          bgcolor: pos.color,
                          flexShrink: 0,
                          border: '2px solid',
                          borderColor: 'divider',
                        }}
                      />
                    )}
                    <Typography fontWeight={600} noWrap>{pos.name}</Typography>
                  </Box>
                  {pos.color && (
                    <Typography variant="caption" color="text.disabled" mt={0.5} display="block">
                      {pos.color}
                    </Typography>
                  )}
                </CardContent>
                <Divider />
                <CardActions sx={{ justifyContent: 'flex-end', py: 0.5 }}>
                  <IconButton size="small" onClick={() => setEditTarget(pos)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(pos)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* 추가 Dialog */}
      {dialogOpen && (
        <PositionDialog
          open={dialogOpen}
          loading={createMutation.isPending}
          onSubmit={handleCreate}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {/* 수정 Dialog */}
      {editTarget && (
        <PositionDialog
          open={!!editTarget}
          initial={editTarget}
          loading={updateMutation.isPending}
          onSubmit={handleUpdate}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 삭제 Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="직무 삭제"
        message={`"${deleteTarget?.name}" 직무를 삭제하시겠습니까?`}
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
