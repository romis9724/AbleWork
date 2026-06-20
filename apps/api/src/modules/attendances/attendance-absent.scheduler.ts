import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { AttendanceStatus, ClockMethod, ShiftStatus } from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'

/** Shift 종료 후 결근 판정까지 대기 시간 (1시간) */
const ABSENT_GRACE_MS = 60 * 60 * 1000

/** 결근 판정 대상 조회 범위 (최근 48시간 내 종료된 Shift만 — 과거 데이터 무한 소급 방지) */
const LOOKBACK_MS = 48 * 60 * 60 * 1000

/** 자동 결근 처리 노트 */
const ABSENT_NOTE = '[자동 결근 처리]'

/**
 * 결근(absent) 자동 판정 스케줄러.
 *
 * 30분마다 실행되어, 종료된 지 1시간 이상 지난 draft/confirmed Shift 중
 * 출근 기록이 없는 건에 대해 status='absent' 출퇴근 기록을 생성한다.
 *
 * 멱등성:
 * 1차 — Attendance.shiftId는 unique이므로 같은 shiftId로 이미 기록이 있으면 조회에서 제외
 * 2차 — 동시 실행 등으로 unique 충돌(P2002) 발생 시 스킵
 */
@Injectable()
export class AttendanceAbsentScheduler {
  private readonly logger = new Logger(AttendanceAbsentScheduler.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/30 * * * *')
  async markAbsences(): Promise<void> {
    const now = Date.now()
    const endedBefore = new Date(now - ABSENT_GRACE_MS)
    const lookbackStart = new Date(now - LOOKBACK_MS)

    // 종료된 지 1시간 이상 지난 Shift 중 연결된 attendance가 없는 건
    const candidateShifts = await this.prisma.shift.findMany({
      where: {
        endAt: { lte: endedBefore, gte: lookbackStart },
        status: { in: [ShiftStatus.DRAFT, ShiftStatus.CONFIRMED] },
        attendance: null, // shiftId unique — 같은 Shift로 이미 기록이 있으면 스킵 (멱등성 1차)
        // 출퇴근 기록이 불필요한 근무유형(재택/외근 등)은 결근 자동 판정에서 제외
        shiftType: { noClockInRequired: false },
      },
      select: { id: true, employeeId: true, startAt: true, endAt: true },
    })

    if (candidateShifts.length === 0) {
      return
    }

    let createdCount = 0
    for (const shift of candidateShifts) {
      try {
        const created = await this.markAbsentForShift(shift)
        if (created) {
          createdCount += 1
        }
      } catch (error: unknown) {
        // 동시 실행 등으로 shiftId unique 충돌 시 스킵 (멱등성 2차 방어)
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue
        }
        // 개별 Shift 실패가 전체 배치를 중단시키지 않도록 로깅 후 계속
        this.logger.error(`결근 자동 판정 실패 (shiftId=${shift.id})`, error as Error)
      }
    }

    this.logger.log(`결근 자동 판정 완료: 후보 ${candidateShifts.length}건 중 ${createdCount}건 생성`)
  }

  /** 해당 직원의 당일 출근 기록이 없으면 absent 기록 생성. 생성 여부 반환. */
  private async markAbsentForShift(shift: {
    id: string
    employeeId: string
    startAt: Date
    endAt: Date
  }): Promise<boolean> {
    // 당일(Shift 시작일 기준) 다른 출근 기록(무일정 출근 등)이 있으면 결근 아님
    const dayStart = new Date(shift.startAt)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(shift.startAt)
    dayEnd.setHours(23, 59, 59, 999)

    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: shift.employeeId,
        clockInAt: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true },
    })
    if (existingAttendance) {
      return false
    }

    // 결근 기록: 실제 출근이 없으므로 clockInAt은 Shift 시작 시각으로 기준 기록만 남긴다
    await this.prisma.attendance.create({
      data: {
        employeeId: shift.employeeId,
        shiftId: shift.id,
        clockInAt: shift.startAt,
        status: AttendanceStatus.ABSENT,
        isOncall: false,
        clockInMethod: ClockMethod.MANUAL,
        note: ABSENT_NOTE,
      },
    })

    return true
  }
}
