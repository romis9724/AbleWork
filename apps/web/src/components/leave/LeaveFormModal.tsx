'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ab/Modal'
import { useToast } from '@/components/ab/Toast'
import { currentEmployeeId } from '@/lib/auth-session'
import { getApiErrorMessage } from '@/lib/api-error'
import { useLeaveTypes, useLeaves, useLeaveBalance, type Leave } from '@/lib/query/leaves'
import { useCreateRequest } from '@/lib/query/requests'

interface LeaveFormModalProps {
  open: boolean
  mode: 'create' | 'modify'
  /** 로그인 직원 ID(폴백) — 실제로는 쿠키 토큰 employeeId를 우선 사용 */
  employeeId: string
  onClose: () => void
  onSuccess?: () => void
}

// @db.Time 직렬화 값('1970-01-01T09:00:00.000Z') → 'HH:MM'
const timeHHMM = (iso?: string | null): string => (iso ? iso.slice(11, 16) : '')

const leaveOptionLabel = (l: Leave): string => {
  const name = l.leaveType?.displayName ?? l.leaveType?.name ?? '휴가'
  return `${name} · ${l.startDate.slice(0, 10)} ~ ${l.endDate.slice(0, 10)}`
}

// 'HH:MM' 두 값의 시간 차(시간). 음수/오류 0.
const hoursBetween = (s: string, e: string): number => {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  return (eh * 60 + em - (sh * 60 + sm)) / 60
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--fg-3)', fontWeight: 500, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

/**
 * 휴가 신청/수정 공용 모달 — me/leaves·me/requests 양쪽에서 동일하게 사용.
 * 모바일 안전한 스택 레이아웃(라벨 위, 입력 100% 폭). 시간 단위 유형은 당일+시작/종료 시간.
 */
