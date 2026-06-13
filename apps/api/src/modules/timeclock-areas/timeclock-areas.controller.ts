import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { TimeclockAreasService } from './timeclock-areas.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateTimeclockAreaSchema,
  UpdateTimeclockAreaSchema,
  CreateTimeclockAreaDto,
  UpdateTimeclockAreaDto,
} from './dto/create-timeclock-area.dto'
import { z } from 'zod'

const OrganizationFilterSchema = z.object({
  organizationId: z.string().uuid().optional(),
})

@ApiTags('timeclock-areas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('timeclock-areas')
export class TimeclockAreasController {
  constructor(private readonly timeclockAreasService: TimeclockAreasService) {}

  // HR-05-01 장소 목록 조회
  @Get()
  @ApiOperation({ summary: '출퇴근 장소 목록 조회' })
  @ApiQuery({ name: 'organizationId', required: false, type: String })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(OrganizationFilterSchema))
    query: { organizationId?: string },
  ) {
    return this.timeclockAreasService.findAll(companyId, query.organizationId)
  }

  // HR-05-01 장소 등록
  @Post()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '출퇴근 장소 등록 (ORG_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateTimeclockAreaSchema)) dto: CreateTimeclockAreaDto,
  ) {
    return this.timeclockAreasService.create(companyId, dto)
  }

  // HR-05-01 장소 수정
  @Patch(':id')
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '출퇴근 장소 수정 (ORG_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTimeclockAreaSchema)) dto: UpdateTimeclockAreaDto,
  ) {
    return this.timeclockAreasService.update(companyId, id, dto)
  }

  // HR-05-01 장소 삭제 (소프트 삭제)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '출퇴근 장소 삭제 (소프트 삭제, ORG_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.timeclockAreasService.remove(companyId, id)
  }
}
