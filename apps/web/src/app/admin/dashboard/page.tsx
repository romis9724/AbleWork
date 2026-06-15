'use client'
import { useRouter } from 'next/navigation'
import { useNowAtWork, useAttendances, type Attendance, type NowAtWork } from '@/lib/query/attendances'
import { useRequests, useApproveRequest, useRejectRequest, type Request } from '@/lib/query/requests'
import { PageHead, KpiGrid, Kpi, CardBox } from '@/components/ab/Page'
import { Avatar } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'
import { useToast } from '@/components/ab/Toast'

const REQUEST_TYPE_LABEL: Record<string, string> = {
  LEAVE_CREATE: '휴가 신청',
  SHIFT_CREATE: '근무일정 추가',
  ATTENDANCE_EDIT: '출퇴근 정정',
  DEVICE_CHANGE: '기기 변경',
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function timeLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function unwrap<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[]
  return ((raw as { items?: T[] })?.items ?? []) as T[]
}

export default function DashboardPage() {
  const toast = useToast()
  const router = useRouter()
  const todayStr = today()

  const { data: nowRaw } = useNowAtWork()
  const nowItems: NowAtWork[] = nowRaw?.items ?? []
  const nowCount = nowRaw?.total ?? nowItems.length

  const { data: attRaw } = useAttendances({ startDate: todayStr, endDate: todayStr })
  const attItems = unwrap<Attendance>(attRaw)
  const clockInCount = attItems.length
  const lateCount = attItems.filter((a) => a.status === 'late').length
  const absentCount = attItems.filter((a) => a.status === 'absent').length

  const { data: reqRaw } = useRequests({ status: 'PENDING' })
  const reqItems = unwrap<Request>(reqRaw)
  const pendingCount = reqItems.length

  const approve = useApproveRequest()
  const reject = useRejectRequest()

  const handleApprove = (id: string) => {
    approve.mutate({ id }, { onSuccess: () => toast('요청을 승인했습니다') })
  }
  const handleReject = (id: string) => {
    reject.mutate({ id }, { onSuccess: () => toast('요청을 거절했습니다') })
  }

  return (
    <>
      <PageHead
        eyebrow="Dashboard"
        title="홈"
        right={
          <span className="page-stamp">
            {new Date().toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })} 기준
            <span className="rf" onClick={() => toast('현황을 새로고침했습니다')}>{I.refresh()}</span>
          </span>
        }
      />

      <KpiGrid>
        <Kpi label="금일 출근" value={clockInCount} unit="명" accent desc={`근무중 ${nowCount}명 포함`} />
        <Kpi label="지각" value={lateCount} unit="명" desc="금일 기준" />
        <Kpi label="결근" value={absentCount} unit="명" desc="금일 기준" />
        <Kpi
          label="미처리 요청"
          value={pendingCount}
          unit="건"
          desc={pendingCount > 0 ? <span className="tag up">처리 필요</span> : '없음'}
        />
      </KpiGrid>

      <div className="dash-grid">
        <CardBox title="실시간 근무 현황" more="출퇴근기록 →" onMore={() => router.push('/admin/attendances')}>
          <div className="mini">
            {nowItems.length === 0 ? (
              <div className="mini-row" style={{ justifyContent: 'center', color: 'var(--fg-4)', fontSize: 12 }}>
                현재 근무 중인 직원이 없습니다
              </div>
            ) : (
              nowItems.slice(0, 8).map((r) => (
                <div className="mini-row" key={r.attendanceId}>
                  <Avatar name={r.employeeName} on={r.workingStatus === 'working'} />
                  <div className="grow">
                    <div className="l1">{r.employeeName}</div>
                    <div className="l2">{r.organization?.name ?? '—'}</div>
                  </div>
                  <span className="rt" style={r.status === 'late' ? { color: 'var(--warn)' } : undefined}>
                    {timeLabel(r.clockInAt)} 출근{r.status === 'late' ? ' · 지각' : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardBox>

        <CardBox title="처리 대기 요청" more="요청 내역 →" onMore={() => router.push('/admin/requests')}>
          <div className="mini">
            {reqItems.length === 0 ? (
              <div className="mini-row" style={{ justifyContent: 'center', color: 'var(--fg-4)', fontSize: 12 }}>
                대기 중인 요청이 없습니다
              </div>
            ) : (
              reqItems.slice(0, 5).map((req) => (
                <div className="mini-row" key={req.id}>
                  <div className="grow">
                    <div className="l1">{REQUEST_TYPE_LABEL[req.type] ?? req.type}</div>
                    <div className="l2">{req.requester?.name ?? '—'}</div>
                  </div>
                  <span className="req-act">
                    <button className="btn-approve" disabled={approve.isPending} onClick={() => handleApprove(req.id)}>
                      승인
                    </button>
                    <button className="btn-reject" disabled={reject.isPending} onClick={() => handleReject(req.id)}>
                      거절
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </CardBox>
      </div>
    </>
  )
}
