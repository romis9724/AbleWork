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
import { ShiftTemplatesService } from './shift-templates.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateShiftTemplateSchema,
  UpdateShiftTemplateSchema,
  CreateShiftTemplateDto,
  UpdateShiftTemplateDto,
} from './dto/create-shift-template.dto'

@ApiTags('shift-templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shift-templates')
export class ShiftTemplatesController {
  constructor(private readonly shiftTemplatesService: ShiftTemplatesService) {}

  // HR-04-03 템플릿 목록 (관리자 전용 — 직원 비노출)
  @Roles(AccessLevel.ORG_ADMIN)
  @Get()
  @ApiOperation({ summary: '근무 템플릿 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.shiftTemplatesService.findAll(companyId)
  }

  // HR-04-03 템플릿 생성
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '근무 템플릿 생성 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateShiftTemplateSchema)) dto: CreateShiftTemplateDto,
  ) {
    return this.shiftTemplatesService.create(companyId, dto)
  }

  // HR-04-03 템플릿 수정
  @Patch(':id')
  @ApiOperation({ summary: '근무 템플릿 수정' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateShiftTemplateSchema)) dto: UpdateShiftTemplateDto,
  ) {
    return this.shiftTemplatesService.update(companyId, id, dto)
  }

  // HR-04-03 템플릿 삭제 (소프트 삭제)
  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '근무 템플릿 삭제 (소프트 삭제, GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftTemplatesService.remove(companyId, id)
  }
}
