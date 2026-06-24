import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateDocumentCategoryDto, UpdateDocumentCategoryDto } from './dto/document-form.dto'

/**
 * AP 문서성격(채번 대분류) 관리 — 사업관리/일반관리/인사관리/LABL CHINA 등.
 * 목록은 전 직원, 생성/수정/삭제는 GENERAL_ADMIN. 사용 중(문서 참조) 분류는 삭제 차단.
 */
@Injectable()
export class DocumentCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.documentCategory.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async create(companyId: string, dto: CreateDocumentCategoryDto) {
    await this.assertUnique(companyId, dto.name, dto.abbreviation)
    return this.prisma.documentCategory.create({
      data: {
        companyId,
        name: dto.name,
        abbreviation: dto.abbreviation,
        sortOrder: dto.sortOrder,
      },
    })
  }

  async update(companyId: string, id: string, dto: UpdateDocumentCategoryDto) {
    await this.assertBelongsToCompany(companyId, id)
    if (dto.name !== undefined || dto.abbreviation !== undefined) {
      await this.assertUnique(companyId, dto.name, dto.abbreviation, id)
    }
    // 멀티테넌시 방어: where에 companyId 포함
    return this.prisma.documentCategory.update({ where: { id, companyId }, data: dto })
  }

  async remove(companyId: string, id: string) {
    await this.assertBelongsToCompany(companyId, id)
    // 참조무결성: 이 성격을 사용하는 문서가 있으면 삭제 차단 (기초데이터 삭제 가드 정책)
    const docCount = await this.prisma.document.count({ where: { categoryId: id, companyId } })
    if (docCount > 0) {
      throw new ForbiddenException({
        code: 'DOCUMENT_CATEGORY_IN_USE',
        message: '이 문서성격을 사용하는 문서가 있어 삭제할 수 없습니다.',
      })
    }
    await this.prisma.documentCategory.delete({ where: { id, companyId } })
    return { deleted: true }
  }

  private async assertBelongsToCompany(companyId: string, id: string) {
    const category = await this.prisma.documentCategory.findFirst({ where: { id, companyId } })
    if (!category) {
      throw new NotFoundException({
        code: 'DOCUMENT_CATEGORY_NOT_FOUND',
        message: '문서성격을 찾을 수 없습니다.',
      })
    }
    return category
  }

  /** 같은 회사 내 이름·약어 중복 차단 (수정 시 자기 자신 제외) */
  private async assertUnique(
    companyId: string,
    name?: string,
    abbreviation?: string,
    excludeId?: string,
  ) {
    const or: Array<Record<string, string>> = []
    if (name !== undefined) or.push({ name })
    if (abbreviation !== undefined) or.push({ abbreviation })
    if (or.length === 0) return

    const existing = await this.prisma.documentCategory.findFirst({
      where: { companyId, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (existing) {
      throw new BadRequestException({
        code: 'DOCUMENT_CATEGORY_DUPLICATE',
        message: '같은 이름 또는 약어의 문서성격이 이미 있습니다.',
      })
    }
  }
}
