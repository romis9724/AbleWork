'use client'
import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Select from '@mui/material/Select'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/common/PageHeader'
import apiClient from '@/lib/api-client'
import CompanyInfoCard from './CompanyInfoCard'
import HolidaysTab from './HolidaysTab'

interface CompanySettings {
  nightShiftStart?: string
  nightShiftEnd?: string
  weekStartDay?: string
  timeFormat?: string
  noShiftClockPolicy?: string
  lateGracePeriodMinutes?: number
  earlyArrivalAllowedMinutes?: number
  pcTimeclockEnabled?: boolean
  timeclockConfirmEnabled?: boolean
  shiftConfirmEnabled?: boolean
  shiftTemplateCodeEnabled?: boolean
  impliedWorkEnabled?: boolean
  autoBreakEnabled?: boolean
  shiftBreakEnabled?: boolean
}

const WEEK_DAYS = [
  { value: 'monday', label: '월요일' },
  { value: 'tuesday', label: '화요일' },
  { value: 'wednesday', label: '수요일' },
  { value: 'thursday', label: '목요일' },
  { value: 'friday', label: '금요일' },
  { value: 'saturday', label: '토요일' },
  { value: 'sunday', label: '일요일' },
]

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <FormControlLabel
      control={<Switch checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={label}
      sx={{ mb: 1 }}
    />
  )
}

