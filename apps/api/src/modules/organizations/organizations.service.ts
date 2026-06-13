import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateOrganizationDto } from './dto/create-organization.dto'
import { UpdateOrganizationDto } from './dto/update-organization.dto'
import { OrganizationNode } from './organizations.types'

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findTree(companyId: string): Promise<OrganizationNode[]> {
    const orgs = await this.prisma.organization.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ depth: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    })

    return this.buildTree(orgs)
  }

  async create(companyId: string, dto: CreateOrganizationDto) {
    let depth = 0

    if (dto.parentId) {
      const parent = await this.prisma.organization.findFirst({
        where: { id: dto.parentId, companyId, isActive: true },
      })

      if (!parent) {
        throw new NotFoundException({
          code: 'ORG_PARENT_NOT_FOUND',
          message: '상위 조직을 찾을 수 없습니다.',
        })
      }

      depth = parent.depth + 1
    }

    return this.prisma.organization.create({
      data: {
        companyId,
        name: dto.name,
        parentId: dto.parentId ?? null,
        sortOrder: dto.sortOrder,
        approverId: dto.approverId ?? null,
        depth,
        isActive: true,
      },
    })
  }

  async update(id: string, companyId: string, dto: UpdateOrganizationDto) {
    await this.findOneOrThrow(id, companyId)

    let depth: number | undefined

    if (dto.parentId !== undefined) {
      if (dto.parentId === null) {
        depth = 0
      } else {
        const parent = await this.prisma.organization.findFirst({
          where: { id: dto.parentId, companyId, isActive: true },
        })

        if (!parent) {
          throw new NotFoundException({
            code: 'ORG_PARENT_NOT_FOUND',
            message: '상위 조직을 찾을 수 없습니다.',
          })
        }

        depth = parent.depth + 1
      }
    }

    return this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.approverId !== undefined && { approverId: dto.approverId }),
        ...(depth !== undefined && { depth }),
      },
    })
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.findOneOrThrow(id, companyId)

    const childCount = await this.prisma.organization.count({
      where: { parentId: id, companyId, isActive: true },
    })

    if (childCount > 0) {
      throw new ForbiddenException({
        code: 'ORG_HAS_CHILDREN',
        message: '하위 조직이 존재하여 삭제할 수 없습니다. 먼저 하위 조직을 삭제하세요.',
      })
    }

    // 이 조직에 배정된 활성 직원이 있으면 삭제 차단
    const employeeCount = await this.prisma.employeeOrganization.count({
      where: { organizationId: id, employee: { isActive: true } },
    })

    if (employeeCount > 0) {
      throw new ForbiddenException({
        code: 'ORG_HAS_EMPLOYEES',
        message:
          '소속 직원이 있어 조직을 삭제할 수 없습니다. 먼저 직원을 이동하세요.',
      })
    }

    // 이 조직의 출퇴근 장소가 있으면 삭제 차단
    const timeclockAreaCount = await this.prisma.timeclockArea.count({
      where: { organizationId: id, isActive: true },
    })

    if (timeclockAreaCount > 0) {
      throw new ForbiddenException({
        code: 'ORG_HAS_TIMECLOCK_AREAS',
        message: '출퇴근 장소가 있어 조직을 삭제할 수 없습니다.',
      })
    }

    // 이 조직의 근무일정이 있으면 삭제 차단
    const shiftCount = await this.prisma.shift.count({
      where: { organizationId: id },
    })

    if (shiftCount > 0) {
      throw new ForbiddenException({
        code: 'ORG_HAS_SHIFTS',
        message: '근무일정이 있어 조직을 삭제할 수 없습니다.',
      })
    }

    await this.prisma.organization.update({
      where: { id },
      data: { isActive: false },
    })
  }

  private async findOneOrThrow(id: string, companyId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id, companyId, isActive: true },
    })

    if (!org) {
      throw new NotFoundException({
        code: 'ORG_NOT_FOUND',
        message: '조직을 찾을 수 없습니다.',
      })
    }

    return org
  }

  buildTree(
    orgs: Omit<OrganizationNode, 'children'>[],
    parentId: string | null = null,
  ): OrganizationNode[] {
    return orgs
      .filter((org) => org.parentId === parentId)
      .map((org) => ({
        ...org,
        children: this.buildTree(orgs, org.id),
      }))
  }
}
