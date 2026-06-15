/**
 * AB 전자결재 — 공용 결재선 등록 · 수정 모달 (핸드오프 screens1.jsx LineModal 네이티브 포팅).
 * 좌: 조직도 트리(organizations + employees)에서 인원/부서 선택 + 역할 버튼(결재/합의/수신/참조/공람).
 * 우: 결재선명 입력 + 선택된 단계 리스트(번호 .tek + 역할 Badge + 이름 + 삭제) → ApprovalStepInput[].
 * 저장은 useCreateSharedApprovalLine/useUpdateSharedApprovalLine ({name, steps}).
 */
'use client'
import { useMemo, useState } from 'react'
import { useToast } from '@/components/ab/Toast'
import { I } from '@/components/ab/icons'
import { Badge } from '@/components/ab/atoms'
import { useEmployees, type Employee } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import {
  useCreateSharedApprovalLine,
  useUpdateSharedApprovalLine,
  type ApprovalStepInput,
  type SharedApprovalLine,
  type StepRole,
} from '@/lib/query/documents'
import { STEP_ROLE_LABEL, isDeptRole } from './approval-constants'

interface Props {
  line?: SharedApprovalLine | null
  mode: 'create' | 'edit'
  onClose: () => void
}

/** 추가 가능한 역할 버튼 (핸드오프: 결재/합의/수신/참조/공람) */
const ROLE_BUTTONS: { role: StepRole; label: string }[] = [
  { role: 'APPROVER', label: '결재' },
  { role: 'AGREEMENT', label: '합의' },
  { role: 'RECEIVER', label: '수신' },
  { role: 'REFERENCE', label: '참조' },
  { role: 'VIEWER', label: '공람' },
]

/** 트리 노드: 조직(부서) 또는 인원 */
interface TreeNode {
  key: string
  level: 1 | 2 | 3
  label: string
  kind: 'org' | 'emp'
  id: string // org.id 또는 employee.id
  orgId: string // 소속 조직 id (인원도 소속 부서)
  orgName: string
}

/** 조직 트리 + 인원을 핸드오프 평면 트리(.tree-node lvl1/2/3)로 평탄화 */
function flattenTree(orgs: Organization[], employees: Employee[], depth = 0): TreeNode[] {
  const empByOrg = new Map<string, Employee[]>()
  for (const e of employees) {
    for (const link of e.organizations ?? []) {
      const list = empByOrg.get(link.organization.id) ?? []
      list.push(e)
      empByOrg.set(link.organization.id, list)
    }
  }
  const walk = (nodes: Organization[], lvl: number): TreeNode[] =>
    nodes.flatMap((o) => {
      const orgLevel = (Math.min(lvl, 2) + 1) as 1 | 2
      const self: TreeNode = {
        key: `org-${o.id}`,
        level: orgLevel,
        label: o.name,
        kind: 'org',
        id: o.id,
        orgId: o.id,
        orgName: o.name,
      }
      const members: TreeNode[] = (empByOrg.get(o.id) ?? []).map((e) => ({
        key: `emp-${o.id}-${e.id}`,
        level: 3,
        label: e.positions?.[0]?.position?.name ? `${e.name} · ${e.positions[0].position.name}` : e.name,
        kind: 'emp',
        id: e.id,
        orgId: o.id,
        orgName: o.name,
      }))
      const children = o.children?.length ? walk(o.children, lvl + 1) : []
      return [self, ...members, ...children]
    })
  void depth
  return walk(orgs, 0)
}

