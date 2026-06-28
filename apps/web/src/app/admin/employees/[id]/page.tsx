'use client'
import { useEffect, useState } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import Alert from '@mui/material/Alert'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormLabel from '@mui/material/FormLabel'
import IconButton from '@mui/material/IconButton'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter, useParams } from 'next/navigation'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import PageHeader from '@/components/common/PageHeader'
import {
  useEmployee,
  useUpdateEmployee,
  useDeactivateEmployee,
  useActivateEmployee,
  useResetDevice,
  useResetPassword,
  useWageInfos,
  useCreateWageInfo,
  useUpdateWageInfo,
  useDeleteWageInfo,
} from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { usePositions } from '@/lib/query/positions'
import { usePermission } from '@/hooks/usePermission'
import { ACTION_KEYS } from '@ablework/shared-constants'

interface EmployeeFormValues {
  name: string
  phone: string
  employeeNumber: string
  joinedAt: string
  resignedAt: string
  employmentType: string
  accessLevel: string
  organizationIds: string[]
  primaryOrganizationId: string
  positionIds: string[]
}

interface OrgOption {
  id: string
  name: string
  depth: number
}

function flattenOrgs(orgs: Organization[], depth = 0): OrgOption[] {
  return orgs.flatMap((o) => [
    { id: o.id, name: o.name, depth },
    ...(o.children ? flattenOrgs(o.children, depth + 1) : []),
  ])
}

interface WageInfoForm {
  hourlyWage: string
  contractedWorkDays: string[]
  contractedHoursPerWeek: string
  maxHoursPerWeek: string
  effectiveFrom: string
}

interface WageInfo {
  id: string
  effectiveFrom: string
  hourlyWage: number
  contractedWorkDays: string
  contractedHoursPerWeek: number | string
  maxHoursPerWeek: number | string
}

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  regular: '정규직',
  contract: '계약직',
  part_time: '파트타임',
  daily: '일용직',
}

const WORK_DAYS: { value: string; label: string }[] = [
  { value: 'mon', label: '월' },
  { value: 'tue', label: '화' },
  { value: 'wed', label: '수' },
  { value: 'thu', label: '목' },
  { value: 'fri', label: '금' },
  { value: 'sat', label: '토' },
  { value: 'sun', label: '일' },
]

const DEFAULT_WORK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri']

const WORK_DAY_LABEL: Record<string, string> = Object.fromEntries(
  WORK_DAYS.map((d) => [d.value, d.label]),
)

function formatWorkDays(days: string): string {
  if (!days) return '—'
  return days
    .split(',')
    .map((d) => WORK_DAY_LABEL[d.trim()] ?? d.trim())
    .join(', ')
}

