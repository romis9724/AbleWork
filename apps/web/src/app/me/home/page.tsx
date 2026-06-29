'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  useClockOut,
  useMyTodayAttendance,
} from '@/lib/query/attendances'
import { useLeaveBalance } from '@/lib/query/leaves'
import { useRequests, type Request } from '@/lib/query/requests'
import { useDocuments } from '@/lib/query/documents'
import { useAuthStore } from '@/stores/auth.store'
import { currentEmployeeId } from '@/lib/auth-session'
import { PageHead, KpiGrid, Kpi, CardBox } from '@/components/ab/Page'
import { Badge, type BadgeKind } from '@/components/ab/atoms'
import { HRI } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'
import { ClockInModal } from '@/components/attendance/ClockInModal'
import { NewRequestModal } from '@/app/me/requests/NewRequestModal'

const REQUEST_TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  LEAVE_MODIFY: '휴가 수정',
  LEAVE_DELETE: '휴가 취소',
  SHIFT_CREATE: '근무일정 신청',
  SHIFT_MODIFY: '근무일정 수정',
  SHIFT_DELETE: '근무일정 삭제',
  ATTENDANCE_EDIT: '출퇴근 정정',
  ATTENDANCE_CREATE: '기록 생성',
  ATTENDANCE_DELETE: '기록 삭제',
  DEVICE_CHANGE: '기기 변경',
  OFFSITE_WORK: '외근/출장',
  CUSTOM: '기타 요청',
}

const REQ_STATUS: Record<string, { label: string; kind: BadgeKind }> = {
  PENDING: { label: '대기중', kind: 'b-wait' },
  APPROVED: { label: '승인', kind: 'b-done' },
  REJECTED: { label: '거절', kind: 'b-reject' },
  CANCELLED: { label: '취소', kind: 'b-submit' },
}

function timeLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function unwrap<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  return ((raw as { items?: T[] })?.items ?? []) as T[]
}

