'use client'
import { useState } from 'react'
import { PageHead } from '@/components/ab/Page'
import { Seg } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { DocStatusChip } from '@/components/approval/StatusChips'
import DocModal from '@/components/approval/DocModal'
import { BOX_TABS, dateText } from '@/components/approval/approval-constants'
import {
  useDocuments,
  type DocumentListItem,
} from '@/lib/query/documents'

type BoxValue = (typeof BOX_TABS)[number]['value']

const PAGE_LIMIT = 50

/** 기안함 계열(내가 작성한 문서) — DRAFT 행 클릭 시 편집 모드 진입 */
const MINE_BOXES: BoxValue[] = ['draft', 'in_progress', 'completed']

type ModalState =
  | { mode: 'view'; documentId: string }
  | { mode: 'edit'; documentId: string }
  | { mode: 'create' }
  | null

/**
 * 직원 문서함(모바일) — 핸드오프 box 탭 + 목록 + DocModal.
 * 기안함/진행중/완료/결재함/참조/공람/수신/부서함. 행 클릭→DocModal(view, DRAFT는 edit),
 * 신규 기안→DocModal(create). [id]/new/edit 라우트를 모달로 대체.
 */
export default function MyDocumentsPage() {
  const [box, setBox] = useState<BoxValue>('draft')
  const [modal, setModal] = useState<ModalState>(null)

  const { data, isLoading, refetch } = useDocuments(box, { page: 1, limit: PAGE_LIMIT })
  const items: DocumentListItem[] = data?.items ?? []
  const total = data?.total ?? 0
  const isMineBox = MINE_BOXES.includes(box)

  const openDoc = (item: DocumentListItem) => {
    if (item.status === 'DRAFT' && isMineBox) {
      setModal({ mode: 'edit', documentId: item.id })
      return
    }
    setModal({ mode: 'view', documentId: item.id })
  }

  return (
    <>
      <PageHead
        eyebrow="Documents"
        title="전자결재"
        right={
          <button className="btn btn-primary btn-sm" onClick={() => setModal({ mode: 'create' })}>
            {I.plus({ style: { marginRight: 6 } })}기안 등록
          </button>
        }
      />

      <Seg<BoxValue>
        value={box}
        onChange={(next) => setBox(next)}
        options={BOX_TABS.map((t) => ({ value: t.value, label: t.label }))}
      />

      <div className="tbl-bar" style={{ marginTop: 16 }}>
        <span className="tbl-count">
          총 <b>{total.toLocaleString()}</b>건
        </span>
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
                <th>기안 제목</th>
                <th style={{ width: 120 }}>기안양식</th>
                {!isMineBox && <th style={{ width: 96 }}>기안자</th>}
                <th style={{ width: 110 }}>상신일</th>
                <th style={{ width: 84 }} className="c">상태</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={isMineBox ? 4 : 5} className="c muted" style={{ padding: '40px 0' }}>
                    문서가 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="lead">
                      <span
                        className="tbl-link"
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
                        {item.title}
                      </span>
                    </td>
                    <td className="muted">{item.form?.name ?? '—'}</td>
                    {!isMineBox && <td className="muted">{item.drafter?.name ?? '—'}</td>}
                    <td className="muted">{item.submittedAt ? dateText(item.submittedAt) : '미상신'}</td>
                    <td className="c">
                      <DocStatusChip status={item.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <DocModal
          mode={modal.mode}
          documentId={modal.mode === 'create' ? null : modal.documentId}
          onClose={() => {
            setModal(null)
            refetch()
          }}
        />
      )}
    </>
  )
}
