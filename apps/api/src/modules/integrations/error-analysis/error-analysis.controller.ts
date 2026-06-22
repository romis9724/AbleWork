import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common'
import type { Response } from 'express'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AccessLevel } from '@ablework/shared-constants'
import { ErrorAnalysisService } from './error-analysis.service'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { CompanyId } from '../../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import { JwtPayload } from '../../../common/types/jwt-payload.type'
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe'
import {
  ErrorAnalysisFilterSchema,
  ErrorAnalysisFilterDto,
  BulkResolveSchema,
  BulkResolveDto,
} from './dto/error-analysis-filter.dto'

@ApiTags('error-analysis')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('error-analysis-logs')
export class ErrorAnalysisController {
  constructor(private readonly service: ErrorAnalysisService) {}

  // 에러 분석 로그 목록 (GENERAL_ADMIN 이상 — 스택·내부정보 포함, 회사 스코핑)
  @Get()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: 'AI 에러 분석 로그 목록 조회 (GENERAL_ADMIN 이상)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ErrorAnalysisFilterSchema)) filter: ErrorAnalysisFilterDto,
  ) {
    return this.service.findAll(companyId, filter)
  }

  // CSV 내보내기 — 현재 필터 동일 적용. (:id 보다 먼저 선언해야 라우트 충돌 없음)
  @Get('export')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: 'AI 에러 분석 로그 CSV 내보내기 (GENERAL_ADMIN 이상)' })
  async export(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ErrorAnalysisFilterSchema)) filter: ErrorAnalysisFilterDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.service.exportCsv(companyId, filter)
    const stamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="error-analysis-${stamp}.csv"`)
    res.send(csv)
  }

  // 처리 상태 일괄 변경 (완료/되돌리기)
  @Patch('bulk-resolve')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: 'AI 에러 분석 로그 처리상태 일괄 변경 (GENERAL_ADMIN 이상)' })
  bulkResolve(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(BulkResolveSchema)) dto: BulkResolveDto,
  ) {
    return this.service.bulkResolve(companyId, dto, user.employeeId)
  }

  // 에러 분석 로그 단건 상세
  @Get(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: 'AI 에러 분석 로그 상세 조회 (GENERAL_ADMIN 이상)' })
  async findOne(@CompanyId() companyId: string, @Param('id') id: string) {
    const log = await this.service.findOne(companyId, id)
    if (!log) throw new NotFoundException('해당 에러 분석 로그를 찾을 수 없습니다.')
    return log
  }
}
