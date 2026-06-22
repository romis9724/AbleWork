'use client'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { PageHead, FilterPanel, TableBar } from '@/components/ab/Page'
import { Badge, Field, Pager, type BadgeKind } from '@/components/ab/atoms'
import { Modal } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import {
  useErrorAnalysisLogs,
  useBulkResolveErrors,
  downloadErrorAnalysisCsv,
  type ErrorAnalysisLog,
  type ErrorAnalysisLogPage,
  type ResolutionStatus,
} from '@/lib/query/error-analysis'

// ── 상수 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25
const DAY_MS = 24 * 60 * 60 * 1000
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const STATUS_OPTIONS = ['400', '401', '403', '404', '409', '422', '500', '502', '503']

interface AppliedFilter {
  from?: string
  to?: string
  resolutionStatus?: ResolutionStatus
  status?: number
  method?: string
  search?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function unwrap(
  raw: ErrorAnalysisLogPage | ErrorAnalysisLog[] | undefined,
): ErrorAnalysisLogPage {
  if (!raw) return { items: [], total: 0, page: 1, limit: PAGE_SIZE }
  if (Array.isArray(raw)) return { items: raw, total: raw.length, page: 1, limit: PAGE_SIZE }
  return raw
}

function formatDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' }
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return { date, time }
}

/** Date → datetime-local 입력값('YYYY-MM-DDTHH:mm', 로컬 타임존) */
function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 오늘 특정 시각(로컬) */
function atToday(hour: number): Date {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  return d
}

/** 오늘 0시 기준 ±offset일(로컬) */
function startOfDay(offsetDays: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(0, 0, 0, 0)
  return d
}

/** 상태 코드 → 뱃지 색. 5xx=적색, 4xx=황색. */
function statusBadge(status: number): BadgeKind {
  return status >= 500 ? 'b-reject' : 'b-wait'
}

/** 처리 상태 → 뱃지 */
function resolutionBadge(s: ResolutionStatus): { kind: BadgeKind; label: string } {
  return s === 'RESOLVED' ? { kind: 'b-done', label: '완료' } : { kind: 'b-submit', label: '미해결' }
}

function stringifyDetail(detail: unknown): string {
  if (detail == null) return ''
  try {
    return JSON.stringify(detail, null, 2)
  } catch {
    return String(detail)
  }
}

