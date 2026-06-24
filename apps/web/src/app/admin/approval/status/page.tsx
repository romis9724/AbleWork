'use client'
import { useMemo, useState } from 'react'
import { PageHead, FilterPanel } from '@/components/ab/Page'
import { Badge, type BadgeKind, Field, DateInput, TextInput, TableEmpty } from '@/components/ab/atoms'
import { ConfirmDialog } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import { dateTimeText, DOC_PHASE_LABEL, type DocPhase } from '@/components/approval/approval-constants'
import DocModal from '@/components/approval/DocModal'
import {
  useDocuments,
  useDocumentForms,
  useBulkForceDeleteDocuments,
  type DocumentListItem,
} from '@/lib/query/documents'
import { getApiErrorMessage } from '@/lib/api-error'
import { usePermission } from '@/hooks/usePermission'

/** 결재 현황 phase → 네이티브 Badge 종류 (상신=회색 / 진행중=오렌지 / 반려=레드) */
const PHASE_BADGE: Record<DocPhase, BadgeKind> = {
  SUBMITTED: 'b-submit',
  IN_PROGRESS: 'b-prog',
  REJECTED: 'b-reject',
}

/** 목록 항목 → 표시 phase (반려 > 진행중 > 상신) */
function phaseOf(item: DocumentListItem): DocPhase {
  if (item.status === 'REJECTED') return 'REJECTED'
  if (item.phase === 'IN_PROGRESS') return 'IN_PROGRESS'
  return 'SUBMITTED'
}

type DocModalState = { documentId: string | null; mode: 'view' | 'create' }

// 결재 현황 상태 필터 — 카카오워크 동일(상신/진행중/반려만)
const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'SUBMITTED', label: '상신' },
  { value: 'IN_PROGRESS', label: '진행중' },
  { value: 'REJECTED', label: '반려' },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['value']

interface FilterForm {
  dateFrom: string
  dateTo: string
  formId: string
  status: StatusFilter
  search: string
}

const EMPTY_FILTER: FilterForm = { dateFrom: '', dateTo: '', formId: '', status: '', search: '' }
const PAGE_SIZES = [10, 20, 50] as const

