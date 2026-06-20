import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { ShiftsService } from '../shifts/shifts.service'
import {
  CreateSchedulePatternDto,
  UpdateSchedulePatternDto,
  ApplySchedulePatternDto,
} from './dto/create-schedule-pattern.dto'

@Injectable()
export class SchedulePatternsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftsService: ShiftsService,
  ) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  findAll(companyId: string) {
    return this.prisma.schedulePattern.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ── 단일 조회 ───────────────────────────────────────────────────────────────

  async findOne(companyId: string, id: string) {
    const pattern = await this.prisma.schedulePattern.findFirst({
      where: { id, companyId },
    })
    if (!pattern) {
      throw new NotFoundException({
        code: 'SCHEDULE_PATTERN_NOT_FOUND',
        message: '스케줄 패턴을 찾을 수 없습니다.',
      })
    }
    return pattern
  }

  // ── 생성 ────────────────────────────────────────────────────────────────────

  create(companyId: string, dto: CreateSchedulePatternDto) {
    return this.prisma.schedulePattern.create({
      data: {
        companyId,
        name: dto.name,
        description: dto.description ?? null,
        repeatCycleDays: dto.repeatCycleDays,
        patternDefinition: dto.patternDefinition as object,
        holidayHandling: dto.holidayHandling,
      },
    })
  }

  // ── 수정 ────────────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateSchedulePatternDto) {
    await this.assertPattern(companyId, id)

    return this.prisma.schedulePattern.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.repeatCycleDays !== undefined && {
          repeatCycleDays: dto.repeatCycleDays,
        }),
        ...(dto.patternDefinition !== undefined && {
          patternDefinition: dto.patternDefinition as object,
        }),
        ...(dto.holidayHandling !== undefined && {
          holidayHandling: dto.holidayHandling,
        }),
      },
    })
  }

  // ── 소프트 삭제 ──────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    await this.assertPattern(companyId, id)
    return this.prisma.schedulePattern.update({
      where: { id },
      data: { isActive: false },
    })
  }

  // ── 패턴 적용 ───────────────────────────────────────────────────────────────

  async applyPattern(companyId: string, patternId: string, dto: ApplySchedulePatternDto) {
    const pattern = await this.assertPattern(companyId, patternId)
    const { employeeIds, startDate, endDate } = dto

    // 직원 존재 + 소속 회사 검증
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, companyId, isActive: true },
      select: {
        id: true,
        organizations: {
          where: { isPrimary: true },
          select: { organizationId: true },
        },
      },
    })

    if (employees.length !== employeeIds.length) {
      throw new BadRequestException({
        code: 'INVALID_EMPLOYEES',
        message: '유효하지 않은 직원이 포함되어 있습니다.',
      })
    }

    const patternDef = pattern.patternDefinition as Record<string, string>
    const cycleDays = pattern.repeatCycleDays
    const holidayHandling = pattern.holidayHandling

    // 공휴일 목록 조회 (해당 기간)
    const holidays = await this.fetchHolidayDates(companyId, startDate, endDate)

    // templateId → ShiftTemplate 검증 및 캐시
    const uniqueTemplateIds = [...new Set(Object.values(patternDef))]
    const templates = await this.prisma.shiftTemplate.findMany({
      where: { id: { in: uniqueTemplateIds }, companyId, isActive: true },
      select: {
        id: true,
        shiftTypeId: true,
        startTime: true,
        endTime: true,
      },
    })
    type TemplateInfo = { id: string; shiftTypeId: string; startTime: Date; endTime: Date }
    const templateMap = new Map<string, TemplateInfo>(
      (templates as TemplateInfo[]).map((t) => [t.id, t]),
    )

    // 날짜 순회 및 Shift 데이터 빌드
    type ShiftInput = {
      employeeId: string
      organizationId: string
      shiftTypeId: string
      templateId: string
      startAt: Date
      endAt: Date
      status: string
      createdBy: string
    }
    const shiftsToCreate: ShiftInput[] = []
    const start = new Date(startDate)
    const end = new Date(endDate)
    const cycleStart = new Date(startDate) // 주기 인덱스 계산 기준

    let cursor = new Date(start)

    while (cursor <= end) {
      const dateStr = this.toDateStr(cursor)
      const isHoliday = holidays.has(dateStr)

      if (isHoliday && holidayHandling === 'skip_and_keep') {
        cursor = this.addDays(cursor, 1)
        continue
      }

      const targetDate =
        isHoliday && holidayHandling === 'skip_and_shift'
          ? this.nextNonHoliday(cursor, holidays)
          : cursor

      const diffDays = Math.floor(
        (cursor.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24),
      )
      const cycleIndex = ((diffDays % cycleDays) + cycleDays) % cycleDays
      const templateId = patternDef[String(cycleIndex)]

      if (templateId) {
        const template = templateMap.get(templateId)
        if (template) {
          for (const employee of employees) {
            const primaryOrgId =
              employee.organizations[0]?.organizationId ?? null

            if (!primaryOrgId) continue

            const startAt = this.combineDateAndTime(targetDate, template.startTime)
            const endAt = this.combineDateAndTime(targetDate, template.endTime)
            // 종료 시각이 시작보다 이전이면 익일로 처리
            const adjustedEndAt =
              endAt <= startAt ? this.addDays(endAt, 1) : endAt

            shiftsToCreate.push({
              employeeId: employee.id,
              organizationId: primaryOrgId,
              shiftTypeId: template.shiftTypeId,
              templateId: template.id,
              startAt,
              endAt: adjustedEndAt,
              status: 'draft',
              createdBy: employee.id, // 시스템 생성 — 실무에서는 requester.employeeId 전달 권장
            })
          }
        }
      }

      cursor = this.addDays(cursor, 1)
    }

    if (shiftsToCreate.length === 0) {
      return { created: 0 }
    }

    const result = await this.prisma.shift.createMany({
      data: shiftsToCreate,
      skipDuplicates: true,
    })

    // 생성 직후 직원×주 단위 주52시간 초과 경고 수집 (저장은 허용, warning만 — shifts와 동일 정책)
    const warnings = await this.shiftsService.collectWeeklyWarnings(
      shiftsToCreate.map((s) => ({ employeeId: s.employeeId, startAt: s.startAt })),
    )

    return { created: result.count, warnings: warnings.length > 0 ? warnings : undefined }
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  private async assertPattern(companyId: string, id: string) {
    const pattern = await this.prisma.schedulePattern.findFirst({
      where: { id, companyId },
    })
    if (!pattern) {
      throw new NotFoundException({
        code: 'SCHEDULE_PATTERN_NOT_FOUND',
        message: '스케줄 패턴을 찾을 수 없습니다.',
      })
    }
    return pattern
  }

  private async fetchHolidayDates(
    companyId: string,
    startDate: string,
    endDate: string,
  ): Promise<Set<string>> {
    const holidays = await this.prisma.companyHoliday.findMany({
      where: {
        companyId,
        holidayDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      select: { holidayDate: true },
    })
    return new Set(
      holidays.map((h: { holidayDate: Date }) => this.toDateStr(h.holidayDate)),
    )
  }

  private toDateStr(date: Date): string {
    return date.toISOString().slice(0, 10)
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date)
    d.setUTCDate(d.getUTCDate() + days)
    return d
  }

  private nextNonHoliday(date: Date, holidays: Set<string>): Date {
    let next = this.addDays(date, 1)
    while (holidays.has(this.toDateStr(next))) {
      next = this.addDays(next, 1)
    }
    return next
  }

  private combineDateAndTime(date: Date, time: Date): Date {
    const combined = new Date(date)
    combined.setUTCHours(time.getUTCHours(), time.getUTCMinutes(), 0, 0)
    return combined
  }
}
