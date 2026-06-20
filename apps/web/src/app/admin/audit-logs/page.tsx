'use client'
import { useState } from 'react'
import { PageHead, FilterPanel, TableBar } from '@/components/ab/Page'
import { Badge, Emp, Field, DateInput, Pager } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { useAuditLogs, type AuditLog, type AuditLogPage } from '@/lib/query/audit'

// ── 상수 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25

// 와이어링된 action 코드 → 한글 라벨. 미정의 코드는 원문 노출.
const ACTION_LABELS: Record<string, string> = {
  ATTENDANCE_UPDATE: '출퇴근 수정',
  LEAVE_GRANT: '휴가 부여',
  SETTINGS_UPDATE: '설정 변경',
  EMPLOYEE_CREATE: '직원 등록',
  EMPLOYEE_DEACTIVATE: '직원 퇴사 처리',
}

const ACTION_OPTIONS = Object.entries(ACTION_LABELS)

// ── Helpers ─────────────────────────────────────────────────────────────────

function unwrap(raw: AuditLogPage | AuditLog[] | undefined): AuditLogPage {
  if (!raw) return { items: [], total: 0, page: 1, limit: PAGE_SIZE }
  if (Array.isArray(raw)) {
    return { items: raw, total: raw.length, page: 1, limit: PAGE_SIZE }
  }
  return raw
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  // 입력 중 필터 (조회 버튼으로 확정)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [draftAction, setDraftAction] = useState('')
  const [draftSearch, setDraftSearch] = useState('')

  // 확정된 조회 조건
  const [applied, setApplied] = useState<{
    startDate?: string
    endDate?: string
    action?: string
    search?: string
  }>({})
  const [page, setPage] = useState(1)

  const { data, isLoading } = useAuditLogs({
    startDate: applied.startDate || undefined,
    endDate: applied.endDate || undefined,
    action: applied.action || undefined,
    search: applied.search || undefined,
    page,
    limit: PAGE_SIZE,
  })

  const { items, total } = unwrap(data)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  function handleSearch() {
    setApplied({
      startDate: draftStart,
      endDate: draftEnd,
      action: draftAction,
      search: draftSearch,
    })
    setPage(1)
  }

  return (
    <>
      <PageHead eyebrow="Audit Log" title="감사 로그" />

      <FilterPanel>
        <Field label="기간">
          <div className="fld-range">
            <DateInput value={draftStart} onChange={setDraftStart} />
            <span className="dash">~</span>
            <DateInput value={draftEnd} onChange={setDraftEnd} />
          </div>
        </Field>
        <Field label="작업">
          <select
            className="sel"
            value={draftAction}
            onChange={(e) => setDraftAction(e.target.value)}
          >
            <option value="">전체 작업</option>
            {ACTION_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="검색">
          <input
            className="inp"
            placeholder="작업자 · 대상으로 검색"
            value={draftSearch}
            onChange={(e) => setDraftSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch()
            }}
          />
        </Field>
        <div className="filter-action">
          <button className="btn btn-primary btn-query" onClick={handleSearch} disabled={isLoading}>
            {isLoading ? '조회 중…' : '조회'}
          </button>
        </div>
      </FilterPanel>

      <TableBar
        count={
          <>
            총 <b>{total}</b>건
          </>
        }
        tools={
          <button className="btn btn-ghost btn-sm" onClick={handleSearch}>
            {I.refresh({ style: { marginRight: 6 } })}새로고침
          </button>
        }
      />

      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>일시</th>
                  <th style={{ width: 180 }}>작업자</th>
                  <th style={{ width: 130 }}>작업</th>
                  <th>대상</th>
                  <th style={{ width: 100 }} className="c">
                    결과
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="tbl-empty" colSpan={5}>
                      조회된 감사 로그가 없습니다
                    </td>
                  </tr>
                ) : (
                  items.map((log) => {
                    const { date, time } = formatDateTime(log.createdAt)
                    return (
                      <tr key={log.id}>
                        <td className="lead">
                          {date}
                          <span className="cell-sub"> {time}</span>
                        </td>
                        <td>
                          <Emp name={log.actorName} />
                        </td>
                        <td>{actionLabel(log.action)}</td>
                        <td className="muted">{log.targetLabel ?? log.targetType}</td>
                        <td className="c">
                          {log.result === 'FAIL' ? (
                            <Badge kind="b-reject">실패</Badge>
                          ) : (
                            <Badge kind="b-done">성공</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </>
  )
}
