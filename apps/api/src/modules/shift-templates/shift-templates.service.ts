import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateShiftTemplateDto, UpdateShiftTemplateDto } from './dto/create-shift-template.dto'

/**
 * HH:MM 문자열을 오늘 날짜 기준의 Date 객체로 변환한다.
 * Prisma Time 컬럼은 Date로 전달해야 한다.
 */
function parseTime(timeStr: string): Date {
  const [hours, minutes] = timeStr.split(':').map(Number)
  const d = new Date(1970, 0, 1, hours, minutes, 0, 0)
  return d
}

@Injectable()
export class ShiftTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string) {
    return this.prisma.shiftTemplate.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'asc' },
      include: {
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })
  }

  // ── 템플릿 생성 ─────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateShiftTemplateDto) {
    await this.validateShiftTypeBelongsToCompany(companyId, dto.shiftTypeId)

    return this.prisma.shiftTemplate.create({
      data: {
        companyId,
        shiftTypeId: dto.shiftTypeId,
        name: dto.name,
        code: dto.code ?? null,
        startTime: parseTime(dto.startTime),
        endTime: parseTime(dto.endTime),
      },
      include: {
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })
  }

  // ── 템플릿 수정 ─────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateShiftTemplateDto) {
    await this.assertTemplate(companyId, id)

    if (dto.shiftTypeId) {
      await this.validateShiftTypeBelongsToCompany(companyId, dto.shiftTypeId)
    }

    // 멀티테넌시 방어: where에 companyId 포함
    return this.prisma.shiftTemplate.update({
      where: { id, companyId },
      data: {
        ...(dto.shiftTypeId !== undefined && { shiftTypeId: dto.shiftTypeId }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.startTime !== undefined && { startTime: parseTime(dto.startTime) }),
        ...(dto.endTime !== undefined && { endTime: parseTime(dto.endTime) }),
      },
      include: {
        shiftType: { select: { id: true, name: true, color: true } },
      },
    })
  }

  // ── 소프트 삭제 ─────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    await this.assertTemplate(companyId, id)

    // 참조무결성: 이 템플릿으로 생성된 근무일정이 있으면 삭제 차단
    const shiftCount = await this.prisma.shift.count({
      where: { templateId: id },
    })
    if (shiftCount > 0) {
      throw new ForbiddenException({
        code: 'SHIFT_TEMPLATE_IN_USE',
        message: '이 템플릿으로 생성된 근무일정이 있어 삭제할 수 없습니다.',
      })
    }

    return this.prisma.shiftTemplate.update({
      where: { id, companyId },
      data: { isActive: false },
    })
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  async assertTemplate(companyId: string, id: string) {
    const template = await this.prisma.shiftTemplate.findFirst({
      where: { id, companyId, isActive: true },
    })
    if (!template) {
      throw new NotFoundException({
        code: 'SHIFT_TEMPLATE_NOT_FOUND',
        message: '근무 템플릿을 찾을 수 없습니다.',
      })
    }
    return template
  }

  private async validateShiftTypeBelongsToCompany(companyId: string, shiftTypeId: string) {
    const shiftType = await this.prisma.shiftType.findFirst({
      where: { id: shiftTypeId, companyId, isActive: true },
    })
    if (!shiftType) {
      throw new BadRequestException({
        code: 'INVALID_SHIFT_TYPE',
        message: '유효하지 않은 근무유형입니다.',
      })
    }
  }
}
