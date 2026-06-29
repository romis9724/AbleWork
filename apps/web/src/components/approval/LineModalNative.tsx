/**
 * AB 전자결재 — 공용 결재선 등록 · 수정 모달 (핸드오프 screens1.jsx LineModal 네이티브 포팅).
 * 좌: 조직도 트리(접기/펼치기 + 내부 스크롤)에서 인원 선택 + 역할 버튼(결재/협조/수신/참조/공람).
 * 우(상): 공용 결재선명 입력 + [중복체크] / (중): 결재·협조 흐름 리스트(드래그로 순서변경·삭제)
 *   (하): 수신/참조/공람 탭 — 결재/협조와 무관하게 담당자 추가.
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
  useCheckSharedLineName,
  type ApprovalStepInput,
  type SharedApprovalLine,
  type StepRole,
} from '@/lib/query/documents'
import { STEP_ROLE_LABEL } from './approval-constants'

interface Props {
  line?: SharedApprovalLine | null
  mode: 'create' | 'edit'
  onClose: () => void
}

/** 결재 흐름(순서 있음)에 들어가는 역할 — 결재/협조. 그 외(수신/참조/공람)는 흐름과 무관하게 등록 */
const FLOW_ROLES: StepRole[] = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']
const isFlowRole = (role: StepRole) => FLOW_ROLES.includes(role)

/** 좌측 결재 흐름 추가 버튼 (결재/협조) */
const FLOW_BUTTONS: { role: StepRole; label: string }[] = [
  { role: 'APPROVER', label: '결재' },
  { role: 'AGREEMENT', label: '협조' },
]
/** 좌측 수신/참조/공람 추가 버튼 */
const CC_BUTTONS: { role: StepRole; label: string }[] = [
  { role: 'RECEIVER', label: '수신' },
  { role: 'REFERENCE', label: '참조' },
  { role: 'VIEWER', label: '공람' },
]

/** 수신/참조/공람 탭 정의 — 각 탭이 포함하는 역할 */
const CC_TABS: { key: 'RECEIVER' | 'REFERENCE' | 'VIEWER'; label: string; roles: StepRole[] }[] = [
  { key: 'RECEIVER', label: '수신', roles: ['RECEIVER', 'DEPT_RECEIVER'] },
  { key: 'REFERENCE', label: '참조', roles: ['REFERENCE'] },
  { key: 'VIEWER', label: '공람', roles: ['VIEWER'] },
]

/** 트리 노드: 조직(부서) 또는 인원 */
interface TreeNode {
  key: string
  level: 1 | 2 | 3
  label: string
  kind: 'org' | 'emp'
  id: string // org.id 또는 employee.id
  orgId: string // 소속 조직 id
  orgName: string
  /** 자신을 표시하려면 모두 펼쳐져 있어야 하는 상위 org 노드 key 체인 */
  ancestorKeys: string[]
}

/** 조직 트리 + 인원을 핸드오프 평면 트리(.tree-node lvl1/2/3)로 평탄화 (조상 체인 포함) */
function flattenTree(orgs: Organization[], employees: Employee[]): TreeNode[] {
  const empByOrg = new Map<string, Employee[]>()
  for (const e of employees) {
    for (const link of e.organizations ?? []) {
      const list = empByOrg.get(link.organization.id) ?? []
      list.push(e)
      empByOrg.set(link.organization.id, list)
    }
  }
  const walk = (nodes: Organization[], lvl: number, ancestors: string[]): TreeNode[] =>
    nodes.flatMap((o) => {
      const selfKey = `org-${o.id}`
      const orgLevel = (Math.min(lvl, 2) + 1) as 1 | 2
      const self: TreeNode = {
        key: selfKey,
        level: orgLevel,
        label: o.name,
        kind: 'org',
        id: o.id,
        orgId: o.id,
        orgName: o.name,
        ancestorKeys: ancestors,
      }
      const childAncestors = [...ancestors, selfKey]
      const members: TreeNode[] = (empByOrg.get(o.id) ?? []).map((e) => ({
        key: `emp-${o.id}-${e.id}`,
        level: 3,
        label: e.positions?.[0]?.position?.name ? `${e.name} · ${e.positions[0].position.name}` : e.name,
        kind: 'emp',
        id: e.id,
        orgId: o.id,
        orgName: o.name,
        ancestorKeys: childAncestors,
      }))
      const children = o.children?.length ? walk(o.children, lvl + 1, childAncestors) : []
      return [self, ...members, ...children]
    })
  return walk(orgs, 0, [])
}

