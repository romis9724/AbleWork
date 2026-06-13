import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { z } from 'zod'

export const CreateShiftTypeSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.string().default('REGULAR'),
  color: z.string().optional(),
  isOvertime: z.boolean().default(false),
  isNight: z.boolean().default(false),
  isHoliday: z.boolean().default(false),
  isDeemedWork: z.boolean().default(false),
  deemedWorkHours: z.number().optional(),
  noClockInRequired: z.boolean().default(false),
  confirmedAlert: z.string().optional(),
  orgScopeIds: z.array(z.string()).optional(),
  positionScopeIds: z.array(z.string()).optional(),
})

export type CreateShiftTypeDto = z.infer<typeof CreateShiftTypeSchema>

export const UpdateShiftTypeSchema = CreateShiftTypeSchema.partial()
export type UpdateShiftTypeDto = z.infer<typeof UpdateShiftTypeSchema>

@Injectable()
export class ShiftTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.shiftType.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    })
  }

  create(companyId: string, dto: CreateShiftTypeDto) {
    return this.prisma.shiftType.create({
      data: { companyId, ...dto },
    })
  }

  async update(companyId: string, id: string, dto: UpdateShiftTypeDto) {
    await this.findOneOrThrow(companyId, id)
    return this.prisma.shiftType.update({ where: { id, companyId }, data: dto })
  }

  async remove(companyId: string, id: string) {
    await this.findOneOrThrow(companyId, id)

    // 참조무결성: 이 근무유형을 사용하는 활성 템플릿이 있으면 삭제 차단
    const templateCount = await this.prisma.shiftTemplate.count({
      where: { shiftTypeId: id, isActive: true },
    })
    if (templateCount > 0) {
      throw new ForbiddenException({
        code: 'SHIFT_TYPE_IN_USE',
        message: '이 근무유형을 사용하는 템플릿이 있어 삭제할 수 없습니다.',
      })
    }

    // 참조무결성: 이 근무유형을 사용하는 근무일정(shift)이 있으면 삭제 차단
    const shiftCount = await this.prisma.shift.count({
      where: { shiftTypeId: id },
    })
    if (shiftCount > 0) {
      throw new ForbiddenException({
        code: 'SHIFT_TYPE_IN_USE',
        message: '이 근무유형을 사용하는 근무일정이 있어 삭제할 수 없습니다.',
      })
    }

    return this.prisma.shiftType.update({ where: { id, companyId }, data: { isActive: false } })
  }

  private async findOneOrThrow(companyId: string, id: string) {
    const type = await this.prisma.shiftType.findFirst({ where: { id, companyId } })
    if (!type) throw new NotFoundException({ code: 'SHIFT_TYPE_NOT_FOUND', message: '근무일정 유형을 찾을 수 없습니다.' })
    return type
  }
}
