import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'

// 다음 70분 내 시작하는 근무일정을 매시간 예약 — 최대 독촉(60분)을 여유 있게 커버
const WINDOW_MS = 70 * 60 * 1000

/**
 * 미출근 독촉 예약 스케줄러.
 * 매시간 임박한 근무일정을 조회해, 회사 설정의 독촉 시점(근무 시작 후 N분)마다
 * BullMQ 지연 작업을 예약한다. jobId가 멱등이라 매시간 재실행해도 중복 예약되지 않는다.
 */
@Injectable()
export class AttendanceReminderScheduler {
  private readonly logger = new Logger(AttendanceReminderScheduler.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: CompanySettingsService,
    @InjectQueue('attendance-reminder') private readonly queue: Queue,
  ) {}

  @Cron('0 * * * *') // 매시 정각
  async scheduleNoShowReminders(): Promise<void> {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + WINDOW_MS)

    // 간주근로·무클럭 일정은 출근 기록이 필요 없으므로 독촉 대상에서 제외
    const shifts = await this.prisma.shift.findMany({
      where: {
        startAt: { gte: now, lte: windowEnd },
        shiftType: { isDeemedWork: false, noClockInRequired: false },
      },
      select: {
        id: true,
        employeeId: true,
        startAt: true,
        employee: { select: { companyId: true } },
      },
    })
    if (shifts.length === 0) return

    const minutesByCompany = new Map<string, number[]>()
    let queued = 0
    for (const shift of shifts) {
      const companyId = shift.employee.companyId
      let minutes = minutesByCompany.get(companyId)
      if (!minutes) {
        minutes = await this.getReminderMinutes(companyId)
        minutesByCompany.set(companyId, minutes)
      }
      for (const m of minutes) {
        const delay = shift.startAt.getTime() + m * 60_000 - now.getTime()
        if (delay <= 0) continue
        await this.queue.add(
          'no-show',
          { companyId, employeeId: shift.employeeId, shiftId: shift.id, minute: m },
          { delay, jobId: `noshow:${shift.id}:${m}`, removeOnComplete: true, removeOnFail: true },
        )
        queued++
      }
    }
    if (queued > 0) this.logger.log(`미출근 독촉 ${queued}건 예약(대상 일정 ${shifts.length})`)
  }

  /** 회사 설정의 독촉 시점(분) 목록 — 콤마 구분 문자열에서 파싱 */
  private async getReminderMinutes(companyId: string): Promise<number[]> {
    const raw = await this.settings.get<string>(
      companyId,
      'attendance',
      'no_show_reminder_minutes',
      '1,10,30,60',
    )
    return String(raw)
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  }
}
