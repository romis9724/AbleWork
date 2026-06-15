'use client'
import { useMemo, useState } from 'react'
import { Emp, Badge, type BadgeKind } from '@/components/ab/atoms'
import { Modal } from '@/components/ab/Modal'
import { HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import {
  useRequests,
  useApproveRequest,
  useRejectRequest,
  useForceApproveRequest,
  useForceRejectRequest,
  useBulkApprove,
  useCancelRequest,
  type Request,
  type RequestApproval,
} from '@/lib/query/requests'
import { useAuthStore } from '@/stores/auth.store'

// ── 상태 / 유형 메타 ──────────────────────────────────────────────────────────
const STATUS_TABS = ['전체', '승인필요', '완료', '거절됨'] as const
type StatusTab = (typeof STATUS_TABS)[number]
const STATUS_FILTER: Record<StatusTab, string | undefined> = {
  전체: undefined,
  승인필요: 'PENDING',
  완료: 'APPROVED',
  거절됨: 'REJECTED',
}

const STATUS_BADGE: Record<string, BadgeKind> = {
  PENDING: 'b-wait',
  APPROVED: 'b-done',
  REJECTED: 'b-reject',
  FORCE_APPROVED: 'b-force',
  FORCE_REJECTED: 'b-force',
  CANCELLED: 'b-submit',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING: '대기중',
  APPROVED: '승인됨',
  REJECTED: '거절됨',
  FORCE_APPROVED: '강제 승인됨',
  FORCE_REJECTED: '강제 거절됨',
  CANCELLED: '취소됨',
}
const TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  SHIFT_CREATE: '근무일정 추가',
  ATTENDANCE_EDIT: '출퇴근 정정',
  DEVICE_CHANGE: '기기 변경',
  OFFSITE_WORK: '외근 신청',
}

function unwrap(raw: unknown): Request[] {
  if (Array.isArray(raw)) return raw as Request[]
  return ((raw as { items?: Request[] })?.items ?? []) as Request[]
}

/** 승인 진행 라벨 (예: "정하늘 (0/1)") */
function approverProgress(approvals?: RequestApproval[]): string {
  if (!approvals || approvals.length === 0) return '—'
  const total = approvals.length
  const done = approvals.filter((a) => a.status === 'APPROVED' || a.status === 'PROXY_APPROVED').length
  const current = approvals.find((a) => a.status === 'PENDING') ?? approvals[approvals.length - 1]
  const name = current.approverName ?? '결재자'
  return `${name} (${done}/${total})`
}

/** payload에서 대상 요약 추출 (변경요청은 from→to 표기) */
function targetCell(req: Request): { plain?: string; label?: string; from?: string; to?: string } {
  const p = req.payload ?? {}
  const get = (k: string): string | undefined => {
    const v = p[k]
    return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined
  }
  if (req.type === 'ATTENDANCE_EDIT') {
    const from = get('originalClockIn') ?? get('from')
    const to = get('clockInAt') ?? get('newClockIn') ?? get('to')
    if (from || to) return { label: get('date') ?? '출퇴근 정정', from, to }
  }
  if (req.type === 'LEAVE_CREATE') {
    const start = get('startDate')
    const end = get('endDate')
    if (start) return { plain: `${start}${end && end !== start ? ` – ${end}` : ''} 휴가` }
  }
  if (req.type === 'SHIFT_CREATE') {
    const date = get('date') ?? get('startAt')
    if (date) return { plain: `${date} 근무일정` }
  }
  if (req.type === 'DEVICE_CHANGE') {
    return { plain: get('newDeviceId') ? '기기 변경 요청' : '기기 해제 요청' }
  }
  // fallback
  const reason = get('reason') ?? get('title')
  return { plain: reason ?? '요청 내용' }
}

function reasonOf(req: Request): string {
  const r = req.payload?.reason
  return typeof r === 'string' ? r : '—'
}

/**
 * 요청 내역 본문 패널.
 * 표준 라우트(/admin/requests)와 회사 설정 임베드(설정 > 요청) 양쪽에서 동일하게 사용.
 * PageHead는 호출하는 page가 렌더하고, 패널은 자체 상태 탭/필터/툴바를 가진다.
 */
