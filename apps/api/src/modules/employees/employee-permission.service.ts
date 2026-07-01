import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from '@ablework/shared-constants'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from '../companies/company-settings.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { UpdateEmployeeDto } from './dto/update-employee.dto'

/**
 * 직원 권한·조직 스코프 가드 (god file 분할 · 항목 24).
 * 수정 권한·ORG_ADMIN 관리 권한·조직 경계(멀티테넌시 방어선) 검증을 모은다.
 */
@Injectable()
export class EmployeePermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: CompanySettingsService,
  ) {}

  /**
   * 직원 수정 권한 검증 (보안):
   * - 본인: 이름/전화번호만 수정 가능
   * - 타인: ORG_ADMIN 이상만 수정 가능
   * - accessLevel 변경: GENERAL_ADMIN 이상 + 본인 권한 변경 금지 + 자신과 같거나 높은 권한 부여 금지
   */
  guardUpdatePermission(
    requester: JwtPayload,
    targetId: string,
    dto: UpdateEmployeeDto,
    currentAccessLevel?: string,
  ) {
    const requesterLevel = ACCESS_LEVEL_HIERARCHY[requester.accessLevel]
    const isSelf = requester.employeeId === targetId

    if (isSelf) {
      // 본인 권한(accessLevel)을 현재와 다른 값으로 바꾸려는 시도는 권한 셀프 상승 위험 — 항상 금지
      if (dto.accessLevel !== undefined && dto.accessLevel !== currentAccessLevel) {
        throw new ForbiddenException({
          code: 'EMPLOYEE_SELF_LEVEL_FORBIDDEN',
          message: '본인의 권한(액세스 레벨)은 변경할 수 없습니다.',
        })
      }
      // 관리자(ORG_ADMIN 이상)는 본인의 관리 정보(조직·직위·고용형태 등)도 수정 가능.
      // 일반 직원은 셀프서비스로 이름/전화번호만 수정 가능.
      if (requesterLevel < ACCESS_LEVEL_HIERARCHY[AccessLevel.ORG_ADMIN]) {
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
  async guardOrgAdminManagePermission(requester: JwtPayload) {
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

  async assertEmployee(companyId: string, id: string) {
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
   * SUPER_ADMIN / GENERAL_ADMIN은 전체 접근 허용.
   * ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능하다.
   * EMPLOYEE는 본인 레코드만 접근 가능하다(동료 PII/임금 열람 차단).
   */
  async guardOrgScope(
    requester: JwtPayload,
    employee: { id: string; organizations: { organizationId: string }[] },
  ) {
    if (
      requester.accessLevel === AccessLevel.SUPER_ADMIN ||
      requester.accessLevel === AccessLevel.GENERAL_ADMIN
    ) {
      return
    }

    if (requester.accessLevel === AccessLevel.EMPLOYEE) {
      if (requester.employeeId !== employee.id) {
        throw new ForbiddenException('해당 직원에 대한 접근 권한이 없습니다.')
      }
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
  async resolveOrgScope(requester: JwtPayload): Promise<string[] | null> {
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

  async validateOrganizationsBelongToCompany(companyId: string, orgIds: string[]) {
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
