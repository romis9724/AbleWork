'use client'
import { useEffect } from 'react'
import { useForm, Controller, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { usePositions } from '@/lib/query/positions'

// ──────────────────────────────────────────────
// Schema — BE CreateEmployeeSchema와 정합
// ──────────────────────────────────────────────
const createEmployeeSchema = z.object({
  name: z.string().min(1, '이름을 입력해 주세요.').max(50, '이름은 50자 이내로 입력해 주세요.'),
  email: z.string().email('유효한 이메일을 입력해 주세요.'),
  // 초기 로그인 비밀번호 (선택). 입력 시 즉시 로그인 가능한 활성 계정으로 생성된다.
  initialPassword: z
    .string()
    .min(8, '비밀번호는 8자 이상이어야 합니다.')
    .regex(/[A-Za-z]/, '영문자를 포함해 주세요.')
    .regex(/[0-9]/, '숫자를 포함해 주세요.')
    .or(z.literal(''))
    .optional(),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '입사일을 선택해 주세요.'),
  employmentType: z.enum(['regular', 'contract', 'part_time', 'daily']),
  accessLevel: z.enum(['EMPLOYEE', 'ORG_ADMIN', 'GENERAL_ADMIN']),
  organizationIds: z.array(z.string()).min(1, '소속 조직을 하나 이상 선택해 주세요.'),
  primaryOrganizationId: z.string().min(1, '본조직을 선택해 주세요.'),
  positionIds: z.array(z.string()),
})

export type CreateEmployeeFormValues = z.infer<typeof createEmployeeSchema>

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'regular', label: '정규직' },
  { value: 'contract', label: '계약직' },
  { value: 'part_time', label: '파트타임' },
  { value: 'daily', label: '일용직' },
] as const

const ACCESS_LEVEL_OPTIONS = [
  { value: 'EMPLOYEE', label: '직원' },
  { value: 'ORG_ADMIN', label: '조직관리자' },
  { value: 'GENERAL_ADMIN', label: '총괄관리자' },
] as const

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

interface Props {
  open: boolean
  loading: boolean
  onSubmit: (values: CreateEmployeeFormValues) => void
  onClose: () => void
}

export default function EmployeeCreateDialog({ open, loading, onSubmit, onClose }: Props) {
  const { data: orgsRaw = [] } = useOrganizations()
  const { data: positions = [] } = usePositions()
  const orgOptions = flattenOrgs(orgsRaw)

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateEmployeeFormValues>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      name: '',
      email: '',
      initialPassword: '',
      joinedAt: new Date().toISOString().slice(0, 10),
      employmentType: 'regular',
      accessLevel: 'EMPLOYEE',
      organizationIds: [],
      primaryOrganizationId: '',
      positionIds: [],
    },
  })

  const organizationIds = useWatch({ control, name: 'organizationIds' })
  const primaryOrganizationId = useWatch({ control, name: 'primaryOrganizationId' })

  // 선택 조직이 바뀌면 본조직 값을 항상 유효하게 유지한다
  useEffect(() => {
    if (organizationIds.length === 0) {
      if (primaryOrganizationId) setValue('primaryOrganizationId', '')
      return
    }
    if (!organizationIds.includes(primaryOrganizationId)) {
      setValue('primaryOrganizationId', organizationIds[0])
    }
  }, [organizationIds, primaryOrganizationId, setValue])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>직원 추가</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="이름"
                required
                fullWidth
                size="small"
                autoFocus
                inputProps={{ 'data-testid': 'emp-create-name' }}
                error={!!errors.name}
                helperText={errors.name?.message}
              />
            )}
          />
          <Controller
            name="email"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="이메일"
                type="email"
                required
                fullWidth
                size="small"
                inputProps={{ 'data-testid': 'emp-create-email' }}
                error={!!errors.email}
                helperText={errors.email?.message ?? '로그인 아이디로 사용됩니다.'}
              />
            )}
          />
        </Box>

        <Controller
          name="initialPassword"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="초기 비밀번호 (선택)"
              type="password"
              fullWidth
              size="small"
              autoComplete="new-password"
              error={!!errors.initialPassword}
              helperText={
                errors.initialPassword?.message ??
                '입력하면 즉시 로그인 가능합니다. 비워두면 추후 "비밀번호 재설정"으로 활성화하세요. (영문+숫자 8자 이상)'
              }
            />
          )}
        />

        <Controller
          name="organizationIds"
          control={control}
          render={({ field }) => (
            <Autocomplete
              multiple
              options={orgOptions}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              value={orgOptions.filter((o) => field.value.includes(o.id))}
              onChange={(_, selected) => field.onChange(selected.map((o) => o.id))}
              renderOption={(props, option) => (
                <Box component="li" {...props} key={option.id} sx={{ pl: `${16 + option.depth * 16}px !important` }}>
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
                  required
                  size="small"
                  error={!!errors.organizationIds}
                  helperText={errors.organizationIds?.message}
                />
              )}
            />
          )}
        />

        <Controller
          name="primaryOrganizationId"
          control={control}
          render={({ field }) => (
            <FormControl size="small" fullWidth required error={!!errors.primaryOrganizationId} disabled={organizationIds.length === 0}>
              <InputLabel>본조직</InputLabel>
              <Select {...field} label="본조직">
                {orgOptions
                  .filter((o) => organizationIds.includes(o.id))
                  .map((o) => (
                    <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                  ))}
              </Select>
              <FormHelperText>
                {errors.primaryOrganizationId?.message ??
                  (organizationIds.length === 0 ? '소속 조직을 먼저 선택하세요.' : undefined)}
              </FormHelperText>
            </FormControl>
          )}
        />

        <Controller
          name="positionIds"
          control={control}
          render={({ field }) => (
            <Autocomplete
              multiple
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
              renderInput={(params) => (
                <TextField {...params} label="직무 (선택)" size="small" />
              )}
            />
          )}
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <Controller
            name="employmentType"
            control={control}
            render={({ field }) => (
              <FormControl size="small" fullWidth>
                <InputLabel>고용형태</InputLabel>
                <Select {...field} label="고용형태">
                  {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            name="accessLevel"
            control={control}
            render={({ field }) => (
              <FormControl size="small" fullWidth>
                <InputLabel>권한</InputLabel>
                <Select {...field} label="권한">
                  {ACCESS_LEVEL_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            name="joinedAt"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="입사일"
                type="date"
                required
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{ 'data-testid': 'emp-create-joined-at' }}
                error={!!errors.joinedAt}
                helperText={errors.joinedAt?.message}
              />
            )}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>취소</Button>
        <Button data-testid="emp-create-submit-btn" onClick={handleSubmit(onSubmit)} variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : '추가'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
