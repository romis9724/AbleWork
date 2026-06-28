'use client'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Alert from '@mui/material/Alert'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Snackbar from '@mui/material/Snackbar'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import GpsFixedIcon from '@mui/icons-material/GpsFixed'
import WifiIcon from '@mui/icons-material/Wifi'
import EmptyState from '@/components/common/EmptyState'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import {
  useTimeclockAreas,
  useCreateTimeclockArea,
  useUpdateTimeclockArea,
  useDeleteTimeclockArea,
  type TimeclockArea,
  type AuthMethod,
} from '@/lib/query/timeclock-areas'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { getApiErrorMessage } from '@/lib/api-error'

// ──────────────────────────────────────────────
// Schema — 폼은 문자열로 받고, submit 시 변환
// ──────────────────────────────────────────────
const areaSchema = z
  .object({
    name: z.string().min(1, '장소명을 입력해 주세요.'),
    organizationId: z.string().min(1, '조직을 선택해 주세요.'),
    authMethod: z.enum(['gps', 'wifi', 'gps_or_wifi', 'gps_and_wifi', 'none']),
    // 폼 입력값은 string으로 관리
    locationLat: z.string().optional(),
    locationLng: z.string().optional(),
    locationRadiusMeters: z.string().optional(),
    wifiSsid: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const needsGps = data.authMethod === 'gps' || data.authMethod === 'gps_or_wifi' || data.authMethod === 'gps_and_wifi'
    const needsWifi = data.authMethod === 'wifi' || data.authMethod === 'gps_or_wifi' || data.authMethod === 'gps_and_wifi'

    if (needsGps) {
      if (!data.locationLat) ctx.addIssue({ path: ['locationLat'], code: 'custom', message: '위도를 입력해 주세요.' })
      if (!data.locationLng) ctx.addIssue({ path: ['locationLng'], code: 'custom', message: '경도를 입력해 주세요.' })
      if (!data.locationRadiusMeters) ctx.addIssue({ path: ['locationRadiusMeters'], code: 'custom', message: '반경을 입력해 주세요.' })
    }
    if (needsWifi) {
      if (!data.wifiSsid) ctx.addIssue({ path: ['wifiSsid'], code: 'custom', message: 'WiFi SSID를 입력해 주세요.' })
    }
  })

type AreaFormValues = z.infer<typeof areaSchema>

// 폼 값을 API 페이로드로 변환
// BE 스키마는 .optional()(undefined만 허용)이므로 미입력 필드는 null 대신 키 자체를 제외한다
function toApiPayload(values: AreaFormValues) {
  return {
    name: values.name,
    organizationId: values.organizationId,
    authMethod: values.authMethod,
    ...(values.locationLat ? { locationLat: Number(values.locationLat) } : {}),
    ...(values.locationLng ? { locationLng: Number(values.locationLng) } : {}),
    ...(values.locationRadiusMeters
      ? { locationRadiusMeters: parseInt(values.locationRadiusMeters, 10) }
      : {}),
    ...(values.wifiSsid ? { wifiSsid: values.wifiSsid } : {}),
  }
}

// ──────────────────────────────────────────────
// Auth Method label / badge
// ──────────────────────────────────────────────
const AUTH_LABELS: Record<AuthMethod, string> = {
  gps: 'GPS',
  wifi: 'WiFi',
  gps_or_wifi: 'GPS 또는 WiFi',
  gps_and_wifi: 'GPS + WiFi',
  none: '인증 없음',
}

const AUTH_COLORS: Record<AuthMethod, 'primary' | 'secondary' | 'success' | 'warning' | 'default'> = {
  gps: 'primary',
  wifi: 'secondary',
  gps_or_wifi: 'success',
  gps_and_wifi: 'warning',
  none: 'default',
}

function flattenTree(orgs: Organization[], depth = 0): (Organization & { depth: number })[] {
  return orgs.flatMap((o) => [
    { ...o, depth },
    ...(o.children ? flattenTree(o.children, depth + 1) : []),
  ])
}

// ──────────────────────────────────────────────
// AreaDialog — 추가 / 수정
// ──────────────────────────────────────────────
interface AreaDialogProps {
  open: boolean
  initial?: TimeclockArea | null
  organizations: Organization[]
  loading: boolean
  onSubmit: (values: AreaFormValues) => void
  onClose: () => void
}

