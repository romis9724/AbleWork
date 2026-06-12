'use client'
import { useState, useMemo } from 'react'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import EmptyState from '@/components/common/EmptyState'
import { ShiftStatus } from '@ablework/shared-constants'
import { useShifts } from '@/lib/query/shifts'
import { useAuthStore } from '@/stores/auth.store'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function ShiftsPage() {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateStr(today))
  const employeeId = useAuthStore((s) => s.user?.employeeId)

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay = new Date(viewYear, viewMonth + 1, 0)

  // 본인 일정만 조회 — employeeId 필터 누락 시 전 직원 일정이 노출됨
  const { data: shifts = [], isLoading } = useShifts({
    employeeId,
    startAt: toLocalDateStr(firstDay),
    endAt: toLocalDateStr(lastDay),
  })

  // Map date string → shift list
  const shiftsByDate = useMemo(() => {
    const map: Record<string, typeof shifts> = {}
    for (const shift of shifts) {
      const dateKey = shift.startAt.slice(0, 10)
      if (!map[dateKey]) map[dateKey] = []
      map[dateKey].push(shift)
    }
    return map
  }, [shifts])

  const selectedShifts = shiftsByDate[selectedDate] ?? []

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

  // Build calendar grid: pad leading empty cells for first day's weekday
  const leadingBlanks = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const calendarCells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad trailing to complete the last row
  const remainder = calendarCells.length % 7
  if (remainder !== 0) {
    calendarCells.push(...Array(7 - remainder).fill(null))
  }

  return (
    <Box>
      <Typography variant="h6" fontWeight={700} mb={2}>내 근무일정</Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: '16px !important' }}>
          {/* Month navigation */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <IconButton size="small" onClick={handlePrevMonth}>
              <ChevronLeftIcon />
            </IconButton>
            <Typography fontWeight={600}>
              {viewYear}년 {viewMonth + 1}월
            </Typography>
            <IconButton size="small" onClick={handleNextMonth}>
              <ChevronRightIcon />
            </IconButton>
          </Box>

          {/* Weekday headers */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
            {WEEKDAYS.map((d, i) => (
              <Typography
                key={d}
                variant="caption"
                align="center"
                fontWeight={600}
                sx={{ color: i === 0 ? 'error.main' : i === 6 ? 'primary.main' : 'text.secondary' }}
              >
                {d}
              </Typography>
            ))}
          </Box>

          {/* Calendar cells */}
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={32} />
            </Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
              {calendarCells.map((day, idx) => {
                if (day === null) return <Box key={`blank-${idx}`} />
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const hasShift = !!shiftsByDate[dateStr]?.length
                const isSelected = selectedDate === dateStr
                const isToday = toLocalDateStr(today) === dateStr
                const colIdx = (leadingBlanks + day - 1) % 7

                return (
                  <Box
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      py: 0.75,
                      borderRadius: 1,
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'primary.main' : 'transparent',
                      '&:hover': { bgcolor: isSelected ? 'primary.main' : 'action.hover' },
                    }}
                  >
                    <Typography
                      variant="body2"
                      fontWeight={isToday ? 700 : 400}
                      sx={{
                        color: isSelected
                          ? 'primary.contrastText'
                          : colIdx === 0
                          ? 'error.main'
                          : colIdx === 6
                          ? 'primary.main'
                          : 'text.primary',
                        lineHeight: 1.4,
                      }}
                    >
                      {day}
                    </Typography>
                    {hasShift && (
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: isSelected ? 'primary.contrastText' : 'primary.main',
                          mt: 0.25,
                        }}
                      />
                    )}
                  </Box>
                )
              })}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Selected date detail */}
      <Typography variant="subtitle2" fontWeight={600} mb={1} color="text.secondary">
        {selectedDate.replace(/-/g, '.')} 근무일정
      </Typography>

      {selectedShifts.length === 0 ? (
        <EmptyState message="이 날의 근무일정이 없습니다." />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {selectedShifts.map((shift) => {
            const start = new Date(shift.startAt)
            const end = new Date(shift.endAt)
            const timeRange = `${start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} ~ ${end.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
            return (
              <Card key={shift.id} variant="outlined">
                <CardContent sx={{ py: '12px !important', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2" fontWeight={600}>
                      {shift.shiftType?.name ?? shift.template?.name ?? '근무'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{timeRange}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                    {shift.shiftType && (
                      <Chip
                        label={shift.shiftType.category}
                        size="small"
                        sx={{
                          bgcolor: shift.shiftType.color ?? 'primary.main',
                          color: 'white',
                          fontSize: 11,
                        }}
                      />
                    )}
                    <Chip
                      label={shift.status === ShiftStatus.CONFIRMED ? '확정' : '미확정'}
                      size="small"
                      color={shift.status === ShiftStatus.CONFIRMED ? 'success' : 'default'}
                      variant="outlined"
                    />
                  </Box>
                </CardContent>
              </Card>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
