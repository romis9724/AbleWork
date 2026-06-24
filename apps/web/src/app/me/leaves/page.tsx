'use client'
import { useState } from 'react'
import { useLeaveBalance, useLeaveTypes } from '@/lib/query/leaves'
import { useCreateRequest } from '@/lib/query/requests'
import { useAuthStore } from '@/stores/auth.store'
import { PageHead } from '@/components/ab/Page'
import { Modal } from '@/components/ab/Modal'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'

function gaugePercent(used: number, accrued: number): number {
  if (accrued <= 0) return 0
  return Math.min(100, Math.round((used / accrued) * 100))
}

export default function MyLeavesPage() {
  const user = useAuthStore((s) => s.user)
  const toast = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [leaveTypeId, setLeaveTypeId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')

  const { data: balances = [], isLoading } = useLeaveBalance(user?.employeeId ?? '')
  const { data: leaveTypes = [] } = useLeaveTypes()
  const createRequest = useCreateRequest()

  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId)
  const canSubmit = !!leaveTypeId && !!startDate && !!endDate && !createRequest.isPending

  const resetDialog = () => {
    setDialogOpen(false)
    setLeaveTypeId('')
    setStartDate('')
    setEndDate('')
    setReason('')
  }

  const handleSubmit = async () => {
    if (!leaveTypeId || !startDate || !endDate) {
      toast('필수 항목을 모두 입력해 주세요')
      return
    }
    try {
      await createRequest.mutateAsync({
        type: 'LEAVE_CREATE',
        payload: { leaveTypeId, startDate, endDate, reason },
      })
      toast('휴가 신청이 완료됐습니다')
      resetDialog()
    } catch (err) {
      toast(err instanceof Error ? err.message : '신청 중 오류가 발생했습니다')
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Leave"
        title="내 휴가"
        right={
          <button data-testid="me-leave-request-btn" className="btn btn-primary btn-sm" onClick={() => setDialogOpen(true)}>
            {I.plus()} 휴가 신청
          </button>
        }
      />

      {isLoading ? (
        <div className="ab-loading"><span className="ab-spin" />불러오는 중…</div>
      ) : balances.length === 0 ? (
        <div className="note"><div className="note-t">휴가 정보 없음</div>휴가 잔여 정보가 없습니다.</div>
      ) : (
        <div className="me-leave-list">
          {balances.map((b) => {
            const pct = gaugePercent(b.usedDays, b.accruedDays)
            return (
              <div className="me-leave-card" key={b.id}>
                <div className="me-leave-top">
                  <span className="me-leave-name">{b.leaveType?.displayName ?? b.leaveType?.name ?? '휴가'}</span>
                  <span className="me-leave-year tek">{b.year}</span>
                </div>
                <div className="bal">
                  <div className="bal-track">
                    <div className="bal-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="bal-num">
                    <b>{b.remainingDays}</b>/{b.accruedDays}일
                  </span>
                </div>
                <div className="me-leave-sub">
                  발생 <b className="tek">{b.accruedDays}</b>일 · 사용 <b className="tek">{b.usedDays}</b>일
                  {b.expiresAt && <> · 만료 {new Date(b.expiresAt).toLocaleDateString('ko-KR')}</>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal
        open={dialogOpen}
        onClose={resetDialog}
        eyebrow="Leave Request"
        title="휴가 신청"
        maxWidth={460}
        footer={
          <>
            <button className="btn btn-ghost" onClick={resetDialog}>취소</button>
            <button data-testid="me-leave-submit-btn" className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
              {createRequest.isPending ? '신청 중…' : '신청'}
            </button>
          </>
        }
      >
        <div className="fld">
          <label>휴가 유형</label>
          <select className="sel" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
            <option value="">선택</option>
            {leaveTypes.filter((lt) => lt.isActive).map((lt) => (
              <option key={lt.id} value={lt.id}>{lt.displayName ?? lt.name}</option>
            ))}
          </select>
        </div>

        {selectedBalance && (
          <div className="note" style={{ marginBottom: 18 }}>
            잔여 일수: <b className="tek" style={{ color: 'var(--ab-orange)' }}>{selectedBalance.remainingDays}일</b>
          </div>
        )}

        <div className="fld">
          <label>시작일</label>
          <input className="inp-block" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="fld">
          <label>종료일</label>
          <input className="inp-block" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="fld" style={{ alignItems: 'start' }}>
          <label>사유</label>
          <textarea
            className="ta"
            style={{ minHeight: 90 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="사유를 입력하세요 (선택)"
          />
        </div>
      </Modal>
    </>
  )
}
