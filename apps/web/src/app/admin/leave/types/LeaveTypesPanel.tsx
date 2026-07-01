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
import FormHelperText from '@mui/material/FormHelperText'
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
import TableSortLabel from '@mui/material/TableSortLabel'
import Paper from '@mui/material/Paper'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import { getApiErrorMessage } from '@/lib/api-error'
import { usePermission } from '@/hooks/usePermission'
import { ACTION_KEYS } from '@ablework/shared-constants'
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
import {
  defaultGroupForm,
  defaultTypeForm,
  SPECIAL_OPTIONS,
  FIELD_HELP,
  validateTypeForm,
  type GroupForm,
  type TypeForm,
  type TypeSortKey,
} from './leave-types.helpers'

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 휴가 유형(그룹/유형) 관리 본문 패널.
 * 표준 라우트(/admin/leave/types)와 회사 설정 임베드(설정 > 휴가 > 유형) 양쪽에서 동일하게 사용.
 * PageHeader는 호출하는 page가 렌더하고, 패널은 자체 탭/툴바를 가진다.
 */
export default function LeaveTypesPanel() {
  const [tab, setTab] = useState(0)

  // 휴가 마스터(그룹/유형/발생규칙) CUD 권한 — 없으면 추가/수정/삭제 버튼 숨김
  const perm = usePermission()
  const canManageLeave = perm.can(ACTION_KEYS.LEAVE_MANAGE)

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
  const [typeSubmitAttempted, setTypeSubmitAttempted] = useState(false)

  // 유형 목록 필터·정렬
  const [typeGroupFilter, setTypeGroupFilter] = useState('')
  const [typeSortKey, setTypeSortKey] = useState<TypeSortKey>('group')
  const [typeSortDir, setTypeSortDir] = useState<'asc' | 'desc'>('asc')

  const typeErrors = validateTypeForm(typeForm)
  const hasTypeErrors = Object.keys(typeErrors).length > 0

  function toggleTypeSort(key: TypeSortKey) {
    if (typeSortKey === key) {
      setTypeSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setTypeSortKey(key)
      setTypeSortDir('asc')
    }
  }

  const displayedTypes = [...types]
    .filter((t) => !typeGroupFilter || t.group?.id === typeGroupFilter)
    .sort((a, b) => {
      const dir = typeSortDir === 'asc' ? 1 : -1
      if (typeSortKey === 'group') {
        return (a.group?.name ?? '').localeCompare(b.group?.name ?? '', 'ko') * dir
      }
      if (typeSortKey === 'paidHours') {
        return ((a.paidHours ?? 0) - (b.paidHours ?? 0)) * dir
      }
      return (Number(a.deductionDays) - Number(b.deductionDays)) * dir
    })

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
    setTypeSubmitAttempted(false)
    setTypeDialogOpen(true)
  }

  function openEditType(t: LeaveType) {
    setEditingType(t)
    setTypeSubmitAttempted(false)
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
    setTypeSubmitAttempted(true)
    if (Object.keys(validateTypeForm(typeForm)).length > 0) return
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
    <Box sx={{ minWidth: 0 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="휴가 그룹" />
        <Tab label="휴가 유형" />
      </Tabs>

      {/* ── Tab 0: Groups ──────────────────────────────────────────────────────── */}
      {tab === 0 && (
        <>
          {canManageLeave && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openAddGroup}
                data-testid="leave-group-add-btn"
              >
                그룹 추가
              </Button>
            </Box>
          )}
          {groupsLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : groups.length === 0 ? (
            <EmptyState
              message="등록된 휴가 그룹이 없습니다."
              action={
                canManageLeave ? (
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={openAddGroup}
                    data-testid="leave-group-add-btn"
                  >
                    그룹 추가
                  </Button>
                ) : undefined
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
                    <TableRow key={g.id} hover data-testid="leave-group-row">
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
                        {canManageLeave && (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => openEditGroup(g)}
                              data-testid="leave-group-edit-btn"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteGroupTarget(g)}
                              data-testid="leave-group-delete-btn"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>그룹 필터</InputLabel>
              <Select
                value={typeGroupFilter}
                label="그룹 필터"
                onChange={(e) => setTypeGroupFilter(e.target.value)}
                data-testid="leave-type-group-filter"
              >
                <MenuItem value="">전체 그룹</MenuItem>
                {groups.map((g: LeaveGroup) => (
                  <MenuItem key={g.id} value={g.id}>
                    {g.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {canManageLeave && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openAddType}
                data-testid="leave-type-add-btn"
              >
                유형 추가
              </Button>
            )}
          </Box>
          {typesLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : types.length === 0 ? (
            <EmptyState
              message="등록된 휴가 유형이 없습니다."
              action={
                canManageLeave ? (
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={openAddType}
                    data-testid="leave-type-add-btn"
                  >
                    유형 추가
                  </Button>
                ) : undefined
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
                    <TableCell sortDirection={typeSortKey === 'group' ? typeSortDir : false}>
                      <TableSortLabel
                        active={typeSortKey === 'group'}
                        direction={typeSortKey === 'group' ? typeSortDir : 'asc'}
                        onClick={() => toggleTypeSort('group')}
                      >
                        그룹
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>단위</TableCell>
                    <TableCell sortDirection={typeSortKey === 'paidHours' ? typeSortDir : false}>
                      <TableSortLabel
                        active={typeSortKey === 'paidHours'}
                        direction={typeSortKey === 'paidHours' ? typeSortDir : 'asc'}
                        onClick={() => toggleTypeSort('paidHours')}
                      >
                        차감 시간
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sortDirection={typeSortKey === 'deductionDays' ? typeSortDir : false}>
                      <TableSortLabel
                        active={typeSortKey === 'deductionDays'}
                        direction={typeSortKey === 'deductionDays' ? typeSortDir : 'asc'}
                        onClick={() => toggleTypeSort('deductionDays')}
                      >
                        차감 일수
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>상태</TableCell>
                    <TableCell align="right">액션</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedTypes.map((t: LeaveType) => (
                    <TableRow key={t.id} hover data-testid="leave-type-row">
                      <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                      <TableCell>{t.displayName ?? '—'}</TableCell>
                      <TableCell>{t.group?.name ?? '—'}</TableCell>
                      <TableCell>{t.timeOption === 'full_day' ? '하루' : '시간 단위'}</TableCell>
                      <TableCell>{t.paidHours != null ? `${t.paidHours}시간` : '—'}</TableCell>
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
                        {canManageLeave && (
                          <>
                            <IconButton
                              size="small"
                              onClick={() => openEditType(t)}
                              data-testid="leave-type-edit-btn"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => setDeleteTarget(t)}
                              data-testid="leave-type-delete-btn"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </>
                        )}
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
            inputProps={{ 'data-testid': 'leave-group-name-input' }}
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
            data-testid="leave-group-submit-btn"
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
            error={typeSubmitAttempted && !!typeErrors.name}
            helperText={(typeSubmitAttempted && typeErrors.name) || '관리·리포트에서 사용하는 휴가 유형의 정식 이름.'}
            inputProps={{ 'data-testid': 'leave-type-name-input' }}
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="표시 이름 (선택)"
              value={typeForm.displayName}
              onChange={(e) => setTypeForm((f) => ({ ...f, displayName: e.target.value }))}
              fullWidth
              helperText={FIELD_HELP.displayName}
            />
            <TextField
              label="코드 (선택)"
              value={typeForm.code}
              onChange={(e) => setTypeForm((f) => ({ ...f, code: e.target.value }))}
              inputProps={{ maxLength: 20 }}
              fullWidth
              helperText={FIELD_HELP.code}
            />
          </Box>
          <FormControl fullWidth required error={typeSubmitAttempted && !!typeErrors.groupId}>
            <InputLabel>그룹</InputLabel>
            <Select
              value={typeForm.groupId}
              label="그룹"
              onChange={(e) => setTypeForm((f) => ({ ...f, groupId: e.target.value }))}
              data-testid="leave-type-group-select"
            >
              {groups.map((g: LeaveGroup) => (
                <MenuItem key={g.id} value={g.id}>
                  {g.name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{(typeSubmitAttempted && typeErrors.groupId) || FIELD_HELP.group}</FormHelperText>
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
            <FormHelperText>{FIELD_HELP.timeOption}</FormHelperText>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="차감 일수"
              type="number"
              value={typeForm.deductionDays}
              onChange={(e) => setTypeForm((f) => ({ ...f, deductionDays: e.target.value }))}
              inputProps={{ min: 0, step: 0.5 }}
              fullWidth
              error={typeSubmitAttempted && !!typeErrors.deductionDays}
              helperText={(typeSubmitAttempted && typeErrors.deductionDays) || FIELD_HELP.deductionDays}
            />
            <TextField
              label={typeForm.timeOption === 'hourly' ? '유급 시간 (필수)' : '유급 시간 (선택)'}
              type="number"
              value={typeForm.paidHours}
              onChange={(e) => setTypeForm((f) => ({ ...f, paidHours: e.target.value }))}
              inputProps={{ min: 0, step: 1 }}
              fullWidth
              error={typeSubmitAttempted && !!typeErrors.paidHours}
              helperText={(typeSubmitAttempted && typeErrors.paidHours) || FIELD_HELP.paidHours}
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
            <FormHelperText>{FIELD_HELP.specialOption}</FormHelperText>
          </FormControl>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="최소 연속 일수 (선택)"
              type="number"
              value={typeForm.minConsecutiveDays}
              onChange={(e) => setTypeForm((f) => ({ ...f, minConsecutiveDays: e.target.value }))}
              inputProps={{ min: 1, step: 1 }}
              fullWidth
              helperText={FIELD_HELP.consecutive}
            />
            <TextField
              label="최대 연속 일수 (선택)"
              type="number"
              value={typeForm.maxConsecutiveDays}
              onChange={(e) => setTypeForm((f) => ({ ...f, maxConsecutiveDays: e.target.value }))}
              inputProps={{ min: 1, step: 1 }}
              fullWidth
              error={typeSubmitAttempted && !!typeErrors.maxConsecutiveDays}
              helperText={(typeSubmitAttempted && typeErrors.maxConsecutiveDays) || ' '}
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
            disabled={isTypeSaving || (typeSubmitAttempted && hasTypeErrors)}
            data-testid="leave-type-submit-btn"
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
    </Box>
  )
}
