import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import { CreateEmployeeDto } from './dto/create-employee.dto'
import { UpdateEmployeeDto } from './dto/update-employee.dto'
import { EmployeeFilterDto } from './dto/employee-filter.dto'
import { CreateWageInfoDto } from '../wage-info/dto/create-wage-info.dto'
import { EVENTS } from '../../events/domain-events'

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string, filter: EmployeeFilterDto, requester: JwtPayload) {
    const { search, organizationId, positionId, isActive, page, limit } = filter
    const skip = (page - 1) * limit

    // ORG_ADMIN은 자신의 조직 소속 직원만 볼 수 있다
    const orgScope = await this.resolveOrgScope(requester)

    const where: Record<string, unknown> = {
      companyId,
      ...(isActive !== undefined && { isActive }),
      ...(orgScope && {
        organizations: { some: { organizationId: { in: orgScope } } },
      }),
      ...(organizationId && {
        organizations: { some: { organizationId } },
      }),
      ...(positionId && {
        positions: { some: { positionId } },
      }),
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

    await this.guardOrgScope(requester, employee)
    return employee
  }

  // ── 직원 등록 ───────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateEmployeeDto) {
    const { email, organizationIds, primaryOrganizationId, positionIds, joinedAt, ...rest } = dto

    // 조직이 같은 회사 소속인지 확인
    await this.validateOrganizationsBelongToCompany(companyId, organizationIds)

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // User 조회 또는 임시 생성
      let user = await tx.user.findUnique({ where: { email } })
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            passwordHash: '',   // 임시 계정 — 합류코드로 비밀번호 설정
            name: rest.name,
            isActive: false,    // 비밀번호 설정 전까지 비활성
          },
        })
      }

      // Employee 생성
      const employee = await tx.employee.create({
        data: {
          companyId,
          userId: user.id,
          joinedAt: new Date(joinedAt),
          ...rest,
        },
      })

      // 조직 연결
      await tx.employeeOrganization.createMany({
        data: organizationIds.map((orgId) => ({
          employeeId: employee.id,
          organizationId: orgId,
          isPrimary: orgId === primaryOrganizationId,
        })),
      })

      // 직무 연결
      if (positionIds.length > 0) {
        await tx.employeePosition.createMany({
          data: positionIds.map((positionId) => ({
            employeeId: employee.id,
            positionId,
          })),
        })
      }

      // 합류코드 이메일 이벤트 emit
      this.events.emit(EVENTS.EMPLOYEE_CREATED, {
        employeeId: employee.id,
        email,
        name: rest.name,
        companyId,
      })

      return employee
    })
  }

  // ── 직원 수정 ───────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateEmployeeDto, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    this.guardUpdatePermission(requester, id, dto)

    const { organizationIds, primaryOrganizationId, positionIds, ...rest } = dto

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const employee = await tx.employee.update({
        where: { id },
        data: rest,
      })

      if (organizationIds) {
        await this.validateOrganizationsBelongToCompany(companyId, organizationIds)
        await tx.employeeOrganization.deleteMany({ where: { employeeId: id } })
        await tx.employeeOrganization.createMany({
          data: organizationIds.map((orgId) => ({
            employeeId: id,
            organizationId: orgId,
            isPrimary: orgId === (primaryOrganizationId ?? organizationIds[0]),
          })),
        })
      }

      if (positionIds !== undefined) {
        await tx.employeePosition.deleteMany({ where: { employeeId: id } })
        if (positionIds.length > 0) {
          await tx.employeePosition.createMany({
            data: positionIds.map((positionId) => ({ employeeId: id, positionId })),
          })
        }
      }

      return employee
    })
  }

  // ── 퇴사 처리 ───────────────────────────────────────────────────────────────

  async deactivate(
    companyId: string,
    id: string,
    resignedAt: string | undefined,
    requester: JwtPayload,
  ) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)

    if (!existing.isActive) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ALREADY_DEACTIVATED',
        message: '이미 퇴사 처리된 직원입니다.',
      })
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        isActive: false,
        resignedAt: resignedAt ? new Date(resignedAt) : new Date(),
      },
    })
  }

  // ── 기기 초기화 ─────────────────────────────────────────────────────────────

  async resetDevice(companyId: string, id: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)

    return this.prisma.employee.update({
      where: { id },
      data: { deviceId: null, deviceBoundAt: null },
    })
  }

  // ── 근로정보 이력 ───────────────────────────────────────────────────────────

  async findWageInfos(companyId: string, employeeId: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, employeeId)
    await this.guardOrgScope(requester, existing)

    return this.prisma.wageInfo.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
    })
  }

  // ── 근로정보 등록 ───────────────────────────────────────────────────────────

  async createWageInfo(
    companyId: string,
    employeeId: string,
    dto: CreateWageInfoDto,
    requester: JwtPayload,
  ) {
    const existing = await this.assertEmployee(companyId, employeeId)
    await this.guardOrgScope(requester, existing)

    return this.prisma.wageInfo.create({
      data: {
        employeeId,
        hourlyWage: dto.hourlyWage,
        contractedWorkDays: dto.contractedWorkDays,
        contractedHoursPerWeek: dto.contractedHoursPerWeek,
        weeklyPaidHolidayDay: dto.weeklyPaidHolidayDay ?? null,
        maxHoursPerWeek: dto.maxHoursPerWeek ?? 52,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
    })
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  /**
   * 직원 수정 권한 검증 (보안):
   * - 본인: 이름/전화번호만 수정 가능
   * - 타인: ORG_ADMIN 이상만 수정 가능
   * - accessLevel 변경: GENERAL_ADMIN 이상 + 본인 권한 변경 금지 + 자신과 같거나 높은 권한 부여 금지
   */
  private guardUpdatePermission(requester: JwtPayload, targetId: string, dto: UpdateEmployeeDto) {
    const requesterLevel = ACCESS_LEVEL_HIERARCHY[requester.accessLevel]
    const isSelf = requester.employeeId === targetId

    if (isSelf) {
      const SELF_EDITABLE_FIELDS = new Set(['name', 'phone'])
      const forbidden = Object.entries(dto)
        .filter(([key, value]) => value !== undefined && !SELF_EDITABLE_FIELDS.has(key))
        .map(([key]) => key)
      if (forbidden.length > 0) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_SELF_UPDATE_FORBIDDEN',
          message: `본인은 이름/전화번호만 수정할 수 있습니다. (불가 필드: ${forbidden.join(', ')})`,
        })
      }
      return
    }

    if (requesterLevel < ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]) {
      throw new ForbiddenException({
        code: 'EMPLOYEE_UPDATE_FORBIDDEN',
        message: '직원 정보 수정 권한이 없습니다.',
      })
    }

    if (dto.accessLevel !== undefined) {
      if (requesterLevel < ACCESS_LEVEL_HIERARCHY[AccessLevel.GENERAL_ADMIN]) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_ACCESS_LEVEL_FORBIDDEN',
          message: '권한 변경은 GENERAL_ADMIN 이상만 가능합니다.',
        })
      }
      if (ACCESS_LEVEL_HIERARCHY[dto.accessLevel] >= requesterLevel) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_ACCESS_LEVEL_ESCALATION',
          message: '자신과 같거나 높은 권한은 부여할 수 없습니다.',
        })
      }
    }
  }

  private async assertEmployee(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        organizations: { select: { organizationId: true } },
      },
    })
    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '직원을 찾을 수 없습니다.',
      })
    }
    return employee
  }

  /**
   * ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능하다.
   * GENERAL_ADMIN / SUPER_ADMIN은 전체 접근 허용.
   */
  async guardOrgScope(
    requester: JwtPayload,
    employee: { organizations: { organizationId: string }[] },
  ) {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return
    }

    const requesterOrgs = await this.prisma.employeeOrganization.findMany({
      where: { employeeId: requester.employeeId },
      select: { organizationId: true },
    })

    const requesterOrgIds = new Set(
      requesterOrgs.map((o: { organizationId: string }) => o.organizationId),
    )
    const targetOrgIds = employee.organizations.map((o) => o.organizationId)

    const hasOverlap = targetOrgIds.some((orgId) => requesterOrgIds.has(orgId))
    if (!hasOverlap) {
      throw new ForbiddenException('해당 직원에 대한 접근 권한이 없습니다.')
    }
  }

  /**
   * ORG_ADMIN의 경우 소속 조직 ID 목록 반환, 그 외 null 반환.
   */
  private async resolveOrgScope(requester: JwtPayload): Promise<string[] | null> {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return null
    }

    const orgs = await this.prisma.employeeOrganization.findMany({
      where: { employeeId: requester.employeeId },
      select: { organizationId: true },
    })

    return orgs.map((o: { organizationId: string }) => o.organizationId)
  }

  private async validateOrganizationsBelongToCompany(companyId: string, orgIds: string[]) {
    const count = await this.prisma.organization.count({
      where: { id: { in: orgIds }, companyId },
    })
    if (count !== orgIds.length) {
      throw new BadRequestException({
        code: 'INVALID_ORGANIZATION',
        message: '유효하지 않은 조직이 포함되어 있습니다.',
      })
    }
  }
}
