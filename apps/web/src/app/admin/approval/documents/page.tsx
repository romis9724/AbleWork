'use client'
import { useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Badge, type BadgeKind, TableEmpty } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import DocModal from '@/components/approval/DocModal'
import { DOC_STATUS_LABEL, dateTimeText } from '@/components/approval/approval-constants'
import { useDocuments, type DocumentStatus } from '@/lib/query/documents'
import { useDebounce } from '@/hooks/useDebounce'

const STATUS_OPTIONS: DocumentStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'RECALLED']
const PAGE_SIZES = [10, 20, 50] as const

/** 문서 상태 → 네이티브 Badge 종류 (DocModal 헤더 매핑과 동일) */
const DOC_BADGE: Record<DocumentStatus, BadgeKind> = {
  DRAFT: 'b-wait',
  PENDING: 'b-prog',
  APPROVED: 'b-done',
  REJECTED: 'b-reject',
  RECALLED: 'b-submit',
}

export default function DocumentLedgerPage() {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchField, setSearchField] = useState<'all' | 'title' | 'form' | 'drafter'>('all')
  const search = useDebounce(searchInput, 300)
  // 행 클릭 — 라우트 이동 대신 DocModal(view)
  const [docId, setDocId] = useState<string | null>(null)

  const { data, isLoading } = useDocuments('ledger', {
    page,
    limit,
    ...(status ? { status } : {}),
    ...(search ? { search, searchField } : {}),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <>
      <PageHead
        eyebrow="Document Ledger"
        title="문서대장"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="sel"
              value={searchField}
              onChange={(e) => {
                setSearchField(e.target.value as typeof searchField)
                setPage(1)
              }}
              aria-label="검색 대상"
            >
              <option value="all">전체</option>
              <option value="title">제목</option>
              <option value="form">양식</option>
              <option value="drafter">기안자</option>
            </select>
            <input
              className="inp"
              type="search"
              placeholder={searchField === 'drafter' ? '기안자명 검색' : searchField === 'form' ? '양식명 검색' : '제목·문서번호 검색'}
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
                setPage(1)
              }}
              aria-label="문서 검색"
              style={{ minWidth: 200 }}
            />
            <select
              className="sel"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
              aria-label="상태"
            >
              <option value="">전체 상태</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{DOC_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        }
      />

      <div className="tbl-bar">
        <span className="tbl-count">총 <b>{total.toLocaleString()}</b>건</span>
        <div className="tbl-tools">
          <select
            className="pgsize"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(1)
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
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
        <>
          <div className="tbl-scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>문서번호</th>
                  <th>제목</th>
                  <th style={{ width: 150 }}>양식</th>
                  <th style={{ width: 130 }}>기안자</th>
                  <th style={{ width: 110 }} className="c">상태</th>
                  <th style={{ width: 160 }}>상신일</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <TableEmpty colSpan={6} message="조회된 문서가 없습니다." />
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setDocId(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDocId(item.id)
                        }
                      }}
                    >
                      <td className="muted">{item.docNumber ?? '—'}</td>
                      <td>
                        <span className="tbl-link">{item.title}</span>
                      </td>
                      <td className="muted">{item.form?.name ?? '—'}</td>
                      <td>{item.drafter?.name ?? '—'}</td>
                      <td className="c">
                        <Badge kind={DOC_BADGE[item.status]}>{DOC_STATUS_LABEL[item.status]}</Badge>
                      </td>
                      <td className="muted">{dateTimeText(item.submittedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="nav" disabled={page <= 1} onClick={() => setPage(page - 1)}>{I.chevL()}</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button className="nav" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>{I.chevR()}</button>
          </div>
        </>
      )}

      {docId && <DocModal documentId={docId} mode="view" onClose={() => setDocId(null)} />}
    </>
  )
}
