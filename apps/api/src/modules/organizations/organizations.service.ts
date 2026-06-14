import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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
        docManagerId: dto.docManagerId ?? null,
        address: dto.address ?? null,
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

        // 자기 자신/하위 조직을 상위로 지정하면 계층에 순환이 발생 → 차단
        await this.assertNoParentCycle(id, dto.parentId, companyId)

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
        ...(dto.docManagerId !== undefined && { docManagerId: dto.docManagerId }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(depth !== undefined && { depth }),
      },
    })
  }

  // ── AP-04-07 부서 문서담당자 (다중) ────────────────────────────────────────────

  /** 부서 문서담당자 목록 (sortOrder 순 — 첫 번째가 대표) */
  async getDocManagers(companyId: string, orgId: string) {
    await this.findOneOrThrow(orgId, companyId)
    return this.prisma.organizationDocManager.findMany({
      where: { organizationId: orgId },
      orderBy: { sortOrder: 'asc' },
      select: { employeeId: true, sortOrder: true, employee: { select: { id: true, name: true } } },
    })
  }

  /**
   * 부서 문서담당자 집합을 employeeIds(순서=우선순위)로 교체한다.
   * 첫 번째를 대표로 보고 레거시 docManagerId도 동기화(없으면 null).
   */
  async setDocManagers(companyId: string, orgId: string, employeeIds: string[]) {
    await this.findOneOrThrow(orgId, companyId)

    const uniqueIds = Array.from(new Set(employeeIds))
    if (uniqueIds.length) {
      const count = await this.prisma.employee.count({
        where: { id: { in: uniqueIds }, companyId },
      })
      if (count !== uniqueIds.length) {
        throw new BadRequestException({
          code: 'EMPLOYEE_NOT_FOUND',
          message: '문서담당자 중 자사 소속이 아닌 직원이 있습니다.',
        })
      }
    }

    await this.prisma.$transaction(// eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      await tx.organizationDocManager.deleteMany({ where: { organizationId: orgId } })
      if (uniqueIds.length) {
        await tx.organizationDocManager.createMany({
          data: uniqueIds.map((employeeId, i) => ({ organizationId: orgId, employeeId, sortOrder: i })),
        })
      }
      // 레거시 단일 docManagerId = 대표(첫 번째) 담당자로 동기화
      await tx.organization.update({
        where: { id: orgId },
        data: { docManagerId: uniqueIds[0] ?? null },
      })
    })

    return this.getDocManagers(companyId, orgId)
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

  /**
   * 조직 계층 순환 참조 방지.
   * `id`의 상위를 `parentId`로 바꿀 때, `parentId`의 조상 체인을 거슬러 올라가며
   * `id`를 만나면(= 자기 자신이거나 `id`의 하위 조직) 순환이므로 차단한다.
   * 데이터 손상 대비로 탐색 깊이에 상한(MAX_DEPTH)을 둔다.
   */
  private async assertNoParentCycle(
    id: string,
    parentId: string,
    companyId: string,
  ): Promise<void> {
    const MAX_DEPTH = 100
    let cursor: string | null = parentId
    let steps = 0

    while (cursor && steps < MAX_DEPTH) {
      const currentId: string = cursor

      if (currentId === id) {
        throw new BadRequestException({
          code: 'ORG_PARENT_CYCLE',
          message:
            '조직 계층에 순환이 발생합니다. 자기 자신 또는 하위 조직을 상위 조직으로 지정할 수 없습니다.',
        })
      }

      const node: { parentId: string | null } | null =
        await this.prisma.organization.findFirst({
          where: { id: currentId, companyId },
          select: { parentId: true },
        })

      cursor = node?.parentId ?? null
      steps++
    }
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
