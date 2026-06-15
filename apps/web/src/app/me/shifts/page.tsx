'use client'
import { useMemo, useState, type CSSProperties } from 'react'
import { ShiftStatus } from '@ablework/shared-constants'
import { useShifts, type Shift } from '@/lib/query/shifts'
import { useAuthStore } from '@/stores/auth.store'
import { PageHead } from '@/components/ab/Page'
import { Badge } from '@/components/ab/atoms'
import { I } from '@/components/ab/icons'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function timeRange(shift: Shift): string {
  const start = new Date(shift.startAt)
  const end = new Date(shift.endAt)
  const fmt = (d: Date) => d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fmt(start)} ~ ${fmt(end)}`
}

/** GET /shifts가 내려주는 shiftType.color를 칩 배경색으로 직접 사용 (category 미제공) */
function chipStyle(shift: Shift): CSSProperties | undefined {
  const color = shift.shiftType?.color
  if (!color) return undefined
  return { backgroundColor: color, borderColor: color, color: '#fff' }
}

export default function MyShiftsPage() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed
  const employeeId = useAuthStore((s) => s.user?.employeeId)

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)

  // 본인 일정만 조회 — employeeId 필터 누락 시 전 직원 일정이 노출됨
  const { data: shifts = [], isLoading } = useShifts({
    employeeId,
    startAt: toLocalDateStr(firstDay),
    endAt: toLocalDateStr(lastDay),
  })

  // 날짜별 그룹 + 정렬
  const groups = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const s of shifts) {
      const key = s.startAt.slice(0, 10)
      const list = map.get(key) ?? []
      list.push(s)
      map.set(key, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [shifts])

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const todayStr = toLocalDateStr(today)

  return (
    <>
      <PageHead eyebrow="Schedule" title="내 근무일정" />

      <div className="roster-toolbar">
        <div className="wk-nav">
          <button className="nb" onClick={handlePrevMonth} aria-label="이전 달">{I.chevL()}</button>
          <span className="wk-label tek">{viewYear}.{String(viewMonth + 1).padStart(2, '0')}</span>
          <button className="nb" onClick={handleNextMonth} aria-label="다음 달">{I.chevR()}</button>
        </div>
        <span className="page-stamp">총 {shifts.length}건</span>
      </div>

      {isLoading ? (
        <div className="ab-loading"><span className="ab-spin" />불러오는 중…</div>
      ) : groups.length === 0 ? (
        <div className="note"><div className="note-t">근무일정 없음</div>이 달의 근무일정이 없습니다.</div>
      ) : (
        <div className="me-shift-list">
          {groups.map(([date, list]) => {
            const d = new Date(date)
            const dow = WEEKDAYS[d.getDay()]
            const isToday = date === todayStr
            return (
              <div className={'me-shift-day' + (isToday ? ' today' : '')} key={date}>
                <div className="me-shift-date">
                  <span className="dnum tek">{d.getDate()}</span>
                  <span className={'dow' + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : '')}>{dow}</span>
                </div>
                <div className="me-shift-items">
                  {list.map((shift) => (
                    <div className="me-shift-row" key={shift.id}>
                      <span className="shift" style={chipStyle(shift)}>
                        {shift.shiftType?.name ?? shift.template?.name ?? '근무'}
                        <span className="tm">{timeRange(shift)}</span>
                      </span>
                      <Badge kind={shift.status === ShiftStatus.CONFIRMED ? 'b-done' : 'b-wait'}>
                        {shift.status === ShiftStatus.CONFIRMED ? '확정' : '미확정'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
