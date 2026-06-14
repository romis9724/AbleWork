'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Snackbar from '@mui/material/Snackbar'
import Switch from '@mui/material/Switch'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  useDocumentForms,
  useCreateDocumentForm,
  useUpdateDocumentForm,
  useSharedApprovalLines,
  useFormCategories,
} from '@/lib/query/documents'
import { useEmployees } from '@/lib/query/employees'
import { readFormFields, type DocumentFieldDef } from '@ablework/shared-constants'
import FormFieldsBuilder from './FormFieldsBuilder'
import FormAccessRulesPanel from './FormAccessRulesPanel'

const VISIBILITY_OPTIONS = [
  { value: 'PUBLIC', label: '공개 (전 직원)' },
  { value: 'DEPARTMENT', label: '부서공개 (접근 권한 지정)' },
  { value: 'PRIVATE', label: '비공개 (담당자/권한 지정)' },
] as const

const schema = z.object({
  name: z.string().min(1, '양식명을 입력해주세요'),
  categoryId: z.string().optional(),
  visibilityScope: z.enum(['PUBLIC', 'DEPARTMENT', 'PRIVATE']),
  abbreviation: z.string().max(20).optional(),
  retentionYears: z.number().int().min(0).max(100),
  description: z.string().max(1000).optional(),
  defaultLineId: z.string().optional(),
  formOwnerId: z.string().optional(),
  allowZipUpload: z.boolean(),
  sortOrder: z.number().int().min(0),
  allowReDraft: z.boolean(),
  allowPreApproval: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = {
  name: '',
  categoryId: '',
  visibilityScope: 'PUBLIC',
  abbreviation: '',
  retentionYears: 0,
  description: '',
  defaultLineId: '',
  formOwnerId: '',
  allowZipUpload: false,
  sortOrder: 0,
  allowReDraft: true,
  allowPreApproval: false,
}

interface Props {
  /** 수정 대상 양식 id (신규는 미지정) */
  editingId?: string | null
  /** 저장/취소 후 돌아갈 목록 경로 */
  listPath: string
}

/**
 * 기안양식 등록·수정 위저드 PAGE — 카카오워크 PDF(기안 양식 관리) 정합.
 * 3-step(기본정보 / 입력필드 / 권한·옵션) 탭 + 하단 [이전][다음][저장] 푸터.
 */
export default function DocumentFormWizard({ editingId = null, listPath }: Props) {
  const router = useRouter()
  const { data: forms = [] } = useDocumentForms()
  const { data: sharedLines = [] } = useSharedApprovalLines()
  const { data: categories = [] } = useFormCategories()
  const { data: employeeData } = useEmployees({ limit: 200, isActive: true })
  const employeeOptions = employeeData?.items ?? []

  const createMutation = useCreateDocumentForm()
  const updateMutation = useUpdateDocumentForm()

  const editingForm = editingId ? forms.find((f) => f.id === editingId) ?? null : null

  const [step, setStep] = useState(0)
  const [fields, setFields] = useState<DocumentFieldDef[]>([])
  const [initializedFor, setInitializedFor] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
  })

  // 수정 대상 로드 시 폼 값 채우기 (1회)
  useEffect(() => {
    if (!editingForm || initializedFor === editingForm.id) return
    reset({
      name: editingForm.name,
      categoryId: editingForm.categoryId ?? '',
      visibilityScope: editingForm.visibilityScope ?? 'PUBLIC',
      abbreviation: editingForm.abbreviation ?? '',
      retentionYears: editingForm.retentionYears ?? 0,
      description: editingForm.description ?? '',
      defaultLineId: editingForm.defaultLineId ?? '',
      formOwnerId: editingForm.formOwnerId ?? '',
      allowZipUpload: editingForm.allowZipUpload ?? false,
      sortOrder: editingForm.sortOrder,
      allowReDraft: editingForm.allowReDraft,
      allowPreApproval: editingForm.allowPreApproval,
    })
    setFields(readFormFields(editingForm.fieldsSchema))
    setInitializedFor(editingForm.id)
  }, [editingForm, initializedFor, reset])

  const busy = createMutation.isPending || updateMutation.isPending || !!successMessage

  const onSubmit = async (values: FormValues) => {
    setErrorMessage('')
    const payload = {
      name: values.name,
      sortOrder: values.sortOrder,
      allowReDraft: values.allowReDraft,
      allowPreApproval: values.allowPreApproval,
      categoryId: values.categoryId || null,
      visibilityScope: values.visibilityScope,
      abbreviation: values.abbreviation || null,
      retentionYears: values.retentionYears > 0 ? values.retentionYears : null,
      description: values.description || null,
      defaultLineId: values.defaultLineId || null,
      formOwnerId: values.formOwnerId || null,
      allowZipUpload: values.allowZipUpload,
      fieldsSchema: { fields },
    }
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload })
        setSuccessMessage('양식이 수정되었습니다.')
      } else {
        await createMutation.mutateAsync(payload)
        setSuccessMessage('양식이 추가되었습니다.')
      }
      window.setTimeout(() => router.push(listPath), 700)
    } catch {
      setErrorMessage('저장 중 오류가 발생했습니다.')
    }
  }

  // 수정 모드인데 양식을 아직 못 찾음 (목록 로딩 중)
  if (editingId && !editingForm) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ pb: 10 }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => router.push(listPath)} color="inherit">
          목록
        </Button>
        <Typography variant="h6" fontWeight={700}>{editingId ? '양식 수정' : '양식 추가'}</Typography>
      </Box>

      {errorMessage && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>}

      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', maxWidth: 860 }}>
        <Tabs
          value={step}
          onChange={(_, v) => setStep(v)}
          variant="fullWidth"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="기본정보" />
          <Tab label="입력필드" />
          <Tab label="권한·옵션" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* 탭 0 — 기본정보 */}
          <Box
            component="form"
            sx={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 2.5 }}
          >
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="양식명"
                  required
                  fullWidth
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              )}
            />
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Controller
                name="categoryId"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="양식함(분류)" sx={{ flexGrow: 1, minWidth: 160 }}>
                    <MenuItem value="">미분류</MenuItem>
                    {categories.map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
              <Controller
                name="visibilityScope"
                control={control}
                render={({ field }) => (
                  <TextField {...field} select label="공개범위" sx={{ flexGrow: 1, minWidth: 200 }}>
                    {VISIBILITY_OPTIONS.map((v) => (
                      <MenuItem key={v.value} value={v.value}>{v.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Controller
                name="abbreviation"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="문서번호 약어" placeholder="예: HR" sx={{ width: 160 }} />
                )}
              />
              <Controller
                name="retentionYears"
                control={control}
                render={({ field }) => (
                  <TextField
                    label="보존연한 (년, 0=미설정)"
                    type="number"
                    inputProps={{ min: 0, max: 100 }}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                    sx={{ width: 200 }}
                  />
                )}
              />
            </Box>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <TextField {...field} label="설명" fullWidth multiline rows={2} placeholder="양식 용도 설명 (선택)" />
              )}
            />
            <Controller
              name="sortOrder"
              control={control}
              render={({ field }) => (
                <TextField
                  label="정렬 순서"
                  type="number"
                  fullWidth
                  inputProps={{ min: 0 }}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value === '' ? 0 : Number(e.target.value))}
                  error={!!errors.sortOrder}
                  helperText={errors.sortOrder?.message}
                />
              )}
            />
          </Box>

          {/* 탭 1 — 입력필드 설계 */}
          <Box sx={{ display: step === 1 ? 'block' : 'none' }}>
            <FormFieldsBuilder fields={fields} onChange={setFields} disabled={busy} />
          </Box>

          {/* 탭 2 — 권한·옵션 */}
          <Box sx={{ display: step === 2 ? 'flex' : 'none', flexDirection: 'column', gap: 2.5 }}>
            <Controller
              name="defaultLineId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  label="기본 결재선"
                  fullWidth
                  helperText="작성 시 결재선을 비워두면 이 공용 결재선이 기본 적용됩니다 (선택)"
                >
                  <MenuItem value="">지정 안 함</MenuItem>
                  {sharedLines.map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="formOwnerId"
              control={control}
              render={({ field }) => (
                <TextField {...field} select label="양식 담당자" fullWidth helperText="이 양식의 관리 담당자 (선택)">
                  <MenuItem value="">지정 안 함</MenuItem>
                  {employeeOptions.map((e) => (
                    <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name="allowReDraft"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="재기안 허용 (반려/회수 후 재상신)"
                />
              )}
            />
            <Controller
              name="allowPreApproval"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="전결 허용"
                />
              )}
            />
            <Controller
              name="allowZipUpload"
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  control={<Switch checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="ZIP 첨부 허용"
                />
              )}
            />

            {/* AP-01-07 접근규칙 — 저장된 양식에만 */}
            {editingId ? (
              <>
                <Divider sx={{ my: 0.5 }} />
                <Typography variant="subtitle2" fontWeight={700}>작성 권한 (접근규칙)</Typography>
                <FormAccessRulesPanel formId={editingId} />
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                접근규칙은 양식 저장 후 수정 화면에서 지정할 수 있습니다.
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>

      {/* 하단 sticky 푸터 — 이전/다음/저장 */}
      <Paper
        elevation={3}
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: (t) => t.zIndex.appBar,
          px: 3,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Button onClick={() => router.push(listPath)} disabled={busy} color="inherit">취소</Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={busy || step === 0}>
          이전
        </Button>
        {step < 2 ? (
          <Button variant="outlined" onClick={() => setStep((s) => Math.min(2, s + 1))} disabled={busy}>
            다음
          </Button>
        ) : null}
        <Button variant="contained" onClick={handleSubmit(onSubmit)} disabled={busy}>
          {busy && !successMessage ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          저장
        </Button>
      </Paper>

      <Snackbar open={!!successMessage} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" variant="filled">{successMessage}</Alert>
      </Snackbar>
    </Box>
  )
}
