import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateTimeclockAreaDto, UpdateTimeclockAreaDto } from './dto/create-timeclock-area.dto'

/** 장소 조회 시 함께 내려주는 연결 조직 정보 */
const ORG_INCLUDE = {
  organizations: {
    select: { organization: { select: { id: true, name: true } } },
  },
} as const

@Injectable()
export class TimeclockAreasService {
  constructor(private readonly prisma: PrismaService) {}

  // ── 목록 조회 ───────────────────────────────────────────────────────────────

  async findAll(companyId: string, organizationId?: string) {
    // organizationId가 지정된 경우 해당 조직이 같은 회사 소속인지 확인
    if (organizationId) {
      await this.validateOrganizationBelongsToCompany(companyId, organizationId)
    }

    return this.prisma.timeclockArea.findMany({
      where: {
        isActive: true,
        companyId,
        // 조직 필터: 해당 조직에 연결된(N:N) 장소만
        ...(organizationId && { organizations: { some: { organizationId } } }),
      },
      orderBy: { createdAt: 'asc' },
      include: ORG_INCLUDE,
    })
  }

  // ── 장소 등록 ───────────────────────────────────────────────────────────────

  async create(companyId: string, dto: CreateTimeclockAreaDto) {
    // 조직 연결은 '조직 관리' 화면에서 별도로 설정한다 (N:N).
    return this.prisma.timeclockArea.create({
      data: {
        companyId,
        name: dto.name,
        authMethod: dto.authMethod,
        locationLat: dto.locationLat,
        locationLng: dto.locationLng,
        locationRadiusMeters: dto.locationRadiusMeters,
        wifiSsid: dto.wifiSsid,
      },
      include: ORG_INCLUDE,
    })
  }

  // ── 장소 수정 ───────────────────────────────────────────────────────────────

  async update(companyId: string, id: string, dto: UpdateTimeclockAreaDto) {
    await this.assertArea(companyId, id)

    return this.prisma.timeclockArea.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.authMethod !== undefined && { authMethod: dto.authMethod }),
        ...(dto.locationLat !== undefined && { locationLat: dto.locationLat }),
        ...(dto.locationLng !== undefined && { locationLng: dto.locationLng }),
        ...(dto.locationRadiusMeters !== undefined && { locationRadiusMeters: dto.locationRadiusMeters }),
        ...(dto.wifiSsid !== undefined && { wifiSsid: dto.wifiSsid }),
      },
      include: ORG_INCLUDE,
    })
  }

  // ── 소프트 삭제 ─────────────────────────────────────────────────────────────

  async remove(companyId: string, id: string) {
    await this.assertArea(companyId, id)

    // 참조무결성: 이 장소로 기록된 출퇴근이 있으면 삭제 차단 (출퇴근 기록 고아 방지)
    const attendanceCount = await this.prisma.attendance.count({
      where: { timeclockAreaId: id },
    })
    if (attendanceCount > 0) {
      throw new ForbiddenException({
        code: 'TIMECLOCK_AREA_IN_USE',
        message: '이 장소로 기록된 출퇴근이 있어 삭제할 수 없습니다.',
      })
    }

    return this.prisma.timeclockArea.update({
      where: { id },
      data: { isActive: false },
    })
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  private async assertArea(companyId: string, id: string) {
    const area = await this.prisma.timeclockArea.findFirst({
      where: { id, isActive: true, companyId },
    })
    if (!area) {
      throw new NotFoundException({
        code: 'TIMECLOCK_AREA_NOT_FOUND',
        message: '출퇴근 장소를 찾을 수 없습니다.',
      })
    }
    return area
  }

  private async validateOrganizationBelongsToCompany(companyId: string, organizationId: string) {
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, companyId },
    })
    if (!org) {
      throw new BadRequestException({
        code: 'INVALID_ORGANIZATION',
        message: '유효하지 않은 조직입니다.',
      })
    }
  }
}
