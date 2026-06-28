'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import FormControlLabel from '@mui/material/FormControlLabel'
import Snackbar from '@mui/material/Snackbar'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import apiClient from '@/lib/api-client'
import { HelpTip } from '@/components/ab/HelpTip'

interface PermissionSettings {
  orgAdmin: Record<string, boolean>
  employee: Record<string, boolean>
}

const ORG_ADMIN_PERMISSIONS = [
  { key: 'employee_manage', label: '직원 추가/수정', help: 'perm.orgAdmin.employeeManage' },
  { key: 'employee_device_reset', label: '직원 기기 초기화', help: 'perm.orgAdmin.deviceReset' },
  { key: 'work_info_manage', label: '근로정보 관리', help: 'perm.orgAdmin.workInfo' },
  { key: 'shift_manage', label: '근무일정 관리', help: 'perm.orgAdmin.shift' },
  { key: 'shift_template_manage', label: '근무일정 템플릿 관리', help: 'perm.orgAdmin.shiftTemplate' },
  { key: 'leave_manage', label: '휴가 관리', help: 'perm.orgAdmin.leave' },
  { key: 'attendance_manage', label: '출퇴근기록 추가/수정/삭제', help: 'perm.orgAdmin.attendance' },
]

const EMPLOYEE_PERMISSIONS = [
  { key: 'org_view_all', label: '모든 조직 열람', help: 'perm.employee.viewAllOrgs' },
  { key: 'shift_view_others', label: '근무일정 조회 (다른 직원)', help: 'perm.employee.viewOthersShift' },
  { key: 'attendance_view', label: '출퇴근 기록 열람', help: 'perm.employee.viewAttendance' },
]

/**
 * 권한 설정 본문 패널.
 * 표준 라우트(/admin/settings/permissions)와 회사 설정 임베드(설정 > 권한) 양쪽에서 사용.
 * PageHeader는 호출하는 page가 렌더하고, 패널은 자체 저장 액션을 가진다.
 */
export default function PermissionsPanel() {
  const [tab, setTab] = useState(0)
  const [orgAdminPerms, setOrgAdminPerms] = useState<Record<string, boolean>>({})
  const [employeePerms, setEmployeePerms] = useState<Record<string, boolean>>({})
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const { data: settings, isLoading } = useQuery<PermissionSettings>({
    queryKey: ['permission-settings'],
    queryFn: () => apiClient.get('/permission-settings') as Promise<PermissionSettings>,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (settings) {
      setOrgAdminPerms(settings.orgAdmin ?? {})
      setEmployeePerms(settings.employee ?? {})
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (data: PermissionSettings) => apiClient.patch('/permission-settings', data),
    onSuccess: () => setSnack({ open: true, message: '저장되었습니다.', severity: 'success' }),
    onError: () => setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' }),
  })

  function handleSave() {
    saveMutation.mutate({ orgAdmin: orgAdminPerms, employee: employeePerms })
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
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="조직관리자 권한" />
        <Tab label="직원 권한" />
      </Tabs>

      {tab === 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" mb={2}>
              조직관리자가 수행할 수 있는 작업 범위를 설정합니다.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {ORG_ADMIN_PERMISSIONS.map(({ key, label, help }) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={orgAdminPerms[key] ?? false}
                      onChange={(e) =>
                        setOrgAdminPerms((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                  }
                  label={
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {label}
                      <HelpTip k={help} />
                    </span>
                  }
                />
              ))}
            </Box>
            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                저장
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent>
            <Typography variant="body2" color="text.secondary" mb={2}>
              일반 직원이 조회할 수 있는 정보 범위를 설정합니다.
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {EMPLOYEE_PERMISSIONS.map(({ key, label, help }) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Checkbox
                      checked={employeePerms[key] ?? false}
                      onChange={(e) =>
                        setEmployeePerms((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                  }
                  label={
                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {label}
                      <HelpTip k={help} />
                    </span>
                  }
                />
              ))}
            </Box>
            <Box sx={{ mt: 3 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                저장
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

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