export default function LineModalNative({ line, mode, onClose }: Props) {
  const toast = useToast()
  const isEdit = mode === 'edit'
  const { data: orgData } = useOrganizations()
  const { data: empData } = useEmployees({ limit: 500, isActive: true })
  const createMutation = useCreateSharedApprovalLine()
  const updateMutation = useUpdateSharedApprovalLine()
  const checkNameMutation = useCheckSharedLineName()

  const tree = useMemo(() => flattenTree(orgData ?? [], empData?.items ?? []), [orgData, empData])

  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()) // 접힌 org key (기본 전체 펼침)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [name, setName] = useState(line?.name ?? '')

  // 저장된 steps를 흐름(결재/협조)과 수신/참조/공람으로 분리 보관
  const initialFlow = (line?.steps ?? []).filter((s) => isFlowRole(s.role)).sort((a, b) => a.stepOrder - b.stepOrder)
  const initialCc = (line?.steps ?? []).filter((s) => !isFlowRole(s.role))
  const [flowSteps, setFlowSteps] = useState<ApprovalStepInput[]>(initialFlow)
  const [ccSteps, setCcSteps] = useState<ApprovalStepInput[]>(initialCc)
  const [ccTab, setCcTab] = useState<'RECEIVER' | 'REFERENCE' | 'VIEWER'>('RECEIVER')

  // 결재선명 중복 확인 결과 (이름이 바뀌면 idle로 초기화)
  const [nameCheck, setNameCheck] = useState<'idle' | 'ok' | 'dup'>('idle')
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const busy = createMutation.isPending || updateMutation.isPending

  const selectedNode = tree.find((n) => n.key === selectedKey) ?? null

  // 이름 해석 맵
  const empNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of empData?.items ?? []) map.set(e.id, e.name)
    return map
  }, [empData])
  const orgNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of tree) if (n.kind === 'org') map.set(n.id, n.label)
    return map
  }, [tree])

  const stepName = (s: ApprovalStepInput): string =>
    s.organizationId
      ? orgNameById.get(s.organizationId) ?? '부서'
      : empNameById.get(s.assigneeId ?? '') ?? '직원'

  // 트리 표시 노드 — 검색 시 매칭+조상 전개, 평소엔 펼침 상태 반영
  const visibleNodes = useMemo(() => {
    const q = search.trim()
    if (!q) return tree.filter((n) => n.ancestorKeys.every((k) => !collapsed.has(k)))
    const show = new Set<string>()
    for (const n of tree) {
      if (n.label.includes(q) || n.orgName.includes(q)) {
        show.add(n.key)
        n.ancestorKeys.forEach((k) => show.add(k))
      }
    }
    return tree.filter((n) => show.has(n.key))
  }, [tree, search, collapsed])

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  /** 결재/협조 단계 추가 (인원 선택 필요, 같은 역할+인원 중복 방지) */
  const addFlow = (role: StepRole) => {
    if (!selectedNode || selectedNode.kind !== 'emp') {
      toast('조직도에서 인원을 선택해 주세요')
      return
    }
    if (flowSteps.some((s) => s.role === role && s.assigneeId === selectedNode.id)) {
      toast('이미 추가된 담당자입니다')
      return
    }
    setFlowSteps((prev) => [...prev, { role, assigneeId: selectedNode.id, stepOrder: prev.length + 1 }])
  }

  /** 수신/참조/공람 추가 (결재·협조와 무관하게 등록, 인원 선택 필요) */
  const addCc = (role: StepRole) => {
    if (!selectedNode || selectedNode.kind !== 'emp') {
      toast('조직도에서 인원을 선택해 주세요')
      return
    }
    if (ccSteps.some((s) => s.role === role && s.assigneeId === selectedNode.id)) {
      toast('이미 추가된 담당자입니다')
      return
    }
    setCcSteps((prev) => [...prev, { role, assigneeId: selectedNode.id, stepOrder: prev.length + 1 }])
    const tab = CC_TABS.find((t) => t.roles.includes(role))
    if (tab) setCcTab(tab.key)
  }

  const removeFlow = (index: number) =>
    setFlowSteps((prev) => prev.filter((_, i) => i !== index))

  const removeCc = (target: ApprovalStepInput) =>
    setCcSteps((prev) => prev.filter((s) => !(s.role === target.role && s.assigneeId === target.assigneeId)))

  // 드래그로 결재/협조 순서 변경
  const onDrop = (toIndex: number) => {
    setDragIndex(null)
    setFlowSteps((prev) => {
      if (dragIndex === null || dragIndex === toIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleCheckName = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('결재선명을 입력해 주세요')
      return
    }
    try {
      const res = await checkNameMutation.mutateAsync({
        name: trimmed,
        excludeId: isEdit && line ? line.id : undefined,
      })
      setNameCheck(res.duplicate ? 'dup' : 'ok')
      toast(res.duplicate ? '이미 사용 중인 결재선명입니다' : '사용 가능한 결재선명입니다')
    } catch {
      toast('중복 확인 중 오류가 발생했습니다')
    }
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast('결재선명을 입력해 주세요')
      return
    }
    if (nameCheck === 'dup') {
      toast('이미 사용 중인 결재선명입니다')
      return
    }
    if (flowSteps.length === 0 && ccSteps.length === 0) {
      toast('결재선에 담당자를 추가해 주세요')
      return
    }
    // 결재/협조 흐름 → 수신/참조/공람 순으로 stepOrder 재부여
    const ordered = [...flowSteps, ...ccSteps].map((s, i) => ({ ...s, stepOrder: i + 1 }))
    const payload = { name: trimmed, steps: ordered }
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

  const ccVisible = ccSteps.filter((s) => CC_TABS.find((t) => t.key === ccTab)?.roles.includes(s.role))

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

        {/* 모달은 고정 높이 — 스크롤은 내부 트리/리스트 영역에서만 발생 */}
        <div className="modal-body" style={{ overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: 'min(560px, 68vh)' }}>
            {/* 좌: 조직도 선택 */}
            <div style={{ borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                {/* 트리 — 이 영역에서만 스크롤 */}
                <div className="tree" style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {visibleNodes.length === 0 && <div className="tbl-empty">결과가 없습니다</div>}
                  {visibleNodes.map((n) => {
                    const isCollapsed = collapsed.has(n.key)
                    return (
                      <div
                        key={n.key}
                        className={`tree-node lvl${n.level}` + (selectedKey === n.key ? ' on' : '')}
                        onClick={() => setSelectedKey(n.key)}
                      >
                        {n.kind === 'org' ? (
                          <span
                            className="tw"
                            style={{ cursor: 'pointer', width: 14, display: 'inline-block' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleCollapse(n.key)
                            }}
                          >
                            {isCollapsed ? '▸' : '▾'}
                          </span>
                        ) : (
                          <span style={{ width: 14, display: 'inline-block' }} />
                        )}
                        {n.label}
                      </div>
                    )
                  })}
                </div>
                {/* 역할 버튼 — 결재/협조(흐름) + 수신/참조/공람 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 14px', borderLeft: '1px solid var(--line-soft)', justifyContent: 'center' }}>
                  {FLOW_BUTTONS.map((r) => (
                    <button key={r.role} className="btn btn-line btn-sm" style={{ padding: '8px 14px' }} onClick={() => addFlow(r.role)}>{r.label}</button>
                  ))}
                  <div style={{ height: 1, background: 'var(--line-soft)', margin: '4px 0' }} />
                  {CC_BUTTONS.map((r) => (
                    <button key={r.role} className="btn btn-line btn-sm" style={{ padding: '8px 14px' }} onClick={() => addCc(r.role)}>{r.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* 우: 결재선명 + 결재/협조 흐름 + 수신/참조/공람 */}
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {/* 결재선명 + 중복체크 */}
              <div style={{ display: 'flex', gap: 8, padding: '16px 18px', borderBottom: '1px solid var(--line)', alignItems: 'center' }}>
                <div className="inp-wrap" style={{ flex: 1 }}>
                  <input
                    className="inp"
                    placeholder="공용 결재선명 입력"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setNameCheck('idle')
                    }}
                  />
                </div>
                <button
                  className="btn btn-line btn-sm"
                  style={{ whiteSpace: 'nowrap', padding: '8px 14px' }}
                  disabled={checkNameMutation.isPending}
                  onClick={handleCheckName}
                >
                  중복체크
                </button>
              </div>
              {nameCheck !== 'idle' && (
                <div style={{ padding: '6px 18px', fontSize: 12, color: nameCheck === 'dup' ? 'var(--danger, #c62828)' : 'var(--ok, #2e7d32)' }}>
                  {nameCheck === 'dup' ? '이미 사용 중인 결재선명입니다.' : '사용 가능한 결재선명입니다.'}
                </div>
              )}

              {/* 결재/협조 흐름 — 드래그로 순서 변경 */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 0' }}>
                <div style={{ padding: '6px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--fg-4)' }}>결재 · 협조</div>
                {flowSteps.length === 0 && <div className="tbl-empty">왼쪽에서 결재·협조 담당자를 추가하세요</div>}
                {flowSteps.map((s, i) => (
                  <div
                    key={`${s.role}-${s.assigneeId}-${i}`}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    onDragEnd={() => setDragIndex(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                      borderBottom: '1px solid var(--line-soft)',
                      opacity: dragIndex === i ? 0.5 : 1, cursor: 'grab',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-display)', fontVariationSettings: "'wdth' 100", fontSize: 11, fontWeight: 700, color: 'var(--ab-orange)', width: 28 }}>{String(i + 1).padStart(2, '0')}</span>
                    <Badge kind="b-submit">{STEP_ROLE_LABEL[s.role]}</Badge>
                    <span style={{ fontSize: 13, color: 'var(--fg-1)', flex: 1 }}>{stepName(s)}</span>
                    <span style={{ color: 'var(--fg-5)', cursor: 'grab', userSelect: 'none' }} aria-hidden>≡</span>
                    <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => removeFlow(i)} aria-label="삭제">{I.x()}</button>
                  </div>
                ))}
              </div>

              {/* 수신/참조/공람 — 결재/협조와 무관하게 등록 */}
              <div style={{ borderTop: '1px solid var(--line)', minHeight: 0 }}>
                <div style={{ display: 'flex', gap: 4, padding: '8px 18px 0' }}>
                  {CC_TABS.map((t) => {
                    const count = ccSteps.filter((s) => t.roles.includes(s.role)).length
                    return (
                      <button
                        key={t.key}
                        className={'btn btn-sm ' + (ccTab === t.key ? 'btn-primary' : 'btn-line')}
                        style={{ padding: '6px 14px' }}
                        onClick={() => setCcTab(t.key)}
                      >
                        {t.label}{count ? ` ${count}` : ''}
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '12px 18px', maxHeight: 120, overflowY: 'auto' }}>
                  {ccVisible.length === 0 ? (
                    <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>등록된 담당자가 없습니다.</span>
                  ) : (
                    ccVisible.map((s, i) => (
                      <span
                        key={`${s.role}-${s.assigneeId}-${i}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--ab-bg-2)', border: '1px solid var(--line)', borderRadius: 999, fontSize: 12, color: 'var(--fg-1)' }}
                      >
                        {stepName(s)}
                        <button
                          className="modal-x"
                          style={{ width: 18, height: 18, border: 'none', fontSize: 12 }}
                          onClick={() => removeCc(s)}
                          aria-label="삭제"
                        >
                          {I.x()}
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn btn-line" style={{ minWidth: 120 }} disabled={busy} onClick={onClose}>취소</button>
          <button
            className="btn btn-primary"
            style={{ minWidth: 120 }}
            disabled={busy || !name.trim() || (flowSteps.length === 0 && ccSteps.length === 0)}
            onClick={handleSave}
          >
            {isEdit ? '저장' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
