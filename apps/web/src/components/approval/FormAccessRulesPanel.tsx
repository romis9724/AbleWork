'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import {
  useFormAccessRules,
  useCreateFormAccessRule,
  useDeleteFormAccessRule,
} from '@/lib/query/documents'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import { usePositions } from '@/lib/query/positions'

interface Props {
  formId: string
}

type ScopeType = 'ORGANIZATION' | 'POSITION'

const flattenOrgs = (orgs: Organization[], depth = 0): { id: string; name: string }[] =>
  orgs.flatMap((o) => [
    { id: o.id, name: `${'  '.repeat(depth)}${o.name}` },
    ...(o.children?.length ? flattenOrgs(o.children, depth + 1) : []),
  ])

/**
 * AP-01-07 양식 접근규칙 관리 — 조직/직무 단위로 작성 권한 제한.
 * 규칙이 하나도 없으면 전체 직원이 작성 가능(서버 enforcement와 동일).
 */
export default function FormAccessRulesPanel({ formId }: Props) {
  const { data: rules = [] } = useFormAccessRules(formId)
  const { data: orgTree = [] } = useOrganizations()
  const { data: positions = [] } = usePositions()
  const createRule = useCreateFormAccessRule()
  const deleteRule = useDeleteFormAccessRule()

  const [scopeType, setScopeType] = useState<ScopeType>('ORGANIZATION')
  const [scopeId, setScopeId] = useState('')

  const orgOptions = flattenOrgs(orgTree)
  const scopeOptions = scopeType === 'ORGANIZATION' ? orgOptions : positions.map((p) => ({ id: p.id, name: p.name }))
  const nameOf = (type: ScopeType, id: string) => {
    const pool = type === 'ORGANIZATION' ? orgOptions : positions.map((p) => ({ id: p.id, name: p.name }))
    return pool.find((o) => o.id === id)?.name.trim() ?? id
  }

  const add = async () => {
    if (!scopeId) return
    await createRule.mutateAsync({ formId, scopeType, scopeId })
    setScopeId('')
  }

  const busy = createRule.isPending || deleteRule.isPending

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="caption" color="text.secondary">
        접근규칙이 없으면 전체 직원이 작성할 수 있습니다. 규칙을 추가하면 해당 조직/직무만 작성 가능합니다.
      </Typography>

      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {rules.length === 0 && (
          <Typography variant="body2" color="text.secondary">전체 허용</Typography>
        )}
        {rules.map((r) => (
          <Chip
            key={r.id}
            size="small"
            label={`${r.scopeType === 'ORGANIZATION' ? '조직' : '직무'}: ${nameOf(r.scopeType, r.scopeId)}`}
            onDelete={busy ? undefined : () => deleteRule.mutate({ formId, ruleId: r.id })}
          />
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
        <TextField
          select
          size="small"
          label="범위"
          value={scopeType}
          onChange={(e) => {
            setScopeType(e.target.value as ScopeType)
            setScopeId('')
          }}
          sx={{ width: 110, flexShrink: 0 }}
        >
          <MenuItem value="ORGANIZATION">조직</MenuItem>
          <MenuItem value="POSITION">직무</MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="대상"
          value={scopeId}
          onChange={(e) => setScopeId(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 140 }}
        >
          {scopeOptions.length === 0 && <MenuItem value="" disabled>대상 없음</MenuItem>}
          {scopeOptions.map((o) => (
            <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
          ))}
        </TextField>
        <Button size="small" startIcon={<AddIcon />} disabled={!scopeId || busy} onClick={add}>
          추가
        </Button>
      </Box>
    </Box>
  )
}
