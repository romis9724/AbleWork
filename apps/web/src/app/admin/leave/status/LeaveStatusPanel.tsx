'use client'
import { useMemo, useState } from 'react'
import { KpiGrid } from '@/components/ab/Page'
import { Emp, Badge } from '@/components/ab/atoms'
import { Modal } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import CreateLeaveDialog from '@/components/leave/CreateLeaveDialog'
import {
  useCompanyLeaveBalances,
  useLeaveTypes,
  useManualAccrual,
  type CompanyBalanceEntry,
  type LeaveBalance,
  type LeaveType,
} from '@/lib/query/leaves'
import { useEmployees, type Employee } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'

// ── Helpers ───────────────────────────────────────────────────────────────────
function flattenOrgs(orgs: Organization[]): Organization[] {
  return orgs.flatMap((o) => [o, ...flattenOrgs(o.children ?? [])])
}

/** 보상휴가성 유형 식별 (코드/이름 기반) */
function isCompensation(t?: LeaveBalance['leaveType']): boolean {
  const name = (t?.displayName ?? t?.name ?? '').toLowerCase()
  return name.includes('보상') || name.includes('comp')
}

interface AccrualForm {
  employeeIds: Employee[]
  leaveTypeId: string
  days: string
  note: string
  year: string
  expiresAt: string
}
const defaultAccrualForm: AccrualForm = {
  employeeIds: [],
  leaveTypeId: '',
  days: '',
  note: '',
  year: String(new Date().getFullYear()),
  expiresAt: '',
}

/**
 * 휴가 현황 본문 패널.
 * 표준 라우트(/admin/leave/status)와 회사 설정 임베드(설정 > 휴가 > 현황) 양쪽에서 동일하게 사용.
 * PageHead는 호출하는 page가 렌더하고, 패널은 자체 툴바(휴가 추가/휴가 부여)를 가진다.
 */
