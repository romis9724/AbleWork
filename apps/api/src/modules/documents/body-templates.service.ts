import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateBodyTemplateDto, UpdateBodyTemplateDto } from './dto/document-form.dto'

/**
 * AP — 기안 본문 템플릿 관리.
 * 기안양식 등록 시 "기본 본문"을 빠르게 채우기 위한 회사 공용 템플릿.
 * 목록은 전 직원, 생성/수정/삭제는 GENERAL_ADMIN. 양식은 템플릿 내용을 복사해 쓰므로 삭제 시 참조 가드 불필요.
 */
@Injectable()
export class BodyTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.bodyTemplate.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async create(companyId: string, dto: CreateBodyTemplateDto) {
    return this.prisma.bodyTemplate.create({
      data: { companyId, name: dto.name, content: dto.content, sortOrder: dto.sortOrder },
    })
  }

  async update(companyId: string, id: string, dto: UpdateBodyTemplateDto) {
    await this.assertBelongsToCompany(companyId, id)
    return this.prisma.bodyTemplate.update({ where: { id }, data: dto })
  }

  async remove(companyId: string, id: string) {
    await this.assertBelongsToCompany(companyId, id)
    // 멀티테넌시 방어: where에 companyId 포함
    await this.prisma.bodyTemplate.delete({ where: { id, companyId } })
    return { deleted: true }
  }

  private async assertBelongsToCompany(companyId: string, id: string) {
    const template = await this.prisma.bodyTemplate.findFirst({ where: { id, companyId } })
    if (!template) {
      throw new NotFoundException({
        code: 'BODY_TEMPLATE_NOT_FOUND',
        message: '본문 템플릿을 찾을 수 없습니다.',
      })
    }
    return template
  }
}
