import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY, ShiftStatus } from '@ablework/shared-constants'
import { CreateShiftDto, UpdateShiftDto } from './dto/create-shift.dto'
import { BulkCreateShiftDto } from './dto/bulk-create-shift.dto'
import { ShiftFilterDto } from './dto/shift-filter.dto'

/** 주 52시간 경고 임계치 (ms) */
const WEEKLY_HOUR_WARNING_MS = 52 * 60 * 60 * 1000

/** ISO 날짜 문자열 → 해당 주 월요일 00:00 / 일요일 23:59 반환 */
function getWeekBounds(dateMs: number): { weekStart: Date; weekEnd: Date } {
  const d = new Date(dateMs)
  const day = d.getDay() // 0=Sun, 1=Mon, ...
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { weekStart: monday, weekEnd: sunday }
}

/** 날짜 범위(YYYY-MM-DD)를 순회하며 Date 배열 반환 */
function dateRange(startDate: string, endDate: string): Date[] {
  const dates: Date[] = []
  const cursor = new Date(startDate + 'T00:00:00.000Z')
  const end = new Date(endDate + 'T00:00:00.000Z')
  while (cursor <= end) {
    dates.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string, filter: ShiftFilterDto, user: JwtPayload) {
    const { employeeId, organizationId, startAt, endAt } = filter

    // 보안(C6-4): ORG_ADMIN 미만은 본인 일정만 조회하도록 employeeId를 서버측에서 강제한다.
    // 관리자(ORG_ADMIN+)는 회사/조직 범위 조회 허용.
    const isManager =
      ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]
    const scopedEmployeeId = isManager ? employeeId : user.employeeId

    const where: Record<string, unknown> = {
      organization: { companyId },
      ...(scopedEmployeeId && { employeeId: scopedEmployeeId }),
      ...(organizationId && { organizationId }),
      ...((startAt || endAt) && {
        startAt: {
          ...(startAt && { gte: new Date(startAt + 'T00:00:00.000Z') }),
          ...(endAt && { lte: new Date(endAt + 'T23:59:59.999Z') }),
        },
      }),
    }

    return this.prisma.shift.findMany({
      where,
      orderBy: { startAt: 'asc' },
      include: {
        employee: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, color: true } },
        template: { select: { id: true, name: true, code: true } },
      },
    })
  }

  // ── 단일 생성 ───────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateShiftDto, requester: JwtPayload) {
    await this.validateRelations(companyId, dto.organizationId, dto.shiftTypeId, dto.templateId)
    await this.validateEmployeesBelongToCompany(companyId, [dto.employeeId])

    const shift = await this.prisma.shift.create({
      data: {
        employeeId: dto.employeeId,
        organizationId: dto.organizationId,
        shiftTypeId: dto.shiftTypeId,
        templateId: dto.templateId ?? null,
        startAt: new Date(dto.startAt),
        endAt: new Date(dto.endAt),
        isOffsite: dto.isOffsite ?? false,
        offsiteAddress: dto.offsiteAddress ?? null,
        offsiteLat: dto.offsiteLat ?? null,
        offsiteLng: dto.offsiteLng ?? null,
        status: ShiftStatus.DRAFT,
        createdBy: requester.employeeId,
      },
      include: {
        employee: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })

    const warning = await this.checkWeeklyHours(dto.employeeId, new Date(dto.startAt))
    return { ...shift, warning: warning ?? undefined }
  }

  // ── 일괄 생성 ───────────────────────────────────────────────────────────────

  async bulkCreate(companyId: string, dto: BulkCreateShiftDto, requester: JwtPayload) {
    const template = await this.prisma.shiftTemplate.findFirst({
      where: { id: dto.templateId, companyId, isActive: true },
    })
    if (!template) {
      throw new BadRequestException({
        code: 'SHIFT_TEMPLATE_NOT_FOUND',
        message: '유효하지 않은 근무 템플릿입니다.',
      })
    }

    await this.validateOrganizationBelongsToCompany(companyId, dto.organizationId)
    await this.validateEmployeesBelongToCompany(companyId, dto.employeeIds)

    const dates = dateRange(dto.startDate, dto.endDate)
    if (dates.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_DATE_RANGE',
        message: '날짜 범위가 올바르지 않습니다.',
      })
    }

    // template.startTime / endTime 은 1970-01-01 기준의 Time 값
    const startHours = template.startTime.getUTCHours()
    const startMinutes = template.startTime.getUTCMinutes()
    const endHours = template.endTime.getUTCHours()
    const endMinutes = template.endTime.getUTCMinutes()

    const shifts: {
      employeeId: string
      organizationId: string
      shiftTypeId: string
      templateId: string
      startAt: Date
      endAt: Date
      status: string
      createdBy: string
    }[] = []

    for (const date of dates) {
      for (const employeeId of dto.employeeIds) {
        const startAt = new Date(date)
        startAt.setUTCHours(startHours, startMinutes, 0, 0)

        const endAt = new Date(date)
        endAt.setUTCHours(endHours, endMinutes, 0, 0)

        // 야간 근무: 종료 시각이 시작 시각보다 이른 경우 다음 날로 처리
        if (endAt <= startAt) {
          endAt.setUTCDate(endAt.getUTCDate() + 1)
        }

        shifts.push({
          employeeId,
          organizationId: dto.organizationId,
          shiftTypeId: template.shiftTypeId,
          templateId: template.id,
          startAt,
          endAt,
          status: ShiftStatus.DRAFT,
          createdBy: requester.employeeId,
        })
      }
    }

    await this.prisma.shift.createMany({ data: shifts })

    // 주 52시간 경고 확인 (첫 번째 직원의 첫 번째 날짜 기준)
    const warnings: string[] = []
    for (const employeeId of dto.employeeIds) {
      const warning = await this.checkWeeklyHours(employeeId, dates[0])
      if (warning) warnings.push(`${employeeId}: ${warning}`)
    }

    return {
      created: shifts.length,
      warnings: warnings.length > 0 ? warnings : undefined,
    }
  }

  // ── 수정 ────────────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateShiftDto) {
    const existing = await this.assertShift(companyId, id)
    this.guardConfirmed(existing)

    if (dto.shiftTypeId) {
      await this.validateShiftTypeBelongsToCompany(companyId, dto.shiftTypeId)
    }

    return this.prisma.shift.update({
      where: { id },
      data: {
        ...(dto.shiftTypeId !== undefined && { shiftTypeId: dto.shiftTypeId }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.startAt !== undefined && { startAt: new Date(dto.startAt) }),
        ...(dto.endAt !== undefined && { endAt: new Date(dto.endAt) }),
        ...(dto.isOffsite !== undefined && { isOffsite: dto.isOffsite }),
        ...(dto.offsiteAddress !== undefined && { offsiteAddress: dto.offsiteAddress }),
        ...(dto.offsiteLat !== undefined && { offsiteLat: dto.offsiteLat }),
        ...(dto.offsiteLng !== undefined && { offsiteLng: dto.offsiteLng }),
      },
      include: {
        employee: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })
  }

  // ── 삭제 ────────────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    const existing = await this.assertShift(companyId, id)
    this.guardConfirmed(existing)

    return this.prisma.shift.delete({ where: { id } })
  }

  // ── 확정 처리 ───────────────────────────────────────────────────────────────

  async confirm(companyId: string, id: string, requester: JwtPayload) {
    const existing = await this.assertShift(companyId, id)

    if (existing.status === ShiftStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'SHIFT_ALREADY_CONFIRMED',
        message: '이미 확정된 근무일정입니다.',
      })
    }

    const shift = await this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CONFIRMED,
        confirmedBy: requester.employeeId,
        confirmedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })

    const warning = await this.checkWeeklyHours(existing.employeeId, existing.startAt)
    return { ...shift, warning: warning ?? undefined }
  }

  // ── 확정 해제 ───────────────────────────────────────────────────────────────

  async unconfirm(companyId: string, id: string, requester: JwtPayload) {
    // unconfirm은 GENERAL_ADMIN 이상만 가능 (RolesGuard로 처리하지만 서비스에서도 방어)
    if (
      requester.accessLevel !== AccessLevel.GENERAL_ADMIN &&
      requester.accessLevel !== AccessLevel.SUPER_ADMIN
    ) {
      throw new ForbiddenException('확정 해제는 GENERAL_ADMIN 이상만 가능합니다.')
    }

    const existing = await this.assertShift(companyId, id)

    if (existing.status !== ShiftStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'SHIFT_NOT_CONFIRMED',
        message: '확정된 일정이 아닙니다.',
      })
    }

    return this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.DRAFT,
        confirmedBy: null,
        confirmedAt: null,
      },
      include: {
        employee: { select: { id: true, name: true } },
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  /** 직원들이 해당 회사 소속(활성)인지 검증 — 멀티테넌시 */
  private async validateEmployeesBelongToCompany(companyId: string, employeeIds: string[]) {
    const uniqueIds = [...new Set(employeeIds)]
    const count = await this.prisma.employee.count({
      where: { id: { in: uniqueIds }, companyId, isActive: true },
    })
    if (count !== uniqueIds.length) {
      throw new BadRequestException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '회사 소속이 아닌 직원이 포함되어 있습니다.',
      })
    }
  }

  async assertShift(companyId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, organization: { companyId } },
    })
    if (!shift) {
      throw new NotFoundException({
        code: 'SHIFT_NOT_FOUND',
        message: '근무일정을 찾을 수 없습니다.',
      })
    }
    return shift
  }

  private guardConfirmed(shift: { status: string }) {
    if (shift.status === ShiftStatus.CONFIRMED) {
      throw new BadRequestException({
        code: 'SHIFT_ALREADY_CONFIRMED',
        message: '확정된 근무일정은 수정하거나 삭제할 수 없습니다.',
      })
    }
  }

  /**
   * 해당 직원의 해당 주 총 근무시간을 계산하고 52시간 초과 시 경고 메시지 반환.
   */
  async checkWeeklyHours(employeeId: string, referenceDate: Date): Promise<string | null> {
    const { weekStart, weekEnd } = getWeekBounds(referenceDate.getTime())

    const shifts = await this.prisma.shift.findMany({
      where: {
        employeeId,
        status: { not: ShiftStatus.CANCELLED },
        startAt: { gte: weekStart, lte: weekEnd },
      },
      select: { startAt: true, endAt: true },
    })

    const totalMs = shifts.reduce((sum: number, s: { startAt: Date; endAt: Date }) => {
      return sum + (s.endAt.getTime() - s.startAt.getTime())
    }, 0)

    if (totalMs > WEEKLY_HOUR_WARNING_MS) {
      const totalHours = Math.round(totalMs / (60 * 60 * 1000) * 10) / 10
      return `이번 주 예정 근무시간이 ${totalHours}시간으로 52시간을 초과합니다.`
    }

    return null
  }

  /**
   * 여러 (직원·시작시각) 근무 묶음에 대해 직원×주 단위로 주52h 경고를 일괄 수집한다.
   * 동일 직원의 같은 주는 한 번만 검사한다. 근무일정 패턴 적용 등 대량 생성 "직후"에 호출해
   * 방금 생성된 근무까지 합산된 주간 시간 기준으로 경고한다.
   */
  async collectWeeklyWarnings(
    items: { employeeId: string; startAt: Date }[],
  ): Promise<string[]> {
    const seen = new Set<string>()
    const warnings: string[] = []
    for (const { employeeId, startAt } of items) {
      const { weekStart } = getWeekBounds(startAt.getTime())
      const key = `${employeeId}:${weekStart.getTime()}`
      if (seen.has(key)) continue
      seen.add(key)
      const warning = await this.checkWeeklyHours(employeeId, startAt)
      if (warning) warnings.push(`${employeeId}: ${warning}`)
    }
    return warnings
  }

  private async validateRelations(
    companyId: string,
    organizationId: string,
    shiftTypeId: string,
    templateId?: string,
  ) {
    await this.validateOrganizationBelongsToCompany(companyId, organizationId)
    await this.validateShiftTypeBelongsToCompany(companyId, shiftTypeId)

    if (templateId) {
      const template = await this.prisma.shiftTemplate.findFirst({
        where: { id: templateId, companyId, isActive: true },
      })
      if (!template) {
        throw new BadRequestException({
          code: 'INVALID_SHIFT_TEMPLATE',
          message: '유효하지 않은 근무 템플릿입니다.',
        })
      }
    }
  }

  private async validateOrganizationBelongsToCompany(companyId: string, organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, companyId },
    })
    if (!org) {
      throw new BadRequestException({
        code: 'INVALID_ORGANIZATION',
        message: '유효하지 않은 조직입니다.',
      })
    }
  }

  private async validateShiftTypeBelongsToCompany(companyId: string, shiftTypeId: string) {
    const shiftType = await this.prisma.shiftType.findFirst({
      where: { id: shiftTypeId, companyId, isActive: true },
    })
    if (!shiftType) {
      throw new BadRequestException({
        code: 'INVALID_SHIFT_TYPE',
        message: '유효하지 않은 근무유형입니다.',
      })
    }
  }
}