function AreaDialog({ open, initial, organizations, loading, onSubmit, onClose }: AreaDialogProps) {
  const { control, handleSubmit, watch, formState: { errors } } = useForm<AreaFormValues>({
    resolver: zodResolver(areaSchema),
    values: {
      name: initial?.name ?? '',
      organizationId: initial?.organizationId ?? '',
      authMethod: (initial?.authMethod ?? 'gps') as AuthMethod,
      locationLat: initial?.locationLat != null ? String(initial.locationLat) : '',
      locationLng: initial?.locationLng != null ? String(initial.locationLng) : '',
      locationRadiusMeters: initial?.locationRadiusMeters != null ? String(initial.locationRadiusMeters) : '',
      wifiSsid: initial?.wifiSsid ?? '',
    },
  })

  const authMethod = watch('authMethod')
  const showGps = authMethod === 'gps' || authMethod === 'gps_or_wifi' || authMethod === 'gps_and_wifi'
  const showWifi = authMethod === 'wifi' || authMethod === 'gps_or_wifi' || authMethod === 'gps_and_wifi'

  const flatOrgs = flattenTree(organizations)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? '출퇴근 장소 수정' : '출퇴근 장소 추가'}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        {/* 장소명 */}
        <Controller
          name="name"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="장소명"
              required
              fullWidth
              error={!!errors.name}
              helperText={errors.name?.message}
            />
          )}
        />

        {/* 조직 */}
        <Controller
          name="organizationId"
          control={control}
          render={({ field }) => (
            <Autocomplete
              options={flatOrgs}
              getOptionLabel={(o) => ' '.repeat(o.depth * 4) + o.name}
              value={flatOrgs.find((o) => o.id === field.value) ?? null}
              onChange={(_, v) => field.onChange(v?.id ?? '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="조직"
                  required
                  error={!!errors.organizationId}
                  helperText={errors.organizationId?.message}
                />
              )}
              isOptionEqualToValue={(a, b) => a.id === b.id}
            />
          )}
        />

        {/* 인증 방식 */}
        <Controller
          name="authMethod"
          control={control}
          render={({ field }) => (
            <FormControl error={!!errors.authMethod}>
              <FormLabel required>인증 방식</FormLabel>
              <RadioGroup row {...field}>
                {(Object.entries(AUTH_LABELS) as [AuthMethod, string][]).map(([value, label]) => (
                  <FormControlLabel key={value} value={value} control={<Radio size="small" />} label={label} />
                ))}
              </RadioGroup>
              {errors.authMethod && <FormHelperText>{errors.authMethod.message}</FormHelperText>}
            </FormControl>
          )}
        />

        {/* GPS 필드 */}
        {showGps && (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <GpsFixedIcon fontSize="small" /> GPS 설정
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Controller
                  name="locationLat"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      label="위도"
                      type="number"
                      fullWidth
                      size="small"
                      error={!!errors.locationLat}
                      helperText={errors.locationLat?.message}
                      inputProps={{ step: 'any' }}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={6}>
                <Controller
                  name="locationLng"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      label="경도"
                      type="number"
                      fullWidth
                      size="small"
                      error={!!errors.locationLng}
                      helperText={errors.locationLng?.message}
                      inputProps={{ step: 'any' }}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="locationRadiusMeters"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      label="반경 (미터)"
                      type="number"
                      fullWidth
                      size="small"
                      error={!!errors.locationRadiusMeters}
                      helperText={errors.locationRadiusMeters?.message}
                      inputProps={{ min: 1, step: 1 }}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* WiFi 필드 */}
        {showWifi && (
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <WifiIcon fontSize="small" /> WiFi 설정
            </Typography>
            <Controller
              name="wifiSsid"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label="WiFi SSID"
                  fullWidth
                  size="small"
                  error={!!errors.wifiSsid}
                  helperText={errors.wifiSsid?.message}
                />
              )}
            />
          </Box>
        )}
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
// Panel — 회사 설정 > 출퇴근, 독립 페이지 양쪽에서 재사용
// ──────────────────────────────────────────────
export default function TimeclockAreasPanel() {
  const { data: areas = [], isLoading } = useTimeclockAreas()
  const { data: orgs = [] } = useOrganizations()

  const createMutation = useCreateTimeclockArea()
  const updateMutation = useUpdateTimeclockArea()
  const deleteMutation = useDeleteTimeclockArea()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<TimeclockArea | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TimeclockArea | null>(null)

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  })

  const showSnack = (message: string, severity: 'success' | 'error') =>
    setSnack({ open: true, message, severity })

  // 조직별 그룹핑
  const flatOrgs = flattenTree(orgs)
  const grouped = areas.reduce<Record<string, TimeclockArea[]>>((acc, area) => {
    const key = area.organizationId
    if (!acc[key]) acc[key] = []
    acc[key].push(area)
    return acc
  }, {})

  const getOrgName = (id: string) => flatOrgs.find((o) => o.id === id)?.name ?? id

  const handleCreate = (values: AreaFormValues) => {
    createMutation.mutate(toApiPayload(values), {
      onSuccess: () => { setDialogOpen(false); showSnack('장소가 추가되었습니다.', 'success') },
      onError: () => showSnack('장소 추가에 실패했습니다.', 'error'),
    })
  }

  const handleUpdate = (values: AreaFormValues) => {
    if (!editTarget) return
    updateMutation.mutate({ id: editTarget.id, ...toApiPayload(values) }, {
      onSuccess: () => { setEditTarget(null); showSnack('장소가 수정되었습니다.', 'success') },
      onError: () => showSnack('장소 수정에 실패했습니다.', 'error'),
    })
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => { setDeleteTarget(null); showSnack('장소가 삭제되었습니다.', 'success') },
      onError: (e) => showSnack(getApiErrorMessage(e, '장소 삭제에 실패했습니다.'), 'error'),
    })
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>출퇴근 장소</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          장소 추가
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        장소는 소속 <b>조직별로 직원의 출근 모달</b>에 표시됩니다. <b>WiFi 인증이 필요한 장소(WiFi · GPS+WiFi)는 모바일 앱 전용</b>이며,
        웹 출근에서는 GPS·인증 없음 장소만 선택할 수 있습니다.
      </Alert>

      {areas.length === 0 ? (
        <EmptyState
          message="등록된 출퇴근 장소가 없습니다."
          action={
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
              첫 번째 장소 추가
            </Button>
          }
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {Object.entries(grouped).map(([orgId, orgAreas]) => (
            <Box key={orgId}>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5} color="text.secondary">
                {getOrgName(orgId)}
              </Typography>
              <Grid container spacing={2}>
                {orgAreas.map((area) => (
                  <Grid item xs={12} sm={6} md={4} key={area.id}>
                    <Card variant="outlined">
                      <CardContent sx={{ pb: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <Typography variant="subtitle1" fontWeight={600}>{area.name}</Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <Chip
                              label={AUTH_LABELS[area.authMethod]}
                              color={AUTH_COLORS[area.authMethod]}
                              size="small"
                            />
                            {(area.authMethod === 'wifi' || area.authMethod === 'gps_and_wifi') && (
                              <Chip label="앱 전용" color="default" variant="outlined" size="small" />
                            )}
                          </Box>
                        </Box>
                        {(area.authMethod === 'gps' || area.authMethod === 'gps_or_wifi' || area.authMethod === 'gps_and_wifi') && area.locationLat != null && (
                          <Typography variant="body2" color="text.secondary" mt={1} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <GpsFixedIcon sx={{ fontSize: 14 }} />
                            {Number(area.locationLat).toFixed(5)}, {area.locationLng != null ? Number(area.locationLng).toFixed(5) : '—'} · {area.locationRadiusMeters}m
                          </Typography>
                        )}
                        {(area.authMethod === 'wifi' || area.authMethod === 'gps_or_wifi' || area.authMethod === 'gps_and_wifi') && area.wifiSsid && (
                          <Typography variant="body2" color="text.secondary" mt={0.5} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <WifiIcon sx={{ fontSize: 14 }} />
                            {area.wifiSsid}
                          </Typography>
                        )}
                      </CardContent>
                      <Divider />
                      <CardActions sx={{ justifyContent: 'flex-end', py: 0.5 }}>
                        <IconButton size="small" onClick={() => setEditTarget(area)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => setDeleteTarget(area)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          ))}
        </Box>
      )}

      {/* 추가 Dialog */}
      {dialogOpen && (
        <AreaDialog
          open={dialogOpen}
          organizations={orgs}
          loading={createMutation.isPending}
          onSubmit={handleCreate}
          onClose={() => setDialogOpen(false)}
        />
      )}

      {/* 수정 Dialog */}
      {editTarget && (
        <AreaDialog
          open={!!editTarget}
          initial={editTarget}
          organizations={orgs}
          loading={updateMutation.isPending}
          onSubmit={handleUpdate}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* 삭제 Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="장소 삭제"
        message={`"${deleteTarget?.name}" 장소를 삭제하시겠습니까?`}
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
    </Box>
  )
}