const PRE_STYLE: CSSProperties = {
  margin: 0,
  padding: '12px 14px',
  background: 'var(--ab-surface-2, rgba(255,255,255,.04))',
  border: '1px solid var(--ab-border, rgba(255,255,255,.1))',
  borderRadius: 8,
  fontSize: 12.5,
  lineHeight: 1.55,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowX: 'auto',
  maxHeight: 320,
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AiErrorAnalysisPage() {
  const toast = useToast()

  // 입력 중 필터 (조회 버튼으로 확정). 기간은 datetime-local('YYYY-MM-DDTHH:mm')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [draftResolution, setDraftResolution] = useState<'' | ResolutionStatus>('')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftMethod, setDraftMethod] = useState('')
  const [draftSearch, setDraftSearch] = useState('')

  const [applied, setApplied] = useState<AppliedFilter>({})
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ErrorAnalysisLog | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [downloading, setDownloading] = useState(false)

  const bulkResolve = useBulkResolveErrors()

  const { data, isLoading } = useErrorAnalysisLogs({
    from: applied.from,
    to: applied.to,
    resolutionStatus: applied.resolutionStatus,
    status: applied.status,
    method: applied.method,
    search: applied.search,
    page,
    limit: PAGE_SIZE,
  })

  const { items, total } = unwrap(data)
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openItems = items.filter((i) => i.resolutionStatus === 'OPEN')
  const allOpenSelected =
    openItems.length > 0 && openItems.every((i) => selectedIds.includes(i.id))

  function buildApplied(over: Partial<AppliedFilter> = {}): AppliedFilter {
    return {
      from: draftFrom ? new Date(draftFrom).toISOString() : undefined,
      to: draftTo ? new Date(draftTo).toISOString() : undefined,
      resolutionStatus: draftResolution || undefined,
      status: draftStatus ? Number(draftStatus) : undefined,
      method: draftMethod || undefined,
      search: draftSearch || undefined,
      ...over,
    }
  }

  function handleSearch() {
    setApplied(buildApplied())
    setPage(1)
    setSelectedIds([])
  }

  /** 기간 프리셋: draft·applied를 동시에 갱신하고 즉시 조회 */
  function applyPreset(from: Date | null, to: Date | null) {
    setDraftFrom(from ? toLocalInput(from) : '')
    setDraftTo(to ? toLocalInput(to) : '')
    setApplied(
      buildApplied({
        from: from ? from.toISOString() : undefined,
        to: to ? to.toISOString() : undefined,
      }),
    )
    setPage(1)
    setSelectedIds([])
  }

  function changePage(p: number) {
    setPage(p)
    setSelectedIds([])
  }

  function toggleSelect(id: string) {
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  function toggleSelectAll() {
    setSelectedIds(allOpenSelected ? [] : openItems.map((i) => i.id))
  }

  async function handleBulkResolve() {
    const n = selectedIds.length
    try {
      await bulkResolve.mutateAsync({ ids: selectedIds, status: 'RESOLVED' })
      setSelectedIds([])
      toast(`${n}건을 완료 처리했습니다`)
    } catch {
      toast('완료 처리에 실패했습니다')
    }
  }

  async function handleToggleOne(log: ErrorAnalysisLog) {
    const next: ResolutionStatus = log.resolutionStatus === 'RESOLVED' ? 'OPEN' : 'RESOLVED'
    try {
      await bulkResolve.mutateAsync({ ids: [log.id], status: next })
      toast(next === 'RESOLVED' ? '완료 처리했습니다' : '미해결로 되돌렸습니다')
      setSelected(null)
    } catch {
      toast('처리에 실패했습니다')
    }
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadErrorAnalysisCsv({
        from: applied.from,
        to: applied.to,
        resolutionStatus: applied.resolutionStatus,
        status: applied.status,
        method: applied.method,
        search: applied.search,
      })
      toast('CSV를 내려받았습니다')
    } catch {
      toast('CSV 내보내기에 실패했습니다')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <PageHead eyebrow="AI Error Analysis" title="AI 에러 분석" />

      <FilterPanel>
        <Field label="기간">
          <div className="fld-range">
            <input
              className="inp"
              type="datetime-local"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
            <span className="dash">~</span>
            <input
              className="inp"
              type="datetime-local"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => applyPreset(atToday(9), null)}>
              오늘 9시~
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => applyPreset(startOfDay(-1), startOfDay(0))}
            >
              어제
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => applyPreset(new Date(Date.now() - DAY_MS), null)}
            >
              최근 24h
            </button>
          </div>
        </Field>
        <Field label="처리 상태">
          <select
            className="sel"
            value={draftResolution}
            onChange={(e) => setDraftResolution(e.target.value as '' | ResolutionStatus)}
          >
            <option value="">전체</option>
            <option value="OPEN">미해결</option>
            <option value="RESOLVED">완료</option>
          </select>
        </Field>
        <Field label="상태 코드">
          <select className="sel" value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}>
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="메서드">
          <select className="sel" value={draftMethod} onChange={(e) => setDraftMethod(e.target.value)}>
            <option value="">전체 메서드</option>
            {METHOD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="검색">
          <input
            className="inp"
            placeholder="코드 · 메시지 · 경로로 검색"
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
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDownload}
              disabled={downloading || total === 0}
            >
              {downloading ? '내보내는 중…' : 'CSV 내보내기'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={handleSearch}>
              {I.refresh({ style: { marginRight: 6 } })}새로고침
            </button>
          </>
        }
      />

      {selectedIds.length > 0 && (
        <div className="tbl-bar">
          <span className="tbl-count">
            <b>{selectedIds.length}</b>건 선택됨
          </span>
          <div className="tbl-tools" style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={bulkResolve.isPending}
              onClick={handleBulkResolve}
            >
              완료 처리
            </button>
            <button className="btn btn-dark btn-sm" onClick={() => setSelectedIds([])}>
              선택 해제
            </button>
          </div>
        </div>
      )}

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
                  <th style={{ width: 40 }} className="c">
                    <input
                      type="checkbox"
                      className="ck"
                      checked={allOpenSelected}
                      disabled={openItems.length === 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ width: 150 }}>일시</th>
                  <th style={{ width: 84 }} className="c">
                    상태
                  </th>
                  <th>요청</th>
                  <th style={{ width: 90 }} className="c">
                    처리상태
                  </th>
                  <th style={{ width: 100 }} className="c">
                    AI 분석
                  </th>
                  <th style={{ width: 110 }} className="c">
                    알림
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="tbl-empty" colSpan={7}>
                      조회된 에러 분석 로그가 없습니다
                    </td>
                  </tr>
                ) : (
                  items.map((log) => {
                    const { date, time } = formatDateTime(log.createdAt)
                    const rb = resolutionBadge(log.resolutionStatus)
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelected(log)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="c" onClick={(e) => e.stopPropagation()}>
                          {log.resolutionStatus === 'OPEN' ? (
                            <input
                              type="checkbox"
                              className="ck"
                              checked={selectedIds.includes(log.id)}
                              onChange={() => toggleSelect(log.id)}
                            />
                          ) : null}
                        </td>
                        <td className="lead">
                          {date}
                          <span className="cell-sub"> {time}</span>
                        </td>
                        <td className="c">
                          <Badge kind={statusBadge(log.status)}>{log.status}</Badge>
                        </td>
                        <td>
                          <span className="lead">
                            {log.method} <span className="muted">{log.path}</span>
                          </span>
                          <span className="cell-sub">{log.code}</span>
                        </td>
                        <td className="c">
                          <Badge kind={rb.kind}>{rb.label}</Badge>
                        </td>
                        <td className="c">
                          {log.aiAnalysis ? (
                            <Badge kind="b-done">분석됨</Badge>
                          ) : (
                            <span className="muted">{log.aiEnabled ? '실패' : 'AI 미설정'}</span>
                          )}
                        </td>
                        <td className="c muted">
                          {log.notifiedEmail ? '메일' : ''}
                          {log.notifiedEmail && log.notifiedDiscord ? ' · ' : ''}
                          {log.notifiedDiscord ? 'Discord' : ''}
                          {!log.notifiedEmail && !log.notifiedDiscord ? '-' : ''}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <Pager page={page} totalPages={totalPages} onChange={changePage} />
        </>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected ? `${selected.method} ${selected.path}` : ''}
        title={selected ? `에러 ${selected.status} · ${selected.code}` : ''}
        maxWidth={820}
      >
        {selected && (
          <ErrorDetail
            log={selected}
            pending={bulkResolve.isPending}
            onToggle={() => handleToggleOne(selected)}
          />
        )}
      </Modal>
    </>
  )
}

