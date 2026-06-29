/**
 * AB 전자결재 — 기안 작성용 결재선/수신/참조/공람 카드 UI.
 * 결재선(기안 + 결재/협조 흐름)은 가로 카드로, 수신/참조/공람은 접이식 섹션의 칩으로 표시·편집한다.
 * steps(ApprovalStepInput[]) 하나를 흐름(FLOW_ROLES)과 수신/참조/공람으로 나눠 관리하고
 * 변경 시 [흐름..., 수신/참조/공람...] 순서로 합쳐 stepOrder를 재부여해 onChange로 올린다.
 */
'use client'
import { useMemo, useState } from 'react'
import { I } from '@/components/ab/icons'
import type { ApprovalStepInput, StepRole } from '@/lib/query/documents'
import type { Employee } from '@/lib/query/employees'
import { STEP_ROLE_LABEL, isDeptRole } from './approval-constants'

interface Props {
  steps: ApprovalStepInput[]
  onChange: (steps: ApprovalStepInput[]) => void
  employees: Employee[]
  drafterName: string
  drafterOrgName?: string
  disabled?: boolean
}

/** 결재 흐름(가로 카드) 역할 — 결재/협조. 그 외(수신/참조/공람)는 접이식 섹션 */
const FLOW_ROLES: StepRole[] = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']
const isFlow = (r: StepRole) => FLOW_ROLES.includes(r)
const normalize = (s: ApprovalStepInput[]) => s.map((x, i) => ({ ...x, stepOrder: i + 1 }))

/** 흐름에 추가 가능한 역할 */
const FLOW_ADD: { role: StepRole; label: string }[] = [
  { role: 'APPROVER', label: '결재' },
  { role: 'AGREEMENT', label: '협조' },
]
/** 수신/참조/공람 섹션 */
const CC_SECTIONS: { role: StepRole; label: string }[] = [
  { role: 'RECEIVER', label: '수신' },
  { role: 'REFERENCE', label: '참조' },
  { role: 'VIEWER', label: '공람' },
]

