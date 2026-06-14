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
import { FormCategoriesService } from './form-categories.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateFormCategoryDto,
  CreateFormCategorySchema,
  UpdateFormCategoryDto,
  UpdateFormCategorySchema,
} from './dto/document-form.dto'

@ApiTags('form-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('form-categories')
export class FormCategoriesController {
  constructor(private readonly service: FormCategoriesService) {}

  @Get()
  @ApiOperation({ summary: '양식함(분류) 목록 (전 직원)' })
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '양식함(분류) 생성 (GENERAL_ADMIN)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateFormCategorySchema)) dto: CreateFormCategoryDto,
  ) {
    return this.service.create(companyId, dto)
  }

  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '양식함(분류) 수정 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateFormCategorySchema)) dto: UpdateFormCategoryDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '양식함(분류) 삭제 (사용 중이면 차단, GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id)
  }
}
