import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { EVENTS } from '../../events/domain-events'

interface NoShowJobData {
  companyId: string
  employeeId: string
  shiftId: string
  minute: number
}

/**
 * 미출근 독촉 처리기 — 예약 시점에 출근 기록을 재확인하고, 미출근이면 독촉 이벤트를 발행한다.
 * (이벤트 → AttendanceNotificationListener가 본인에게 DM/인앱/이메일 발송)
 */
@Processor('attendance-reminder')
export class AttendanceReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(AttendanceReminderProcessor.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {
    super()
  }

  async process(job: Job<NoShowJobData>): Promise<void> {
    const { companyId, employeeId, shiftId, minute } = job.data

    // 해당 근무일정에 출근/결근 기록이 이미 있으면 독촉하지 않는다
    const attendance = await this.prisma.attendance.findFirst({
      where: { shiftId },
      select: { id: true },
    })
    if (attendance) return

    this.events.emit(EVENTS.ATTENDANCE_NO_SHOW_REMINDER, { companyId, employeeId, shiftId, minute })
  }
}
