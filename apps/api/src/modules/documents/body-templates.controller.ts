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
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { BodyTemplatesService } from './body-templates.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateBodyTemplateDto,
  CreateBodyTemplateSchema,
  UpdateBodyTemplateDto,
  UpdateBodyTemplateSchema,
} from './dto/document-form.dto'

@ApiTags('body-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('body-templates')
export class BodyTemplatesController {
  constructor(private readonly service: BodyTemplatesService) {}

  @Get()
  @ApiOperation({ summary: '기안 본문 템플릿 목록 (전 직원)' })
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '기안 본문 템플릿 생성 (GENERAL_ADMIN)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateBodyTemplateSchema)) dto: CreateBodyTemplateDto,
  ) {
    return this.service.create(companyId, dto)
  }

  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '기안 본문 템플릿 수정 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBodyTemplateSchema)) dto: UpdateBodyTemplateDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '기안 본문 템플릿 삭제 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id)
  }
}
