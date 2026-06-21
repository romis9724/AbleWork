'use client'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { PageHead, FilterPanel, TableBar } from '@/components/ab/Page'
import { Badge, Field, DateInput, Pager, type BadgeKind } from '@/components/ab/atoms'
import { Modal } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import {
  useErrorAnalysisLogs,
  type ErrorAnalysisLog,
  type ErrorAnalysisLogPage,
} from '@/lib/query/error-analysis'

// ── 상수 ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const STATUS_OPTIONS = ['400', '401', '403', '404', '409', '422', '500', '502', '503']

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

/** 상태 코드 → 뱃지 색. 5xx=적색, 4xx=황색. */
function statusBadge(status: number): BadgeKind {
  return status >= 500 ? 'b-reject' : 'b-wait'
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
  // 입력 중 필터 (조회 버튼으로 확정)
  const [draftStart, setDraftStart] = useState('')
  const [draftEnd, setDraftEnd] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [draftMethod, setDraftMethod] = useState('')
  const [draftSearch, setDraftSearch] = useState('')

  const [applied, setApplied] = useState<{
    startDate?: string
    endDate?: string
    status?: number
    method?: string
    search?: string
  }>({})
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ErrorAnalysisLog | null>(null)

  const { data, isLoading } = useErrorAnalysisLogs({
    startDate: applied.startDate || undefined,
    endDate: applied.endDate || undefined,
    status: applied.status,
    method: applied.method || undefined,
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
      status: draftStatus ? Number(draftStatus) : undefined,
      method: draftMethod,
      search: draftSearch,
    })
    setPage(1)
  }

  return (
    <>
      <PageHead eyebrow="AI Error Analysis" title="AI 에러 분석" />

      <FilterPanel>
        <Field label="기간">
          <div className="fld-range">
            <DateInput value={draftStart} onChange={setDraftStart} />
            <span className="dash">~</span>
            <DateInput value={draftEnd} onChange={setDraftEnd} />
          </div>
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
                  <th style={{ width: 90 }} className="c">
                    상태
                  </th>
                  <th>요청</th>
                  <th style={{ width: 110 }} className="c">
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
                    <td className="tbl-empty" colSpan={5}>
                      조회된 에러 분석 로그가 없습니다
                    </td>
                  </tr>
                ) : (
                  items.map((log) => {
                    const { date, time } = formatDateTime(log.createdAt)
                    return (
                      <tr
                        key={log.id}
                        onClick={() => setSelected(log)}
                        style={{ cursor: 'pointer' }}
                      >
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
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        eyebrow={selected ? `${selected.method} ${selected.path}` : ''}
        title={selected ? `에러 ${selected.status} · ${selected.code}` : ''}
        maxWidth={820}
      >
        {selected && <ErrorDetail log={selected} />}
      </Modal>
    </>
  )
}

// ── 상세 ────────────────────────────────────────────────────────────────────

function ErrorDetail({ log }: { log: ErrorAnalysisLog }) {
  const { date, time } = formatDateTime(log.createdAt)
  const detailText = stringifyDetail(log.detail)
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