export default function EmployeeDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState(0)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [activateOpen, setActivateOpen] = useState(false)
  const [resetDeviceOpen, setResetDeviceOpen] = useState(false)
  const [resetPwOpen, setResetPwOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [addWageOpen, setAddWageOpen] = useState(false)
  const [editingWageId, setEditingWageId] = useState<string | null>(null)
  const [deleteWageId, setDeleteWageId] = useState<string | null>(null)
  const [wageForm, setWageForm] = useState<WageInfoForm>({
    hourlyWage: '',
    contractedWorkDays: DEFAULT_WORK_DAYS,
    contractedHoursPerWeek: '',
    maxHoursPerWeek: '',
    effectiveFrom: '',
  })
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const perm = usePermission()
  const canManage = perm.can(ACTION_KEYS.EMPLOYEE_MANAGE)
  const canResetPassword = perm.can(ACTION_KEYS.EMPLOYEE_RESET_PASSWORD)
  const canResetDevice = perm.can(ACTION_KEYS.EMPLOYEE_RESET_DEVICE)
  const canManageWage = perm.can(ACTION_KEYS.EMPLOYEE_WAGE_MANAGE)
  const canChangeLevel = perm.isGeneralAdmin // 권한 변경은 GENERAL_ADMIN 이상

  const { data: employee, isLoading } = useEmployee(id)
  const updateMutation = useUpdateEmployee()
  const deactivateMutation = useDeactivateEmployee()
  const activateMutation = useActivateEmployee()
  const resetDeviceMutation = useResetDevice()
  const resetPasswordMutation = useResetPassword()
  const isPasswordValid = newPassword.length >= 8 && /[A-Za-z]/.test(newPassword) && /[0-9]/.test(newPassword)
  const { data: wageInfosRaw } = useWageInfos(id)
  const createWageInfoMutation = useCreateWageInfo(id)
  const updateWageInfoMutation = useUpdateWageInfo(id)
  const deleteWageInfoMutation = useDeleteWageInfo(id)
  const { data: orgsRaw = [] } = useOrganizations()
  const { data: positions = [] } = usePositions()
  const orgOptions = flattenOrgs(orgsRaw)

  const wageInfos: WageInfo[] = Array.isArray(wageInfosRaw)
    ? (wageInfosRaw as WageInfo[])
    : ((wageInfosRaw as { items?: WageInfo[] })?.items ?? [])

  const { control, handleSubmit, setValue, formState: { isDirty, errors } } = useForm<EmployeeFormValues>({
    values: {
      name: employee?.name ?? '',
      phone: employee?.phone ?? '',
      employeeNumber: employee?.employeeNumber ?? '',
      joinedAt: employee?.joinedAt?.slice(0, 10) ?? '',
      resignedAt: employee?.resignedAt?.slice(0, 10) ?? '',
      employmentType: employee?.employmentType ?? 'regular',
      accessLevel: employee?.accessLevel ?? 'EMPLOYEE',
      organizationIds: employee?.organizations?.map((o) => o.organization.id) ?? [],
      primaryOrganizationId:
        employee?.organizations?.find((o) => o.isPrimary)?.organization.id ??
        employee?.organizations?.[0]?.organization.id ??
        '',
      positionIds: employee?.positions?.map((p) => p.position.id) ?? [],
    },
  })

  const organizationIds = useWatch({ control, name: 'organizationIds' })
  const primaryOrganizationId = useWatch({ control, name: 'primaryOrganizationId' })

  // 선택 조직이 바뀌면 본조직 값을 항상 유효하게 유지한다
  useEffect(() => {
    if (organizationIds.length === 0) {
      if (primaryOrganizationId) setValue('primaryOrganizationId', '', { shouldDirty: true })
      return
    }
    if (!organizationIds.includes(primaryOrganizationId)) {
      setValue('primaryOrganizationId', organizationIds[0], { shouldDirty: true })
    }
  }, [organizationIds, primaryOrganizationId, setValue])

  async function onSaveBasic(values: EmployeeFormValues) {
    try {
      const { organizationIds: orgIds, primaryOrganizationId: primaryId, positionIds, phone, ...rest } = values
      await updateMutation.mutateAsync({
        id,
        ...rest,
        phone: phone || null,
        resignedAt: values.resignedAt || undefined,
        employeeNumber: values.employeeNumber || undefined,
        // UpdateEmployeeSchema: organizationIds는 min(1) — 비어 있으면 전송하지 않는다
        ...(orgIds.length > 0 && {
          organizationIds: orgIds,
          primaryOrganizationId: orgIds.includes(primaryId) ? primaryId : orgIds[0],
        }),
        positionIds,
      })
      setSnack({ open: true, message: '저장되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' })
    }
  }

  async function handleActivate() {
    try {
      await activateMutation.mutateAsync(id)
      setActivateOpen(false)
      setSnack({ open: true, message: '직원이 재활성화되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '재활성화에 실패했습니다.', severity: 'error' })
    }
  }

  async function handleDeactivate() {
    try {
      await deactivateMutation.mutateAsync({ id })
      setDeactivateOpen(false)
      setSnack({ open: true, message: '직원이 비활성화되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '비활성화에 실패했습니다.', severity: 'error' })
    }
  }

  async function handleResetDevice() {
    try {
      await resetDeviceMutation.mutateAsync(id)
      setResetDeviceOpen(false)
      setSnack({ open: true, message: '기기가 초기화되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '기기 초기화에 실패했습니다.', severity: 'error' })
    }
  }

  async function handleResetPassword() {
    if (!isPasswordValid) return
    try {
      await resetPasswordMutation.mutateAsync({ id, newPassword })
      setResetPwOpen(false)
      setNewPassword('')
      setSnack({ open: true, message: '비밀번호가 재설정되고 계정이 활성화되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '비밀번호 재설정에 실패했습니다.', severity: 'error' })
    }
  }

  function resetWageForm() {
    setEditingWageId(null)
    setWageForm({
      hourlyWage: '',
      contractedWorkDays: DEFAULT_WORK_DAYS,
      contractedHoursPerWeek: '',
      maxHoursPerWeek: '',
      effectiveFrom: '',
    })
  }

  function openWageAdd() {
    resetWageForm()
    setAddWageOpen(true)
  }

  function openWageEdit(w: WageInfo) {
    setEditingWageId(w.id)
    setWageForm({
      hourlyWage: String(w.hourlyWage ?? ''),
      contractedWorkDays: w.contractedWorkDays ? String(w.contractedWorkDays).split(',') : DEFAULT_WORK_DAYS,
      contractedHoursPerWeek: String(w.contractedHoursPerWeek ?? ''),
      maxHoursPerWeek: w.maxHoursPerWeek != null && w.maxHoursPerWeek !== '' ? String(w.maxHoursPerWeek) : '',
      effectiveFrom: w.effectiveFrom ? w.effectiveFrom.slice(0, 10) : '',
    })
    setAddWageOpen(true)
  }

  async function handleSaveWageInfo() {
    const payload = {
      hourlyWage: Number(wageForm.hourlyWage),
      contractedWorkDays: wageForm.contractedWorkDays.join(','),
      contractedHoursPerWeek: Number(wageForm.contractedHoursPerWeek),
      // 미입력 시 키 자체를 제외 (BE 기본값 52 적용)
      ...(wageForm.maxHoursPerWeek ? { maxHoursPerWeek: Number(wageForm.maxHoursPerWeek) } : {}),
      effectiveFrom: wageForm.effectiveFrom,
    }
    try {
      if (editingWageId) {
        await updateWageInfoMutation.mutateAsync({ wageId: editingWageId, ...payload })
        setSnack({ open: true, message: '근로정보가 수정되었습니다.', severity: 'success' })
      } else {
        await createWageInfoMutation.mutateAsync(payload)
        setSnack({ open: true, message: '근로정보가 추가되었습니다.', severity: 'success' })
      }
      setAddWageOpen(false)
      resetWageForm()
    } catch {
      setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' })
    }
  }

  async function handleDeleteWageInfo() {
    if (!deleteWageId) return
    try {
      await deleteWageInfoMutation.mutateAsync(deleteWageId)
      setDeleteWageId(null)
      setSnack({ open: true, message: '근로정보가 삭제되었습니다.', severity: 'success' })
    } catch {
      setDeleteWageId(null)
      setSnack({ open: true, message: '삭제에 실패했습니다.', severity: 'error' })
    }
  }

  function toggleWorkDay(day: string) {
    setWageForm((f) => ({
      ...f,
      contractedWorkDays: f.contractedWorkDays.includes(day)
        ? f.contractedWorkDays.filter((d) => d !== day)
        : WORK_DAYS.filter((d) => f.contractedWorkDays.includes(d.value) || d.value === day).map((d) => d.value),
    }))
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (!employee) {
    return (
      <Box sx={{ mt: 4 }}>
        <Alert severity="error">직원 정보를 찾을 수 없습니다.</Alert>
      </Box>
    )
  }

  return (
    <>
      <PageHeader
        title="직원 상세"
        actions={
          <IconButton onClick={() => router.back()} aria-label="뒤로 가기">
            <ArrowBackIcon />
          </IconButton>
        }
      />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="기본정보" />
        <Tab label="근로정보" />
        <Tab label="기기" />
      </Tabs>

      {/* 기본정보 탭 */}
      {tab === 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Box
              component="form"
              onSubmit={handleSubmit(onSaveBasic)}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
            >
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} label="이름" size="small" sx={{ flex: 1, minWidth: 160 }} />
                  )}
                />
                <Controller
                  name="employeeNumber"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="사원번호"
                      size="small"
                      sx={{ flex: 1, minWidth: 160 }}
                    />
                  )}
                />
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="전화번호"
                      size="small"
                      placeholder="010-0000-0000"
                      sx={{ flex: 1, minWidth: 160 }}
                    />
                  )}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Controller
                  name="organizationIds"
                  control={control}
                  rules={{ validate: (v) => v.length > 0 || '소속 조직을 하나 이상 선택해 주세요.' }}
                  render={({ field }) => (
                    <Autocomplete
                      multiple
                      size="small"
                      options={orgOptions}
                      getOptionLabel={(o) => o.name}
                      isOptionEqualToValue={(o, v) => o.id === v.id}
                      value={orgOptions.filter((o) => field.value.includes(o.id))}
                      onChange={(_, selected) => field.onChange(selected.map((o) => o.id))}
                      renderOption={(props, option) => (
                        <Box
                          component="li"
                          {...props}
                          key={option.id}
                          sx={{ pl: `${16 + option.depth * 16}px !important` }}
                        >
                          {option.name}
                        </Box>
                      )}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => (
                          <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                        ))
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="소속 조직"
                          error={!!errors.organizationIds}
                          helperText={errors.organizationIds?.message}
                        />
                      )}
                      sx={{ flex: 2, minWidth: 280 }}
                    />
                  )}
                />
                <Controller
                  name="primaryOrganizationId"
                  control={control}
                  render={({ field }) => (
                    <FormControl size="small" sx={{ flex: 1, minWidth: 180 }} disabled={organizationIds.length === 0}>
                      <InputLabel>본조직</InputLabel>
                      <Select {...field} label="본조직">
                        {orgOptions
                          .filter((o) => organizationIds.includes(o.id))
                          .map((o) => (
                            <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                          ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Box>

              <Controller
                name="positionIds"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    multiple
                    size="small"
                    options={positions}
                    getOptionLabel={(p) => p.name}
                    isOptionEqualToValue={(o, v) => o.id === v.id}
                    value={positions.filter((p) => field.value.includes(p.id))}
                    onChange={(_, selected) => field.onChange(selected.map((p) => p.id))}
                    renderTags={(value, getTagProps) =>
                      value.map((option, index) => (
                        <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
                      ))
                    }
                    renderInput={(params) => <TextField {...params} label="직위" />}
                  />
                )}
              />

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Controller
                  name="joinedAt"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="입사일"
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 180 }}
                    />
                  )}
                />
                <Controller
                  name="resignedAt"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="퇴사일"
                      type="date"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 180 }}
                    />
                  )}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Controller
                  name="employmentType"
                  control={control}
                  render={({ field }) => (
                    <FormControl size="small" sx={{ width: 180 }}>
                      <InputLabel>고용형태</InputLabel>
                      <Select {...field} label="고용형태">
                        {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([value, label]) => (
                          <MenuItem key={value} value={value}>{label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
                <Controller
                  name="accessLevel"
                  control={control}
                  render={({ field }) => (
                    <FormControl size="small" sx={{ width: 200 }} disabled={!canChangeLevel}>
                      <InputLabel>액세스 권한</InputLabel>
                      <Select {...field} label="액세스 권한">
                        <MenuItem value="EMPLOYEE">직원</MenuItem>
                        <MenuItem value="ORG_ADMIN">조직관리자</MenuItem>
                        <MenuItem value="GENERAL_ADMIN">총괄관리자</MenuItem>
                        <MenuItem value="SUPER_ADMIN">최고관리자</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                <Button
                  data-testid="emp-detail-save-btn"
                  type="submit"
                  variant="contained"
                  disabled={updateMutation.isPending || !isDirty}
                >
                  저장
                </Button>
                {canResetPassword && (
                  <Button
                    data-testid="emp-detail-reset-pw-btn"
                    variant="outlined"
                    color="primary"
                    onClick={() => {
                      setNewPassword('')
                      setResetPwOpen(true)
                    }}
                  >
                    비밀번호 재설정
                  </Button>
                )}
                {canManage &&
                  (employee.isActive ? (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => setDeactivateOpen(true)}
                      disabled={deactivateMutation.isPending}
                    >
                      비활성화
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      color="success"
                      onClick={() => setActivateOpen(true)}
                      disabled={activateMutation.isPending}
                    >
                      재활성화
                    </Button>
                  ))}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 근로정보 탭 */}
      {tab === 1 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            {canManageWage && (
              <Button data-testid="emp-detail-wage-add-btn" variant="outlined" onClick={openWageAdd}>
                + 근로정보 추가
              </Button>
            )}
          </Box>
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{ border: '1px solid', borderColor: 'divider' }}
          >
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell>적용시점</TableCell>
                  <TableCell align="right">시급 (원)</TableCell>
                  <TableCell>계약 근무요일</TableCell>
                  <TableCell align="right">주 계약시간 (h)</TableCell>
                  <TableCell align="right">주 최대시간 (h)</TableCell>
                  {canManageWage && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {wageInfos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canManageWage ? 6 : 5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      근로정보가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  wageInfos.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        {new Date(w.effectiveFrom).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell align="right">
                        {Number(w.hourlyWage).toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell>{formatWorkDays(w.contractedWorkDays)}</TableCell>
                      <TableCell align="right">{Number(w.contractedHoursPerWeek)}</TableCell>
                      <TableCell align="right">{Number(w.maxHoursPerWeek)}</TableCell>
                      {canManageWage && (
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          <IconButton size="small" aria-label="수정" onClick={() => openWageEdit(w)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" aria-label="삭제" onClick={() => setDeleteWageId(w.id)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* 기기 탭 */}
      {tab === 2 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" mb={1}>
              등록된 기기 ID
            </Typography>
            <Typography variant="body1" mb={3} sx={{ fontFamily: 'monospace' }}>
              {employee.deviceId ?? (
                <Chip label="미등록" size="small" variant="outlined" color="default" />
              )}
            </Typography>
            {canResetDevice && (
              <Button
                data-testid="emp-detail-reset-device-btn"
                variant="outlined"
                color="error"
                onClick={() => setResetDeviceOpen(true)}
                disabled={!employee.deviceId || resetDeviceMutation.isPending}
              >
                기기 초기화
              </Button>
            )}
            {!employee.deviceId && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                등록된 기기가 없어 초기화할 수 없습니다.
              </Typography>
            )}
            {employee.deviceId && !canResetDevice && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                기기 초기화는 총괄관리자 이상만 가능합니다.
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* 비활성화 ConfirmDialog */}
      <ConfirmDialog
        open={deactivateOpen}
        title="직원 비활성화"
        message={`${employee.name} 직원을 비활성화하시겠습니까? 비활성화된 직원은 로그인할 수 없습니다.`}
        confirmLabel="비활성화"
        confirmColor="error"
        loading={deactivateMutation.isPending}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateOpen(false)}
      />

      {/* 재활성화 ConfirmDialog */}
      <ConfirmDialog
        open={activateOpen}
        title="직원 재활성화"
        message={`${employee.name} 직원을 재활성화하시겠습니까? 재직 상태로 전환되고 퇴사일이 초기화됩니다.`}
        confirmLabel="재활성화"
        confirmColor="primary"
        loading={activateMutation.isPending}
        onConfirm={handleActivate}
        onCancel={() => setActivateOpen(false)}
      />

      {/* 기기 초기화 ConfirmDialog */}
      <ConfirmDialog
        open={resetDeviceOpen}
        title="기기 초기화"
        message="등록된 기기를 초기화하면 해당 기기에서 앱 출퇴근을 사용할 수 없게 됩니다. 계속하시겠습니까?"
        confirmLabel="초기화"
        confirmColor="error"
        loading={resetDeviceMutation.isPending}
        onConfirm={handleResetDevice}
        onCancel={() => setResetDeviceOpen(false)}
      />

      {/* 비밀번호 재설정 Dialog */}
      <Dialog open={resetPwOpen} onClose={() => setResetPwOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>비밀번호 재설정</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <Typography variant="body2" color="text.secondary">
            {employee.name} 직원의 로그인 비밀번호를 설정합니다. 설정 시 계정이 활성화되어 즉시
            로그인할 수 있습니다.
          </Typography>
          <TextField
            label="새 비밀번호"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            fullWidth
            size="small"
            autoFocus
            error={newPassword.length > 0 && !isPasswordValid}
            helperText="영문자와 숫자를 포함해 8자 이상 입력하세요."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPwOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleResetPassword}
            disabled={!isPasswordValid || resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? <CircularProgress size={20} /> : '재설정'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 근로정보 추가/수정 Dialog */}
      <Dialog open={addWageOpen} onClose={() => { setAddWageOpen(false); resetWageForm() }} maxWidth="xs" fullWidth>
        <DialogTitle>{editingWageId ? '근로정보 수정' : '근로정보 추가'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField
            label="시급 (원)"
            type="number"
            value={wageForm.hourlyWage}
            onChange={(e) => setWageForm((f) => ({ ...f, hourlyWage: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
          />
          <FormControl size="small">
            <FormLabel required sx={{ fontSize: '0.8rem' }}>계약 근무요일</FormLabel>
            <FormGroup row>
              {WORK_DAYS.map((day) => (
                <FormControlLabel
                  key={day.value}
                  control={
                    <Checkbox
                      size="small"
                      checked={wageForm.contractedWorkDays.includes(day.value)}
                      onChange={() => toggleWorkDay(day.value)}
                    />
                  }
                  label={day.label}
                />
              ))}
            </FormGroup>
          </FormControl>
          <TextField
            label="주 계약시간 (시간/주)"
            type="number"
            value={wageForm.contractedHoursPerWeek}
            onChange={(e) => setWageForm((f) => ({ ...f, contractedHoursPerWeek: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
            required
          />
          <TextField
            label="주 최대시간 (시간/주)"
            type="number"
            value={wageForm.maxHoursPerWeek}
            onChange={(e) => setWageForm((f) => ({ ...f, maxHoursPerWeek: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
            helperText="미입력 시 52시간이 적용됩니다."
          />
          <TextField
            label="적용시점"
            type="date"
            value={wageForm.effectiveFrom}
            onChange={(e) => setWageForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddWageOpen(false); resetWageForm() }}>취소</Button>
          <Button
            variant="contained"
            onClick={handleSaveWageInfo}
            disabled={
              createWageInfoMutation.isPending ||
              updateWageInfoMutation.isPending ||
              !wageForm.hourlyWage ||
              wageForm.contractedWorkDays.length === 0 ||
              !wageForm.contractedHoursPerWeek ||
              !wageForm.effectiveFrom
            }
          >
            {editingWageId ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={!!deleteWageId}
        title="근로정보 삭제"
        message="이 근로정보를 삭제하시겠습니까? 되돌릴 수 없습니다."
        confirmLabel="삭제"
        confirmColor="error"
        loading={deleteWageInfoMutation.isPending}
        onConfirm={handleDeleteWageInfo}
        onCancel={() => setDeleteWageId(null)}
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