export default function LeaveStatusPanel() {
  const toast = useToast()

  const { data: employeesData } = useEmployees({ isActive: true, excludeSuperAdmin: true, limit: 500 })
  const employees: Employee[] = employeesData?.items ?? []

  const { data: orgsRaw = [] } = useOrganizations()
  const organizations = useMemo(() => flattenOrgs(orgsRaw), [orgsRaw])

  const { data: leaveTypes = [] } = useLeaveTypes()
  const manualAccrualMutation = useManualAccrual()

  // Filters
  const [orgFilter, setOrgFilter] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')

  const { data: balanceEntries = [], isLoading } = useCompanyLeaveBalances({
    organizationId: orgFilter || undefined,
  })

  // Grant (manual accrual) modal
  const [grantOpen, setGrantOpen] = useState(false)
  const [form, setForm] = useState<AccrualForm>(defaultAccrualForm)

  // 공용 휴가 추가 다이얼로그
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

  function openGrant() {
    setForm(defaultAccrualForm)
    setGrantOpen(true)
  }

  async function handleGrant() {
    if (form.employeeIds.length === 0 || !form.leaveTypeId || !form.days) return
    try {
      await manualAccrualMutation.mutateAsync({
        employeeIds: form.employeeIds.map((e) => e.id),
        leaveTypeId: form.leaveTypeId,
        days: Number(form.days),
        year: form.year ? Number(form.year) : undefined,
        expiresAt: form.expiresAt || undefined,
        note: form.note || undefined,
      })
      setGrantOpen(false)
      toast(`${form.employeeIds.length}명에게 휴가를 부여했습니다`)
    } catch {
      toast('휴가 부여에 실패했습니다')
    }
  }

  const displayEntries: CompanyBalanceEntry[] = employeeFilter
    ? balanceEntries.filter((entry) => entry.employee.id === employeeFilter)
    : balanceEntries

  // KPI 합계
  const { totalGranted, totalUsed } = useMemo(() => {
    let granted = 0
    let used = 0
    for (const entry of displayEntries) {
      for (const b of entry.balances) {
        granted += Number(b.accruedDays) || 0
        used += Number(b.usedDays) || 0
      }
    }
    return { totalGranted: granted, totalUsed: used }
  }, [displayEntries])
  const usageRate = totalGranted > 0 ? Math.round((totalUsed / totalGranted) * 100) : 0
  const remaining = totalGranted - totalUsed

  const memberCount = displayEntries.length

  function toggleEmployeeSelect(emp: Employee) {
    setForm((f) => ({
      ...f,
      employeeIds: f.employeeIds.some((e) => e.id === emp.id)
        ? f.employeeIds.filter((e) => e.id !== emp.id)
        : [...f.employeeIds, emp],
    }))
  }

  return (
    <div style={{ minWidth: 0 }}>
      {/* 패널 툴바 — PageHead 우측에 있던 액션을 임베드에서도 보이도록 패널 내부로 이동 */}
      <div className="tbl-bar" style={{ marginBottom: 14 }}>
        <span className="tbl-count">
          구성원 <b>{memberCount}</b>명
        </span>
        <div className="head-actions">
          <button className="btn btn-line btn-sm" onClick={() => setLeaveDialogOpen(true)}>
            휴가 추가
          </button>
          <button className="btn btn-ghost btn-sm" onClick={openGrant}>
            {I.plus({ style: { marginRight: 6 } })} 휴가 부여
          </button>
        </div>
      </div>

      <KpiGrid>
        <div className="kpi accent">
          <div className="kpi-k">Total Granted</div>
          <div className="kpi-v">
            {totalGranted}
            <span className="u">일</span>
          </div>
          <div className="kpi-d">전 직원 부여 합계</div>
        </div>
        <div className="kpi">
          <div className="kpi-k">Used</div>
          <div className="kpi-v">
            {totalUsed}
            <span className="u">일</span>
          </div>
          <div className="kpi-d">
            <span className="tag up">{usageRate}%</span> 사용률
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-k">Remaining</div>
          <div className="kpi-v">
            {remaining.toFixed(1)}
            <span className="u">일</span>
          </div>
          <div className="kpi-d">잔여 합계</div>
        </div>
      </KpiGrid>

      {/* 필터 + 카운트 */}
      <div className="tbl-bar">
        <span className="tbl-count">
          구성원 <b>{memberCount}</b>명
        </span>
        <div className="tbl-tools">
          <select
            className="sel"
            value={orgFilter}
            onChange={(e) => {
              setOrgFilter(e.target.value)
              setEmployeeFilter('')
            }}
            style={{ minWidth: 150 }}
          >
            <option value="">전체 조직</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {'　'.repeat(o.depth)}
                {o.name}
              </option>
            ))}
          </select>
          <select
            className="sel"
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            style={{ minWidth: 150 }}
          >
            <option value="">전체 직원</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 210 }}>직원</th>
                <th style={{ width: 130 }}>휴가 유형</th>
                <th style={{ width: 80 }} className="c">부여</th>
                <th style={{ width: 80 }} className="c">사용</th>
                <th>잔여</th>
                <th style={{ width: 130 }}>만료일</th>
              </tr>
            </thead>
            <tbody>
              {displayEntries.length === 0 ? (
                <tr>
                  <td className="tbl-empty" colSpan={6}>
                    등록된 직원이 없습니다
                  </td>
                </tr>
              ) : (
                displayEntries.flatMap((entry) =>
                  entry.balances.map((b: LeaveBalance) => {
                    const pct =
                      b.accruedDays > 0
                        ? Math.min(100, Math.max(0, Math.round((b.remainingDays / b.accruedDays) * 100)))
                        : 0
                    const typeName = b.leaveType?.displayName ?? b.leaveType?.name ?? '—'
                    return (
                      <tr key={b.id}>
                        <td>
                          <Emp name={entry.employee.name} />
                        </td>
                        <td>
                          {isCompensation(b.leaveType) ? (
                            <Badge kind="b-force">{typeName}</Badge>
                          ) : (
                            <span className="muted">{typeName}</span>
                          )}
                        </td>
                        <td className="c att-dur">{b.accruedDays}</td>
                        <td className="c att-dur">{b.usedDays}</td>
                        <td>
                          <div className="bal">
                            <div className="bal-track">
                              <div className="bal-fill" style={{ width: pct + '%' }} />
                            </div>
                            <span className="bal-num">
                              <b>{b.remainingDays}</b> / {b.accruedDays}일
                            </span>
                          </div>
                        </td>
                        <td className="muted">
                          {b.expiresAt ? new Date(b.expiresAt).toLocaleDateString('ko-KR') : '—'}
                        </td>
                      </tr>
                    )
                  }),
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 휴가 부여 (수동 발생) 모달 */}
      <Modal
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        eyebrow="Grant Leave"
        title="휴가 부여"
        maxWidth={640}
        footer={
          <>
            <button className="btn btn-line" style={{ minWidth: 110 }} onClick={() => setGrantOpen(false)}>
              취소
            </button>
            <button
              className="btn btn-primary"
              style={{ minWidth: 110 }}
              disabled={
                manualAccrualMutation.isPending ||
                form.employeeIds.length === 0 ||
                !form.leaveTypeId ||
                !form.days
              }
              onClick={handleGrant}
            >
              부여
            </button>
          </>
        }
      >
        <div className="doc-section">
          <div className="doc-field">
            <span className="fk">
              대상 직원<span className="req">*</span>
            </span>
            <span className="fv" style={{ width: '100%' }}>
              <div className="chips">
                {form.employeeIds.map((e) => (
                  <span key={e.id} className="chip">
                    {e.name}
                    <span className="x" onClick={() => toggleEmployeeSelect(e)}>
                      {I.x()}
                    </span>
                  </span>
                ))}
              </div>
              <select
                className="sel"
                value=""
                onChange={(e) => {
                  const emp = employees.find((x) => x.id === e.target.value)
                  if (emp && !form.employeeIds.some((x) => x.id === emp.id)) toggleEmployeeSelect(emp)
                }}
                style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 200, marginTop: 8 }}
              >
                <option value="">직원 추가…</option>
                {employees
                  .filter((e) => !form.employeeIds.some((x) => x.id === e.id))
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </span>
          </div>

          <div className="doc-field">
            <span className="fk">
              휴가 유형<span className="req">*</span>
            </span>
            <span className="fv">
              <select
                className="sel"
                value={form.leaveTypeId}
                onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
                style={{ borderBottom: '1px solid var(--warm-500)', minWidth: 200 }}
              >
                <option value="">선택</option>
                {(leaveTypes as LeaveType[]).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName ?? t.name}
                  </option>
                ))}
              </select>
            </span>
          </div>

          <div className="doc-field">
            <span className="fk">
              부여 일수<span className="req">*</span>
            </span>
            <span className="fv">
              <input
                className="inp-block"
                type="number"
                min={0.5}
                step={0.5}
                value={form.days}
                onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                style={{ maxWidth: 120, fontFamily: 'var(--font-display)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-4)', marginLeft: 8 }}>일</span>
            </span>
          </div>

          <div className="doc-field">
            <span className="fk">메모</span>
            <span className="fv" style={{ width: '100%' }}>
              <input
                className="inp-block"
                placeholder="부여 사유 (선택)"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </span>
          </div>

          <div className="doc-field">
            <span className="fk">발생 연도</span>
            <span className="fv">
              <input
                className="inp-block"
                type="number"
                min={2000}
                max={2100}
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                style={{ maxWidth: 120, fontFamily: 'var(--font-display)' }}
              />
            </span>
          </div>

          <div className="doc-field">
            <span className="fk">만료일</span>
            <span className="fv">
              <input
                className="inp-block"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                style={{ maxWidth: 180 }}
              />
              <span style={{ fontSize: 12, color: 'var(--fg-4)', marginLeft: 8 }}>미지정 시 무기한</span>
            </span>
          </div>
        </div>
      </Modal>

      {/* 공용 휴가 추가 다이얼로그 (MUI 위젯 유지) */}
      <CreateLeaveDialog
        open={leaveDialogOpen}
        onClose={() => setLeaveDialogOpen(false)}
        onResult={(message) => toast(message)}
      />
    </div>
  )
}
