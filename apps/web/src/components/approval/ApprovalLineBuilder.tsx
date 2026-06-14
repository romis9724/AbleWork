'use client'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import type { ApprovalStepInput, StepRole } from '@/lib/query/documents'
import { STEP_ROLE_OPTIONS, isDeptRole } from './approval-constants'

interface PickOption {
  id: string
  name: string
}

/** 조직 트리를 플랫 옵션으로 (depth 들여쓰기 표기) */
const flattenOrgs = (orgs: Organization[], depth = 0): PickOption[] =>
  orgs.flatMap((o) => [
    { id: o.id, name: `${'  '.repeat(depth)}${o.name}` },
    ...(o.children?.length ? flattenOrgs(o.children, depth + 1) : []),
  ])

interface Props {
  steps: ApprovalStepInput[]
  onChange: (steps: ApprovalStepInput[]) => void
  disabled?: boolean
}

/** stepOrder를 배열 순서 기준으로 재계산 */
const normalize = (steps: ApprovalStepInput[]): ApprovalStepInput[] =>
  steps.map((s, i) => ({ ...s, stepOrder: i + 1 }))

/**
 * 결재선 단계 빌더 — 역할 선택 + 직원 Autocomplete + 순서 이동 + 행 추가/삭제.
 * 공용 결재선 편집과 기안 작성 다이얼로그에서 공용으로 사용한다.
 */
export default function ApprovalLineBuilder({ steps, onChange, disabled = false }: Props) {
  const { data: employeeData } = useEmployees({ limit: 200, isActive: true })
  const options: PickOption[] = (employeeData?.items ?? []).map((e) => ({
    id: e.id,
    name: e.name,
  }))

  const { data: orgData } = useOrganizations()
  const orgOptions: PickOption[] = flattenOrgs(orgData ?? [])

  const updateStep = (index: number, patch: Partial<ApprovalStepInput>) => {
    onChange(normalize(steps.map((s, i) => (i === index ? { ...s, ...patch } : s))))
  }

  /** 역할 변경 시 대상 필드를 초기화 (개인↔부서 전환) */
  const changeRole = (index: number, role: StepRole) => {
    const patch: Partial<ApprovalStepInput> = isDeptRole(role)
      ? { role, organizationId: '', assigneeId: undefined }
      : { role, assigneeId: '', organizationId: undefined }
    updateStep(index, patch)
  }

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(normalize(next))
  }

  const removeStep = (index: number) => {
    onChange(normalize(steps.filter((_, i) => i !== index)))
  }

  const addStep = () => {
    onChange(
      normalize([...steps, { role: 'APPROVER', assigneeId: '', stepOrder: steps.length + 1 }]),
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {steps.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
          결재 단계가 없습니다. 단계를 추가해주세요.
        </Typography>
      )}

      {steps.map((step, index) => {
        const dept = isDeptRole(step.role)
        const pickOptions = dept ? orgOptions : options
        const selectedId = dept ? step.organizationId : step.assigneeId
        const selected = pickOptions.find((o) => o.id === selectedId) ?? null
        return (
          <Box
            key={`step-${index}`}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <Typography
              variant="caption"
              sx={{ width: 20, textAlign: 'center', color: 'text.secondary', flexShrink: 0 }}
            >
              {index + 1}
            </Typography>

            <TextField
              select
              size="small"
              label="역할"
              value={step.role}
              disabled={disabled}
              onChange={(e) => changeRole(index, e.target.value as StepRole)}
              sx={{ width: 120, flexShrink: 0 }}
            >
              {STEP_ROLE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </TextField>

            <Autocomplete
              size="small"
              options={pickOptions}
              value={selected}
              disabled={disabled}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              onChange={(_, value) =>
                updateStep(index, dept ? { organizationId: value?.id ?? '' } : { assigneeId: value?.id ?? '' })
              }
              renderInput={(params) => (
                <TextField {...params} label={dept ? '부서' : '담당자'} />
              )}
              sx={{ flexGrow: 1, minWidth: 140 }}
            />

            <Box sx={{ display: 'flex', flexShrink: 0 }}>
              <IconButton
                size="small"
                disabled={disabled || index === 0}
                onClick={() => moveStep(index, -1)}
                aria-label="위로 이동"
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                disabled={disabled || index === steps.length - 1}
                onClick={() => moveStep(index, 1)}
                aria-label="아래로 이동"
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                color="error"
                disabled={disabled}
                onClick={() => removeStep(index)}
                aria-label="단계 삭제"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        )
      })}

      <Button
        startIcon={<AddIcon />}
        size="small"
        disabled={disabled}
        onClick={addStep}
        sx={{ alignSelf: 'flex-start' }}
      >
        단계 추가
      </Button>
    </Box>
  )
}