export function LeaveFormModal({ open, mode, employeeId, onClose, onSuccess }: LeaveFormModalProps) {
  const toast = useToast()
  const eid = currentEmployeeId(employeeId)
  const { data: leaveTypes = [] } = useLeaveTypes()
  const { data: balances = [] } = useLeaveBalance(eid)
  const { data: leaveList } = useLeaves({ employeeId: eid, limit: 50 })
  const createRequest = useCreateRequest()

  const approvedLeaves = (leaveList?.items ?? []).filter((l) => l.status === 'APPROVED')

  const [leaveId, setLeaveId] = useState('')
  const [leaveGroupId, setLeaveGroupId] = useState('')
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) {
      setLeaveId('')
      setLeaveGroupId('')
      setLeaveTypeId('')
      setStartDate('')
      setEndDate('')
      setStartTime('')
      setEndTime('')
      setReason('')
    }
  }, [open])

  // 휴가 유형 선택 2단계 — 1) 휴가 그룹 2) 그 그룹의 휴가 유형
  const activeTypes = leaveTypes.filter((lt) => lt.isActive)
  const groups = Array.from(
    new Map(activeTypes.filter((t) => t.group).map((t) => [t.group!.id, t.group!])).values(),
  )
  const typesInGroup = activeTypes.filter((t) => t.group?.id === leaveGroupId)

  const selectedLeave = approvedLeaves.find((l) => l.id === leaveId)
  const createType = leaveTypes.find((lt) => lt.id === leaveTypeId)
  const isHourly =
    mode === 'create'
      ? createType?.timeOption === 'hourly'
      : selectedLeave?.leaveType?.timeOption === 'hourly'
  const paidHours = mode === 'create' ? createType?.paidHours ?? null : null
  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId)

  const hours = isHourly ? hoursBetween(startTime, endTime) : 0
  const overLimit = isHourly && paidHours != null && hours > Number(paidHours)

  const handleSelectLeave = (id: string) => {
    setLeaveId(id)
    const l = approvedLeaves.find((x) => x.id === id)
    if (l) {
      setStartDate(l.startDate.slice(0, 10))
      setEndDate(l.endDate.slice(0, 10))
      setStartTime(timeHHMM(l.startTime))
      setEndTime(timeHHMM(l.endTime))
    }
  }

  const handleStartDate = (v: string) => {
    setStartDate(v)
    if (!endDate || endDate < v) setEndDate(v)
  }

  const baseReady =
    mode === 'create' ? !!leaveTypeId && !!startDate : !!leaveId && !!startDate
  const timeReady = isHourly
    ? !!startTime && !!endTime && endTime > startTime && !overLimit
    : !!endDate && endDate >= startDate
  const canSubmit = baseReady && timeReady && !createRequest.isPending

  const handleSubmit = async () => {
    if (!baseReady) {
      toast('필수 항목을 입력해 주세요')
      return
    }
    if (isHourly) {
      if (!startTime || !endTime) return toast('시작/종료 시간을 입력해 주세요')
      if (endTime <= startTime) return toast('종료 시간은 시작 시간보다 늦어야 합니다')
      if (overLimit) return toast(`신청 시간(${hours}시간)이 설정 시간(${paidHours}시간)을 초과할 수 없습니다`)
    } else if (endDate < startDate) {
      return toast('종료일은 시작일과 같거나 이후여야 합니다')
    }

    // 시간 단위 휴가는 당일만(시작일=종료일)
    const datePart = isHourly
      ? { startDate, endDate: startDate, startTime, endTime }
      : { startDate, endDate }

    try {
      if (mode === 'create') {
        await createRequest.mutateAsync({ type: 'LEAVE_CREATE', payload: { leaveTypeId, ...datePart, reason } })
        toast('휴가 신청이 완료됐습니다')
      } else {
        await createRequest.mutateAsync({ type: 'LEAVE_MODIFY', payload: { leaveId, ...datePart, ...(reason && { reason }) } })
        toast('휴가 수정 요청이 완료됐습니다')
      }
      onClose()
      onSuccess?.()
    } catch (err) {
      toast(getApiErrorMessage(err, '요청 중 오류가 발생했습니다'))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={mode === 'create' ? 'Leave Request' : 'Leave Modify'}
      title={mode === 'create' ? '휴가 신청' : '휴가 수정 요청'}
      maxWidth={520}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>취소</button>
          <button data-testid="me-leave-submit-btn" className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
            {createRequest.isPending ? '처리 중…' : '신청'}
          </button>
        </>
      }
    >
      <div style={{ padding: '20px 24px' }}>
        {mode === 'modify' ? (
          <Field label="대상 휴가">
            <select className="sel" value={leaveId} onChange={(e) => handleSelectLeave(e.target.value)}>
              <option value="">선택</option>
              {approvedLeaves.map((l) => (
                <option key={l.id} value={l.id}>{leaveOptionLabel(l)}</option>
              ))}
            </select>
            {approvedLeaves.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--fg-5)', marginTop: 6 }}>수정 가능한 승인된 휴가가 없습니다.</div>
            )}
          </Field>
        ) : (
          <>
            <Field label="휴가 그룹">
              <select
                className="sel"
                value={leaveGroupId}
                onChange={(e) => {
                  setLeaveGroupId(e.target.value)
                  setLeaveTypeId('') // 그룹 변경 시 유형 초기화
                }}
              >
                <option value="">선택</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </Field>
            <Field label="휴가 유형">
              <select
                className="sel"
                value={leaveTypeId}
                disabled={!leaveGroupId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
              >
                <option value="">{leaveGroupId ? '선택' : '휴가 그룹을 먼저 선택하세요'}</option>
                {typesInGroup.map((lt) => (
                  <option key={lt.id} value={lt.id}>{lt.displayName ?? lt.name}</option>
                ))}
              </select>
            </Field>
          </>
        )}

        {mode === 'create' && selectedBalance && (
          <div className="note" style={{ marginBottom: 16 }}>
            잔여 일수: <b className="tek" style={{ color: 'var(--ab-orange)' }}>{selectedBalance.remainingDays}일</b>
          </div>
        )}

        <Field label={isHourly ? '날짜' : '시작일'}>
          <input className="inp-block" type="date" value={startDate} onChange={(e) => handleStartDate(e.target.value)} />
        </Field>

        {isHourly ? (
          <>
            <Field label="시작 시간">
              <input className="inp-block" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="종료 시간">
              <input className="inp-block" type="time" value={endTime} min={startTime || undefined} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
            <div className="note" style={{ marginBottom: 16 }}>
              시간 단위 휴가는 <b>당일</b>만 가능하며, <b>8시간=1일</b> 기준으로 차감됩니다.
              {paidHours != null && <> 최대 <b>{paidHours}시간</b>까지 신청할 수 있습니다.</>}
              {overLimit && (
                <div style={{ color: 'var(--danger, #e5484d)', marginTop: 6 }}>
                  신청 시간({hours}시간)이 설정 시간({paidHours}시간)을 초과했습니다.
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <Field label="종료일">
              <input className="inp-block" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <div className="note" style={{ marginBottom: 16 }}>
              차감 일수는 <b>영업일</b> 기준(주말·공휴일 제외)으로 계산됩니다.
            </div>
          </>
        )}

        <Field label="사유">
          <textarea
            className="ta"
            style={{ width: '100%', minHeight: 90 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="사유를 입력하세요 (선택)"
          />
        </Field>
      </div>
    </Modal>
  )
}
