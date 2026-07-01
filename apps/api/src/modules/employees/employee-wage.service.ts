import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { CreateWageInfoDto } from '../wage-info/dto/create-wage-info.dto'
import { EmployeePermissionService } from './employee-permission.service'

/**
 * 직원 근로정보(WageInfo) 이력 CRUD (god file 분할 · 항목 24).
 * 접근 시 EmployeePermissionService로 직원 존재·조직 스코프를 검증한다.
 */
@Injectable()
export class EmployeeWageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: EmployeePermissionService,
  ) {}

  async findWageInfos(companyId: string, employeeId: string, requester: JwtPayload) {
    const existing = await this.permission.assertEmployee(companyId, employeeId)
    await this.permission.guardOrgScope(requester, existing)

    return this.prisma.wageInfo.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
    })
  }

  // ── 근로정보 등록 ───────────────────────────────────────────────────────────

  async createWageInfo(
    companyId: string,
    employeeId: string,
    dto: CreateWageInfoDto,
    requester: JwtPayload,
  ) {
    const existing = await this.permission.assertEmployee(companyId, employeeId)
    await this.permission.guardOrgScope(requester, existing)

    return this.prisma.wageInfo.create({
      data: {
        employeeId,
        hourlyWage: dto.hourlyWage,
        contractedWorkDays: dto.contractedWorkDays,
        contractedHoursPerWeek: dto.contractedHoursPerWeek,
        weeklyPaidHolidayDay: dto.weeklyPaidHolidayDay ?? null,
        maxHoursPerWeek: dto.maxHoursPerWeek ?? 52,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
    })
  }

  // ── 근로정보 수정/삭제 ──────────────────────────────────────────────────────

  private async assertWageInfo(employeeId: string, wageId: string) {
    const wage = await this.prisma.wageInfo.findFirst({ where: { id: wageId, employeeId } })
    if (!wage) {
      throw new NotFoundException({
        code: 'WAGE_INFO_NOT_FOUND',
        message: '근로정보를 찾을 수 없습니다.',
      })
    }
    return wage
  }

  async updateWageInfo(
    companyId: string,
    employeeId: string,
    wageId: string,
    dto: CreateWageInfoDto,
    requester: JwtPayload,
  ) {
    const existing = await this.permission.assertEmployee(companyId, employeeId)
    await this.permission.guardOrgScope(requester, existing)
    await this.assertWageInfo(employeeId, wageId)

    return this.prisma.wageInfo.update({
      where: { id: wageId },
      data: {
        hourlyWage: dto.hourlyWage,
        contractedWorkDays: dto.contractedWorkDays,
        contractedHoursPerWeek: dto.contractedHoursPerWeek,
        weeklyPaidHolidayDay: dto.weeklyPaidHolidayDay ?? null,
        maxHoursPerWeek: dto.maxHoursPerWeek ?? 52,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
    })
  }

  async deleteWageInfo(
    companyId: string,
    employeeId: string,
    wageId: string,
    requester: JwtPayload,
  ) {
    const existing = await this.permission.assertEmployee(companyId, employeeId)
    await this.permission.guardOrgScope(requester, existing)
    await this.assertWageInfo(employeeId, wageId)

    await this.prisma.wageInfo.delete({ where: { id: wageId } })
    return { success: true }
  }
}
