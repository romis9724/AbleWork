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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { StandardizationRulesService } from './standardization-rules.service'
import {
  CreateStandardizationRuleSchema,
  CreateStandardizationRuleDto,
  UpdateStandardizationRuleSchema,
  UpdateStandardizationRuleDto,
} from './dto/standardization-rule.dto'

@ApiTags('standardization-rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('standardization-rules')
export class StandardizationRulesController {
  constructor(private readonly service: StandardizationRulesService) {}

  @Roles(AccessLevel.ORG_ADMIN)
  @Get()
  @ApiOperation({ summary: '표준화 규칙 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '표준화 규칙 생성 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateStandardizationRuleSchema))
    dto: CreateStandardizationRuleDto,
  ) {
    return this.service.create(companyId, dto)
  }

  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '표준화 규칙 수정 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateStandardizationRuleSchema))
    dto: UpdateStandardizationRuleDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '표준화 규칙 삭제 (소프트, GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(companyId, id)
  }
}
