import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AccessLevel } from '@ablework/shared-constants'
import { ErrorAnalysisService } from './error-analysis.service'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { CompanyId } from '../../../common/decorators/company-id.decorator'
import { Roles } from '../../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe'
import {
  ErrorAnalysisFilterSchema,
  ErrorAnalysisFilterDto,
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
