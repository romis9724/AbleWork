import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { SchedulePatternsService } from './schedule-patterns.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateSchedulePatternSchema,
  UpdateSchedulePatternSchema,
  ApplySchedulePatternSchema,
  CreateSchedulePatternDto,
  UpdateSchedulePatternDto,
  ApplySchedulePatternDto,
} from './dto/create-schedule-pattern.dto'

@ApiTags('schedule-patterns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schedule-patterns')
export class SchedulePatternsController {
  constructor(private readonly service: SchedulePatternsService) {}

  // HR-04-10 패턴 목록
  @Get()
  @ApiOperation({ summary: '스케줄 패턴 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  // HR-04-10 패턴 생성
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '스케줄 패턴 생성 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateSchedulePatternSchema)) dto: CreateSchedulePatternDto,
  ) {
    return this.service.create(companyId, dto)
  }

  // HR-04-10 패턴 수정
  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '스케줄 패턴 수정 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateSchedulePatternSchema)) dto: UpdateSchedulePatternDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  // HR-04-10 패턴 소프트 삭제
  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '스케줄 패턴 비활성화 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(companyId, id)
  }

  // HR-04-10 패턴 적용
  @Post(':id/apply')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '스케줄 패턴을 직원에게 적용 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  applyPattern(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApplySchedulePatternSchema)) dto: ApplySchedulePatternDto,
  ) {
    return this.service.applyPattern(companyId, id, dto)
  }
}
