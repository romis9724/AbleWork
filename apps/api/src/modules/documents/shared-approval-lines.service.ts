import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  CreateSharedLineDto,
  UpdateSharedLineDto,
  SharedLineFilterDto,
} from './dto/document-form.dto'
import { StepInput } from './dto/document.dto'
import { StepRole } from './documents.constants'

/** 협조 역할 — 최종결재자가 동시에 협조자로 지정되는 것을 금지 */
const COLLAB_ROLES: string[] = [StepRole.AGREEMENT, StepRole.DEPT_COLLABORATOR]

/**
 * AP — 공용 결재선 (Goal 11)
 * steps는 SharedApprovalLine.steps Json 컬럼에 [{role, assigneeId, stepOrder}] 형태로 저장한다.
 */
@Injectable()
export class SharedApprovalLinesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 공용 결재선 목록 — 결재선명(name)·작성자(createdBy)·작성일(createdAt)은 DB where로,
   * 결재자(approver)는 steps Json 내부라 직접 필터가 불가하여 후처리(in-memory)로 거른다.
   * 공용 결재선은 회사당 소수이므로 후처리 비용은 무시할 수준이다.
   */
  async findAll(companyId: string, filter: SharedLineFilterDto = {}) {
    const { search, author, approver, dateFrom, dateTo } = filter

    // 결재자명/사번 → 자사 직원 id 집합 (steps 후처리용)
    let approverIds: Set<string> | undefined
    if (approver) {
      const emps = await this.prisma.employee.findMany({
        where: {
          companyId,
          OR: [{ name: { contains: approver } }, { employeeNumber: { contains: approver } }],
        },
        select: { id: true },
      })
      // 매칭되는 직원이 없으면 결재자 조건을 만족하는 결재선도 없음
      if (emps.length === 0) return []
      approverIds = new Set(emps.map((e) => e.id))
    }

    const lines = await this.prisma.sharedApprovalLine.findMany({
      where: {
        companyId,
        ...(search ? { name: { contains: search } } : {}),
        ...(author
          ? {
              createdBy: {
                is: {
                  OR: [
                    { name: { contains: author } },
                    { employeeNumber: { contains: author } },
                  ],
                },
              },
            }
          : {}),
        ...this.buildCreatedAtRange(dateFrom, dateTo),
      },
      orderBy: { name: 'asc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    if (!approverIds) return lines

    // 결재자 필터: steps Json의 assigneeId가 매칭 직원 집합에 포함된 결재선만
    return lines.filter((line) => {
      const steps = (line.steps as Array<{ assigneeId?: string | null }>) ?? []
      return steps.some((s) => s.assigneeId != null && approverIds.has(s.assigneeId))
    })
  }

  /** 작성일(createdAt) 범위 where 절 — KST 기준, dateTo는 그날 끝까지 포함 */
  private buildCreatedAtRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return {}
    const createdAt: { gte?: Date; lte?: Date } = {}
    if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000+09:00`)
    if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999+09:00`)
    return { createdAt }
  }

  async create(companyId: string, dto: CreateSharedLineDto, createdById: string) {
    await this.assertAssigneesInCompany(companyId, dto.steps)
    this.assertNoFinalApproverConflict(dto.steps)
    await this.assertNameUnique(companyId, dto.name)

    return this.prisma.sharedApprovalLine.create({
      data: { companyId, name: dto.name, steps: dto.steps, createdById },
    })
  }

  async update(companyId: string, lineId: string, dto: UpdateSharedLineDto) {
    await this.assertLineBelongsToCompany(companyId, lineId)

    if (dto.steps) {
      await this.assertAssigneesInCompany(companyId, dto.steps)
      this.assertNoFinalApproverConflict(dto.steps)
    }
    if (dto.name !== undefined) {
      await this.assertNameUnique(companyId, dto.name, lineId)
    }

    return this.prisma.sharedApprovalLine.update({
      // 멀티테넌시 방어: assertLineBelongsToCompany 우회 시에도 타 회사 라인 수정 차단
      where: { id: lineId, companyId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        // steps 변경 시 version 증가 — 변경 이력 추적 (SYSTEM_DESIGN §5.3.8)
        ...(dto.steps && { steps: dto.steps, version: { increment: 1 } }),
      },
    })
  }

  async remove(companyId: string, lineId: string) {
    await this.assertLineBelongsToCompany(companyId, lineId)

    try {
      // 멀티테넌시 방어: where에 companyId 포함 — 타 회사 라인 삭제 차단
      await this.prisma.sharedApprovalLine.delete({ where: { id: lineId, companyId } })
    } catch (error: unknown) {
      // P2003: 기존 문서의 ApprovalLine이 참조 중 — 삭제 불가
      if ((error as { code?: string }).code === 'P2003') {
        throw new BadRequestException({
          code: 'SHARED_LINE_IN_USE',
          message: '문서에서 사용 중인 공용 결재선은 삭제할 수 없습니다.',
        })
      }
      throw error
    }

    return { deleted: true }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

  /** 같은 회사 내 결재선 이름 중복 차단 (수정 시 자기 자신 제외) */
  private async assertNameUnique(companyId: string, name: string, excludeId?: string) {
    const existing = await this.prisma.sharedApprovalLine.findFirst({
      where: { companyId, name, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    })
    if (existing) {
      throw new BadRequestException({
        code: 'SHARED_LINE_DUPLICATE_NAME',
        message: '같은 이름의 공용 결재선이 이미 있습니다.',
      })
    }
  }

  /**
   * 최종 결재자(마지막 APPROVER/AGREEMENT 흐름 단계 중 최대 stepOrder의 APPROVER)가
   * 동일 결재선에서 협조자(AGREEMENT/부서협조)로도 지정되면 거부한다.
   */
  private assertNoFinalApproverConflict(steps: StepInput[]) {
    const approvers = steps
      .filter((s) => s.role === StepRole.APPROVER && s.assigneeId)
      .sort((a, b) => a.stepOrder - b.stepOrder)
    const finalApprover = approvers[approvers.length - 1]
    if (!finalApprover?.assigneeId) return

    const collaboratorIds = new Set(
      steps
        .filter((s) => COLLAB_ROLES.includes(s.role) && s.assigneeId)
        .map((s) => s.assigneeId as string),
    )
    if (collaboratorIds.has(finalApprover.assigneeId)) {
      throw new BadRequestException({
        code: 'FINAL_APPROVER_IS_COLLABORATOR',
        message: '최종 결재자는 협조자로 함께 지정할 수 없습니다.',
      })
    }
  }

  private async assertLineBelongsToCompany(companyId: string, lineId: string) {
    const line = await this.prisma.sharedApprovalLine.findFirst({
      where: { id: lineId, companyId },
    })
    if (!line) {
      throw new NotFoundException({
        code: 'SHARED_LINE_NOT_FOUND',
        message: '공용 결재선을 찾을 수 없습니다.',
      })
    }
    return line
  }

  /** 결재선 구성원(개인 결재자 + 부서)이 모두 자사 소속인지 검증 — 멀티테넌시 */
  private async assertAssigneesInCompany(companyId: string, steps: StepInput[]) {
    // 개인 단계: assigneeId 자사 소속 검증 (부서 단계는 assigneeId 없음 — organizationId만)
    const assigneeIds = Array.from(
      new Set(steps.map((s) => s.assigneeId).filter((id): id is string => Boolean(id))),
    )
    if (assigneeIds.length) {
      const count = await this.prisma.employee.count({
        where: { id: { in: assigneeIds }, companyId },
      })
      if (count !== assigneeIds.length) {
        throw new BadRequestException({
          code: 'EMPLOYEE_NOT_FOUND',
          message: '결재선에 자사 소속이 아닌 직원이 포함되어 있습니다.',
        })
      }
    }

    // 부서 단계(DEPT_*): organizationId 자사 소속 검증
    const orgIds = Array.from(
      new Set(steps.map((s) => s.organizationId).filter((id): id is string => Boolean(id))),
    )
    if (orgIds.length) {
      const count = await this.prisma.organization.count({
        where: { id: { in: orgIds }, companyId },
      })
      if (count !== orgIds.length) {
        throw new BadRequestException({
          code: 'ORG_NOT_FOUND',
          message: '결재선에 자사 부서가 아닌 부서가 포함되어 있습니다.',
        })
      }
    }
  }
}
