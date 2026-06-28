import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateDocumentFormDto,
  UpdateDocumentFormDto,
  UpsertNumberRuleDto,
  CreateFormAccessRuleDto,
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
    await this.assertFormOwnerValid(companyId, dto.formOwnerId)
    await this.assertCategoryValid(companyId, dto.categoryId)
    return this.prisma.documentForm.create({
      data: {
        companyId,
        name: dto.name,
        category: dto.category ?? null,
        categoryId: dto.categoryId ?? null,
        fieldsSchema: dto.fieldsSchema as Prisma.InputJsonValue,
        visibilityScope: dto.visibilityScope,
        retentionYears: dto.retentionYears ?? null,
        abbreviation: dto.abbreviation ?? null,
        description: dto.description ?? null,
        defaultLineId: dto.defaultLineId ?? null,
        formOwnerId: dto.formOwnerId ?? null,
        allowZipUpload: dto.allowZipUpload,
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
    if (dto.formOwnerId !== undefined) {
      await this.assertFormOwnerValid(companyId, dto.formOwnerId)
    }
    if (dto.categoryId !== undefined) {
      await this.assertCategoryValid(companyId, dto.categoryId)
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

  // ── AP-01-07 양식 접근규칙 (조직/직위 단위 작성 권한) ─────────────────────────

  async getAccessRules(companyId: string, formId: string) {
    await this.assertFormBelongsToCompany(companyId, formId)
    return this.prisma.formAccessRule.findMany({ where: { formId } })
  }

  async createAccessRule(companyId: string, formId: string, dto: CreateFormAccessRuleDto) {
    await this.assertFormBelongsToCompany(companyId, formId)
    await this.assertScopeBelongsToCompany(companyId, dto.scopeType, dto.scopeId)
    return this.prisma.formAccessRule.create({
      data: { formId, scopeType: dto.scopeType, scopeId: dto.scopeId },
    })
  }

  async deleteAccessRule(companyId: string, formId: string, ruleId: string) {
    await this.assertFormBelongsToCompany(companyId, formId)
    // 멀티테넌시: 규칙이 해당 양식 소속인지 확인 후 삭제
    const rule = await this.prisma.formAccessRule.findFirst({ where: { id: ruleId, formId } })
    if (!rule) {
      throw new NotFoundException({
        code: 'FORM_ACCESS_RULE_NOT_FOUND',
        message: '양식 접근규칙을 찾을 수 없습니다.',
      })
    }
    await this.prisma.formAccessRule.delete({ where: { id: ruleId } })
    return { deleted: true }
  }

  /**
   * 양식 작성 권한 검증 (enforcement) — 접근규칙이 없으면 전체 허용,
   * 규칙이 있으면 사용자의 조직/직위가 하나라도 매칭되어야 한다(OR).
   */
  async assertCanUseForm(
    companyId: string,
    formId: string,
    user: { employeeId: string },
  ): Promise<void> {
    const rules = await this.prisma.formAccessRule.findMany({ where: { formId } })
    if (rules.length === 0) {
      // 규칙 없음: 공개(PUBLIC)면 전체 허용(기존 동작), 부서공개/비공개면 양식 담당자만 작성 가능
      const form = await this.prisma.documentForm.findFirst({
        where: { id: formId, companyId },
        select: { visibilityScope: true, formOwnerId: true },
      })
      if (!form || form.visibilityScope === 'PUBLIC') return
      if (form.formOwnerId === user.employeeId) return
      throw new ForbiddenException({
        code: 'FORM_ACCESS_DENIED',
        message: '제한 공개 양식입니다. 접근 권한(부서/직위)이 지정되어야 작성할 수 있습니다.',
      })
    }

    const orgIds = rules.filter((r) => r.scopeType === 'ORGANIZATION').map((r) => r.scopeId)
    const posIds = rules.filter((r) => r.scopeType === 'POSITION').map((r) => r.scopeId)

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: user.employeeId,
        companyId,
        OR: [
          ...(orgIds.length ? [{ organizations: { some: { organizationId: { in: orgIds } } } }] : []),
          ...(posIds.length ? [{ positions: { some: { positionId: { in: posIds } } } }] : []),
        ],
      },
      select: { id: true },
    })
    if (!employee) {
      throw new ForbiddenException({
        code: 'FORM_ACCESS_DENIED',
        message: '이 양식을 작성할 권한이 없습니다.',
      })
    }
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

  /** 양식 분류(categoryId)가 지정된 경우 자사 양식함인지 검증 (AP-01) */
  private async assertCategoryValid(companyId: string, categoryId?: string | null) {
    if (!categoryId) return
    const category = await this.prisma.formCategory.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    })
    if (!category) {
      throw new NotFoundException({
        code: 'FORM_CATEGORY_NOT_FOUND',
        message: '지정한 양식 분류를 찾을 수 없습니다.',
      })
    }
  }

  /** 양식 담당자(formOwnerId)가 지정된 경우 자사 직원인지 검증 (AP-01-07) */
  private async assertFormOwnerValid(companyId: string, formOwnerId?: string | null) {
    if (!formOwnerId) return
    const employee = await this.prisma.employee.findFirst({
      where: { id: formOwnerId, companyId },
      select: { id: true },
    })
    if (!employee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '양식 담당자로 지정한 직원을 찾을 수 없습니다.',
      })
    }
  }

  /** 접근규칙 scope(조직/직위)가 자사 소속인지 검증 */
  private async assertScopeBelongsToCompany(
    companyId: string,
    scopeType: string,
    scopeId: string,
  ) {
    const exists =
      scopeType === 'ORGANIZATION'
        ? await this.prisma.organization.findFirst({ where: { id: scopeId, companyId }, select: { id: true } })
        : await this.prisma.position.findFirst({ where: { id: scopeId, companyId }, select: { id: true } })
    if (!exists) {
      throw new NotFoundException({
        code: 'FORM_ACCESS_SCOPE_NOT_FOUND',
        message: '접근규칙 대상(조직/직위)을 찾을 수 없습니다.',
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
