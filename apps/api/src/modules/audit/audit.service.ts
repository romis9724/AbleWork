import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { AuditFilterDto } from './dto/audit-filter.dto'

/** 감사 로그 기록 파라미터 */
export interface RecordAuditParams {
  companyId: string
  /** 행위자 직원 id (null이면 시스템 행위) */
  actorId?: string | null
  /** 행위자 이름. 미지정 시 actorId로 직원명을 조회해 채운다. */
  actorName?: string | null
  /** 행위 코드 (예: 'ATTENDANCE_UPDATE') */
  action: string
  /** 대상 유형 (예: 'ATTENDANCE') */
  targetType: string
  targetId?: string | null
  targetLabel?: string | null
  /** 'SUCCESS' | 'FAIL' */
  result?: 'SUCCESS' | 'FAIL'
  detail?: Prisma.InputJsonValue | null
}

const SYSTEM_ACTOR_NAME = '시스템'

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  // ── 기록 (실패해도 throw 하지 않는 안전 기록) ─────────────────────────────────

  /**
   * 감사 로그를 안전하게 기록한다.
   * 본 동작(출퇴근 수정 등)을 깨지 않도록 모든 예외를 삼키고 로그만 남긴다.
   */
  async record(params: RecordAuditParams): Promise<void> {
    try {
      const actorName =
        params.actorName ?? (await this.resolveActorName(params.companyId, params.actorId))

      await this.prisma.auditLog.create({
        data: {
          companyId: params.companyId,
          actorId: params.actorId ?? null,
          actorName,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId ?? null,
          targetLabel: params.targetLabel ?? null,
          result: params.result ?? 'SUCCESS',
          detail: params.detail ?? Prisma.JsonNull,
        },
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류'
      this.logger.warn(`감사 로그 기록 실패 (action=${params.action}): ${message}`)
    }
  }

  // ── 조회 ────────────────────────────────────────────────────────────────────

  async findAll(companyId: string, filter: AuditFilterDto) {
    const { startDate, endDate, actorId, action, search, page, limit } = filter
    const skip = (page - 1) * limit

    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(actorId && { actorId }),
      ...(action && { action }),
      ...(this.buildDateRange(startDate, endDate) && {
        createdAt: this.buildDateRange(startDate, endDate),
      }),
      ...(search && {
        OR: [
          { actorName: { contains: search, mode: 'insensitive' } },
          { targetLabel: { contains: search, mode: 'insensitive' } },
          { action: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ])

    return { items, total, page, limit }
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────────────────

  private buildDateRange(
    startDate?: string,
    endDate?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!startDate && !endDate) return undefined
    const range: Prisma.DateTimeFilter = {}
    if (startDate) range.gte = new Date(`${startDate}T00:00:00.000Z`)
    if (endDate) range.lte = new Date(`${endDate}T23:59:59.999Z`)
    return range
  }

  private async resolveActorName(
    companyId: string,
    actorId?: string | null,
  ): Promise<string> {
    if (!actorId) return SYSTEM_ACTOR_NAME
    const employee = await this.prisma.employee.findFirst({
      where: { id: actorId, companyId },
      select: { name: true },
    })
    return employee?.name ?? SYSTEM_ACTOR_NAME
  }
}
