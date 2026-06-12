import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateStandardizationRuleDto,
  UpdateStandardizationRuleDto,
} from './dto/standardization-rule.dto'

// TODO(Wave 5): 리포트 계산(getRealtimeReport/스냅샷 생성)에 표준화 규칙
// (calculationBasis, startTimeRule/endTimeRule 반올림, excludeNoCheckin,
// includeManualBreak)을 반영할 것. 현재는 규칙 CRUD만 제공한다.
@Injectable()
export class StandardizationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.standardizationRule.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })
  }

  async create(companyId: string, dto: CreateStandardizationRuleDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.standardizationRule.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        })
      }
      return tx.standardizationRule.create({
        data: {
          companyId,
          name: dto.name,
          calculationBasis: dto.calculationBasis,
          startTimeRule: dto.startTimeRule,
          endTimeRule: dto.endTimeRule,
          positionId: dto.positionId ?? null,
          excludeNoCheckin: dto.excludeNoCheckin ?? false,
          includeManualBreak: dto.includeManualBreak ?? true,
          isDefault: dto.isDefault ?? false,
        },
      })
    })
  }

  async update(companyId: string, id: string, dto: UpdateStandardizationRuleDto) {
    await this.findOneOrThrow(companyId, id)

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.standardizationRule.updateMany({
          where: { companyId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }
      return tx.standardizationRule.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.calculationBasis !== undefined && {
            calculationBasis: dto.calculationBasis,
          }),
          ...(dto.startTimeRule !== undefined && {
            startTimeRule: dto.startTimeRule,
          }),
          ...(dto.endTimeRule !== undefined && { endTimeRule: dto.endTimeRule }),
          ...(dto.positionId !== undefined && {
            positionId: dto.positionId ?? null,
          }),
          ...(dto.excludeNoCheckin !== undefined && {
            excludeNoCheckin: dto.excludeNoCheckin,
          }),
          ...(dto.includeManualBreak !== undefined && {
            includeManualBreak: dto.includeManualBreak,
          }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      })
    })
  }

  async remove(companyId: string, id: string) {
    await this.findOneOrThrow(companyId, id)
    // isActive 컬럼이 있으므로 소프트 삭제
    return this.prisma.standardizationRule.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    })
  }

  private async findOneOrThrow(companyId: string, id: string) {
    const rule = await this.prisma.standardizationRule.findFirst({
      where: { id, companyId, isActive: true },
    })
    if (!rule) {
      throw new NotFoundException({
        code: 'STANDARDIZATION_RULE_NOT_FOUND',
        message: '표준화 규칙을 찾을 수 없습니다.',
      })
    }
    return rule
  }
}
