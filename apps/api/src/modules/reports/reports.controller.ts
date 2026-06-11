import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common'
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger'
import { Response } from 'express'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { ReportsService } from './reports.service'
import {
  ReportFilterSchema,
  ReportFilterDto,
  SnapshotListFilterSchema,
  SnapshotListFilterDto,
} from './dto/report-filter.dto'
import {
  CreateSnapshotSchema,
  CreateSnapshotDto,
  CreateCustomColumnSchema,
  CreateCustomColumnDto,
} from './dto/snapshot.dto'

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ── 실시간 리포트 ──────────────────────────────────────────────────────────

  @Get('realtime')
  @ApiOperation({ summary: '실시간 근태 리포트 조회' })
  @ApiQuery({ name: 'startDate', required: true, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: true, example: '2026-01-31' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  getRealtimeReport(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ReportFilterSchema)) filter: ReportFilterDto,
  ) {
    return this.reportsService.getRealtimeReport(companyId, filter)
  }

  // ── CSV 내보내기 ───────────────────────────────────────────────────────────

  @Get('export')
  @ApiOperation({ summary: '근태 리포트 CSV 내보내기' })
  @ApiQuery({ name: 'startDate', required: true, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: true, example: '2026-01-31' })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  async exportReport(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ReportFilterSchema)) filter: ReportFilterDto,
    @Res() res: Response,
  ) {
    const csv = await this.reportsService.exportReportCsv(companyId, filter)
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${filter.startDate}-${filter.endDate}.csv"`,
    )
    res.send(csv)
  }

  // ── 스냅샷 목록 ───────────────────────────────────────────────────────────

  @Get('snapshots')
  @ApiOperation({ summary: '리포트 스냅샷 목록 조회' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  findSnapshots(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(SnapshotListFilterSchema))
    filter: SnapshotListFilterDto,
  ) {
    return this.reportsService.findSnapshots(companyId, filter)
  }

  // ── 스냅샷 생성 ───────────────────────────────────────────────────────────

  @Post('snapshots')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '리포트 스냅샷 생성 (GENERAL_ADMIN 이상)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'periodStart', 'periodEnd'],
      properties: {
        name: { type: 'string', example: '2026년 1월 근태 스냅샷' },
        periodStart: { type: 'string', example: '2026-01-01' },
        periodEnd: { type: 'string', example: '2026-01-31' },
        columnConfig: { type: 'object' },
      },
    },
  })
  createSnapshot(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateSnapshotSchema)) dto: CreateSnapshotDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.reportsService.createSnapshot(companyId, dto, user)
  }

  // ── 스냅샷 잠금 ───────────────────────────────────────────────────────────

  @Post('snapshots/:id/lock')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '스냅샷 잠금 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', description: '스냅샷 ID' })
  lockSnapshot(
    @CompanyId() companyId: string,
    @Param('id') snapshotId: string,
  ) {
    return this.reportsService.lockSnapshot(companyId, snapshotId)
  }

  // ── 커스텀 열 목록 ────────────────────────────────────────────────────────

  @Get('custom-columns')
  @ApiOperation({ summary: '커스텀 리포트 열 목록 조회' })
  findCustomColumns(@CompanyId() companyId: string) {
    return this.reportsService.findCustomColumns(companyId)
  }

  // ── 커스텀 열 생성 ────────────────────────────────────────────────────────

  @Post('custom-columns')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '커스텀 리포트 열 생성 (GENERAL_ADMIN 이상)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'formula'],
      properties: {
        name: { type: 'string', example: '특별 수당 일수' },
        formula: { type: 'string', example: 'overtimeMinutes / 60' },
        leaveTypeId: { type: 'string', format: 'uuid' },
        shiftTypeId: { type: 'string', format: 'uuid' },
      },
    },
  })
  createCustomColumn(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateCustomColumnSchema))
    dto: CreateCustomColumnDto,
  ) {
    return this.reportsService.createCustomColumn(companyId, dto)
  }
}
