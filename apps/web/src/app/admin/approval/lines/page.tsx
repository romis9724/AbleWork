/**
 * AB 전자결재 — 공용 결재선 관리 (핸드오프 screens1.jsx ApprovalLines 네이티브 재구축).
 * FilterPanel(작성일·결재선명·결재자명·작성자명) + .tbl-bar(＋결재선 등록) + .tbl
 * (결재선명 tbl-link·결재선 흐름 .flow·수신/참조/공람 카운트·작성자·작성일).
 * 행 클릭/등록은 LineModalNative(useState) 사용. 데이터/로직은 기존 훅 보존.
 */
'use client'
import { useMemo, useState } from 'react'
import { PageHead, FilterPanel } from '@/components/ab/Page'
import { Field, TextInput, DateInput, TableEmpty } from '@/components/ab/atoms'
import { ConfirmDialog } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import LineModalNative from '@/components/approval/LineModalNative'
import { dateText } from '@/components/approval/approval-constants'
import { getApiErrorMessage } from '@/lib/api-error'
import { useEmployees } from '@/lib/query/employees'
import { useOrganizations, type Organization } from '@/lib/query/organizations'
import {
  useSharedApprovalLines,
  useDeleteSharedApprovalLine,
  type ApprovalStepInput,
  type SharedApprovalLine,
  type SharedLineFilter,
  type StepRole,
} from '@/lib/query/documents'

/** 결재 흐름(.flow)에 표시할 핵심 단계 역할(결재/합의). 수신/참조/공람은 카운트로 분리 집계 */
const FLOW_ROLES: StepRole[] = ['APPROVER', 'AGREEMENT', 'DEPT_COLLABORATOR']
/** 카운트 컬럼 매핑 */
const RECEIVE_ROLES: StepRole[] = ['RECEIVER', 'DEPT_RECEIVER']

interface ModalState {
  mode: 'create' | 'edit'
  line: SharedApprovalLine | null
}

