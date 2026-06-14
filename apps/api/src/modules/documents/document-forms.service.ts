import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateDocumentFormDto,
  UpdateDocumentFormDto,
  UpsertNumberRuleDto,
} from './dto/document-form.dto'

/**
 * AP — 기안 양식 관리 + 양식별 문서번호 채번 규칙 (Goal 11)
 */
@Injectable()
export class DocumentFormsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 양식 목록 (전 직원) ──────────────────────────────────────────────────────

  async findAll(companyId: string) {
    return this.prisma.documentForm.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  // ── 양식 생성 (GENERAL_ADMIN) ────────────────────────────────────────────────

  async create(companyId: string, dto: CreateDocumentFormDto) {
    await this.assertDefaultLineValid(companyId, dto.defaultLineId)
    return this.prisma.documentForm.create({
      data: {
        companyId,
        name: dto.name,
        category: dto.category ?? null,
        fieldsSchema: dto.fieldsSchema as Prisma.InputJsonValue,
        defaultLineId: dto.defaultLineId ?? null,
        sortOrder: dto.sortOrder,
        allowReDraft: dto.allowReDraft,
        allowPreApproval: dto.allowPreApproval,
      },
    })
  }

  // ── 양식 수정 ────────────────────────────────────────────────────────────────

  async update(companyId: string, formId: string, dto: UpdateDocumentFormDto) {
    await this.assertFormBelongsToCompany(companyId, formId)
    if (dto.defaultLineId !== undefined) {
      await this.assertDefaultLineValid(companyId, dto.defaultLineId)
    }

    const { fieldsSchema, ...rest } = dto
    return this.prisma.documentForm.update({
      where: { id: formId },
      data: {
        ...rest,
        ...(fieldsSchema !== undefined && {
          fieldsSchema: fieldsSchema as Prisma.InputJsonValue,
        }),
      },
    })
  }

  // ── 양식 삭제 (소프트 isActive=false) ────────────────────────────────────────

  async remove(companyId: string, formId: string) {
    await this.assertFormBelongsToCompany(companyId, formId)

    // 참조무결성: 이 양식으로 작성된 문서가 있으면 삭제 차단.
    // (Document.form은 onDelete: Cascade라 hard-delete 시 문서가 연쇄 삭제될 위험도 함께 방지)
    const docCount = await this.prisma.document.count({ where: { formId, companyId } })
    if (docCount > 0) {
      throw new ForbiddenException({
        code: 'FORM_IN_USE',
        message: '이 양식으로 작성된 문서가 있어 삭제할 수 없습니다.',
      })
    }

    await this.prisma.documentForm.update({
      where: { id: formId },
      data: { isActive: false },
    })

    return { deleted: true }
  }

  // ── 문서번호 채번 규칙 조회 ──────────────────────────────────────────────────

  async getNumberRule(companyId: string, formId: string) {
    await this.assertFormBelongsToCompany(companyId, formId)

    return this.prisma.documentNumberRule.findFirst({
      where: { companyId, formId },
    })
  }

  // ── 문서번호 채번 규칙 upsert (양식당 1개) ───────────────────────────────────

  async upsertNumberRule(companyId: string, formId: string, dto: UpsertNumberRuleDto) {
    await this.assertFormBelongsToCompany(companyId, formId)

    const existing = await this.prisma.documentNumberRule.findFirst({
      where: { companyId, formId },
    })

    if (existing) {
      return this.prisma.documentNumberRule.update({
        where: { id: existing.id },
        data: { pattern: dto.pattern, resetYearly: dto.resetYearly },
      })
    }

    return this.prisma.documentNumberRule.create({
      data: { companyId, formId, pattern: dto.pattern, resetYearly: dto.resetYearly },
    })
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

  /** 양식별 기본 결재선이 지정된 경우 자사 공용 결재선인지 검증 (AP-01-03) */
  private async assertDefaultLineValid(companyId: string, defaultLineId?: string | null) {
    if (!defaultLineId) return
    const line = await this.prisma.sharedApprovalLine.findFirst({
      where: { id: defaultLineId, companyId },
      select: { id: true },
    })
    if (!line) {
      throw new NotFoundException({
        code: 'SHARED_LINE_NOT_FOUND',
        message: '기본 결재선으로 지정한 공용 결재선을 찾을 수 없습니다.',
      })
    }
  }

  /** 양식이 해당 회사 소속인지 검증 — 멀티테넌시 */
  private async assertFormBelongsToCompany(companyId: string, formId: string) {
    const form = await this.prisma.documentForm.findFirst({
      where: { id: formId, companyId },
    })
    if (!form) {
      throw new NotFoundException({
        code: 'FORM_NOT_FOUND',
        message: '기안 양식을 찾을 수 없습니다.',
      })
    }
    return form
  }
}
