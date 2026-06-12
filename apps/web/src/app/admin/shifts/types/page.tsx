'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import Switch from '@mui/material/Switch'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import PageHeader from '@/components/common/PageHeader'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import { useSnackbar } from '@/hooks/useSnackbar'
import { useConfirm } from '@/hooks/useConfirm'
import {
  useShiftTypes,
  useCreateShiftType,
  useUpdateShiftType,
  useDeleteShiftType,
  type ShiftType,
} from '@/lib/query/shifts'

const CATEGORY_OPTIONS = [
  { value: 'REGULAR', label: '일반' },
  { value: 'OVERTIME', label: '연장' },
  { value: 'NIGHT', label: '야간' },
  { value: 'HOLIDAY', label: '휴일' },
  { value: 'REMOTE', label: '재택' },
  { value: 'OFFSITE', label: '외근' },
] as const

const CATEGORY_LABEL: Record<string, string> = {
  REGULAR: '일반', OVERTIME: '연장', NIGHT: '야간',
  HOLIDAY: '휴일', REMOTE: '재택', OFFSITE: '외근',
}

const schema = z.object({
  name: z.string().min(1, '유형명을 입력해주세요'),
  color: z.string(),
  category: z.string().min(1, '분류를 선택해주세요'),
  noClockInRequired: z.boolean(),
  isDeemedWork: z.boolean(),
  deemedWorkHours: z.number().min(0).max(24).optional(),
  confirmedAlert: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface DialogState {
  open: boolean
  editing: ShiftType | null
}

export default function ShiftTypesPage() {
  const { data: types = [], isLoading } = useShiftTypes()
  const createMutation = useCreateShiftType()
  const updateMutation = useUpdateShiftType()
  const deleteMutation = useDeleteShiftType()

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()

  const [dialog, setDialog] = useState<DialogState>({ open: false, editing: null })

  const { control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      color: '#1976d2',
      category: 'REGULAR',
      noClockInRequired: false,
      isDeemedWork: false,
      deemedWorkHours: undefined,
      confirmedAlert: '',
    },
  })

  const isDeemedWork = watch('isDeemedWork')

  const openCreate = () => {
    reset({
      name: '', color: '#1976d2', category: 'REGULAR',
      noClockInRequired: false, isDeemedWork: false,
      deemedWorkHours: undefined, confirmedAlert: '',
    })
    setDialog({ open: true, editing: null })
  }

  const openEdit = (type: ShiftType) => {
    reset({
      name: type.name,
      color: type.color ?? '#1976d2',
      category: type.category,
      noClockInRequired: type.noClockInRequired,
      isDeemedWork: type.isDeemedWork,
      deemedWorkHours: type.deemedWorkHours ?? undefined,
      confirmedAlert: type.confirmedAlert ?? '',
    })
    setDialog({ open: true, editing: type })
  }

  const closeDialog = () => setDialog({ open: false, editing: null })

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      color: values.color,
      category: values.category,
      noClockInRequired: values.noClockInRequired,
      isDeemedWork: values.isDeemedWork,
      ...(values.isDeemedWork && values.deemedWorkHours != null
        ? { deemedWorkHours: values.deemedWorkHours }
        : {}),
      ...(values.confirmedAlert ? { confirmedAlert: values.confirmedAlert } : {}),
    }

    try {
      if (dialog.editing) {
        await updateMutation.mutateAsync({ id: dialog.editing.id, ...payload })
        showSnackbar('근무일정 유형이 수정되었습니다.')
      } else {
        await createMutation.mutateAsync(payload)
        showSnackbar('근무일정 유형이 추가되었습니다.')
      }
      closeDialog()
    } catch {
      showSnackbar('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleDelete = async (type: ShiftType) => {
    const ok = await confirm({
      title: '근무일정 유형 삭제',
      message: `"${type.name}" 유형을 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      confirmColor: 'error',
    })
    if (!ok) return
    try {
      await deleteMutation.mutateAsync(type.id)
      showSnackbar('삭제되었습니다.')
    } catch {
      showSnackbar('삭제 중 오류가 발생했습니다.', 'error')
    }
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
      <PageHeader
        title="근무일정 유형"
        subtitle="근무 분류별 유형을 관리합니다."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            유형 추가
          </Button>
        }
      />

      {types.length === 0 ? (
        <EmptyState
          message="등록된 근무일정 유형이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              첫 유형 추가
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>유형명</TableCell>
                <TableCell>색상</TableCell>
                <TableCell>분류</TableCell>
                <TableCell>간주근로</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {types.map((type) => (
                <TableRow key={type.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{type.name}</TableCell>
                  <TableCell>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        bgcolor: type.color ?? '#1976d2',
                        border: '1px solid',
                        borderColor: 'divider',
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={CATEGORY_LABEL[type.category] ?? type.category}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {type.isDeemedWork ? (
                      <Chip label="사용" color="info" size="small" />
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={type.isActive ? '활성' : '비활성'}
                      color={type.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(type)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(type)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialog.open} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog.editing ? '근무일정 유형 수정' : '근무일정 유형 추가'}</DialogTitle>
        <DialogContent dividers>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="유형명"
                  required
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />

            <Controller
              name="color"
              control={control}
              render={({ field }) => (
                <TextField
                  label="색상"
                  fullWidth
                  value={field.value}
                  onChange={field.onChange}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Box
                          component="input"
                          type="color"
                          value={field.value}
                          onChange={(e) => field.onChange(e.target.value)}
                          sx={{
                            width: 32,
                            height: 32,
                            border: 'none',
                            borderRadius: 1,
                            cursor: 'pointer',
                            p: 0,
                            bgcolor: 'transparent',
                          }}
                        />
                      </InputAdornment>
                    ),
                  }}
                />
              )}
            />

            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="분류"
                  required
                  fullWidth
                  error={!!errors.category}
                  helperText={errors.category?.message}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </TextField>
              )}
            />

            <Controller
              name="noClockInRequired"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="출퇴근 기록 불필요"
                />
              )}
            />

            <Controller
              name="isDeemedWork"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="간주근로 사용"
                />
              )}
            />

            {isDeemedWork && (
              <Controller
                name="deemedWorkHours"
                control={control}
                render={({ field }) => (
                  <TextField
                    label="고정 간주근로 시간 (시)"
                    type="number"
                    fullWidth
                    inputProps={{ min: 0, max: 24, step: 0.5 }}
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
                    error={!!errors.deemedWorkHours}
                    helperText={errors.deemedWorkHours?.message}
                  />
                )}
              />
            )}

            <Controller
              name="confirmedAlert"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="출근 전 확인사항"
                  multiline
                  rows={3}
                  fullWidth
                  placeholder="출근 전 직원에게 안내할 내용을 입력하세요"
                />
              )}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={isSubmitting}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSubmit(onSubmit)}
            disabled={isSubmitting}
          >
            {isSubmitting ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {dialog.editing ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        confirmColor={confirmState.confirmColor}
        loading={deleteMutation.isPending}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
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
