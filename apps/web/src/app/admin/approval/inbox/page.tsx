'use client'
import { useEffect, useMemo, useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Badge, type BadgeKind, TextInput, TableEmpty } from '@/components/ab/atoms'
import { I, HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import DocModal from '@/components/approval/DocModal'
import ProxySettingsDialog from '@/components/approval/ProxySettingsDialog'
import { BOX_TABS, DOC_STATUS_LABEL, dateTimeText } from '@/components/approval/approval-constants'
import {
  useDocuments,
  type DocumentBox,
  type DocumentListItem,
  type DocumentStatus,
} from '@/lib/query/documents'

const PAGE_LIMIT = 20
type BoxValue = (typeof BOX_TABS)[number]['value']
/** 기안함 계열 — DRAFT 문서를 내가 편집/상신할 수 있는 박스 */
const MINE_BOXES: BoxValue[] = ['draft', 'in_progress', 'completed']

/** 문서 상태 → 네이티브 Badge 종류 (DocModal 헤더 매핑과 동일) */
const DOC_BADGE: Record<DocumentStatus, BadgeKind> = {
  DRAFT: 'b-wait',
  PENDING: 'b-prog',
  APPROVED: 'b-done',
  REJECTED: 'b-reject',
  RECALLED: 'b-submit',
}

type DocModalState = { documentId: string | null; mode: 'view' | 'edit' | 'create' }

/** 관리자용 내 문서함 — 핸드오프 네이티브(탭 + 헤어라인 표 + DocModal) */
export default function AdminApprovalInboxPage() {
  const toast = useToast()
  const [box, setBox] = useState<BoxValue>('draft')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [searchField, setSearchField] = useState<'all' | 'title' | 'form' | 'drafter'>('all')
  const [proxyOpen, setProxyOpen] = useState(false)
  const [docModal, setDocModal] = useState<DocModalState | null>(null)

  // 검색어 디바운스 — 입력 멈춤 후 300ms 적용, 페이지 초기화
  useEffect(() => {
    const t = setTimeout(() => {
      setAppliedSearch(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, refetch } = useDocuments(box as DocumentBox, {
    page,
    limit: PAGE_LIMIT,
    ...(appliedSearch ? { search: appliedSearch, searchField } : {}),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT))
  const isMineBox = useMemo(() => MINE_BOXES.includes(box), [box])

  function selectBox(value: BoxValue) {
    setBox(value)
    setPage(1)
  }

  function openDoc(item: DocumentListItem) {
    // 기안함 계열의 임시저장 문서는 편집/상신, 그 외는 열람
    if (item.status === 'DRAFT' && isMineBox) {
      setDocModal({ documentId: item.id, mode: 'edit' })
      return
    }
    setDocModal({ documentId: item.id, mode: 'view' })
  }

  return (
    <>
      <PageHead
        eyebrow="My Documents"
        title="내 문서함"
        right={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-line btn-sm" onClick={() => setProxyOpen(true)}>
              {HRI.settings({ style: { marginRight: 6 } })}대리결재 설정
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setDocModal({ documentId: null, mode: 'create' })}
            >
              {I.plus({ style: { marginRight: 6 } })}기안 작성
            </button>
          </div>
        }
      />

      {/* 문서함 탭 */}
      <div className="tabs">
        {BOX_TABS.map((t) => (
          <button
            key={t.value}
            className={'tab' + (box === t.value ? ' on' : '')}
            onClick={() => selectBox(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 표 상단 — 건수 + 검색 */}
      <div className="tbl-bar">
        <span className="tbl-count">총 <b>{total.toLocaleString()}</b>건</span>
        <div className="tbl-tools" style={{ minWidth: 340, display: 'flex', gap: 8 }}>
          <select
            className="sel"
            style={{ maxWidth: 100 }}
            value={searchField}
            onChange={(e) => setSearchField(e.target.value as typeof searchField)}
            aria-label="검색 대상"
          >
            <option value="all">전체</option>
            <option value="title">제목</option>
            <option value="form">양식</option>
            <option value="drafter">기안자</option>
          </select>
          <TextInput
            placeholder={searchField === 'drafter' ? '기안자명 검색' : searchField === 'form' ? '양식명 검색' : '제목 · 문서번호 검색'}
            icon={I.search()}
            value={search}
            onChange={setSearch}
          />
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
                  {!isMineBox && <th style={{ width: 130 }}>기안자</th>}
                  <th style={{ width: 110 }} className="c">상태</th>
                  <th style={{ width: 160 }}>상신일</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <TableEmpty
                    colSpan={isMineBox ? 5 : 6}
                    message={appliedSearch ? '검색 결과가 없습니다.' : '문서가 없습니다.'}
                  />
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.id}
                      style={{ cursor: 'pointer' }}
                      role="button"
                      tabIndex={0}
                      onClick={() => openDoc(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openDoc(item)
                        }
                      }}
                    >
                      <td className="muted">{item.docNumber ?? '미부여'}</td>
                      <td>
                        <span className="tbl-link">{item.title}</span>
                      </td>
                      <td className="muted">{item.form?.name ?? '—'}</td>
                      {!isMineBox && <td>{item.drafter?.name ?? '—'}</td>}
                      <td className="c">
                        <Badge kind={DOC_BADGE[item.status]}>{DOC_STATUS_LABEL[item.status]}</Badge>
                      </td>
                      <td className="muted">
                        {item.submittedAt ? dateTimeText(item.submittedAt) : '미상신'}
                      </td>
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

      {docModal && (
        <DocModal
          documentId={docModal.documentId}
          mode={docModal.mode}
          onClose={() => {
            setDocModal(null)
            refetch()
          }}
        />
      )}

      {proxyOpen && (
        <ProxySettingsDialog
          open
          onClose={() => setProxyOpen(false)}
          onSuccess={(msg) => {
            toast(msg)
            setProxyOpen(false)
          }}
        />
      )}
    </>
  )
}
