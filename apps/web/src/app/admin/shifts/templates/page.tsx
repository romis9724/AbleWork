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
import { getApiErrorMessage } from '@/lib/api-error'
import { useConfirm } from '@/hooks/useConfirm'
import {
  useShiftTypes,
  useShiftTemplates,
  useCreateShiftTemplate,
  useUpdateShiftTemplate,
  useDeleteShiftTemplate,
  type ShiftTemplate,
} from '@/lib/query/shifts'

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/

const schema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, '이름을 입력해주세요'),
  shiftTypeId: z.string().min(1, '근무일정 유형을 선택해주세요'),
  startTime: z.string().regex(TIME_REGEX, 'HH:MM 형식으로 입력해주세요'),
  endTime: z.string().regex(TIME_REGEX, 'HH:MM 형식으로 입력해주세요'),
  autoBreak: z.boolean(),
})

type FormValues = z.infer<typeof schema>

interface DialogState {
  open: boolean
  editing: ShiftTemplate | null
}

export default function ShiftTemplatesPage() {
  const { data: templates = [], isLoading: loadingTemplates } = useShiftTemplates()
  const { data: shiftTypes = [], isLoading: loadingTypes } = useShiftTypes()
  const createMutation = useCreateShiftTemplate()
  const updateMutation = useUpdateShiftTemplate()
  const deleteMutation = useDeleteShiftTemplate()

  const { snackbar, showSnackbar, hideSnackbar } = useSnackbar()
  const { confirmState, confirm, handleConfirm, handleCancel } = useConfirm()

  const [dialog, setDialog] = useState<DialogState>({ open: false, editing: null })

  const { control, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
      name: '',
      shiftTypeId: '',
      startTime: '09:00',
      endTime: '18:00',
      autoBreak: false,
    },
  })

  const isLoading = loadingTemplates || loadingTypes

  const openCreate = () => {
    reset({ code: '', name: '', shiftTypeId: '', startTime: '09:00', endTime: '18:00', autoBreak: false })
    setDialog({ open: true, editing: null })
  }

  const openEdit = (template: ShiftTemplate) => {
    reset({
      code: template.code ?? '',
      name: template.name,
      shiftTypeId: template.shiftTypeId,
      startTime: template.startTime,
      endTime: template.endTime,
      autoBreak: false,
    })
    setDialog({ open: true, editing: template })
  }

  const closeDialog = () => setDialog({ open: false, editing: null })

  const onSubmit = async (values: FormValues) => {
    const payload = {
      name: values.name,
      shiftTypeId: values.shiftTypeId,
      startTime: values.startTime,
      endTime: values.endTime,
      autoBreak: values.autoBreak,
      ...(values.code ? { code: values.code } : {}),
    }

    try {
      if (dialog.editing) {
        await updateMutation.mutateAsync({ id: dialog.editing.id, ...payload })
        showSnackbar('템플릿이 수정되었습니다.')
      } else {
        await createMutation.mutateAsync(payload)
        showSnackbar('템플릿이 추가되었습니다.')
      }
      closeDialog()
    } catch {
      showSnackbar('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  const handleDelete = async (template: ShiftTemplate) => {
    const ok = await confirm({
      title: '템플릿 삭제',
      message: `"${template.name}" 템플릿을 삭제하시겠습니까?`,
      confirmLabel: '삭제',
      confirmColor: 'error',
    })
    if (!ok) return
    try {
      await deleteMutation.mutateAsync(template.id)
      showSnackbar('삭제되었습니다.')
    } catch (e) {
      showSnackbar(getApiErrorMessage(e, '삭제 중 오류가 발생했습니다.'), 'error')
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
        title="근무일정 템플릿"
        subtitle="근무 시작·종료 시간과 유형을 미리 정의합니다."
        actions={
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            템플릿 추가
          </Button>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          message="등록된 근무일정 템플릿이 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
              첫 템플릿 추가
            </Button>
          }
        />
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'background.default' }}>
                <TableCell>코드</TableCell>
                <TableCell>이름</TableCell>
                <TableCell>근무 시간</TableCell>
                <TableCell>유형</TableCell>
                <TableCell>상태</TableCell>
                <TableCell align="right">관리</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <TableRow key={template.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                      {template.code ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{template.name}</TableCell>
                  <TableCell>
                    {template.startTime} — {template.endTime}
                  </TableCell>
                  <TableCell>
                    {template.shiftType ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {template.shiftType.color && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: template.shiftType.color,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <Typography variant="body2">{template.shiftType.name}</Typography>
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={template.isActive ? '활성' : '비활성'}
                      color={template.isActive ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEdit(template)}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(template)}>
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
        <DialogTitle>{dialog.editing ? '템플릿 수정' : '템플릿 추가'}</DialogTitle>
        <DialogContent dividers>
          <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
            <Controller
              name="code"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="템플릿 코드 (선택)"
                  fullWidth
                  placeholder="예: DAY, NIGHT, FLEX"
                  inputProps={{ style: { fontFamily: 'monospace' } }}
                />
              )}
            />

            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="이름"
                  required
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />

            <Controller
              name="shiftTypeId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="근무일정 유형"
                  required
                  fullWidth
                  error={!!errors.shiftTypeId}
                  helperText={errors.shiftTypeId?.message}
                >
                  {shiftTypes.map((type) => (
                    <MenuItem key={type.id} value={type.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {type.color && (
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: type.color,
                              flexShrink: 0,
                            }}
                          />
                        )}
                        {type.name}
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Controller
                name="startTime"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="시작 시간"
                    required
                    fullWidth
                    placeholder="09:00"
                    error={!!errors.startTime}
                    helperText={errors.startTime?.message ?? 'HH:MM'}
                  />
                )}
              />
              <Controller
                name="endTime"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="종료 시간"
                    required
                    fullWidth
                    placeholder="18:00"
                    error={!!errors.endTime}
                    helperText={errors.endTime?.message ?? 'HH:MM'}
                  />
                )}
              />
            </Box>

            <Controller
              name="autoBreak"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="자동 휴게시간 사용"
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
