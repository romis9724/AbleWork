'use client'
import { useState } from 'react'
import { useLeaveBalance } from '@/lib/query/leaves'
import { useAuthStore } from '@/stores/auth.store'
import { currentEmployeeId } from '@/lib/auth-session'
import { PageHead } from '@/components/ab/Page'
import { LeaveFormModal } from '@/components/leave/LeaveFormModal'
import { I } from '@/components/ab/icons'

function gaugePercent(used: number, accrued: number): number {
  if (accrued <= 0) return 0
  return Math.min(100, Math.round((used / accrued) * 100))
}

export default function MyLeavesPage() {
  const user = useAuthStore((s) => s.user)
  const [dialogOpen, setDialogOpen] = useState(false)

  // 본인 잔액은 쿠키 토큰의 employeeId로 조회한다(스토어-토큰 desync 방지)
  const { data: balances = [], isLoading } = useLeaveBalance(currentEmployeeId(user?.employeeId))

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

      <LeaveFormModal
        open={dialogOpen}
        mode="create"
        employeeId={user?.employeeId ?? ''}
        onClose={() => setDialogOpen(false)}
      />
    </>
  )
}