export default function RequestListPanel() {
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const isSuperAdmin = user?.accessLevel === 'SUPER_ADMIN'

  const [statusTab, setStatusTab] = useState<StatusTab>('전체')
  const [showAll, setShowAll] = useState(false)
  const [myTurn, setMyTurn] = useState(false)

  const queryParams = {
    status: STATUS_FILTER[statusTab],
    allEmployees: showAll || undefined,
  }
  const { data, isLoading } = useRequests(queryParams)
  const allRequests = useMemo(() => unwrap(data), [data])

  // "내 승인 차례" 클라이언트 필터 (현재 PENDING 승인자가 본인)
  const requests = useMemo(() => {
    if (!myTurn) return allRequests
    const myIds = [user?.employeeId, user?.userId].filter(Boolean)
    return allRequests.filter((r) =>
      (r.approvals ?? []).some((a) => a.status === 'PENDING' && myIds.includes(a.approverId)),
    )
  }, [allRequests, myTurn, user?.employeeId, user?.userId])

  // 선택 (PENDING 일괄 승인)
  const [selected, setSelected] = useState<string[]>([])
  const pendingRequests = requests.filter((r) => r.status === 'PENDING')
  const allPendingSelected =
    pendingRequests.length > 0 && pendingRequests.every((r) => selected.includes(r.id))
  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]))
  }
  function toggleSelectAll() {
    setSelected(allPendingSelected ? [] : pendingRequests.map((r) => r.id))
  }

  // 상세/강제 모달
  const [detail, setDetail] = useState<Request | null>(null)
  const [comment, setComment] = useState('')

  const approveMutation = useApproveRequest()
  const rejectMutation = useRejectRequest()
  const forceApproveMutation = useForceApproveRequest()
  const forceRejectMutation = useForceRejectRequest()
  const bulkApproveMutation = useBulkApprove()
  const cancelMutation = useCancelRequest()

  const isActionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    forceApproveMutation.isPending ||
    forceRejectMutation.isPending

  // 인라인 승인/거절 (성공 여부 반환 — 모달은 성공 시에만 닫음)
  async function inlineApprove(id: string): Promise<boolean> {
    try {
      await approveMutation.mutateAsync({ id })
      toast('요청을 승인했습니다')
      return true
    } catch {
      toast('승인에 실패했습니다')
      return false
    }
  }
  async function inlineReject(id: string): Promise<boolean> {
    try {
      await rejectMutation.mutateAsync({ id })
      toast('요청을 거절했습니다')
      return true
    } catch {
      toast('거절에 실패했습니다')
      return false
    }
  }

  // 모달 액션
  async function handleForceApprove() {
    if (!detail) return
    try {
      await forceApproveMutation.mutateAsync({ id: detail.id, comment: comment || undefined })
      setDetail(null)
      toast('강제 승인했습니다')
    } catch {
      toast('강제 승인에 실패했습니다')
    }
  }
  async function handleForceReject() {
    if (!detail) return
    try {
      await forceRejectMutation.mutateAsync({ id: detail.id, comment: comment || undefined })
      setDetail(null)
      toast('강제 거절했습니다')
    } catch {
      toast('강제 거절에 실패했습니다')
    }
  }
  async function handleCancel() {
    if (!detail) return
    try {
      await cancelMutation.mutateAsync(detail.id)
      setDetail(null)
      toast('요청을 회수했습니다')
    } catch {
      toast('회수에 실패했습니다')
    }
  }
  async function handleBulkApprove() {
    if (selected.length === 0) return
    try {
      await bulkApproveMutation.mutateAsync(selected)
      setSelected([])
      toast(`${selected.length}건을 일괄 승인했습니다`)
    } catch {
      toast('일괄 승인에 실패했습니다')
    }
  }

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length

  return (
    <div style={{ minWidth: 0 }}>
      {/* 상태 탭 */}
      <div className="tabs">
        {STATUS_TABS.map((t) => (
          <button
            key={t}
            className={'tab' + (statusTab === t ? ' on' : '')}
            onClick={() => {
              setStatusTab(t)
              setSelected([])
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 필터 칩 + 요약 */}
      <div className="fbar" style={{ marginTop: 16 }}>
        <button
          className="fchip"
          onClick={() => setShowAll((v) => !v)}
          style={showAll ? { borderColor: 'var(--ab-orange)', color: 'var(--ab-orange)' } : undefined}
        >
          {HRI.people({ className: 'ic' })} 모든 직원 요청
        </button>
        <button
          className="fchip"
          onClick={() => setMyTurn((v) => !v)}
          style={myTurn ? { borderColor: 'var(--ab-orange)', color: 'var(--ab-orange)' } : undefined}
        >
          {HRI.check({ className: 'ic' })} 내 승인 차례
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--fg-3)' }}>
          처리 대기{' '}
          <b style={{ color: 'var(--ab-orange)', fontFamily: 'var(--font-display)' }}>{pendingCount}</b>건 · 총{' '}
          {requests.length}건
        </span>
      </div>

      {/* 일괄 승인 바 */}
      {selected.length > 0 && (
        <div className="tbl-bar">
          <span className="tbl-count">
            <b>{selected.length}</b>건 선택됨
          </span>
          <div className="tbl-tools" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" disabled={bulkApproveMutation.isPending} onClick={handleBulkApprove}>
              일괄 승인
            </button>
            <button className="btn btn-dark btn-sm" onClick={() => setSelected([])}>
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
        <div className="tbl-scroll wide">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    className="ck"
                    checked={allPendingSelected}
                    onChange={toggleSelectAll}
                    disabled={pendingRequests.length === 0}
                  />
                </th>
                <th style={{ width: 130 }}>요청 종류</th>
                <th style={{ width: 190 }}>요청자</th>
                <th>대상</th>
                <th style={{ width: 170 }}>요청 사유</th>
                <th style={{ width: 150 }} className="c">상태</th>
                <th style={{ width: 110 }}>신청일자</th>
                <th style={{ width: 150 }} className="c">관리</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 ? (
                <tr>
                  <td className="tbl-empty" colSpan={8}>
                    요청 내역이 없습니다
                  </td>
                </tr>
              ) : (
                requests.map((r) => {
                  const t = targetCell(r)
                  const isPending = r.status === 'PENDING'
                  return (
                    <tr
                      key={r.id}
                      role="button"
                      tabIndex={0}
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setDetail(r); setComment('') }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setDetail(r)
                          setComment('')
                        }
                      }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        {isPending && (
                          <input
                            type="checkbox"
                            className="ck"
                            checked={selected.includes(r.id)}
                            onChange={() => toggleSelect(r.id)}
                          />
                        )}
                      </td>
                      <td className="lead">{TYPE_LABEL[r.type] ?? r.type}</td>
                      <td>
                        <Emp name={r.requester?.name ?? '—'} />
                      </td>
                      <td>
                        {t.plain ? (
                          <span style={{ fontSize: 13, color: '#fff' }}>{t.plain}</span>
                        ) : (
                          <span style={{ fontSize: 13 }}>
                            {t.label}
                            <div className="cell-sub">
                              <span className="cell-strike">{t.from ?? '—'}</span>{' '}
                              <span className="cell-arrow">→</span>{' '}
                              <span style={{ color: '#fff' }}>{t.to ?? '—'}</span>
                            </div>
                          </span>
                        )}
                      </td>
                      <td className="muted" style={{ fontSize: 12 }}>
                        {reasonOf(r)}
                      </td>
                      <td className="c">
                        <Badge kind={STATUS_BADGE[r.status] ?? 'b-submit'}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        <div className="cell-sub">{approverProgress(r.approvals)}</div>
                      </td>
                      <td className="muted">{new Date(r.createdAt).toLocaleDateString('ko-KR')}</td>
                      <td className="c" onClick={(e) => e.stopPropagation()}>
                        {isPending ? (
                          <span className="req-act">
                            <button
                              className="btn-approve"
                              disabled={isActionPending}
                              onClick={() => inlineApprove(r.id)}
                            >
                              승인
                            </button>
                            <button
                              className="btn-reject"
                              disabled={isActionPending}
                              onClick={() => inlineReject(r.id)}
                            >
                              거절
                            </button>
                          </span>
                        ) : (
                          <span className="zero">처리됨</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 상세 모달 */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        eyebrow="Request Detail"
        title="요청 상세"
        maxWidth={620}
        footer={
          detail && (
            <>
              <button className="btn btn-line" style={{ marginRight: 'auto' }} onClick={() => setDetail(null)}>
                닫기
              </button>
              {detail.status === 'PENDING' && (
                <>
                  <button className="btn btn-line" disabled={isActionPending} onClick={handleCancel}>
                    회수
                  </button>
                  <button
                    className="btn btn-reject"
                    disabled={isActionPending}
                    onClick={async () => {
                      const ok = await inlineReject(detail.id)
                      if (ok) setDetail(null)
                    }}
                  >
                    거절
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={isActionPending}
                    onClick={async () => {
                      const ok = await inlineApprove(detail.id)
                      if (ok) setDetail(null)
                    }}
                  >
                    승인
                  </button>
                  {isSuperAdmin && (
                    <>
                      <button className="btn btn-dark" disabled={isActionPending} onClick={handleForceReject}>
                        강제 거절
                      </button>
                      <button className="btn btn-dark" disabled={isActionPending} onClick={handleForceApprove}>
                        강제 승인
                      </button>
                    </>
                  )}
                </>
              )}
            </>
          )
        }
      >
        {detail && (
          <>
            <div className="doc-section">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 24px' }}>
                <div className="doc-field" style={{ borderBottom: 'none' }}>
                  <span className="fk">요청자</span>
                  <span className="fv">{detail.requester?.name ?? '—'}</span>
                </div>
                <div className="doc-field" style={{ borderBottom: 'none' }}>
                  <span className="fk">유형</span>
                  <span className="fv">{TYPE_LABEL[detail.type] ?? detail.type}</span>
                </div>
                <div className="doc-field" style={{ borderBottom: 'none' }}>
                  <span className="fk">신청일시</span>
                  <span className="fv">{new Date(detail.createdAt).toLocaleString('ko-KR')}</span>
                </div>
              </div>
            </div>
            <div className="doc-section">
              <div className="doc-sec-head">
                <span className="dot" />
                <span className="t">요청 내용</span>
                <span className="en">Payload</span>
              </div>
              <pre
                className="ta"
                style={{ minHeight: 'auto', maxHeight: 220, overflow: 'auto', fontFamily: 'var(--font-display)', fontSize: 12 }}
              >
                {JSON.stringify(detail.payload, null, 2)}
              </pre>
              {detail.status === 'PENDING' && (
                <input
                  className="inp-block"
                  style={{ marginTop: 14 }}
                  placeholder="승인/거절 의견 (선택)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