export default function SharedApprovalLinesPage() {
  const toast = useToast()
  // 검색: 입력값(input) / 적용값(applied) 분리 — [조회] 버튼으로 4개 필터 일괄 적용
  const [lineNameInput, setLineNameInput] = useState('')
  const [approverInput, setApproverInput] = useState('')
  const [authorInput, setAuthorInput] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [applied, setApplied] = useState<SharedLineFilter>({})

  const { data: lines = [], isLoading } = useSharedApprovalLines(applied)
  const { data: employeeData } = useEmployees({ limit: 500, isActive: true })
  const { data: orgTree = [] } = useOrganizations()
  const deleteMutation = useDeleteSharedApprovalLine()

  const [modal, setModal] = useState<ModalState | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<SharedApprovalLine | null>(null)

  // id → 이름 해석 맵 (저장된 line.steps 표시용)
  const empNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of employeeData?.items ?? []) map.set(e.id, e.name)
    return map
  }, [employeeData])

  const orgNameById = useMemo(() => {
    const map = new Map<string, string>()
    const walk = (nodes: Organization[]) => {
      for (const n of nodes) {
        map.set(n.id, n.name)
        if (n.children?.length) walk(n.children)
      }
    }
    walk(orgTree)
    return map
  }, [orgTree])

  const stepName = (s: ApprovalStepInput): string =>
    s.organizationId
      ? orgNameById.get(s.organizationId) ?? '부서'
      : empNameById.get(s.assigneeId ?? '') ?? '직원'

  const countByRole = (line: SharedApprovalLine, roles: StepRole[]) =>
    line.steps.filter((s) => roles.includes(s.role)).length

  const flowSteps = (line: SharedApprovalLine) =>
    [...line.steps].sort((a, b) => a.stepOrder - b.stepOrder).filter((s) => FLOW_ROLES.includes(s.role))

  const handleDelete = async () => {
    if (!confirmTarget) return
    try {
      await deleteMutation.mutateAsync(confirmTarget.id)
      toast('결재선을 삭제했습니다.')
    } catch (e) {
      toast(getApiErrorMessage(e, '삭제 중 오류가 발생했습니다.'))
    } finally {
      setConfirmTarget(null)
    }
  }

  const handleQuery = () =>
    setApplied({
      search: lineNameInput.trim() || undefined,
      author: authorInput.trim() || undefined,
      approver: approverInput.trim() || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })

  return (
    <>
      <PageHead eyebrow="Shared Approval Line" title="공용 결재선 관리" />

      {/* 검색 필터 (핸드오프: 작성일·결재선명·결재자명·작성자명) */}
      <FilterPanel>
        <Field label="작성일">
          <div className="fld-range">
            <DateInput value={dateFrom} onChange={setDateFrom} />
            <span className="dash">~</span>
            <DateInput value={dateTo} onChange={setDateTo} />
          </div>
        </Field>
        <Field label="결재선명">
          <TextInput placeholder="결재선명 입력" value={lineNameInput} onChange={setLineNameInput} />
        </Field>
        <Field label="결재자명">
          <TextInput placeholder="ID 또는 이름 입력" icon={I.search()} value={approverInput} onChange={setApproverInput} />
        </Field>
        <Field label="작성자명">
          <TextInput placeholder="ID 또는 이름 입력" icon={I.search()} value={authorInput} onChange={setAuthorInput} />
        </Field>
      </FilterPanel>
      <div className="filter-action">
        <button className="btn btn-primary btn-query" onClick={handleQuery}>조회</button>
      </div>

      <div className="tbl-bar">
        <span className="tbl-count">총 <b>{lines.length}</b>건</span>
        <div className="tbl-tools">
          <button className="btn btn-ghost btn-sm" onClick={() => setModal({ mode: 'create', line: null })}>＋ 결재선 등록</button>
        </div>
      </div>

      {isLoading ? (
        <div className="ab-loading">
          <span className="ab-spin" />
          불러오는 중…
        </div>
      ) : (
        <div className="tbl-scroll wide">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 180 }}>결재선명</th>
                <th>결재선</th>
                <th style={{ width: 70 }} className="c">수신</th>
                <th style={{ width: 70 }} className="c">참조</th>
                <th style={{ width: 70 }} className="c">공람</th>
                <th style={{ width: 150 }}>작성자</th>
                <th style={{ width: 110 }}>작성일</th>
                <th style={{ width: 70 }} className="c">관리</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <TableEmpty colSpan={8} message="등록된 공용 결재선이 없습니다." />
              ) : (
                lines.map((line) => {
                  const recv = countByRole(line, RECEIVE_ROLES)
                  const ref = countByRole(line, ['REFERENCE'])
                  const view = countByRole(line, ['VIEWER'])
                  const flow = flowSteps(line)
                  return (
                    <tr key={line.id}>
                      <td>
                        <span
                          className="tbl-link"
                          role="button"
                          tabIndex={0}
                          onClick={() => setModal({ mode: 'edit', line })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              setModal({ mode: 'edit', line })
                            }
                          }}
                        >
                          {line.name}
                        </span>
                      </td>
                      <td>
                        <span className="flow">
                          {flow.length === 0 ? (
                            <span className="zero">—</span>
                          ) : (
                            flow.map((s, i) => (
                              <span key={`${line.id}-${i}`}>
                                {i > 0 && <span className="arr">{I.arrow({ style: { display: 'inline', verticalAlign: 'middle' } })}</span>}
                                <b>{stepName(s)}</b>
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                      <td className="c">{recv ? recv : <span className="zero">0</span>}</td>
                      <td className="c">{ref ? ref : <span className="zero">0</span>}</td>
                      <td className="c">{view ? view : <span className="zero">0</span>}</td>
                      <td className="muted">{line.createdBy?.name ?? '—'}</td>
                      <td className="muted">{line.createdAt ? dateText(line.createdAt) : '—'}</td>
                      <td className="c">
                        <div style={{ display: 'inline-flex', gap: 8, color: 'var(--fg-4)' }}>
                          <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => setModal({ mode: 'edit', line })} aria-label="수정">{I.edit()}</button>
                          <button className="modal-x" style={{ width: 26, height: 26 }} onClick={() => setConfirmTarget(line)} aria-label="삭제">{I.trash()}</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <LineModalNative
          line={modal.line}
          mode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        title="공용 결재선 삭제"
        message={confirmTarget ? `"${confirmTarget.name}" 결재선을 삭제하시겠습니까?` : ''}
        confirmLabel="삭제"
        onConfirm={handleDelete}
        onCancel={() => setConfirmTarget(null)}
      />
    </>
  )
}
