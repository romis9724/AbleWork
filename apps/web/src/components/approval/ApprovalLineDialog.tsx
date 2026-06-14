'use client'
import { useEffect, useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import PersonIcon from '@mui/icons-material/Person'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import type { ApprovalStepInput, StepRole, SharedApprovalLine } from '@/lib/query/documents'
import { STEP_ROLE_LABEL, isDeptRole } from './approval-constants'

/** 좌측에서 선택해 우측 결재선에 추가할 수 있는 역할 버튼 (카카오워크 PDF 순서) */
const ROLE_BUTTONS: { role: StepRole; label: string }[] = [
  { role: 'APPROVER', label: '결재' },
  { role: 'AGREEMENT', label: '협조' },
  { role: 'RECEIVER', label: '수신' },
  { role: 'REFERENCE', label: '참조' },
  { role: 'VIEWER', label: '공람' },
]

interface PickedNode {
  /** 'emp' | 'org' */
  kind: 'emp' | 'org'
  id: string
  name: string
}

interface Props {
  open: boolean
  /** 현재 결재선 단계 (편집 시작값) */
  steps: ApprovalStepInput[]
  /** 공용 결재선 목록 (결재선명 불러오기) */
  sharedLines: SharedApprovalLine[]
  /** 기안자 표시명 (상단 고정 '기안' 행) */
  drafterName?: string
  onApply: (steps: ApprovalStepInput[], sharedLineId?: string) => void
  onClose: () => void
}

const normalize = (steps: ApprovalStepInput[]): ApprovalStepInput[] =>
  steps.map((s, i) => ({ ...s, stepOrder: i + 1 }))

/**
 * 결재선 설정 LAYER_POPUP — 카카오워크 PDF(기안 작성) 정합.
 * 좌측 조직 트리(부서/직원 체크박스) + 중앙 역할 추가 버튼 + 우측 결재선 단계 리스트 + [취소][적용].
 * 직원=개인 역할, 부서=협조→부서협조 / 수신→부서수신으로 추가된다.
 */
export default function ApprovalLineDialog({
  open,
  steps,
  sharedLines,
  drafterName,
  onApply,
  onClose,
}: Props) {
  const { data: orgData } = useOrganizations()
  const { data: empData } = useEmployees({ limit: 500, isActive: true })

  const [editing, setEditing] = useState<ApprovalStepInput[]>(steps)
  const [picked, setPicked] = useState<Map<string, PickedNode>>(new Map())
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sharedLineId, setSharedLineId] = useState('')

  const orgs = useMemo(() => orgData ?? [], [orgData])
  const employees = useMemo(() => empData?.items ?? [], [empData])

  // 부서별 직원 그룹 (primary 소속 기준, 없으면 첫 소속)
  const empsByOrg = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>()
    for (const e of employees) {
      const primary = e.organizations?.find((o) => o.isPrimary) ?? e.organizations?.[0]
      const orgId = primary?.organization.id
      if (!orgId) continue
      const list = map.get(orgId) ?? []
      list.push({ id: e.id, name: e.name })
      map.set(orgId, list)
    }
    return map
  }, [employees])

  // 이름 해석용 맵
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>()
    const walk = (nodes: Organization[]) => {
      for (const n of nodes) {
        map.set(n.id, n.name)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(orgs)
    return map
  }, [orgs])
  const empNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employees) map.set(e.id, e.name)
    return map
  }, [employees])

  // 팝업 열릴 때 편집값 초기화 + 트리 전체 펼침
  useEffect(() => {
    if (!open) return
    setEditing(steps)
    setPicked(new Map())
    setSearch('')
    setSharedLineId('')
    const allOrgIds: string[] = []
    const walk = (nodes: Organization[]) => {
      for (const n of nodes) {
        allOrgIds.push(n.id)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(orgData ?? [])
    setExpanded(new Set(allOrgIds))
    // open 토글로만 초기화 (steps/orgData는 의도적 제외)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const togglePick = (node: PickedNode) =>
    setPicked((prev) => {
      const key = `${node.kind}:${node.id}`
      const next = new Map(prev)
      if (next.has(key)) next.delete(key)
      else next.set(key, node)
      return next
    })

  /** 선택 항목을 지정 역할로 결재선에 추가 (직원=개인, 부서=협조/수신만) */
  const addRole = (role: StepRole) => {
    if (picked.size === 0) return
    const additions: ApprovalStepInput[] = []
    for (const node of picked.values()) {
      if (node.kind === 'emp') {
        if (editing.some((s) => s.role === role && s.assigneeId === node.id)) continue
        additions.push({ role, assigneeId: node.id, stepOrder: 0 })
      } else {
        // 부서: 협조→부서협조, 수신→부서수신만 허용
        const deptRole: StepRole | null =
          role === 'AGREEMENT' ? 'DEPT_COLLABORATOR' : role === 'RECEIVER' ? 'DEPT_RECEIVER' : null
        if (!deptRole) continue
        if (editing.some((s) => s.role === deptRole && s.organizationId === node.id)) continue
        additions.push({ role: deptRole, organizationId: node.id, stepOrder: 0 })
      }
    }
    if (additions.length) setEditing((prev) => normalize([...prev, ...additions]))
    setPicked(new Map())
  }

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= editing.length) return
    const next = [...editing]
    const [m] = next.splice(index, 1)
    next.splice(target, 0, m)
    setEditing(normalize(next))
  }
  const removeStep = (index: number) =>
    setEditing(normalize(editing.filter((_, i) => i !== index)))

  const loadSharedLine = () => {
    const line = sharedLines.find((l) => l.id === sharedLineId)
    if (line) setEditing(normalize(line.steps))
  }

  const stepName = (s: ApprovalStepInput): string =>
    isDeptRole(s.role)
      ? (orgNameById.get(s.organizationId ?? '') ?? '부서')
      : (empNameById.get(s.assigneeId ?? '') ?? '직원')

  // 검색 필터링된 평면 결과 (검색어 있을 때)
  const searchLower = search.trim().toLowerCase()
  const flatResults: PickedNode[] = useMemo(() => {
    if (!searchLower) return []
    const res: PickedNode[] = []
    orgNameById.forEach((name, id) => {
      if (name.toLowerCase().includes(searchLower)) res.push({ kind: 'org', id, name })
    })
    for (const e of employees) {
      if (e.name.toLowerCase().includes(searchLower)) res.push({ kind: 'emp', id: e.id, name: e.name })
    }
    return res
  }, [searchLower, orgNameById, employees])

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
        <Box sx={{ flexGrow: 1 }}>결재선 설정</Box>
        <IconButton size="small" onClick={onClose} aria-label="닫기">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', minHeight: 420 }}>
          {/* 좌측: 조직 트리 + 직원 */}
          <Box sx={{ width: '42%', borderRight: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="부서명 또는 이름 입력"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" color="action" />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 0.5, pb: 1 }}>
              {searchLower ? (
                flatResults.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>검색 결과가 없습니다.</Typography>
                ) : (
                  flatResults.map((node) => (
                    <PickRow
                      key={`${node.kind}:${node.id}`}
                      label={node.name}
                      isEmp={node.kind === 'emp'}
                      checked={picked.has(`${node.kind}:${node.id}`)}
                      onToggle={() => togglePick(node)}
                      depth={0}
                    />
                  ))
                )
              ) : (
                orgs.map((org) => (
                  <OrgTreeNode
                    key={org.id}
                    org={org}
                    depth={0}
                    expanded={expanded}
                    picked={picked}
                    empsByOrg={empsByOrg}
                    onToggleExpand={toggleExpand}
                    onTogglePick={togglePick}
                  />
                ))
              )}
            </Box>
          </Box>

          {/* 중앙: 역할 추가 버튼 */}
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, px: 1.5, borderRight: '1px solid', borderColor: 'divider' }}>
            {ROLE_BUTTONS.map((b) => (
              <Button
                key={b.role}
                size="small"
                variant="outlined"
                disabled={picked.size === 0}
                onClick={() => addRole(b.role)}
                sx={{ minWidth: 64 }}
              >
                {b.label}
              </Button>
            ))}
          </Box>

          {/* 우측: 결재선 단계 */}
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Box sx={{ p: 1.5, display: 'flex', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
              <TextField
                select
                size="small"
                label="결재선명"
                value={sharedLineId}
                onChange={(e) => setSharedLineId(e.target.value)}
                sx={{ flexGrow: 1 }}
              >
                <MenuItem value="">직접 설정</MenuItem>
                {sharedLines.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
                ))}
              </TextField>
              <Button size="small" variant="outlined" disabled={!sharedLineId} onClick={loadSharedLine}>
                불러오기
              </Button>
            </Box>

            <Box sx={{ flexGrow: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {/* 기안 고정 행 */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <Chip size="small" label="기안" sx={{ minWidth: 56, bgcolor: '#eeeeee' }} />
                <Typography variant="body2" sx={{ flexGrow: 1 }}>{drafterName ?? '기안자'}</Typography>
              </Box>

              {editing.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                  좌측에서 대상을 선택하고 역할 버튼으로 추가하세요.
                </Typography>
              ) : (
                editing.map((s, i) => (
                  <Box key={`${s.role}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      size="small"
                      label={STEP_ROLE_LABEL[s.role]}
                      sx={{ minWidth: 56 }}
                      color={s.role === 'APPROVER' ? 'primary' : 'default'}
                      variant={s.role === 'APPROVER' ? 'filled' : 'outlined'}
                    />
                    <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }} noWrap>
                      {stepName(s)}
                    </Typography>
                    <IconButton size="small" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="위로">
                      <ArrowUpwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={i === editing.length - 1} onClick={() => moveStep(i, 1)} aria-label="아래로">
                      <ArrowDownwardIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => removeStep(i)} aria-label="삭제">
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={() => onApply(normalize(editing), sharedLineId || undefined)}>
          적용
        </Button>
      </DialogActions>
    </Dialog>
  )
}

/** 체크박스 행 (검색 결과·직원 리프 공용) */
function PickRow({
  label,
  isEmp,
  checked,
  onToggle,
  depth,
}: {
  label: string
  isEmp: boolean
  checked: boolean
  onToggle: () => void
  depth: number
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', pl: 1 + depth * 1.5, py: 0.1 }}>
      <Checkbox size="small" checked={checked} onChange={onToggle} sx={{ p: 0.5 }} />
      {isEmp && <PersonIcon fontSize="small" sx={{ color: 'text.disabled', mr: 0.5 }} />}
      <Typography variant="body2" noWrap sx={{ fontWeight: isEmp ? 400 : 600 }}>
        {label}
      </Typography>
    </Box>
  )
}

/** 조직 트리 노드 (부서 체크박스 + 펼침 + 하위 부서/직원) */
function OrgTreeNode({
  org,
  depth,
  expanded,
  picked,
  empsByOrg,
  onToggleExpand,
  onTogglePick,
}: {
  org: Organization
  depth: number
  expanded: Set<string>
  picked: Map<string, PickedNode>
  empsByOrg: Map<string, { id: string; name: string }[]>
  onToggleExpand: (id: string) => void
  onTogglePick: (node: PickedNode) => void
}) {
  const isOpen = expanded.has(org.id)
  const childOrgs = org.children ?? []
  const emps = empsByOrg.get(org.id) ?? []
  const hasChildren = childOrgs.length > 0 || emps.length > 0

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', pl: 0.5 + depth * 1.5, py: 0.1 }}>
        {hasChildren ? (
          <IconButton size="small" onClick={() => onToggleExpand(org.id)} sx={{ p: 0.25 }} aria-label={isOpen ? '접기' : '펼치기'}>
            {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        ) : (
          <Box sx={{ width: 28 }} />
        )}
        <Checkbox
          size="small"
          checked={picked.has(`org:${org.id}`)}
          onChange={() => onTogglePick({ kind: 'org', id: org.id, name: org.name })}
          sx={{ p: 0.5 }}
        />
        <Typography variant="body2" fontWeight={600} noWrap>{org.name}</Typography>
      </Box>
      <Collapse in={isOpen} timeout="auto" unmountOnExit>
        {childOrgs.map((c) => (
          <OrgTreeNode
            key={c.id}
            org={c}
            depth={depth + 1}
            expanded={expanded}
            picked={picked}
            empsByOrg={empsByOrg}
            onToggleExpand={onToggleExpand}
            onTogglePick={onTogglePick}
          />
        ))}
        {emps.map((e) => (
          <PickRow
            key={e.id}
            label={e.name}
            isEmp
            checked={picked.has(`emp:${e.id}`)}
            onToggle={() => onTogglePick({ kind: 'emp', id: e.id, name: e.name })}
            depth={depth + 1.5}
          />
        ))}
      </Collapse>
    </>
  )
}
