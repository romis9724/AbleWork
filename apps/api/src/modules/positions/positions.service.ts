import { Injectable, NotFoundException } from '@nestjs/common'
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

    return this.prisma.position.update({
      where: { id },
      data: dto,
    })
  }

  // ── 소프트 삭제 ─────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    await this.assertPosition(companyId, id)

    return this.prisma.position.update({
      where: { id },
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
        message: '직무를 찾을 수 없습니다.',
      })
    }
    return position
  }
}
