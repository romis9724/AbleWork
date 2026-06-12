'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import Alert from '@mui/material/Alert'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
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
import { useRouter } from 'next/navigation'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import PageHeader from '@/components/common/PageHeader'
import {
  useEmployee,
  useUpdateEmployee,
  useDeactivateEmployee,
  useResetDevice,
  useWageInfos,
  useCreateWageInfo,
} from '@/lib/query/employees'

interface EmployeeFormValues {
  name: string
  employeeNumber: string
  joinedAt: string
  resignedAt: string
  employmentType: string
  accessLevel: string
}

interface WageInfoForm {
  hourlyWage: string
  scheduledWorkHours: string
  maxWorkHours: string
  effectiveDate: string
}

interface WageInfo {
  id: string
  effectiveDate: string
  hourlyWage: number
  scheduledWorkHours: number
  maxWorkHours: number
}

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  regular: '정규직',
  contract: '계약직',
  part_time: '아르바이트',
}

const ACCESS_LEVEL_LABEL: Record<string, string> = {
  EMPLOYEE: '직원',
  ORG_ADMIN: '조직관리자',
  GENERAL_ADMIN: '총괄관리자',
  SUPER_ADMIN: '최고관리자',
}

export default function EmployeeDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { id } = params
  const [tab, setTab] = useState(0)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [resetDeviceOpen, setResetDeviceOpen] = useState(false)
  const [addWageOpen, setAddWageOpen] = useState(false)
  const [wageForm, setWageForm] = useState<WageInfoForm>({
    hourlyWage: '',
    scheduledWorkHours: '',
    maxWorkHours: '',
    effectiveDate: '',
  })
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const { data: employee, isLoading } = useEmployee(id)
  const updateMutation = useUpdateEmployee()
  const deactivateMutation = useDeactivateEmployee()
  const resetDeviceMutation = useResetDevice()
  const { data: wageInfosRaw } = useWageInfos(id)
  const createWageInfoMutation = useCreateWageInfo(id)

  const wageInfos: WageInfo[] = Array.isArray(wageInfosRaw)
    ? (wageInfosRaw as WageInfo[])
    : ((wageInfosRaw as { items?: WageInfo[] })?.items ?? [])

  const { control, handleSubmit, formState: { isDirty } } = useForm<EmployeeFormValues>({
    values: {
      name: employee?.name ?? '',
      employeeNumber: employee?.employeeNumber ?? '',
      joinedAt: employee?.joinedAt?.slice(0, 10) ?? '',
      resignedAt: employee?.resignedAt?.slice(0, 10) ?? '',
      employmentType: employee?.employmentType ?? 'regular',
      accessLevel: employee?.accessLevel ?? 'EMPLOYEE',
    },
  })

  async function onSaveBasic(values: EmployeeFormValues) {
    try {
      await updateMutation.mutateAsync({
        id,
        ...values,
        resignedAt: values.resignedAt || undefined,
        employeeNumber: values.employeeNumber || undefined,
      })
      setSnack({ open: true, message: '저장되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' })
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

  async function handleAddWageInfo() {
    try {
      await createWageInfoMutation.mutateAsync({
        hourlyWage: Number(wageForm.hourlyWage),
        scheduledWorkHours: Number(wageForm.scheduledWorkHours),
        maxWorkHours: Number(wageForm.maxWorkHours),
        effectiveDate: wageForm.effectiveDate,
      })
      setAddWageOpen(false)
      setWageForm({ hourlyWage: '', scheduledWorkHours: '', maxWorkHours: '', effectiveDate: '' })
      setSnack({ open: true, message: '근로정보가 추가되었습니다.', severity: 'success' })
    } catch {
      setSnack({ open: true, message: '추가에 실패했습니다.', severity: 'error' })
    }
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
              </Box>

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
                        <MenuItem value="regular">정규직</MenuItem>
                        <MenuItem value="contract">계약직</MenuItem>
                        <MenuItem value="part_time">아르바이트</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
                <Controller
                  name="accessLevel"
                  control={control}
                  render={({ field }) => (
                    <FormControl size="small" sx={{ width: 200 }}>
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

              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={updateMutation.isPending || !isDirty}
                >
                  저장
                </Button>
                {employee.isActive && (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => setDeactivateOpen(true)}
                    disabled={deactivateMutation.isPending}
                  >
                    비활성화
                  </Button>
                )}
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 근로정보 탭 */}
      {tab === 1 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="outlined" onClick={() => setAddWageOpen(true)}>
              + 근로정보 추가
            </Button>
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
                  <TableCell align="right">소정근로시간 (h)</TableCell>
                  <TableCell align="right">최대근로시간 (h)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {wageInfos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      근로정보가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  wageInfos.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>
                        {new Date(w.effectiveDate).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell align="right">
                        {w.hourlyWage.toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell align="right">{w.scheduledWorkHours}</TableCell>
                      <TableCell align="right">{w.maxWorkHours}</TableCell>
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
            <Button
              variant="outlined"
              color="error"
              onClick={() => setResetDeviceOpen(true)}
              disabled={!employee.deviceId || resetDeviceMutation.isPending}
            >
              기기 초기화
            </Button>
            {!employee.deviceId && (
              <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                등록된 기기가 없어 초기화할 수 없습니다.
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

      {/* 근로정보 추가 Dialog */}
      <Dialog open={addWageOpen} onClose={() => setAddWageOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>근로정보 추가</DialogTitle>
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
          <TextField
            label="소정근로시간 (시간/주)"
            type="number"
            value={wageForm.scheduledWorkHours}
            onChange={(e) => setWageForm((f) => ({ ...f, scheduledWorkHours: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
          />
          <TextField
            label="최대근로시간 (시간/주)"
            type="number"
            value={wageForm.maxWorkHours}
            onChange={(e) => setWageForm((f) => ({ ...f, maxWorkHours: e.target.value }))}
            inputProps={{ min: 0 }}
            fullWidth
            size="small"
          />
          <TextField
            label="적용시점"
            type="date"
            value={wageForm.effectiveDate}
            onChange={(e) => setWageForm((f) => ({ ...f, effectiveDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
            size="small"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddWageOpen(false)}>취소</Button>
          <Button
            variant="contained"
            onClick={handleAddWageInfo}
            disabled={
              createWageInfoMutation.isPending ||
              !wageForm.hourlyWage ||
              !wageForm.effectiveDate
            }
          >
            추가
          </Button>
        </DialogActions>
      </Dialog>

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