export default function DraftApprovalCards({
  steps,
  onChange,
  employees,
  drafterName,
  drafterOrgName,
  disabled = false,
}: Props) {
  // 직원 id → { 이름, 소속(대표) 부서명 }
  const empMap = useMemo(() => {
    const m = new Map<string, { name: string; org?: string }>()
    for (const e of employees) {
      const org = e.organizations?.find((o) => o.isPrimary) ?? e.organizations?.[0]
      m.set(e.id, { name: e.name, org: org?.organization.name })
    }
    return m
  }, [employees])

  const flow = steps.filter((s) => isFlow(s.role))
  const cc = steps.filter((s) => !isFlow(s.role))

  const commit = (nextFlow: ApprovalStepInput[], nextCc: ApprovalStepInput[]) =>
    onChange(normalize([...nextFlow, ...nextCc]))

  const targetName = (s: ApprovalStepInput): string =>
    isDeptRole(s.role) ? s.organizationId ?? '부서' : empMap.get(s.assigneeId ?? '')?.name ?? '미지정'
  const targetOrg = (s: ApprovalStepInput): string | undefined =>
    isDeptRole(s.role) ? undefined : empMap.get(s.assigneeId ?? '')?.org

  // ── 흐름(결재/협조) 추가/삭제 ──
  const [flowRole, setFlowRole] = useState<StepRole>('APPROVER')
  const [flowEmp, setFlowEmp] = useState('')
  const addFlow = () => {
    if (!flowEmp) return
    if (flow.some((s) => s.role === flowRole && s.assigneeId === flowEmp)) return
    commit([...flow, { role: flowRole, assigneeId: flowEmp, stepOrder: 0 }], cc)
    setFlowEmp('')
  }
  const removeFlow = (idx: number) => commit(flow.filter((_, i) => i !== idx), cc)

  // ── 수신/참조/공람 추가/삭제 ──
  const addCc = (role: StepRole, empId: string) => {
    if (!empId) return
    if (cc.some((s) => s.role === role && s.assigneeId === empId)) return
    commit(flow, [...cc, { role, assigneeId: empId, stepOrder: 0 }])
  }
  const removeCc = (target: ApprovalStepInput) =>
    commit(flow, cc.filter((s) => !(s.role === target.role && s.assigneeId === target.assigneeId)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 결재선: 기안 + 흐름 카드 (가로) */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <FlowCard role="기안" name={drafterName} org={drafterOrgName} muted />
        {flow.map((s, i) => (
          <FlowCard
            key={`${s.role}-${s.assigneeId}-${i}`}
            role={STEP_ROLE_LABEL[s.role]}
            name={targetName(s)}
            org={targetOrg(s)}
            onRemove={disabled ? undefined : () => removeFlow(i)}
          />
        ))}
        {!disabled && (
          <div style={ADD_CARD_SX}>
            <div style={{ display: 'flex', gap: 4 }}>
              {FLOW_ADD.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className={'btn btn-sm ' + (flowRole === r.role ? 'btn-primary' : 'btn-line')}
                  style={{ padding: '3px 10px', fontSize: 11 }}
                  onClick={() => setFlowRole(r.role)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <select className="sel" value={flowEmp} onChange={(e) => setFlowEmp(e.target.value)} style={{ fontSize: 12, maxWidth: 130 }}>
              <option value="">담당자 선택</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <button type="button" className="btn btn-line btn-sm" style={{ padding: '4px 10px' }} disabled={!flowEmp} onClick={addFlow}>
              {I.plus({ style: { marginRight: 2 } })}추가
            </button>
          </div>
        )}
      </div>

      {/* 수신 / 참조 / 공람 */}
      {CC_SECTIONS.map((sec) => (
        <CcSection
          key={sec.role}
          label={sec.label}
          role={sec.role}
          items={cc.filter((s) => s.role === sec.role || (sec.role === 'RECEIVER' && s.role === 'DEPT_RECEIVER'))}
          targetName={targetName}
          targetOrg={targetOrg}
          employees={employees}
          disabled={disabled}
          onAdd={(empId) => addCc(sec.role, empId)}
          onRemove={removeCc}
        />
      ))}
    </div>
  )
}

const ADD_CARD_SX: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  justifyContent: 'center',
  minWidth: 150,
  padding: '12px 14px',
  border: '1px dashed var(--line-strong)',
  borderRadius: 10,
  background: 'transparent',
}

/** 결재선 가로 카드 — 역할(작게) + 이름(굵게) + 부서 칩 + 삭제(X) */
function FlowCard({
  role,
  name,
  org,
  muted,
  onRemove,
}: {
  role: string
  name: string
  org?: string
  muted?: boolean
  onRemove?: () => void
}) {
  return (
    <div
      style={{
        position: 'relative',
        minWidth: 132,
        padding: '14px 16px',
        borderRadius: 10,
        border: '1px solid var(--line)',
        background: 'var(--ab-bg-2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: muted ? 'var(--fg-4)' : 'var(--ab-orange)' }}>{role}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)', whiteSpace: 'nowrap' }}>{name}</span>
      {org && (
        <span style={{ fontSize: 10, color: 'var(--fg-4)', padding: '2px 8px', borderRadius: 999, background: 'color-mix(in srgb, var(--ab-orange) 12%, transparent)' }}>
          {org}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          className="modal-x"
          style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, fontSize: 11, border: 'none' }}
          onClick={onRemove}
          aria-label="삭제"
        >
          {I.x()}
        </button>
      )}
    </div>
  )
}

/** 수신/참조/공람 접이식 섹션 — 칩 목록 + 직원 추가 */
function CcSection({
  label,
  role,
  items,
  targetName,
  targetOrg,
  employees,
  disabled,
  onAdd,
  onRemove,
}: {
  label: string
  role: StepRole
  items: ApprovalStepInput[]
  targetName: (s: ApprovalStepInput) => string
  targetOrg: (s: ApprovalStepInput) => string | undefined
  employees: Employee[]
  disabled: boolean
  onAdd: (empId: string) => void
  onRemove: (s: ApprovalStepInput) => void
}) {
  const [open, setOpen] = useState(true)
  const [pick, setPick] = useState('')
  void role

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--fg-2)', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>{label}{items.length > 0 && <span style={{ color: 'var(--fg-4)', marginLeft: 6, fontWeight: 400 }}>{items.length}</span>}</span>
        <span style={{ color: 'var(--fg-5)', fontSize: 11 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {items.map((s, i) => (
            <span
              key={`${s.role}-${s.assigneeId}-${i}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'var(--ab-bg-2)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--fg-1)' }}
            >
              {targetName(s)}
              {targetOrg(s) && <span style={{ color: 'var(--fg-5)', fontSize: 11 }}>· {targetOrg(s)}</span>}
              {!disabled && (
                <button type="button" className="modal-x" style={{ width: 16, height: 16, border: 'none', fontSize: 11 }} onClick={() => onRemove(s)} aria-label="삭제">
                  {I.x()}
                </button>
              )}
            </span>
          ))}
          {items.length === 0 && <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>없음</span>}
          {!disabled && (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
              <select className="sel" value={pick} onChange={(e) => setPick(e.target.value)} style={{ fontSize: 12, maxWidth: 140 }}>
                <option value="">직원 선택</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button
                type="button"
                className="btn btn-line btn-sm"
                style={{ padding: '4px 10px' }}
                disabled={!pick}
                onClick={() => { onAdd(pick); setPick('') }}
              >
                추가
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
