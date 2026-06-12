'use client'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import type { Shift } from '@/lib/query/shifts'

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const
const DAYS_PER_WEEK = 7

export interface CalendarEmployee {
  id: string
  name: string
}

interface WeeklyCalendarProps {
  weekStart: Date // 월요일
  shifts: Shift[]
  employees: CalendarEmployee[]
  canUnconfirm: boolean
  isUnconfirming: boolean
  onWeekChange: (nextWeekStart: Date) => void
  onCellClick: (employeeId: string, date: string) => void
  onShiftClick: (shift: Shift) => void
  onUnconfirm: (shift: Shift) => void
}

/** 로컬 기준 YYYY-MM-DD */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** 해당 날짜가 속한 주의 월요일 (로컬 기준) */
export function getMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0(일) ~ 6(토)
  const diff = day === 0 ? -6 : 1 - day
  return addDays(d, diff)
}

function toHHMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 미확정 빗금 표현 */
const HATCH_BG =
  'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.07) 4px, rgba(0,0,0,0.07) 8px)'

export default function WeeklyCalendar({
  weekStart,
  shifts,
  employees,
  canUnconfirm,
  isUnconfirming,
  onWeekChange,
  onCellClick,
  onShiftClick,
  onUnconfirm,
}: WeeklyCalendarProps) {
  const weekDates = Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(weekStart, i))
  const todayStr = toLocalDateStr(new Date())

  // employeeId → dateStr → Shift[]
  const shiftMap = new Map<string, Map<string, Shift[]>>()
  for (const shift of shifts) {
    const dateStr = toLocalDateStr(new Date(shift.startAt))
    const byDate = shiftMap.get(shift.employeeId) ?? new Map<string, Shift[]>()
    const list = byDate.get(dateStr) ?? []
    byDate.set(dateStr, [...list, shift])
    shiftMap.set(shift.employeeId, byDate)
  }

  return (
    <>
      {/* 주 이동 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <IconButton size="small" onClick={() => onWeekChange(addDays(weekStart, -DAYS_PER_WEEK))} aria-label="이전 주">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle2" sx={{ minWidth: 180, textAlign: 'center' }}>
          {toLocalDateStr(weekStart)} — {toLocalDateStr(addDays(weekStart, DAYS_PER_WEEK - 1))}
        </Typography>
        <IconButton size="small" onClick={() => onWeekChange(addDays(weekStart, DAYS_PER_WEEK))} aria-label="다음 주">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        <Button size="small" onClick={() => onWeekChange(getMonday(new Date()))}>
          오늘
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 860 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: 'background.default' }}>
              <TableCell sx={{ width: 120, fontWeight: 700 }}>직원</TableCell>
              {weekDates.map((date, i) => {
                const dateStr = toLocalDateStr(date)
                const isToday = dateStr === todayStr
                return (
                  <TableCell
                    key={dateStr}
                    align="center"
                    sx={{
                      fontWeight: 700,
                      ...(isToday && { color: 'primary.main', bgcolor: 'action.hover' }),
                      ...(i >= 5 && !isToday && { color: 'text.secondary' }),
                    }}
                  >
                    {WEEKDAY_LABELS[i]} {date.getMonth() + 1}/{date.getDate()}
                  </TableCell>
                )
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={DAYS_PER_WEEK + 1} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    표시할 직원이 없습니다.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{employee.name}</TableCell>
                  {weekDates.map((date) => {
                    const dateStr = toLocalDateStr(date)
                    const cellShifts = shiftMap.get(employee.id)?.get(dateStr) ?? []
                    return (
                      <TableCell
                        key={dateStr}
                        align="center"
                        onClick={() => onCellClick(employee.id, dateStr)}
                        sx={{
                          cursor: 'pointer',
                          verticalAlign: 'top',
                          p: 0.75,
                          height: 56,
                          ...(dateStr === todayStr && { bgcolor: 'action.hover' }),
                          '&:hover': { bgcolor: 'action.selected' },
                        }}
                      >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'stretch' }}>
                          {cellShifts.map((shift) => {
                            const isConfirmed = shift.status === 'confirmed'
                            const typeColor = shift.shiftType?.color
                            const label = `${toHHMM(shift.startAt)}–${toHHMM(shift.endAt)}`
                            return (
                              <Tooltip
                                key={shift.id}
                                title={`${shift.shiftType?.name ?? '근무'} · ${isConfirmed ? '확정' : '미확정'}`}
                              >
                                <Chip
                                  label={label}
                                  size="small"
                                  variant={isConfirmed ? 'filled' : 'outlined'}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onShiftClick(shift)
                                  }}
                                  {...(isConfirmed && canUnconfirm
                                    ? {
                                        deleteIcon: <LockOpenIcon />,
                                        onDelete: isUnconfirming
                                          ? undefined
                                          : () => onUnconfirm(shift),
                                      }
                                    : {})}
                                  sx={{
                                    fontSize: 11,
                                    height: 22,
                                    justifyContent: 'flex-start',
                                    ...(isConfirmed
                                      ? {
                                          bgcolor: typeColor ?? 'primary.main',
                                          color: 'common.white',
                                          '& .MuiChip-deleteIcon': {
                                            color: 'rgba(255,255,255,0.8)',
                                            '&:hover': { color: 'common.white' },
                                          },
                                        }
                                      : {
                                          borderStyle: 'dashed',
                                          borderColor: typeColor ?? 'divider',
                                          backgroundImage: HATCH_BG,
                                        }),
                                  }}
                                />
                              </Tooltip>
                            )
                          })}
                        </Box>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
