'use client'
import { useState, useEffect } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useBulkCreateShifts, type ShiftTemplate } from '@/lib/query/shifts'
import { useEmployees, type Employee } from '@/lib/query/employees'
import type { Organization } from '@/lib/query/organizations'

type Severity = 'success' | 'error' | 'info' | 'warning'

interface BulkCreateDialogProps {
  open: boolean
  templates: ShiftTemplate[]
  organizations: Organization[]
  defaultStartDate: string
  defaultEndDate: string
  onClose: () => void
  onResult: (message: string, severity?: Severity) => void
}

export default function BulkCreateDialog({
  open,
  templates,
  organizations,
  defaultStartDate,
  defaultEndDate,
  onClose,
  onResult,
}: BulkCreateDialogProps) {
  const [templateId, setTemplateId] = useState('')
  const [organizationId, setOrganizationId] = useState('')
  const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([])
  const [startDate, setStartDate] = useState(defaultStartDate)
  const [endDate, setEndDate] = useState(defaultEndDate)

  // 다이얼로그가 열릴 때마다 초기화
  useEffect(() => {
    if (open) {
      setTemplateId('')
      setOrganizationId('')
      setSelectedEmployees([])
      setStartDate(defaultStartDate)
      setEndDate(defaultEndDate)
    }
  }, [open, defaultStartDate, defaultEndDate])

  // 선택한 조직 소속 직원만 조회 (BE EmployeeFilterDto.organizationId)
  // 근무일정 배정 대상이므로 최고관리자 제외
  const { data: employeeData, isLoading: loadingEmployees } = useEmployees(
    organizationId
      ? { organizationId, excludeSuperAdmin: true }
      : { excludeSuperAdmin: true },
  )
  const employeeOptions = organizationId ? (employeeData?.items ?? []) : []

  const bulkMutation = useBulkCreateShifts()

  const isValid =
    !!templateId &&
    !!organizationId &&
    selectedEmployees.length > 0 &&
    !!startDate &&
    !!endDate &&
    startDate <= endDate

  const handleSubmit = async () => {
    if (!isValid) return
    try {
      const result = await bulkMutation.mutateAsync({
        templateId,
        organizationId,
        employeeIds: selectedEmployees.map((e) => e.id),
        startDate,
        endDate,
      })
      if (result.warnings && result.warnings.length > 0) {
        onResult(`${result.created}건 생성 완료 — 주 52시간 초과 경고 ${result.warnings.length}건`, 'warning')
      } else {
        onResult(`근무일정 ${result.created}건이 생성되었습니다.`)
      }
      onClose()
    } catch {
      onResult('일괄 생성 중 오류가 발생했습니다.', 'error')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>근무일정 일괄 생성</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 0.5 }}>
          <TextField
            select
            label="근무일정 템플릿"
            required
            fullWidth
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <MenuItem value="" disabled><em>선택하세요</em></MenuItem>
            {templates.map((tmpl) => (
              <MenuItem key={tmpl.id} value={tmpl.id}>
                {tmpl.name} ({tmpl.startTime}–{tmpl.endTime})
              </MenuItem>
            ))}
          </TextField>

          <Autocomplete
            options={organizations}
            getOptionLabel={(o) => o.name}
            value={organizations.find((o) => o.id === organizationId) ?? null}
            onChange={(_, val) => {
              setOrganizationId(val?.id ?? '')
              setSelectedEmployees([])
            }}
            renderInput={(params) => <TextField {...params} label="조직" required />}
          />

          <Autocomplete
            multiple
            options={employeeOptions}
            getOptionLabel={(e) => e.name}
            value={selectedEmployees}
            onChange={(_, val) => setSelectedEmployees(val)}
            disabled={!organizationId}
            loading={loadingEmployees}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip {...getTagProps({ index })} key={option.id} label={option.name} size="small" />
              ))
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="직원 (다중 선택)"
                required
                helperText={organizationId ? `${selectedEmployees.length}명 선택됨` : '조직을 먼저 선택해주세요'}
              />
            )}
          />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="시작일"
              type="date"
              required
              fullWidth
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="종료일"
              type="date"
              required
              fullWidth
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={!!startDate && !!endDate && startDate > endDate}
              helperText={!!startDate && !!endDate && startDate > endDate ? '종료일은 시작일 이후여야 합니다' : undefined}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={bulkMutation.isPending}>취소</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!isValid || bulkMutation.isPending}>
          {bulkMutation.isPending ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
          일괄 생성
        </Button>
      </DialogActions>
    </Dialog>
  )
}