export default function LineModalNative({ line, mode, onClose }: Props) {
  const toast = useToast()
  const isEdit = mode === 'edit'
  const { data: orgData } = useOrganizations()
  const { data: empData } = useEmployees({ limit: 500, isActive: true })
  const createMutation = useCreateSharedApprovalLine()
  const updateMutation = useUpdateSharedApprovalLine()

  const tree = useMemo(
    () => flattenTree(orgData ?? [], empData?.items ?? []),
    [orgData, empData],
  )

  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [name, setName] = useState(line?.name ?? '')
  const [steps, setSteps] = useState<ApprovalStepInput[]>(line?.steps ?? [])

  const busy = createMutation.isPending || updateMutation.isPending

  const filtered = search.trim()
    ? tree.filter((n) => n.label.includes(search.trim()) || n.orgName.includes(search.trim()))
    : tree
  const selectedNode = tree.find((n) => n.key === selectedKey) ?? null

  // 이름 해석 맵 (저장된 line.steps 표시용)
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of tree) if (n.kind === 'org') map.set(n.id, n.label)
    return map
  }, [tree])
  const empNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of empData?.items ?? []) map.set(e.id, e.name)
    return map
  }, [empData])

  const stepName = (s: ApprovalStepInput): string =>
    isDeptRole(s.role)
      ? orgNameById.get(s.organizationId ?? '') ?? '부서'
      : empNameById.get(s.assigneeId ?? '') ?? '직원'

  const addRole = (role: StepRole) => {
    if (!selectedNode) {
      toast('조직도에서 대상을 선택해 주세요')
      return
    }
    const dept = isDeptRole(role)
    if (dept && selectedNode.kind !== 'org') {
      toast('부서 역할은 조직(부서)을 선택해 주세요')
      return
    }
    if (!dept && selectedNode.kind !== 'emp') {
      toast('해당 역할은 인원을 선택해 주세요')
      return
    }
    const next: ApprovalStepInput = dept
      ? { role, organizationId: selectedNode.orgId, stepOrder: steps.length + 1 }
      : { role, assigneeId: selectedNode.id, stepOrder: steps.length + 1 }
    setSteps((prev) => [...prev, { ...next, stepOrder: prev.length + 1 }])
  }

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, stepOrder: i + 1 })))
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast('결재선명을 입력해 주세요')
      return
    }
    if (steps.length === 0) {
      toast('결재선에 단계를 추가해 주세요')
      return
    }
    const payload = {
      name: name.trim(),
      steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
    }
    try {
      if (isEdit && line) {
        await updateMutation.mutateAsync({ id: line.id, ...payload })
        toast('공용 결재선을 수정했습니다')
      } else {
        await createMutation.mutateAsync(payload)
        toast('공용 결재선이 등록되었습니다')
      }
      onClose()
    } catch {
      toast('저장 중 오류가 발생했습니다')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title-wrap">
            <span className="modal-eyebrow">{isEdit ? 'Edit Approval Line' : 'New Approval Line'}</span>
            <span className="modal-title">{isEdit ? '공용 결재선 수정' : '공용 결재선 등록'}</span>
          </div>
          <button className="modal-x" onClick={onClose}>{I.x()}</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 440 }}>
            {/* 좌: 조직도 선택 */}
            <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 18px 0' }}>
                <div className="inp-wrap">
                  <input
                    className="inp"
                    placeholder="조직명 또는 이름을 입력하세요"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span className="ic">{I.search()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                <div className="tree" style={{ flex: 1, overflowY: 'auto' }}>
                  {filtered.length === 0 && <div className="tbl-empty">결과가 없습니다</div>}
                  {filtered.map((n) => (
                    <div
                      key={n.key}
                      className={`tree-node lvl${n.level}` + (selectedKey === n.key ? ' on' : '')}
                      onClick={() => setSelectedKey(n.key)}
                    >
                      {n.kind === 'org' && <span className="tw">▾</span>}
                      {n.label}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 14px', borderLeft: '1px solid var(--line-soft)', justifyContent: 'center' }}>
                  {ROLE_BUTTONS.map((r) => (
                    <button key={r.role} className="btn btn-line btn-sm" style={{ padding: '8px 14px' }} onClick={() => addRole(r.role)}>{r.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* 우: 선택된 결재선 */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--line)' }}>
                <div className="inp-wrap" style={{ flex: 1 }}>
                  <input
                    className="inp"
                    placeholder="공용 결재선명 입력"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                {steps.map((s, i) => (
                  <div key={`${s.role}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--line-soft)' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 100", fontSize: 11, fontWeight: 700, color: 'var(--ab-orange)', width: 28 }}>{String(i + 1).padStart(2, '0')}</span>
                    <Badge kind="b-submit">{STEP_ROLE_LABEL[s.role]}</Badge>
                    <span style={{ fontSize: 13, color: '#fff', flex: 1 }}>{stepName(s)}</span>
                    <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => removeStep(i)}>{I.x()}</button>
                  </div>
                ))}
                {steps.length === 0 && <div className="tbl-empty">왼쪽에서 결재권자를 추가하세요</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-line" style={{ minWidth: 120 }} disabled={busy} onClick={onClose}>취소</button>
          <button className="btn btn-primary" style={{ minWidth: 120 }} disabled={busy || !name.trim() || steps.length === 0} onClick={handleSave}>{isEdit ? '저장' : '등록'}</button>
        </div>
      </div>
    </div>
  )
}