export default function CompanySettingsPage() {
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [form, setForm] = useState<CompanySettings>({})
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })

  const { data: settings, isLoading } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: () => apiClient.get('/company-settings') as Promise<CompanySettings>,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: (patch: Partial<CompanySettings>) =>
      apiClient.patch('/company-settings', patch),
    onSuccess: () => setSnack({ open: true, message: '저장되었습니다.', severity: 'success' }),
    onError: () => setSnack({ open: true, message: '저장에 실패했습니다.', severity: 'error' }),
  })

  function set<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave(keys: (keyof CompanySettings)[]) {
    const patch = Object.fromEntries(keys.map((k) => [k, form[k]])) as Partial<CompanySettings>
    saveMutation.mutate(patch)
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
      <PageHeader title="회사 설정" />

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="일반" />
        <Tab label="출퇴근" />
        <Tab label="근무일정" />
        <Tab label="휴게시간" />
        <Tab label="휴일" />
        <Tab label="권한" />
      </Tabs>

      {/* 일반 탭 */}
      {tab === 0 && (
        <CompanyInfoCard
          onResult={(message, severity) => setSnack({ open: true, message, severity })}
        />
      )}
      {tab === 0 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="야간근무 시작 시각"
                type="time"
                value={form.nightShiftStart ?? ''}
                onChange={(e) => set('nightShiftStart', e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 180 }}
              />
              <TextField
                label="야간근무 종료 시각"
                type="time"
                value={form.nightShiftEnd ?? ''}
                onChange={(e) => set('nightShiftEnd', e.target.value)}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: 180 }}
              />
            </Box>

            <FormControl size="small" sx={{ width: 200 }}>
              <InputLabel>1주 시작 요일</InputLabel>
              <Select
                value={form.weekStartDay ?? 'monday'}
                label="1주 시작 요일"
                onChange={(e) => set('weekStartDay', e.target.value)}
              >
                {WEEK_DAYS.map((d) => (
                  <MenuItem key={d.value} value={d.value}>
                    {d.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel>시간 형식</FormLabel>
              <RadioGroup
                row
                value={form.timeFormat ?? '24h'}
                onChange={(e) => set('timeFormat', e.target.value)}
              >
                <FormControlLabel value="24h" control={<Radio />} label="24시간" />
                <FormControlLabel value="12h" control={<Radio />} label="12시간 (AM/PM)" />
              </RadioGroup>
            </FormControl>

            <Box>
              <Button
                variant="contained"
                onClick={() => handleSave(['nightShiftStart', 'nightShiftEnd', 'weekStartDay', 'timeFormat'])}
                disabled={saveMutation.isPending}
              >
                저장
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 출퇴근 탭 */}
      {tab === 1 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <FormControl>
              <FormLabel>무일정 출퇴근 정책</FormLabel>
              <RadioGroup
                value={form.noShiftClockPolicy ?? 'if_no_shift'}
                onChange={(e) => set('noShiftClockPolicy', e.target.value)}
              >
                <FormControlLabel value="always" control={<Radio />} label="항상 허용" />
                <FormControlLabel
                  value="if_no_shift"
                  control={<Radio />}
                  label="근무일정 없을 때만 허용"
                />
                <FormControlLabel value="never" control={<Radio />} label="허용 안 함" />
              </RadioGroup>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <TextField
                label="지각 유예 시간 (분)"
                type="number"
                value={form.lateGracePeriodMinutes ?? 0}
                onChange={(e) =>
                  set('lateGracePeriodMinutes', Math.max(0, Math.min(120, Number(e.target.value))))
                }
                inputProps={{ min: 0, max: 120 }}
                size="small"
                sx={{ width: 200 }}
                helperText="0 ~ 120분"
              />
              <TextField
                label="근무 시작 전 출근 허용 시간 (분)"
                type="number"
                value={form.earlyArrivalAllowedMinutes ?? 0}
                onChange={(e) =>
                  set('earlyArrivalAllowedMinutes', Math.max(0, Number(e.target.value)))
                }
                inputProps={{ min: 0 }}
                size="small"
                sx={{ width: 240 }}
              />
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <SwitchField
                label="PC 출퇴근 사용"
                checked={form.pcTimeclockEnabled ?? false}
                onChange={(v) => set('pcTimeclockEnabled', v)}
              />
              <SwitchField
                label="출퇴근기록 확정 기능 사용"
                checked={form.timeclockConfirmEnabled ?? false}
                onChange={(v) => set('timeclockConfirmEnabled', v)}
              />
            </Box>

            <Box>
              <Button
                variant="contained"
                onClick={() =>
                  handleSave([
                    'noShiftClockPolicy',
                    'lateGracePeriodMinutes',
                    'earlyArrivalAllowedMinutes',
                    'pcTimeclockEnabled',
                    'timeclockConfirmEnabled',
                  ])
                }
                disabled={saveMutation.isPending}
              >
                저장
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 근무일정 탭 */}
      {tab === 2 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <SwitchField
                label="근무일정 확정 기능 사용"
                checked={form.shiftConfirmEnabled ?? false}
                onChange={(v) => set('shiftConfirmEnabled', v)}
              />
              <SwitchField
                label="근무일정 템플릿 코드 기능 사용"
                checked={form.shiftTemplateCodeEnabled ?? false}
                onChange={(v) => set('shiftTemplateCodeEnabled', v)}
              />
              <SwitchField
                label="간주근로 기능 사용"
                checked={form.impliedWorkEnabled ?? false}
                onChange={(v) => set('impliedWorkEnabled', v)}
              />
            </Box>

            <Box>
              <Button
                variant="contained"
                onClick={() =>
                  handleSave(['shiftConfirmEnabled', 'shiftTemplateCodeEnabled', 'impliedWorkEnabled'])
                }
                disabled={saveMutation.isPending}
              >
                저장
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 휴게시간 탭 */}
      {tab === 3 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              <SwitchField
                label="자동 휴게시간 사용"
                checked={form.autoBreakEnabled ?? false}
                onChange={(v) => set('autoBreakEnabled', v)}
              />
              <SwitchField
                label="근무일정 휴게시간 기능 사용"
                checked={form.shiftBreakEnabled ?? false}
                onChange={(v) => set('shiftBreakEnabled', v)}
              />
            </Box>

            <Box>
              <Button
                variant="contained"
                onClick={() => handleSave(['autoBreakEnabled', 'shiftBreakEnabled'])}
                disabled={saveMutation.isPending}
              >
                저장
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* 휴일 탭 */}
      {tab === 4 && (
        <HolidaysTab
          onResult={(message, severity) => setSnack({ open: true, message, severity })}
        />
      )}

      {/* 권한 탭 */}
      {tab === 5 && (
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Alert severity="info">권한 설정은 권한 설정 메뉴에서 변경하세요.</Alert>
            <Box>
              <Button
                variant="outlined"
                onClick={() => router.push('/admin/settings/permissions')}
              >
                권한 설정으로 이동
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
    </>
  )
}
