import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateFormCategoryDto, UpdateFormCategoryDto } from './dto/document-form.dto'

/**
 * AP-01 양식함 — 기안양식 분류(카테고리) 관리.
 * 목록은 전 직원, 생성/수정/삭제는 GENERAL_ADMIN.
 */
@Injectable()
export class FormCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.formCategory.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async create(companyId: string, dto: CreateFormCategoryDto) {
    return this.prisma.formCategory.create({
      data: { companyId, name: dto.name, sortOrder: dto.sortOrder },
    })
  }

  async update(companyId: string, id: string, dto: UpdateFormCategoryDto) {
    await this.assertBelongsToCompany(companyId, id)
    return this.prisma.formCategory.update({ where: { id }, data: dto })
  }

  async remove(companyId: string, id: string) {
    await this.assertBelongsToCompany(companyId, id)
    // 참조무결성: 이 분류를 사용하는 양식이 있으면 삭제 차단 (기초데이터 삭제 가드 정책)
    const formCount = await this.prisma.documentForm.count({
      where: { categoryId: id, companyId },
    })
    if (formCount > 0) {
      throw new ForbiddenException({
        code: 'FORM_CATEGORY_IN_USE',
        message: '이 분류를 사용하는 양식이 있어 삭제할 수 없습니다.',
      })
    }
    await this.prisma.formCategory.delete({ where: { id } })
    return { deleted: true }
  }

  private async assertBelongsToCompany(companyId: string, id: string) {
    const category = await this.prisma.formCategory.findFirst({ where: { id, companyId } })
    if (!category) {
      throw new NotFoundException({
        code: 'FORM_CATEGORY_NOT_FOUND',
        message: '양식 분류를 찾을 수 없습니다.',
      })
    }
    return category
  }
}
