'use client'
import { useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PageHeader from '@/components/common/PageHeader'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import { getApiErrorMessage } from '@/lib/api-error'
import {
  useLeaveGroups,
  useCreateLeaveGroup,
  useUpdateLeaveGroup,
  useDeleteLeaveGroup,
  useLeaveTypes,
  useCreateLeaveType,
  useUpdateLeaveType,
  useDeleteLeaveType,
  type LeaveGroup,
  type LeaveType,
} from '@/lib/query/leaves'

// ── Group form state ──────────────────────────────────────────────────────────

interface GroupForm {
  name: string
  code: string
  overageLimitDays: string
}

const defaultGroupForm: GroupForm = { name: '', code: '', overageLimitDays: '0' }

// ── Type form state ───────────────────────────────────────────────────────────

interface TypeForm {
  name: string
  displayName: string
  code: string
  groupId: string
  timeOption: string
  paidHours: string
  deductionDays: string
  specialOption: string
  minConsecutiveDays: string
  maxConsecutiveDays: string
  isActive: boolean
}

const defaultTypeForm: TypeForm = {
  name: '',
  displayName: '',
  code: '',
  groupId: '',
  timeOption: 'full_day',
  paidHours: '',
  deductionDays: '1',
  specialOption: '',
  minConsecutiveDays: '',
  maxConsecutiveDays: '',
  isActive: true,
}

// 특별 옵션 (SYSTEM_DESIGN: 장기/휴무/휴일)
const SPECIAL_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '없음' },
  { value: 'long_term', label: '장기휴가' },
  { value: 'day_off', label: '휴무' },
  { value: 'holiday', label: '휴일' },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function LeaveTypesPage() {
  const [tab, setTab] = useState(0)

  const { data: groups = [], isLoading: groupsLoading } = useLeaveGroups()
  const { data: types = [], isLoading: typesLoading } = useLeaveTypes()

  const createGroupMutation = useCreateLeaveGroup()
  const updateGroupMutation = useUpdateLeaveGroup()
  const deleteGroupMutation = useDeleteLeaveGroup()
  const createTypeMutation = useCreateLeaveType()
  const updateTypeMutation = useUpdateLeaveType()
  const deleteTypeMutation = useDeleteLeaveType()

  // Group dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<LeaveGroup | null>(null)
  const [groupForm, setGroupForm] = useState<GroupForm>(defaultGroupForm)
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<LeaveGroup | null>(null)

  // Type dialog
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<LeaveType | null>(null)
  const [typeForm, setTypeForm] = useState<TypeForm>(defaultTypeForm)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  function showSnack(message: string, severity: 'success' | 'error' = 'success') {
    setSnack({ open: true, message, severity })
  }

  // ── Group actions ────────────────────────────────────────────────────────────

  function openAddGroup() {
    setEditingGroup(null)
    setGroupForm(defaultGroupForm)
    setGroupDialogOpen(true)
  }

  function openEditGroup(g: LeaveGroup) {
    setEditingGroup(g)
    setGroupForm({
      name: g.name,
      code: g.code ?? '',
      overageLimitDays: String(g.overageLimitDays),
    })
    setGroupDialogOpen(true)
  }

  async function handleSaveGroup() {
    if (!groupForm.name.trim()) return
    const payload = {
      name: groupForm.name.trim(),
      code: groupForm.code.trim() || undefined,
      overageLimitDays: Number(groupForm.overageLimitDays),
    }
    try {
      if (editingGroup) {
        await updateGroupMutation.mutateAsync({ id: editingGroup.id, ...payload })
        showSnack('휴가 그룹이 수정되었습니다.')
      } else {
        await createGroupMutation.mutateAsync(payload)
        showSnack('휴가 그룹이 추가되었습니다.')
      }
      setGroupDialogOpen(false)
    } catch {
      showSnack('저장에 실패했습니다.', 'error')
    }
  }

  async function handleDeleteGroup() {
    if (!deleteGroupTarget) return
    try {
      await deleteGroupMutation.mutateAsync(deleteGroupTarget.id)
      setDeleteGroupTarget(null)
      showSnack('삭제되었습니다.')
    } catch (e) {
      showSnack(getApiErrorMessage(e, '삭제에 실패했습니다.'), 'error')
    }
  }

  // ── Type actions ─────────────────────────────────────────────────────────────

  function openAddType() {
    setEditingType(null)
    setTypeForm(defaultTypeForm)
    setTypeDialogOpen(true)
  }

  function openEditType(t: LeaveType) {
    setEditingType(t)
    setTypeForm({
      name: t.name,
      displayName: t.displayName ?? '',
      code: t.code ?? '',
      groupId: t.group?.id ?? '',
      timeOption: t.timeOption,
      paidHours: t.paidHours != null ? String(t.paidHours) : '',
      deductionDays: String(t.deductionDays),
      specialOption: t.specialOption ?? '',
      minConsecutiveDays: t.minConsecutiveDays != null ? String(t.minConsecutiveDays) : '',
      maxConsecutiveDays: t.maxConsecutiveDays != null ? String(t.maxConsecutiveDays) : '',
      isActive: t.isActive,
    })
    setTypeDialogOpen(true)
  }

  async function handleSaveType() {
    if (!typeForm.name.trim()) return
    const payload = {
      name: typeForm.name.trim(),
      displayName: typeForm.displayName.trim() || undefined,
      code: typeForm.code.trim() || undefined,
      groupId: typeForm.groupId || undefined,
      timeOption: typeForm.timeOption,
      paidHours: typeForm.paidHours !== '' ? Number(typeForm.paidHours) : undefined,
      deductionDays: Number(typeForm.deductionDays),
      specialOption: typeForm.specialOption || undefined,
      minConsecutiveDays:
        typeForm.minConsecutiveDays !== '' ? Number(typeForm.minConsecutiveDays) : undefined,
      maxConsecutiveDays:
        typeForm.maxConsecutiveDays !== '' ? Number(typeForm.maxConsecutiveDays) : undefined,
      isActive: typeForm.isActive,
    }
    try {
      if (editingType) {
        await updateTypeMutation.mutateAsync({ id: editingType.id, ...payload })
        showSnack('휴가 유형이 수정되었습니다.')
      } else {
        await createTypeMutation.mutateAsync(payload)
        showSnack('휴가 유형이 추가되었습니다.')
      }
      setTypeDialogOpen(false)
    } catch {
      showSnack('저장에 실패했습니다.', 'error')
    }
  }

  async function handleDeleteType() {
    if (!deleteTarget) return
    try {
      await deleteTypeMutation.mutateAsync(deleteTarget.id)
      setDeleteTarget(null)
      showSnack('삭제되었습니다.')
    } catch (e) {
      showSnack(getApiErrorMessage(e, '삭제에 실패했습니다.'), 'error')
    }
  }

  const isTypeSaving = createTypeMutation.isPending || updateTypeMutation.isPending

  return (
    <>
      <PageHeader title="휴가 유형 관리" />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="휴가 그룹" />
        <Tab label="휴가 유형" />
      </Tabs>

      {/* ── Tab 0: Groups ──────────────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddGroup}>
              그룹 추가
            </Button>
          </Box>
          {groupsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : groups.length === 0 ? (
            <EmptyState
              message="등록된 휴가 그룹이 없습니다."
              action={
                <Button variant="outlined" startIcon={<AddIcon />} onClick={openAddGroup}>
                  그룹 추가
                </Button>
              }
            />
          ) : (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider' }}
            >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell>그룹명</TableCell>
                    <TableCell>코드</TableCell>
                    <TableCell>초과 제한 일수</TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell align="right">액션</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {groups.map((g: LeaveGroup) => (
                    <TableRow key={g.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{g.name}</TableCell>
                      <TableCell>{g.code ?? '—'}</TableCell>
                      <TableCell>{g.overageLimitDays}일</TableCell>
                      <TableCell>
                        <Chip
                          label={g.isActive === false ? '비활성' : '활성'}
                          color={g.isActive === false ? 'default' : 'success'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditGroup(g)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteGroupTarget(g)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ── Tab 1: Types ───────────────────────────────────────────────────────── */}
      {tab === 1 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAddType}>
              유형 추가
            </Button>
          </Box>
          {typesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : types.length === 0 ? (
            <EmptyState
              message="등록된 휴가 유형이 없습니다."
              action={
                <Button variant="outlined" startIcon={<AddIcon />} onClick={openAddType}>
                  유형 추가
                </Button>
              }
            />
          ) : (
            <TableContainer
              component={Paper}
              elevation={0}
              sx={{ border: '1px solid', borderColor: 'divider' }}
            >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell>유형명</TableCell>
                    <TableCell>표시 이름</TableCell>
                    <TableCell>그룹</TableCell>
                    <TableCell>단위</TableCell>
                    <TableCell>차감 일수</TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell align="right">액션</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {types.map((t: LeaveType) => (
                    <TableRow key={t.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                      <TableCell>{t.displayName ?? '—'}</TableCell>
                      <TableCell>{t.group?.name ?? '—'}</TableCell>
                      <TableCell>{t.timeOption === 'full_day' ? '하루' : '시간 단위'}</TableCell>
                      <TableCell>{t.deductionDays}일</TableCell>
                      <TableCell>
                        <Chip
                          label={t.isActive ? '활성' : '비활성'}
                          color={t.isActive ? 'success' : 'default'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => openEditType(t)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(t)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* ── Add/Edit Group Dialog ──────────────────────────────────────────────── */}
      <Dialog open={groupDialogOpen} onClose={() => setGroupDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingGroup ? '휴가 그룹 수정' : '휴가 그룹 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="그룹명"
            required
            value={groupForm.name}
            onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <TextField
            label="코드 (선택)"
            value={groupForm.code}
            onChange={(e) => setGroupForm((f) => ({ ...f, code: e.target.value }))}
            fullWidth
          />
          <TextField
            label="초과사용 제한 일수"
            type="number"
            value={groupForm.overageLimitDays}
            onChange={(e) => setGroupForm((f) => ({ ...f, overageLimitDays: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGroupDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveGroup}
            disabled={
              createGroupMutation.isPending ||
              updateGroupMutation.isPending ||
              !groupForm.name.trim()
            }
          >
            {editingGroup ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Add/Edit Type Dialog ───────────────────────────────────────────────── */}
      <Dialog open={typeDialogOpen} onClose={() => setTypeDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingType ? '휴가 유형 수정' : '휴가 유형 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="이름"
            required
            value={typeForm.name}
            onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))}
            fullWidth
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="표시 이름 (선택)"
              value={typeForm.displayName}
              onChange={(e) => setTypeForm((f) => ({ ...f, displayName: e.target.value }))}
              fullWidth
            />
            <TextField
              label="코드 (선택)"
              value={typeForm.code}
              onChange={(e) => setTypeForm((f) => ({ ...f, code: e.target.value }))}
              inputProps={{ maxLength: 20 }}
              fullWidth
            />
          </Box>
          <FormControl fullWidth>
            <InputLabel>그룹</InputLabel>
            <Select
              value={typeForm.groupId}
              label="그룹"
              onChange={(e) => setTypeForm((f) => ({ ...f, groupId: e.target.value }))}
            >
              <MenuItem value="">없음</MenuItem>
              {groups.map((g: LeaveGroup) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl component="fieldset">
            <FormLabel component="legend">시간 옵션</FormLabel>
            <RadioGroup
              row
              value={typeForm.timeOption}
              onChange={(e) => setTypeForm((f) => ({ ...f, timeOption: e.target.value }))}
            >
              <FormControlLabel value="full_day" control={<Radio />} label="하루종일" />
              <FormControlLabel value="hourly" control={<Radio />} label="시간입력" />
            </RadioGroup>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="차감 일수"
              type="number"
              value={typeForm.deductionDays}
              onChange={(e) => setTypeForm((f) => ({ ...f, deductionDays: e.target.value }))}
              inputProps={{ min: 0, step: 0.5 }}
              fullWidth
            />
            <TextField
              label="유급 시간 (선택)"
              type="number"
              value={typeForm.paidHours}
              onChange={(e) => setTypeForm((f) => ({ ...f, paidHours: e.target.value }))}
              inputProps={{ min: 0, step: 1 }}
              fullWidth
            />
          </Box>
          <FormControl fullWidth>
            <InputLabel shrink>특별 옵션</InputLabel>
            <Select
              displayEmpty
              value={typeForm.specialOption}
              label="특별 옵션"
              onChange={(e) => setTypeForm((f) => ({ ...f, specialOption: e.target.value }))}
            >
              {SPECIAL_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="최소 연속 일수 (선택)"
              type="number"
              value={typeForm.minConsecutiveDays}
              onChange={(e) => setTypeForm((f) => ({ ...f, minConsecutiveDays: e.target.value }))}
              inputProps={{ min: 1, step: 1 }}
              fullWidth
            />
            <TextField
              label="최대 연속 일수 (선택)"
              type="number"
              value={typeForm.maxConsecutiveDays}
              onChange={(e) => setTypeForm((f) => ({ ...f, maxConsecutiveDays: e.target.value }))}
              inputProps={{ min: 1, step: 1 }}
              fullWidth
            />
          </Box>
          <FormControlLabel
            control={
              <Switch
                checked={typeForm.isActive}
                onChange={(e) => setTypeForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
            }
            label="활성화"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTypeDialogOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveType}
            disabled={isTypeSaving || !typeForm.name.trim()}
          >
            {editingType ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Group Confirm ───────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteGroupTarget}
        title="휴가 그룹 삭제"
        message={`"${deleteGroupTarget?.name}" 그룹을 삭제(비활성화)하시겠습니까?`}
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleteGroupMutation.isPending}
        onConfirm={handleDeleteGroup}
        onCancel={() => setDeleteGroupTarget(null)}
      />

      {/* ── Delete Type Confirm ────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="휴가 유형 삭제"
        message={`"${deleteTarget?.name}" 유형을 삭제하시겠습니까?`}
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleteTypeMutation.isPending}
        onConfirm={handleDeleteType}
        onCancel={() => setDeleteTarget(null)}
      />

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.severity}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </>
  )
}
