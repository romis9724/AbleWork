'use client'
import { useMemo } from 'react'
import { useAttendances, type Attendance } from '@/lib/query/attendances'
import { useAuthStore } from '@/stores/auth.store'
import { PageHead, TableBar } from '@/components/ab/Page'
import { Badge, TableEmpty, type BadgeKind } from '@/components/ab/atoms'

const STATUS: Record<string, { label: string; kind: BadgeKind }> = {
  normal: { label: '정상', kind: 'b-done' },
  late: { label: '지각', kind: 'b-wait' },
  early_leave: { label: '조퇴', kind: 'b-wait' },
  absent: { label: '결근', kind: 'b-reject' },
  oncall: { label: '무일정', kind: 'b-prog' },
  deemed_work: { label: '간주근무', kind: 'b-prog' },
  remote: { label: '재택', kind: 'b-prog' },
}

function monthRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = now.toISOString().slice(0, 10)
  return { start, end }
}

function timeLabel(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

function durationLabel(inIso?: string | null, outIso?: string | null): string {
  if (!inIso || !outIso) return '—'
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime()
  if (ms <= 0) return '—'
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}시간 ${String(m).padStart(2, '0')}분`
}

function unwrap(raw: unknown): Attendance[] {
  if (Array.isArray(raw)) return raw as Attendance[]
  return ((raw as { items?: Attendance[] })?.items ?? []) as Attendance[]
}

export default function MyAttendancesPage() {
  const { start, end } = useMemo(monthRange, [])
  const employeeId = useAuthStore((s) => s.user?.employeeId)
  // 본인 기록만 조회 — 관리자가 직원 모드로 봐도 본인 출퇴근만 노출(서버도 EMPLOYEE는 강제 스코핑)
  const { data, isLoading } = useAttendances({ startDate: start, endDate: end, employeeId })
  const records = unwrap(data)

  return (
    <>
      <PageHead eyebrow="Attendance" title="내 출퇴근 기록" right={<span className="page-stamp">이번 달</span>} />

      <TableBar count={<>총 <b>{records.length}</b>건</>} />

      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th>날짜</th>
              <th className="c">출근</th>
              <th className="c">퇴근</th>
              <th className="c">근무시간</th>
              <th className="c">상태</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableEmpty colSpan={5} message="불러오는 중…" />
            ) : records.length === 0 ? (
              <TableEmpty colSpan={5} message="이번 달 출퇴근 기록이 없습니다" />
            ) : (
              records.map((r) => {
                const st = STATUS[r.status] ?? { label: r.status, kind: 'b-submit' as BadgeKind }
                return (
                  <tr key={r.id}>
                    <td className="lead">{dateLabel(r.clockInAt)}</td>
                    <td className="c">
                      <span className="att-time">{timeLabel(r.clockInAt)}</span>
                    </td>
                    <td className="c">
                      <span className={'att-time' + (r.clockOutAt ? '' : ' miss')}>{timeLabel(r.clockOutAt)}</span>
                    </td>
                    <td className="c">
                      <span className="att-dur">{durationLabel(r.clockInAt, r.clockOutAt)}</span>
                    </td>
                    <td className="c">
                      <Badge kind={st.kind}>{st.label}</Badge>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
