import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreatePositionDto } from './dto/create-position.dto'
import { UpdatePositionDto } from './dto/create-position.dto'

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 목록 ────────────────────────────────────────────────────────────────────

  async findAll(companyId: string) {
    return this.prisma.position.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  // ── 생성 ────────────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreatePositionDto) {
    return this.prisma.position.create({
      data: {
        companyId,
        name: dto.name,
        color: dto.color ?? null,
        sortOrder: dto.sortOrder,
      },
    })
  }

  // ── 수정 ────────────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdatePositionDto) {
    await this.assertPosition(companyId, id)

    // 멀티테넌시 방어: where에 companyId 포함 (assertPosition 우회 시에도 타사 수정 차단)
    return this.prisma.position.update({
      where: { id, companyId },
      data: dto,
    })
  }

  // ── 정렬 순서 변경 ──────────────────────────────────────────────────────────

  // ids 배열의 순서대로 sortOrder(0..n)를 재설정한다.
  async reorder(companyId: string, ids: string[]) {
    const uniqueIds = Array.from(new Set(ids))

    // 멀티테넌시 방어: 모든 id가 자사 활성 직위인지 검증
    const count = await this.prisma.position.count({
      where: { id: { in: uniqueIds }, companyId, isActive: true },
    })
    if (count !== uniqueIds.length) {
      throw new BadRequestException({
        code: 'POSITION_NOT_FOUND',
        message: '정렬 대상 중 자사 직위가 아닌 항목이 있습니다.',
      })
    }

    await this.prisma.$transaction(
      uniqueIds.map((id, i) =>
        this.prisma.position.update({
          where: { id, companyId },
          data: { sortOrder: i },
        }),
      ),
    )

    return this.findAll(companyId)
  }

  // ── 소프트 삭제 ─────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    await this.assertPosition(companyId, id)

    // 참조무결성: 활성 직원에게 배정된 직위는 삭제 차단
    // (employee 관계를 통해 companyId까지 검증하여 멀티테넌시 방어)
    const inUseCount = await this.prisma.employeePosition.count({
      where: { positionId: id, employee: { companyId, isActive: true } },
    })
    if (inUseCount > 0) {
      throw new ForbiddenException({
        code: 'POSITION_IN_USE',
        message: '이 직위가 배정된 직원이 있어 삭제할 수 없습니다.',
      })
    }

    return this.prisma.position.update({
      where: { id, companyId },
      data: { isActive: false },
    })
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  private async assertPosition(companyId: string, id: string) {
    const position = await this.prisma.position.findFirst({
      where: { id, companyId },
    })
    if (!position) {
      throw new NotFoundException({
        code: 'POSITION_NOT_FOUND',
        message: '직위를 찾을 수 없습니다.',
      })
    }
    return position
  }
}
