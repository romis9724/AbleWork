import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateCustomRequestTypeDto,
  UpdateCustomRequestTypeDto,
  CustomRequestTypeFieldDto,
} from './dto/custom-request-type.dto'

@Injectable()
export class CustomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.customRequestType.findMany({
      where: { companyId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  create(companyId: string, dto: CreateCustomRequestTypeDto) {
    return this.prisma.customRequestType.create({
      data: {
        companyId,
        name: dto.name,
        isActive: dto.isActive,
        enablePdf: dto.enablePdf,
        allowEmployeePdf: dto.allowEmployeePdf,
        fields: {
          create: dto.fields.map((f, index) => this.toFieldData(f, index)),
        },
      },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    })
  }

  async update(companyId: string, id: string, dto: UpdateCustomRequestTypeDto) {
    await this.findOneOrThrow(companyId, id)

    return this.prisma.$transaction(async (tx) => {
      // fields가 주어지면 전체 교체
      if (dto.fields !== undefined) {
        // 멀티테넌시: 관계 조건으로 companyId를 강제하여 타사 데이터 삭제 방지
        await tx.customRequestTypeField.deleteMany({
          where: { customTypeId: id, customType: { companyId } },
        })
        if (dto.fields.length > 0) {
          await tx.customRequestTypeField.createMany({
            data: dto.fields.map((f, index) => ({
              customTypeId: id,
              ...this.toFieldData(f, index),
            })),
          })
        }
      }

      return tx.customRequestType.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.enablePdf !== undefined && { enablePdf: dto.enablePdf }),
          ...(dto.allowEmployeePdf !== undefined && {
            allowEmployeePdf: dto.allowEmployeePdf,
          }),
        },
        include: { fields: { orderBy: { sortOrder: 'asc' } } },
      })
    })
  }

  async remove(companyId: string, id: string) {
    await this.findOneOrThrow(companyId, id)
    // isActive 컬럼이 있으므로 소프트 삭제
    return this.prisma.customRequestType.update({
      where: { id },
      data: { isActive: false },
    })
  }

  private toFieldData(field: CustomRequestTypeFieldDto, sortOrder: number) {
    return {
      fieldName: field.fieldName,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      options:
        field.options === undefined
          ? Prisma.JsonNull
          : (field.options as Prisma.InputJsonValue),
      description: field.description ?? null,
      imageUrl: field.imageUrl ?? null,
      sortOrder,
    }
  }

  private async findOneOrThrow(companyId: string, id: string) {
    const type = await this.prisma.customRequestType.findFirst({
      where: { id, companyId },
    })
    if (!type) {
      throw new NotFoundException({
        code: 'CUSTOM_REQUEST_TYPE_NOT_FOUND',
        message: '커스텀 요청 유형을 찾을 수 없습니다.',
      })
    }
    return type
  }
}
