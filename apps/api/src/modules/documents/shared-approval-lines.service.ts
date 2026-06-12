import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateSharedLineDto, UpdateSharedLineDto } from './dto/document-form.dto'
import { StepInput } from './dto/document.dto'

/**
 * AP — 공용 결재선 (Goal 11)
 * steps는 SharedApprovalLine.steps Json 컬럼에 [{role, assigneeId, stepOrder}] 형태로 저장한다.
 */
@Injectable()
export class SharedApprovalLinesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.sharedApprovalLine.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    })
  }

  async create(companyId: string, dto: CreateSharedLineDto) {
    await this.assertAssigneesInCompany(companyId, dto.steps)

    return this.prisma.sharedApprovalLine.create({
      data: { companyId, name: dto.name, steps: dto.steps },
    })
  }

  async update(companyId: string, lineId: string, dto: UpdateSharedLineDto) {
    await this.assertLineBelongsToCompany(companyId, lineId)

    if (dto.steps) {
      await this.assertAssigneesInCompany(companyId, dto.steps)
    }

    return this.prisma.sharedApprovalLine.update({
      where: { id: lineId },
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
      await this.prisma.sharedApprovalLine.delete({ where: { id: lineId } })
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

  /** 결재선 구성원이 모두 자사 소속인지 검증 — 멀티테넌시 */
  private async assertAssigneesInCompany(companyId: string, steps: StepInput[]) {
    const assigneeIds = Array.from(new Set(steps.map((s) => s.assigneeId)))
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
}
