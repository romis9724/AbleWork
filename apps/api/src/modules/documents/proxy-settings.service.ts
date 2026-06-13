import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateProxySettingDto, UpdateProxySettingDto } from './dto/proxy-setting.dto'

/**
 * AP — 대리결재자(대결) 설정 (Goal 13)
 * principal(위임자) 본인만 자신의 설정을 생성/수정/삭제할 수 있다.
 */
@Injectable()
export class ProxySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(employeeId: string) {
    return this.prisma.proxySettings.findMany({
      where: { principalId: employeeId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async create(companyId: string, employeeId: string, dto: CreateProxySettingDto) {
    if (dto.proxyId === employeeId) {
      throw new BadRequestException({
        code: 'PROXY_SELF_NOT_ALLOWED',
        message: '본인을 대리결재자로 지정할 수 없습니다.',
      })
    }

    // 대리인은 자사 소속 재직자만 — 멀티테넌시
    const proxyEmployee = await this.prisma.employee.findFirst({
      where: { id: dto.proxyId, companyId, isActive: true },
    })
    if (!proxyEmployee) {
      throw new NotFoundException({
        code: 'EMPLOYEE_NOT_FOUND',
        message: '대리결재자로 지정할 직원을 찾을 수 없습니다.',
      })
    }

    return this.prisma.proxySettings.create({
      data: {
        principalId: employeeId,
        proxyId: dto.proxyId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason ?? null,
      },
    })
  }

  async update(employeeId: string, settingId: string, dto: UpdateProxySettingDto) {
    const setting = await this.assertOwnSetting(employeeId, settingId)

    if (dto.endDate && new Date(dto.endDate) < setting.startDate) {
      throw new BadRequestException({
        code: 'PROXY_PERIOD_INVALID',
        message: '종료일은 시작일 이후여야 합니다.',
      })
    }

    return this.prisma.proxySettings.update({
      where: { id: settingId },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
    })
  }

  async remove(employeeId: string, settingId: string) {
    await this.assertOwnSetting(employeeId, settingId)
    await this.prisma.proxySettings.delete({ where: { id: settingId } })
    return { deleted: true }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

  private async assertOwnSetting(employeeId: string, settingId: string) {
    const setting = await this.prisma.proxySettings.findFirst({
      where: { id: settingId, principalId: employeeId },
    })
    if (!setting) {
      throw new NotFoundException({
        code: 'PROXY_SETTING_NOT_FOUND',
        message: '대리결재 설정을 찾을 수 없습니다.',
      })
    }
    return setting
  }
}
