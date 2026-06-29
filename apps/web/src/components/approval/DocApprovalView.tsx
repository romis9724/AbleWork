/**
 * AB 전자결재 — 기안 상세(view)용 결재선/수신/참조/공람 카드 (읽기전용).
 * 기안 등록/수정의 DraftApprovalCards와 동일한 카드 레이아웃을 쓰되,
 * 각 단계의 결재 진행 상태(승인/대기/반려/전결/대결)와 처리일시를 함께 표시한다.
 */
'use client'
import { useState } from 'react'
import type { ApprovalStepDetail, StepRole } from '@/lib/query/documents'
import { STEP_ROLE_LABEL, STEP_STATUS_LABEL, STEP_STATUS_STYLE, isDeptRole, dateTimeText } from './approval-constants'

interface Props {
  steps: ApprovalStepDetail[]
  drafterName: string
  drafterOrgName?: string
  drafterDate?: string | null
}

/** 결재 흐름(가로 카드) 역할 — 결재/협조. 그 외(수신/참조/공람)는 접이식 섹션 */
const FLOW_ROLES: StepRole[] = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']
const isFlow = (r: StepRole) => FLOW_ROLES.includes(r)

// 수신만 상태(수신완료/반송/대기)가 문서 흐름에 의미가 있어 배지 표시. 참조/공람은 이름만.
const CC_SECTIONS: { label: string; roles: StepRole[]; showStatus: boolean }[] = [
  { label: '수신', roles: ['RECEIVER', 'DEPT_RECEIVER'], showStatus: true },
  { label: '참조', roles: ['REFERENCE'], showStatus: false },
  { label: '공람', roles: ['VIEWER'], showStatus: false },
]

const targetName = (s: ApprovalStepDetail) =>
  (isDeptRole(s.role) ? s.organization?.name : s.assignee?.name) ?? '미지정'

export default function DocApprovalView({ steps, drafterName, drafterOrgName, drafterDate }: Props) {
  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder)
  const flow = sorted.filter((s) => isFlow(s.role))
  const cc = sorted.filter((s) => !isFlow(s.role))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* 결재선: 기안 + 결재/협조 카드 (가로) */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <StampCard role="기안" name={drafterName} org={drafterOrgName} statusLabel="기안" date={drafterDate} muted />
        {flow.map((s) => (
          <StampCard
            key={s.id}
            role={STEP_ROLE_LABEL[s.role]}
            name={targetName(s)}
            org={isDeptRole(s.role) ? undefined : undefined}
            statusLabel={STEP_STATUS_LABEL[s.status] ?? s.status}
            statusStyle={STEP_STATUS_STYLE[s.status]}
            sub={s.isProxy && s.proxy?.name ? `대결 ${s.proxy.name}` : undefined}
            date={s.actedAt ?? (s.status === 'PENDING' ? null : undefined)}
            pendingText={s.status === 'PENDING' ? '결재 대기' : undefined}
          />
        ))}
        {flow.length === 0 && <span style={{ fontSize: 13, color: 'var(--fg-5)', alignSelf: 'center' }}>결재 단계가 없습니다.</span>}
      </div>

      {/* 수신 / 참조 / 공람 (읽기전용) — 수신만 상태 배지 표시 */}
      {CC_SECTIONS.map((sec) => (
        <CcViewSection
          key={sec.label}
          label={sec.label}
          items={cc.filter((s) => sec.roles.includes(s.role))}
          showStatus={sec.showStatus}
        />
      ))}
    </div>
  )
}

/** 결재선 카드 — 역할 + 이름 + (부서) + 상태 배지 + 처리일시. 기안 칸은 muted */
function StampCard({
  role,
  name,
  org,
  statusLabel,
  statusStyle,
  sub,
  date,
  pendingText,
  muted,
}: {
  role: string
  name: string
  org?: string
  statusLabel: string
  statusStyle?: { bg: string; fg: string }
  sub?: string
  date?: string | null
  pendingText?: string
  muted?: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        minWidth: 140,
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
      {sub && <span style={{ fontSize: 10, color: 'var(--fg-4)' }}>{sub}</span>}
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 999,
          background: statusStyle?.bg ?? 'var(--ab-bg-1, #16181d)',
          color: statusStyle?.fg ?? 'var(--fg-4)',
        }}
      >
        {statusLabel}
      </span>
      <span style={{ fontSize: 10, color: 'var(--fg-5)' }}>{pendingText ?? (date ? dateTimeText(date) : '—')}</span>
    </div>
  )
}

/** 수신/참조/공람 접이식 섹션 (읽기전용) — 이름·부서·상태 칩 */
function CcViewSection({ label, items, showStatus }: { label: string; items: ApprovalStepDetail[]; showStatus: boolean }) {
  const [open, setOpen] = useState(true)
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
        <div style={{ padding: '0 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {items.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--fg-5)' }}>없음</span>
          ) : (
            items.map((s) => {
              const st = STEP_STATUS_STYLE[s.status]
              return (
                <span
                  key={s.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'var(--ab-bg-2)', border: '1px solid var(--line)', fontSize: 12, color: 'var(--fg-1)' }}
                >
                  {targetName(s)}
                  {showStatus && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: st?.bg, color: st?.fg }}>
                      {STEP_STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  )}
                </span>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