export default function ApprovalStatusPage() {
  const toast = useToast()
  // 일괄 강제삭제(POST /documents/bulk-force-delete)는 백엔드 @Roles(GENERAL_ADMIN)로 막혀 있다.
  // 방어심층: UI에서도 GENERAL_ADMIN 미만에게는 "선택 삭제" 버튼을 노출하지 않는다.
  const { isGeneralAdmin } = usePermission()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  // 필터: 입력값(form) / 적용값(applied) 분리 — [조회] 버튼으로 적용
  const [form, setForm] = useState<FilterForm>(EMPTY_FILTER)
  const [applied, setApplied] = useState<FilterForm>(EMPTY_FILTER)
  const [selected, setSelected] = useState<string[]>([])
  const [confirmBulk, setConfirmBulk] = useState(false)
  // 행 클릭/등록 — 라우트 이동 대신 DocModal
  const [docModal, setDocModal] = useState<DocModalState | null>(null)

  const { data: forms } = useDocumentForms()
  const { data, isLoading, isFetching, refetch } = useDocuments('status', {
    page,
    limit,
    ...(applied.status ? { status: applied.status } : {}),
    ...(applied.formId ? { formId: applied.formId } : {}),
    ...(applied.dateFrom ? { dateFrom: applied.dateFrom } : {}),
    ...(applied.dateTo ? { dateTo: applied.dateTo } : {}),
    ...(applied.search ? { search: applied.search } : {}),
  })
  const bulkDelete = useBulkForceDeleteDocuments()

  const items = useMemo(() => data?.items ?? [], [data])
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / limit))

  const pageIds = useMemo(() => items.map((i) => i.id), [items])
  const allChecked = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const someChecked = selected.length > 0

  function applyFilter() {
    setApplied(form)
    setPage(1)
    setSelected([])
  }

  function toggleAll() {
    setSelected(allChecked ? [] : pageIds)
  }

  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function gotoPage(p: number) {
    setPage(p)
    setSelected([])
  }

  function handleBulkDelete() {
    if (selected.length === 0) return
    bulkDelete.mutate(selected, {
      onSuccess: (res) => {
        const skippedMsg = res.skipped.length
          ? ` (제외 ${res.skipped.length}건 — HR연동/삭제불가 상태)`
          : ''
        toast(`${res.deletedCount}건 삭제했습니다.${skippedMsg}`)
        setSelected([])
        setConfirmBulk(false)
      },
      onError: (err) => {
        toast(getApiErrorMessage(err, '선택 삭제에 실패했습니다.'))
        setConfirmBulk(false)
      },
    })
  }

  return (
    <>
      <PageHead
        eyebrow="Approval Status"
        title="결재 현황"
        right={
          <span className="page-stamp">
            {new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} 기준
            <span className="rf" onClick={() => refetch()}>{I.refresh()}</span>
          </span>
        }
      />

      {/* 필터 */}
      <FilterPanel>
        <Field label="상신일">
          <div className="fld-range">
            <DateInput value={form.dateFrom} onChange={(v) => setForm((f) => ({ ...f, dateFrom: v }))} />
            <span className="dash">~</span>
            <DateInput value={form.dateTo} onChange={(v) => setForm((f) => ({ ...f, dateTo: v }))} />
          </div>
        </Field>
        <Field label="기안양식">
          <select
            className="sel"
            value={form.formId}
            onChange={(e) => setForm((f) => ({ ...f, formId: e.target.value }))}
          >
            <option value="">전체</option>
            {(forms ?? []).map((fm) => (
              <option key={fm.id} value={fm.id}>{fm.name}</option>
            ))}
          </select>
        </Field>
        <Field label="결재상태">
          <select
            className="sel"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as StatusFilter }))}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </Field>
        <Field label="검색어">
          <TextInput
            placeholder="제목 또는 문서번호 입력"
            icon={I.search()}
            value={form.search}
            onChange={(v) => setForm((f) => ({ ...f, search: v }))}
          />
        </Field>
      </FilterPanel>
      <div className="filter-action">
        <button className="btn btn-primary btn-query" onClick={applyFilter}>조회</button>
      </div>

      {/* 표 상단 툴바 */}
      <div className="tbl-bar">
        <span className="tbl-count">
          총 <b>{total.toLocaleString()}</b>건
          {selected.length > 0 && <> · 선택 {selected.length}건</>}
          {isFetching && <span className="ab-spin" style={{ marginLeft: 10, verticalAlign: 'middle' }} />}
        </span>
        <div className="tbl-tools">
          {isGeneralAdmin && (
            <button
              className="btn btn-line btn-sm"
              data-testid="estatus-bulk-delete-btn"
              disabled={selected.length === 0 || bulkDelete.isPending}
              onClick={() => setConfirmBulk(true)}
            >
              선택 삭제
            </button>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setDocModal({ documentId: null, mode: 'create' })}
          >
            {I.plus({ style: { marginRight: 6 } })}기안 등록
          </button>
          <select
            className="pgsize"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value))
              setPage(1)
              setSelected([])
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
                  <th style={{ width: 44 }} className="c">
                    <input
                      type="checkbox"
                      className="ck"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked && !allChecked
                      }}
                      onChange={toggleAll}
                    />
                  </th>
                  <th style={{ width: 130 }}>기안양식</th>
                  <th>기안 제목</th>
                  <th style={{ width: 150 }}>기안자</th>
                  <th style={{ width: 160 }}>상신일시</th>
                  <th style={{ width: 150 }}>현재 결재자</th>
                  <th style={{ width: 110 }} className="c">결재상태</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <TableEmpty colSpan={7} message="조회된 문서가 없습니다." />
                ) : (
                  items.map((item) => {
                    const checked = selected.includes(item.id)
                    return (
                      <tr key={item.id}>
                        <td className="c" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="ck"
                            checked={checked}
                            onChange={() => toggleOne(item.id)}
                          />
                        </td>
                        <td className="muted">{item.form?.name ?? '—'}</td>
                        <td>
                          <span
                            className="tbl-link"
                            role="button"
                            tabIndex={0}
                            onClick={() => setDocModal({ documentId: item.id, mode: 'view' })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setDocModal({ documentId: item.id, mode: 'view' })
                              }
                            }}
                          >
                            {item.title}
                          </span>
                        </td>
                        <td>{item.drafter?.name ?? '—'}</td>
                        <td className="muted">{dateTimeText(item.submittedAt)}</td>
                        <td>
                          {item.status === 'REJECTED' ? '—' : (item.currentApprover?.name ?? '—')}
                        </td>
                        <td className="c">
                          <Badge kind={PHASE_BADGE[phaseOf(item)]}>
                            {DOC_PHASE_LABEL[phaseOf(item)]}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="nav" disabled={page <= 1} onClick={() => gotoPage(page - 1)}>{I.chevL()}</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button key={p} className={p === page ? 'on' : ''} onClick={() => gotoPage(p)}>{p}</button>
            ))}
            <button className="nav" disabled={page >= totalPages} onClick={() => gotoPage(page + 1)}>{I.chevR()}</button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmBulk}
        title="선택 문서 삭제"
        message={`선택한 ${selected.length}건의 문서를 삭제하시겠습니까? 되돌릴 수 없습니다. (HR 요청과 연결된 문서는 자동 제외됩니다.)`}
        confirmLabel="선택 삭제"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulk(false)}
      />

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
    </>
  )
}
