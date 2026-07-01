import { Injectable } from '@nestjs/common'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AttendanceFilterDto } from './dto/attendance-filter.dto'

/**
 * 출퇴근 조회 — 목록(권한별 스코프) + 오늘 내 출퇴근 (god file 분할 · 항목 24).
 */
@Injectable()
export class AttendanceQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, filter: AttendanceFilterDto, user: JwtPayload) {
    const { startDate, endDate, organizationId, employeeId, scope, status, missingClockOut, page, limit } =
      filter
    const skip = (page - 1) * limit

    // 보안: ORG_ADMIN 미만(EMPLOYEE)은 본인 출퇴근만 조회하도록 employeeId를 서버측에서 강제한다.
    // 관리자(ORG_ADMIN+)는 필터의 employeeId/조직 범위 조회 허용. (shifts.findAll 과 동일 정책)
    const isManager =
      ACCESS_LEVEL_HIERARCHY[user.accessLevel] >= ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]
    const scopedEmployeeId = isManager ? employeeId : user.employeeId

    // 직원 셀프서비스 '우리 조직' 탭: 요청자 소속 조직을 서버에서 직접 해석해 그 조직들의 직원만 조회.
    // (클라이언트가 보낸 조직 ID를 신뢰하지 않으므로 타 조직 열람 불가. EMPLOYEE는 아래 scopedEmployeeId로 본인만.)
    let scopeOrgFilter: Record<string, unknown> | undefined
    if (scope === 'org' && isManager) {
      const myOrgs = await this.prisma.employeeOrganization.findMany({
        where: { employeeId: user.employeeId },
        select: { organizationId: true },
      })
      const myOrgIds = myOrgs.map((o: { organizationId: string }) => o.organizationId)
      scopeOrgFilter = {
        companyId,
        organizations: { some: { organizationId: { in: myOrgIds } } },
      }
    }

    const where: Record<string, unknown> = {
      employee: scopeOrgFilter ?? { companyId },
      // scope=org(매니저)일 때는 본인으로 좁히지 않고 조직 전체를 본다
      ...(!scopeOrgFilter && scopedEmployeeId && { employeeId: scopedEmployeeId }),
      ...(status && { status }),
      ...(missingClockOut && { clockOutAt: null }),
      ...(!scopeOrgFilter && organizationId && {
        employee: {
          companyId,
          organizations: { some: { organizationId } },
        },
      }),
      ...(startDate && {
        clockInAt: { gte: new Date(startDate) },
      }),
      ...(endDate && {
        clockInAt: {
          ...(startDate ? { gte: new Date(startDate) } : {}),
          lte: new Date(`${endDate}T23:59:59.999Z`),
        },
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clockInAt: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              name: true,
              employeeNumber: true,
              // '우리 조직' 탭에서 직원 소속/직무 표기용 (주 소속 조직 + 직무)
              organizations: {
                where: { isPrimary: true },
                select: { organization: { select: { id: true, name: true } } },
              },
              positions: { select: { position: { select: { id: true, name: true } } } },
            },
          },
          shift: {
            select: {
              id: true,
              startAt: true,
              endAt: true,
              shiftType: { select: { id: true, name: true, color: true } },
            },
          },
          timeclockArea: { select: { id: true, name: true } },
          breaks: true,
        },
      }),
      this.prisma.attendance.count({ where }),
    ])

    return { items, total, page, limit }
  }

  async getMyToday(companyId: string, employeeId: string) {
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date()
    dayEnd.setHours(23, 59, 59, 999)

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        employee: { companyId },
        clockInAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { clockInAt: 'desc' },
      include: { breaks: { orderBy: { startAt: 'asc' } } },
    })

    if (!attendance) {
      return { attendance: null, openBreak: null }
    }

    type BreakRecord = (typeof attendance.breaks)[number]
    const openBreak =
      attendance.breaks.find((b: BreakRecord) => b.endAt === null) ?? null

    return { attendance, openBreak }
  }
}
