'use client'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useAuthStore } from '@/stores/auth.store'
import { useCompany, useUpdateCompany } from '@/lib/query/companies'

const TIMEZONES = [
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Singapore',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
]

interface CompanyInfoForm {
  name: string
  logoUrl: string
  timezone: string
}

interface CompanyInfoCardProps {
  onResult: (message: string, severity: 'success' | 'error') => void
}

export default function CompanyInfoCard({ onResult }: CompanyInfoCardProps) {
  const user = useAuthStore((s) => s.user)
  const companyId = user?.companyId
  const isSuperAdmin = user?.accessLevel === 'SUPER_ADMIN'

  const { data: company } = useCompany(companyId)
  const updateMutation = useUpdateCompany()

  const [form, setForm] = useState<CompanyInfoForm>({ name: '', logoUrl: '', timezone: 'Asia/Seoul' })

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? '',
        logoUrl: company.logoUrl ?? '',
        timezone: company.timezone ?? 'Asia/Seoul',
      })
    }
  }, [company])

  function set<K extends keyof CompanyInfoForm>(key: K, value: CompanyInfoForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    if (!companyId) return
    updateMutation.mutate(
      {
        id: companyId,
        name: form.name.trim(),
        timezone: form.timezone,
        // 빈 문자열은 URL 검증에 걸리므로 값이 있을 때만 전송
        ...(form.logoUrl.trim() !== '' && { logoUrl: form.logoUrl.trim() }),
      },
      {
        onSuccess: () => onResult('회사 정보가 저장되었습니다.', 'success'),
        onError: () => onResult('회사 정보 저장에 실패했습니다.', 'error'),
      },
    )
  }

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          회사 기본 정보
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField
            label="회사명"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            size="small"
            sx={{ width: 260 }}
            disabled={!isSuperAdmin}
          />
          <TextField
            label="로고 URL"
            value={form.logoUrl}
            onChange={(e) => set('logoUrl', e.target.value)}
            size="small"
            sx={{ width: 320 }}
            placeholder="https://example.com/logo.png"
            disabled={!isSuperAdmin}
          />
          <FormControl size="small" sx={{ width: 220 }} disabled={!isSuperAdmin}>
            <InputLabel>시간대</InputLabel>
            <Select
              value={form.timezone}
              label="시간대"
              onChange={(e) => set('timezone', e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <MenuItem key={tz} value={tz}>
                  {tz}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {!isSuperAdmin && (
          <Typography variant="caption" color="text.secondary">
            회사 기본 정보는 최고관리자(SUPER_ADMIN)만 수정할 수 있습니다.
          </Typography>
        )}

        <Box>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!isSuperAdmin || form.name.trim() === '' || updateMutation.isPending}
          >
            회사 정보 저장
          </Button>
        </Box>
      </CardContent>
    </Card>
  )
}