export default function HomePage() {
  const toast = useToast()
  const router = useRouter()
  // 본인 식별은 쿠키 토큰의 employeeId 우선(스토어-토큰 desync 방지)
  const storeEmployeeId = useAuthStore((s) => s.user?.employeeId) ?? ''
  const employeeId = currentEmployeeId(storeEmployeeId)

  // 서버 상태 기반 출근/휴게 판정 — 새로고침해도 상태가 유지된다
  const { data: today, isLoading: isTodayLoading } = useMyTodayAttendance()
  const attendance = today?.attendance ?? null
  const clockedIn = !!attendance && !attendance.clockOutAt
  const clockedOut = !!attendance?.clockOutAt
  const onBreak = !!today?.openBreak

  const [clockInOpen, setClockInOpen] = useState(false)
  const [reqOpen, setReqOpen] = useState(false)
  const clockOutMutation = useClockOut()

  const { data: balances = [] } = useLeaveBalance(employeeId)
  // 연차 잔액 = 연차휴가 그룹(대표 유형 '연차전일'). 유형명이 '연차'로 시작하는 잔액으로 식별.
  const annual =
    balances.find((b) => {
      const n = b.leaveType?.name ?? b.leaveType?.displayName ?? ''
      return n.startsWith('연차') || b.leaveType?.code === 'ANNUAL'
    }) ?? null

  const { data: reqRaw } = useRequests()
  const reqItems = unwrap<Request>(reqRaw)
  const recentReqs = reqItems.slice(0, 5)

  // 결재 대기 문서 = 전자결재에서 내가 결재할 차례인 문서(HR 요청 건수와 무관)
  const { data: pendingDocs } = useDocuments('pending_approval', { limit: 1 })
  const approvalPendingCount = pendingDocs?.total ?? 0

  const busy = isTodayLoading || clockOutMutation.isPending

  const withGeolocation = async (): Promise<{ lat: number; lng: number } | null> => {
    if (!navigator.geolocation) {
      toast('위치 서비스를 사용할 수 없습니다')
      return null
    }
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 }),
      )
      return { lat: position.coords.latitude, lng: position.coords.longitude }
    } catch {
      toast('위치 정보를 가져오지 못했습니다')
      return null
    }
  }

  const handleClockOut = async () => {
    const coords = await withGeolocation()
    if (!coords) return
    try {
      await clockOutMutation.mutateAsync({ ...coords, method: 'gps' })
      toast('퇴근 기록이 완료됐습니다')
    } catch (err) {
      toast(err instanceof Error ? err.message : '퇴근 처리 중 오류가 발생했습니다')
    }
  }

  const dateLabel = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  const workState = clockedOut ? '퇴근 완료' : onBreak ? '휴게 중' : clockedIn ? '근무 중' : '출근 전'

  return (
    <>
      <PageHead eyebrow="Home" title="홈" right={<span className="page-stamp">{dateLabel}</span>} />

      {/* 오늘 출퇴근 상태 카드 */}
      <div className="me-clock">
        <div className="me-clock-head">
          <span className="me-clock-ic">{HRI.clock()}</span>
          <div className="grow">
            <div className="me-clock-state">{workState}</div>
            <div className="me-clock-times">
              출근 <b className="tek">{timeLabel(attendance?.clockInAt)}</b>
              <span className="sep">·</span>
              퇴근 <b className="tek">{timeLabel(attendance?.clockOutAt)}</b>
            </div>
          </div>
        </div>

        <div className="me-clock-actions">
          {!clockedIn && !clockedOut && (
            <button data-testid="me-clock-in-btn" className="btn btn-primary btn-lg" disabled={busy} onClick={() => setClockInOpen(true)}>
              출근하기
            </button>
          )}

          {clockedIn && (
            <button data-testid="me-clock-out-btn" className="btn btn-primary btn-lg" disabled={busy} onClick={handleClockOut}>
              {clockOutMutation.isPending ? '처리 중…' : '퇴근하기'}
            </button>
          )}

          {clockedOut && <div className="me-clock-done">오늘 근무가 마감됐습니다</div>}

          {/* 요청 — 홈에서 바로 새 요청(요청 유형 선택) 팝업 */}
          <button data-testid="me-request-btn" className="btn btn-line btn-lg" onClick={() => setReqOpen(true)}>
            요청
          </button>
        </div>
      </div>

      {/* 연차 현황 KPI — 관리자모드 '휴가'와 동일(전체/사용/잔여 연차). 1행 3열 고정 */}
      <KpiGrid cols={3}>
        <Kpi label="전체 연차" value={annual ? annual.accruedDays : 0} unit="일" desc="발생(부여)" />
        <Kpi label="사용 연차" value={annual ? annual.usedDays : 0} unit="일" desc="사용" />
        <Kpi label="잔여 연차" value={annual ? annual.remainingDays : 0} unit="일" accent desc="잔여" />
      </KpiGrid>

      {/* 최근 요청 + 결재 대기 문서 — 1행 2열 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, alignItems: 'start' }}>
        <CardBox title="최근 요청" more="요청 내역 →" onMore={() => router.push('/me/requests')}>
          <div className="mini">
            {recentReqs.length === 0 ? (
              <div className="mini-row" style={{ justifyContent: 'center', color: 'var(--fg-4)', fontSize: 12 }}>
                요청 내역이 없습니다
              </div>
            ) : (
              recentReqs.map((req) => {
                const st = REQ_STATUS[req.status] ?? { label: req.status, kind: 'b-submit' as BadgeKind }
                return (
                  <div className="mini-row" key={req.id}>
                    <div className="grow">
                      <div className="l1">{REQUEST_TYPE_LABEL[req.type] ?? req.type}</div>
                      <div className="l2">{new Date(req.createdAt).toLocaleDateString('ko-KR')}</div>
                    </div>
                    <Badge kind={st.kind}>{st.label}</Badge>
                  </div>
                )
              })
            )}
          </div>
        </CardBox>

        {/* 결재 대기 문서 — 전자결재(내 결재 차례) 문서만 (HR 요청 제외) */}
        <CardBox title="결재 대기 문서" more="문서함 →" onMore={() => router.push('/me/documents')}>
          <div className="mini">
            <div className="mini-row">
              <div className="grow">
                <div className="l1">내 결재 차례</div>
                <div className="l2">전자결재 대기 문서</div>
              </div>
              <span className="rt">{approvalPendingCount}건</span>
            </div>
          </div>
        </CardBox>
      </div>

      <ClockInModal
        open={clockInOpen}
        employeeId={employeeId}
        onClose={() => setClockInOpen(false)}
      />

      <NewRequestModal
        open={reqOpen}
        employeeId={employeeId}
        onClose={() => setReqOpen(false)}
      />
    </>
  )
}
