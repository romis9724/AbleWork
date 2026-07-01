import { Injectable, NotFoundException } from '@nestjs/common'
import { AccessLevel } from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { EmployeeFilterDto } from './dto/employee-filter.dto'
import { EmployeePermissionService } from './employee-permission.service'

/**
 * 직원 조회 — 목록(권한 스코프)·상세 (god file 분할 · 항목 24).
 */
@Injectable()
export class EmployeeQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: EmployeePermissionService,
  ) {}

  async findAll(companyId: string, filter: EmployeeFilterDto, requester: JwtPayload) {
    const {
      search,
      organizationId,
      positionId,
      organizationIds,
      positionIds,
      excludeSuperAdmin,
      isActive,
      page,
      limit,
    } = filter
    const skip = (page - 1) * limit

    // ORG_ADMIN은 자신의 조직 소속 직원만 볼 수 있다
    const orgScope = await this.permission.resolveOrgScope(requester)

    // 조직/직위 조건은 모두 organizations/positions 관계를 참조하므로
    // 단일 객체로 spread하면 키가 충돌해 마지막 조건만 남는다.
    // AND 배열로 합쳐 orgScope(보안)·조직 필터·직위 필터가 모두 적용되도록 한다.
    const and: Record<string, unknown>[] = []
    if (orgScope) {
      and.push({ organizations: { some: { organizationId: { in: orgScope } } } })
    }
    const orgIds = organizationIds?.length ? organizationIds : organizationId ? [organizationId] : null
    if (orgIds) {
      and.push({ organizations: { some: { organizationId: { in: orgIds } } } })
    }
    const posIds = positionIds?.length ? positionIds : positionId ? [positionId] : null
    if (posIds) {
      and.push({ positions: { some: { positionId: { in: posIds } } } })
    }

    const where: Record<string, unknown> = {
      companyId,
      ...(isActive !== undefined && { isActive }),
      // 인사관리 목록 전용: 최고관리자 제외 (별도 관계 키와 충돌 없어 직접 지정)
      ...(excludeSuperAdmin && { accessLevel: { not: AccessLevel.SUPER_ADMIN } }),
      ...(and.length > 0 && { AND: and }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { employeeNumber: { contains: search } },
        ],
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true } },
          organizations: {
            include: { organization: { select: { id: true, name: true } } },
          },
          positions: {
            include: { position: { select: { id: true, name: true, color: true } } },
          },
        },
      }),
      this.prisma.employee.count({ where }),
    ])

    return { items, total, page, limit }
  }

  // ── 단일 조회 ───────────────────────────────────────────────────────────────

  async findOne(companyId: string, id: string, requester: JwtPayload) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        user: { select: { email: true } },
        organizations: {
          include: { organization: { select: { id: true, name: true } } },
        },
        positions: {
          include: { position: { select: { id: true, name: true, color: true } } },
        },
        wageInfos: { orderBy: { effectiveFrom: 'desc' }, take: 1 },
      },
    })

    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '직원을 찾을 수 없습니다.',
      })
    }

    await this.permission.guardOrgScope(requester, employee)
    return employee
  }

  // ── 직원 등록 ───────────────────────────────────────────────────────────────

}
