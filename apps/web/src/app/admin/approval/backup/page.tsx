'use client'
import { useMemo, useState } from 'react'
import { PageHead, FilterPanel } from '@/components/ab/Page'
import { Field, DateInput, Radio, TableEmpty } from '@/components/ab/atoms'
import { useToast } from '@/components/ab/Toast'
import { DOC_STATUS_LABEL, dateTimeText } from '@/components/approval/approval-constants'
import {
  useDocuments,
  useDocumentForms,
  type DocumentListItem,
} from '@/lib/query/documents'

type Scope = 'all' | 'select'
type Attach = 'include' | 'exclude'

// 백업 조회 시 한 번에 가져올 최대 문서 수 (전체 문서 export 용)
const BACKUP_FETCH_LIMIT = 1000

/** 로컬 타임존 기준 YYYY-MM-DD (DateInput과 일관) */
function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setFullYear(from.getFullYear() - 1)
  return { from: localYmd(from), to: localYmd(to) }
}

/** CSV 셀 이스케이프 — 쌍따옴표/콤마/개행 안전 처리 */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function ApprovalBackupPage() {
  const toast = useToast()
  const init = useMemo(defaultRange, [])
  const [dateFrom, setDateFrom] = useState(init.from)
  const [dateTo, setDateTo] = useState(init.to)
  const [attach, setAttach] = useState<Attach>('include')
  const [scope, setScope] = useState<Scope>('all')
  const [checkedForms, setCheckedForms] = useState<Record<string, boolean>>({})

  const { data: forms = [] } = useDocumentForms()
  const { data, isLoading } = useDocuments('ledger', {
    page: 1,
    limit: BACKUP_FETCH_LIMIT,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
  })

  const allDocs = useMemo(() => data?.items ?? [], [data])
  const totalDocs = data?.total ?? 0
  const isSelect = scope === 'select'

  const sortedForms = useMemo(() => [...forms].sort((a, b) => a.sortOrder - b.sortOrder), [forms])
  const selectedFormIds = useMemo(
    () => sortedForms.filter((f) => checkedForms[f.id]).map((f) => f.id),
    [sortedForms, checkedForms],
  )
  const selectedCount = selectedFormIds.length
  const allFormsOn = sortedForms.length > 0 && sortedForms.every((f) => checkedForms[f.id])

  // 백업 대상 문서 — 기간 클라이언트 보정 + (양식선택 시) 선택 양식만
  const targetDocs = useMemo(() => {
    let docs = allDocs
    // 상신일 기간 클라이언트 보정 (서버가 ledger 기간을 무시하는 경우 대비)
    if (dateFrom || dateTo) {
      docs = docs.filter((d) => {
        if (!d.submittedAt) return true
        // submittedAt(UTC ISO)을 로컬 날짜로 환산해 DateInput(로컬)과 일관 비교
        const day = localYmd(new Date(d.submittedAt))
        if (dateFrom && day < dateFrom) return false
        if (dateTo && day > dateTo) return false
        return true
      })
    }
    if (isSelect) {
      const set = new Set(selectedFormIds)
      docs = docs.filter((d) => (d.form?.id ? set.has(d.form.id) : false))
    }
    return docs
  }, [allDocs, dateFrom, dateTo, isSelect, selectedFormIds])

  function toggleAllForms() {
    if (allFormsOn) setCheckedForms({})
    else setCheckedForms(Object.fromEntries(sortedForms.map((f) => [f.id, true])))
  }

  function buildCsv(docs: DocumentListItem[]): string {
    const header = ['문서번호', '기안양식', '기안제목', '기안자', '결재상태', '상신일시', '첨부포함']
    const attachLabel = attach === 'include' ? '포함' : '미포함'
    const rows = docs.map((d) => [
      csvCell(d.docNumber ?? ''),
      csvCell(d.form?.name ?? ''),
      csvCell(d.title),
      csvCell(d.drafter?.name ?? ''),
      csvCell(DOC_STATUS_LABEL[d.status] ?? d.status),
      csvCell(dateTimeText(d.submittedAt)),
      csvCell(attachLabel),
    ])
    // BOM 추가로 Excel 한글 깨짐 방지
    return '﻿' + [header, ...rows].map((r) => r.join(',')).join('\r\n')
  }

  function handleBackup() {
    if (isSelect && selectedCount === 0) return
    if (targetDocs.length === 0) {
      toast('백업할 문서가 없습니다.')
      return
    }
    const csv = buildCsv(targetDocs)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const fname = `approval_backup_${dateFrom || 'all'}_${dateTo || 'all'}.csv`
    a.href = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    if (totalDocs > allDocs.length) {
      toast(`최대 ${BACKUP_FETCH_LIMIT}건까지만 백업됨 (전체 ${totalDocs}건). 기간을 좁혀 다시 백업하세요.`)
    } else {
      toast(`${targetDocs.length}건의 문서를 백업했습니다.`)
    }
  }

  return (
    <>
      <PageHead eyebrow="Document Backup" title="전자결재 백업" />

      {/* 필터 */}
      <FilterPanel>
        <Field label="문서기간">
          <div className="fld-range">
            <DateInput value={dateFrom} onChange={setDateFrom} />
            <span className="dash">~</span>
            <DateInput value={dateTo} onChange={setDateTo} />
          </div>
        </Field>
        <Field label="첨부파일">
          <div className="rad-grp">
            <Radio on={attach === 'include'} onChange={() => setAttach('include')}>포함</Radio>
            <Radio on={attach === 'exclude'} onChange={() => setAttach('exclude')}>미포함</Radio>
          </div>
        </Field>
        <Field label="문서양식">
          <div className="rad-grp">
            <Radio on={isSelect} onChange={() => setScope('select')}>양식선택</Radio>
            <Radio on={!isSelect} onChange={() => setScope('all')}>전체문서</Radio>
          </div>
        </Field>
      </FilterPanel>

      <div className="note">
        <div className="note-t">Notice</div>
        <ul>
          <li>선택한 기간·양식의 전자결재 문서 목록을 CSV 파일로 내려받습니다.</li>
          <li>CSV에는 문서번호·양식·제목·기안자·결재상태·상신일시가 포함됩니다.</li>
          <li>첨부파일 포함 여부는 CSV의 ‘첨부포함’ 열에 표기됩니다.</li>
          <li>파일명에는 조회 기간이 포함됩니다.</li>
        </ul>
      </div>

      <div className="tbl-bar">
        <span className="tbl-count">
          {isSelect ? (
            <>양식 <b>{selectedCount}</b>개 선택 · 대상 문서 <b>{targetDocs.length}</b>건</>
          ) : (
            <>전체 문서 <b>{targetDocs.length}</b>건이 선택되었습니다</>
          )}
        </span>
        <div className="tbl-tools">
          <button
            className="btn btn-primary btn-sm"
            disabled={isLoading || (isSelect && selectedCount === 0) || targetDocs.length === 0}
            onClick={handleBackup}
          >
            백업 (CSV)
          </button>
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
                {isSelect && (
                  <th style={{ width: 44 }} className="c">
                    <input type="checkbox" className="ck" checked={allFormsOn} onChange={toggleAllForms} />
                  </th>
                )}
                <th>양식명</th>
                <th style={{ width: 160 }}>보존연한</th>
                <th style={{ width: 140 }} className="c">사용여부</th>
              </tr>
            </thead>
            <tbody>
              {sortedForms.length === 0 ? (
                <TableEmpty colSpan={isSelect ? 4 : 3} message="등록된 양식이 없습니다." />
              ) : (
                sortedForms.map((f) => (
                  <tr key={f.id} style={!isSelect ? { opacity: 0.55 } : undefined}>
                    {isSelect && (
                      <td className="c">
                        <input
                          type="checkbox"
                          className="ck"
                          checked={!!checkedForms[f.id]}
                          onChange={() =>
                            setCheckedForms((prev) => ({ ...prev, [f.id]: !prev[f.id] }))
                          }
                        />
                      </td>
                    )}
                    <td className="lead">{f.name}</td>
                    <td className="muted">{f.retentionYears ? `${f.retentionYears}년 보존` : '—'}</td>
                    <td className="c">
                      {f.isActive ? (
                        <span style={{ color: 'var(--ok)' }}>사용</span>
                      ) : (
                        <span className="zero">사용 안 함</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
