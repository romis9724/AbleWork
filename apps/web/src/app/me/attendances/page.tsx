'use client'
import { useMemo, useState } from 'react'
import { useAttendances, type Attendance } from '@/lib/query/attendances'
import { useAuthStore } from '@/stores/auth.store'
import { PageHead, TableBar } from '@/components/ab/Page'
import { Badge, Seg, TableEmpty, type BadgeKind } from '@/components/ab/atoms'

const STATUS: Record<string, { label: string; kind: BadgeKind }> = {
  normal: { label: '정상', kind: 'b-done' },
  late: { label: '지각', kind: 'b-wait' },
  early_leave: { label: '조퇴', kind: 'b-wait' },
  absent: { label: '결근', kind: 'b-reject' },
  oncall: { label: '무일정', kind: 'b-prog' },
  deemed_work: { label: '간주근무', kind: 'b-prog' },
  remote: { label: '재택', kind: 'b-prog' },
}

type Tab = 'mine' | 'org'

const TABS: { value: Tab; label: string }[] = [
  { value: 'mine', label: '내 기록' },
  { value: 'org', label: '우리 조직' },
]

// 조직관리자 이상만 '우리 조직' 탭을 본다
const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'GENERAL_ADMIN', 'ORG_ADMIN'])

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

// 직원 소속/직무 한 줄 표기 (우리 조직 탭)
function employeeSub(e?: Attendance['employee']): string {
  const org = e?.organizations?.[0]?.organization?.name
  const pos = e?.positions?.[0]?.position?.name
  return [org, pos].filter(Boolean).join(' · ')
}

function unwrap(raw: unknown): Attendance[] {
  if (Array.isArray(raw)) return raw as Attendance[]
  return ((raw as { items?: Attendance[] })?.items ?? []) as Attendance[]
}

function StatusBadge({ status }: { status: string }) {
  const st = STATUS[status] ?? { label: status, kind: 'b-submit' as BadgeKind }
  return <Badge kind={st.kind}>{st.label}</Badge>
}

export default function MyAttendancesPage() {
  const { start, end } = useMemo(monthRange, [])
  const employeeId = useAuthStore((s) => s.user?.employeeId)
  const accessLevel = useAuthStore((s) => s.user?.accessLevel)
  const isManager = accessLevel ? MANAGER_ROLES.has(accessLevel) : false

  const [tab, setTab] = useState<Tab>('mine')
  // 권한이 없으면 항상 본인 기록만
  const activeTab: Tab = isManager ? tab : 'mine'

  // 활성 탭에 맞는 파라미터로 한 번만 조회. '우리 조직'은 scope=org(서버가 요청자 조직으로 스코프).
  const params =
    activeTab === 'org'
      ? { startDate: start, endDate: end, scope: 'org', limit: '100' }
      : { startDate: start, endDate: end, employeeId, limit: '100' }
  const { data, isLoading } = useAttendances(params)
  const records = unwrap(data)

  const isOrg = activeTab === 'org'

  return (
    <>
      <PageHead eyebrow="Attendance" title="출퇴근 기록" right={<span className="page-stamp">이번 달</span>} />

      {isManager && (
        <div style={{ marginBottom: 12 }}>
          <Seg<Tab> value={tab} onChange={setTab} options={TABS} />
        </div>
      )}

      <TableBar count={<>총 <b>{records.length}</b>건</>} />

      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              {isOrg && <th>직원</th>}
              <th>날짜</th>
              <th className="c">출근</th>
              <th className="c">퇴근</th>
              {!isOrg && <th className="c">근무시간</th>}
              <th className="c">상태</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableEmpty colSpan={isOrg ? 5 : 5} message="불러오는 중…" />
            ) : records.length === 0 ? (
              <TableEmpty
                colSpan={5}
                message={isOrg ? '이번 달 우리 조직의 출퇴근 기록이 없습니다' : '이번 달 출퇴근 기록이 없습니다'}
              />
            ) : (
              records.map((r) => (
                <tr key={r.id}>
                  {isOrg && (
                    <td className="lead">
                      <div style={{ fontWeight: 600 }}>{r.employee?.name ?? '—'}</div>
                      {employeeSub(r.employee) && (
                        <div style={{ fontSize: 12, color: 'var(--fg-4)' }}>{employeeSub(r.employee)}</div>
                      )}
                    </td>
                  )}
                  <td className={isOrg ? '' : 'lead'}>{dateLabel(r.clockInAt)}</td>
                  <td className="c">
                    <span className="att-time">{timeLabel(r.clockInAt)}</span>
                  </td>
                  <td className="c">
                    <span className={'att-time' + (r.clockOutAt ? '' : ' miss')}>{timeLabel(r.clockOutAt)}</span>
                  </td>
                  {!isOrg && (
                    <td className="c">
                      <span className="att-dur">{durationLabel(r.clockInAt, r.clockOutAt)}</span>
                    </td>
                  )}
                  <td className="c">
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
