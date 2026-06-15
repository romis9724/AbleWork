import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { CompanySettingsService } from '../companies/company-settings.service'
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
    private readonly settingsService: CompanySettingsService,
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
    const { email, initialPassword, organizationIds, primaryOrganizationId, positionIds, joinedAt, ...rest } =
      dto

    // 조직이 같은 회사 소속인지 확인
    await this.validateOrganizationsBelongToCompany(companyId, organizationIds)

    // 초기 비밀번호가 있으면 즉시 로그인 가능한 활성 계정을 만든다.
    // 없으면 비활성 계정으로 생성하고, 추후 비밀번호 재설정으로 활성화한다.
    const passwordHash = initialPassword ? await bcrypt.hash(initialPassword, 10) : ''

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // User 조회 또는 신규 생성
      let user = await tx.user.findUnique({ where: { email } })
      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            passwordHash,
            name: rest.name,
            isActive: Boolean(initialPassword), // 비밀번호 설정 시에만 활성
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

      // 직원 등록 도메인 이벤트 (감사/알림 확장용)
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

    // 본인 수정(이름/전화번호)은 권한 설정의 영향을 받지 않는다
    if (requester.employeeId !== id) {
      await this.guardOrgAdminManagePermission(requester)
    }

    const { organizationIds, primaryOrganizationId, positionIds, joinedAt, resignedAt, ...rest } = dto

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const employee = await tx.employee.update({
        where: { id },
        data: {
          ...rest,
          // date-only 문자열(YYYY-MM-DD)은 Prisma에 그대로 넘기면 실패하므로 Date로 변환
          ...(joinedAt !== undefined && { joinedAt: new Date(joinedAt) }),
          ...(resignedAt !== undefined && {
            resignedAt: resignedAt === null ? null : new Date(resignedAt),
          }),
        },
      })

      // 이름/전화번호 변경 시 연결된 User 계정 정보도 동기화 (프로필 일관성)
      if (existing.userId && (rest.name !== undefined || rest.phone !== undefined)) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(rest.name !== undefined && { name: rest.name }),
            ...(rest.phone !== undefined && { phone: rest.phone }),
          },
        })
      }

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
    await this.guardOrgAdminManagePermission(requester)

    if (!existing.isActive) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ALREADY_DEACTIVATED',
        message: '이미 퇴사 처리된 직원입니다.',
      })
    }

    // 미결 결재가 있는 직원은 퇴사 처리 전 결재를 먼저 위임/처리해야 한다 (결재 정합성)
    const pendingApprovals = await this.prisma.approvalStep.count({
      where: { assigneeId: id, status: { in: ['PENDING', 'WAITING'] } },
    })
    if (pendingApprovals > 0) {
      throw new ForbiddenException({
        code: 'EMPLOYEE_HAS_PENDING_APPROVALS',
        message: '미결 결재가 있어 퇴사 처리할 수 없습니다. 결재를 먼저 위임/처리하세요.',
      })
    }

    // isActive=false 설정과 조직 결재자 해제를 하나의 트랜잭션으로 묶는다 (원자성)
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 비활성 직원이 조직 결재자로 남지 않도록 approverId를 해제한다
      await tx.organization.updateMany({
        where: { approverId: id, companyId },
        data: { approverId: null },
      })

      return tx.employee.update({
        where: { id },
        data: {
          isActive: false,
          resignedAt: resignedAt ? new Date(resignedAt) : new Date(),
        },
      })
    })
  }

  // ── 재활성화 ────────────────────────────────────────────────────────────────

  async activate(companyId: string, id: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    await this.guardOrgAdminManagePermission(requester)

    if (existing.isActive) {
      throw new BadRequestException({
        code: 'EMPLOYEE_ALREADY_ACTIVE',
        message: '이미 재직 중인 직원입니다.',
      })
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        isActive: true,
        resignedAt: null,
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

  // ── 비밀번호 재설정 (관리자가 직원 로그인 자격 발급/초기화) ──────────────────

  /**
   * 관리자가 직원의 로그인 비밀번호를 설정/재설정한다.
   * 연결된 User 계정을 활성화하여 즉시 로그인 가능하게 한다.
   * 권한: GENERAL_ADMIN 이상은 무조건, ORG_ADMIN은 조직 스코프 + 관리 권한 설정이 켜진 경우.
   */
  async resetPassword(companyId: string, id: string, newPassword: string, requester: JwtPayload) {
    const existing = await this.assertEmployee(companyId, id)
    await this.guardOrgScope(requester, existing)
    await this.guardOrgAdminManagePermission(requester)

    if (!existing.userId) {
      throw new BadRequestException({
        code: 'EMPLOYEE_USER_NOT_FOUND',
        message: '로그인 계정이 연결되지 않은 직원입니다.',
      })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.prisma.user.update({
      where: { id: existing.userId },
      data: { passwordHash, isActive: true },
    })

    return { success: true }
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

  /**
   * 권한 설정(permission.org_admin_can_manage_employees, 기본 true)이 꺼져 있으면
   * ORG_ADMIN의 직원 추가/수정/퇴사 처리를 차단한다.
   */
  private async guardOrgAdminManagePermission(requester: JwtPayload) {
    if (requester.accessLevel !== AccessLevel.ORG_ADMIN) return

    const canManage = await this.settingsService.get<boolean>(
      requester.companyId,
      'permission',
      'org_admin_can_manage_employees',
      true,
    )

    if (canManage === false) {
      throw new ForbiddenException({
        code: 'EMPLOYEE_MANAGE_PERMISSION_DENIED',
        message: '조직관리자의 직원 관리 권한이 비활성화되어 있습니다.',
      })
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