// ── 상세 ────────────────────────────────────────────────────────────────────

function ErrorDetail({
  log,
  pending,
  onToggle,
}: {
  log: ErrorAnalysisLog
  pending: boolean
  onToggle: () => void
}) {
  const { date, time } = formatDateTime(log.createdAt)
  const detailText = stringifyDetail(log.detail)
  const rb = resolutionBadge(log.resolutionStatus)
  const resolved = log.resolutionStatus === 'RESOLVED'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <dl className="kv-grid" style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 16px', margin: 0 }}>
        <dt className="muted">발생시각</dt>
        <dd style={{ margin: 0 }}>
          {date} {time}
        </dd>
        <dt className="muted">상태</dt>
        <dd style={{ margin: 0 }}>
          <Badge kind={statusBadge(log.status)}>{log.status}</Badge>{' '}
          <span className="muted">{log.code}</span>
        </dd>
        <dt className="muted">처리상태</dt>
        <dd style={{ margin: 0 }}>
          <Badge kind={rb.kind}>{rb.label}</Badge>
          {resolved && log.resolvedAt && (
            <span className="muted"> · {formatDateTime(log.resolvedAt).date} {formatDateTime(log.resolvedAt).time}</span>
          )}
        </dd>
        <dt className="muted">요청</dt>
        <dd style={{ margin: 0, wordBreak: 'break-all' }}>
          {log.method} {log.path}
        </dd>
        {log.userId && (
          <>
            <dt className="muted">사용자</dt>
            <dd style={{ margin: 0 }}>{log.userId}</dd>
          </>
        )}
        <dt className="muted">알림</dt>
        <dd style={{ margin: 0 }} className="muted">
          이메일 {log.notifiedEmail ? '발송됨' : '미발송'} · Discord{' '}
          {log.notifiedDiscord ? '발송됨' : '미발송'}
        </dd>
      </dl>

      <Section title="메시지">
        <pre style={PRE_STYLE}>{log.message}</pre>
      </Section>

      <Section title="AI 분석">
        {log.aiAnalysis ? (
          <pre style={PRE_STYLE}>{log.aiAnalysis}</pre>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {log.aiEnabled
              ? 'AI 분석에 실패했습니다.'
              : '회사 AI가 비활성 상태입니다. 환경설정 > AI에서 활성화하면 원인 분석이 자동 첨부됩니다.'}
          </p>
        )}
      </Section>

      {detailText && (
        <Section title="검증/상세">
          <pre style={PRE_STYLE}>{detailText}</pre>
        </Section>
      )}

      {log.stack && (
        <Section title="스택">
          <pre style={PRE_STYLE}>{log.stack}</pre>
        </Section>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          className={resolved ? 'btn btn-dark btn-sm' : 'btn btn-primary btn-sm'}
          disabled={pending}
          onClick={onToggle}
        >
          {resolved ? '미해결로 되돌리기' : '완료 처리'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, letterSpacing: '.02em' }}>{title}</h4>
      {children}
    </div>
  )
}
