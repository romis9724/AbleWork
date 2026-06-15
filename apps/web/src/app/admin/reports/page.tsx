'use client'
import { type ReactNode, useState } from 'react'
import { PageHead, FilterPanel } from '@/components/ab/Page'
import { Avatar, Field, DateInput, Pager } from '@/components/ab/atoms'
import { I, HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import { useEmployees, type Employee } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import apiClient from '@/lib/api-client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function minutesToHours(minutes: number): string {
  if (!minutes) return '0h'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function avgPerDay(totalMinutes: number, days: number): string {
  if (!days) return '—'
  const per = Math.round(totalMinutes / days)
  const h = Math.floor(per / 60)
  const m = per % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

function flattenOrgs(orgs: Organization[]): Organization[] {
  return orgs.flatMap((o) => [o, ...flattenOrgs(o.children ?? [])])
}

// ── Types ─────────────────────────────────────────────────────────────────────

// BE EmployeeReportRow(apps/api/src/modules/reports/reports.service.ts)와 동일한 계약
interface ReportRow {
  employeeId: string
  employeeName: string
  totalWorkDays: number
  scheduledWorkDays: number
  scheduledWorkMinutes: number
  normalCount: number
  lateCount: number
  earlyLeaveCount: number
  absentCount: number
  noScheduleCount: number
  missingClockOutCount: number
  totalWorkMinutes: number
  standardizedWorkMinutes: number
  overtimeMinutes: number
  usedLeaveDays: number
}

const LATE_OPTIONS = [0, 5, 10, 15, 30]
const PAGE_SIZE = 25

// 와이드 표 컬럼: 라벨(2줄)과 데이터 accessor를 한 배열로 묶어 헤더↔본문 정합 보장.
// 직원열은 sticky로 별도 렌더. CSV export 필드 매핑과 일관(근로시간=totalWorkMinutes,
// 표준화근로시간=standardizedWorkMinutes).
interface RepCol {
  label: string
  cell: (r: ReportRow) => { value: ReactNode; className?: string }
}
const REP_COLS: RepCol[] = [
  { label: '소정\n근로일', cell: (r) => ({ value: r.scheduledWorkDays }) },
  {
    label: '승인\n근로일',
    cell: (r) => ({ value: r.totalWorkDays, className: r.scheduledWorkDays > r.totalWorkDays ? 'warnv' : '' }),
  },
  { label: '실\n근로일', cell: (r) => ({ value: r.normalCount }) },
  { label: '유급\n휴가일', cell: (r) => ({ value: r.usedLeaveDays, className: r.usedLeaveDays === 0 ? 'zero' : '' }) },
  { label: '소정\n근로시간', cell: (r) => ({ value: minutesToHours(r.scheduledWorkMinutes) }) },
  {
    label: '승인\n근로시간',
    cell: (r) => ({
      value: minutesToHours(r.totalWorkMinutes),
      className: r.totalWorkMinutes !== r.scheduledWorkMinutes ? 'warnv' : '',
    }),
  },
  { label: '실\n근로시간', cell: (r) => ({ value: minutesToHours(r.totalWorkMinutes) }) },
  { label: '표준\n근로시간', cell: (r) => ({ value: minutesToHours(r.standardizedWorkMinutes) }) },
  { label: '1일\n평균', cell: (r) => ({ value: avgPerDay(r.totalWorkMinutes, r.totalWorkDays) }) },
  {
    label: '지각',
    cell: (r) => ({ value: r.lateCount, className: r.lateCount > 2 ? 'alert' : r.lateCount === 0 ? 'zero' : '' }),
  },
]

// ─────────────────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const toast = useToast()

  const { data: employeesData } = useEmployees({ isActive: true })
  const employees: Employee[] = employeesData?.items ?? []

  const { data: orgsRaw = [] } = useOrganizations()
  const organizations = flattenOrgs(orgsRaw)

  // Filters
  const [startDate, setStartDate] = useState(startOfMonth())
  const [endDate, setEndDate] = useState(today())
  const [orgId, setOrgId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [lateThreshold, setLateThreshold] = useState(0)
  const [earlyLeaveThreshold, setEarlyLeaveThreshold] = useState(0)

  // Result state
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)

  async function handleSearch() {
    setLoading(true)
    setPage(1)
    setHasSearched(true)
    try {
      const params: Record<string, string | undefined> = {
        startDate,
        endDate,
        organizationId: orgId || undefined,
        employeeId: employeeId || undefined,
        lateThresholdMinutes: lateThreshold > 0 ? String(lateThreshold) : undefined,
        earlyLeaveThresholdMinutes: earlyLeaveThreshold > 0 ? String(earlyLeaveThreshold) : undefined,
      }
      const result = (await apiClient.get('/reports/realtime', { params })) as
        | ReportRow[]
        | { items: ReportRow[] }
      const data = Array.isArray(result) ? result : (result.items ?? [])
      setRows(data)
    } catch {
      toast('리포트 조회에 실패했습니다')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  function handleExport() {
    const headers = [
      '직원명', '근로일수', '일정일수', '일정근로시간', '정상출근', '근로시간', '표준화근로시간', '연장근로시간',
      '지각횟수', '조퇴횟수', '결근횟수', '퇴근누락', '무일정근무', '휴가사용일수',
    ]
    const csvRows = rows.map((r) => [
      r.employeeName,
      r.totalWorkDays,
      r.scheduledWorkDays,
      minutesToHours(r.scheduledWorkMinutes),
      r.normalCount,
      minutesToHours(r.totalWorkMinutes),
      minutesToHours(r.standardizedWorkMinutes),
      minutesToHours(r.overtimeMinutes),
      r.lateCount,
      r.earlyLeaveCount,
      r.absentCount,
      r.missingClockOutCount,
      r.noScheduleCount,
      r.usedLeaveDays,
    ])
    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `근태리포트_${startDate}_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast('엑셀로 내보냈습니다')
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const paginatedRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      <PageHead
        eyebrow="Real-time Report"
        title="리포트"
        right={
          rows.length > 0 ? (
            <button className="btn btn-ghost btn-sm" onClick={handleExport}>
              {I.down({ style: { marginRight: 7 } })}다운로드
            </button>
          ) : undefined
        }
      />

      {/* 필터 패널 — 실제 편집 가능 */}
      <FilterPanel>
        <Field label="기간">
          <div className="fld-range">
            <DateInput value={startDate} onChange={setStartDate} />
            <span className="dash">~</span>
            <DateInput value={endDate} onChange={setEndDate} />
          </div>
        </Field>
        <Field label="조직">
          <select className="sel" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">전체 조직</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="직원">
          <select className="sel" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">전체 직원</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="지각 범위">
          <select
            className="sel"
            value={lateThreshold}
            onChange={(e) => setLateThreshold(Number(e.target.value))}
          >
            <option value={0}>전체</option>
            {LATE_OPTIONS.filter((v) => v > 0).map((v) => (
              <option key={v} value={v}>
                {v}분 이상
              </option>
            ))}
          </select>
        </Field>
        <Field label="조퇴 범위">
          <select
            className="sel"
            value={earlyLeaveThreshold}
            onChange={(e) => setEarlyLeaveThreshold(Number(e.target.value))}
          >
            <option value={0}>전체</option>
            {LATE_OPTIONS.filter((v) => v > 0).map((v) => (
              <option key={v} value={v}>
                {v}분 이상
              </option>
            ))}
          </select>
        </Field>
        <div className="filter-action">
          <button className="btn btn-primary btn-query" onClick={handleSearch} disabled={loading}>
            {loading ? '조회 중…' : '조회'}
          </button>
        </div>
      </FilterPanel>

      {/* 요약 바 */}
      <div className="fbar">
        <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>
          {HRI.up({ style: { display: 'inline', verticalAlign: 'middle', marginRight: 6 } })}
          실근로시간 = 휴게 차감 기준 · 총 <b style={{ color: 'var(--ab-orange)' }}>{rows.length}</b>명
        </span>
      </div>

      {loading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : rows.length === 0 ? (
        <div className="note">
          {hasSearched ? '조건에 맞는 데이터가 없습니다.' : '조회 버튼을 눌러 리포트를 생성하세요.'}
        </div>
      ) : (
        <>
          <div className="tbl-wide-wrap">
            <table className="tbl-wide">
              <thead>
                <tr>
                  <th className="emp-col lft">직원</th>
                  {REP_COLS.map((c, i) => (
                    <th key={i}>
                      {c.label.split('\n').map((l, j) => (
                        <div key={j}>{l}</div>
                      ))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r) => {
                  const isAlert = r.lateCount > 2
                  return (
                    <tr key={r.employeeId}>
                      <td className="emp-col">
                        <span className="emp">
                          {isAlert && (
                            <span style={{ color: 'var(--err)' }}>
                              {HRI.pin({ width: 12, height: 12 })}
                            </span>
                          )}
                          <Avatar name={r.employeeName} />
                          <span className="nm" style={{ fontSize: 12 }}>
                            {r.employeeName}
                          </span>
                        </span>
                      </td>
                      {REP_COLS.map((c, i) => {
                        const { value, className } = c.cell(r)
                        return (
                          <td key={i} className={className || undefined}>
                            {value}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </>
  )
}
