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
import { DocumentCategoriesService } from './document-categories.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateDocumentCategoryDto,
  CreateDocumentCategorySchema,
  UpdateDocumentCategoryDto,
  UpdateDocumentCategorySchema,
} from './dto/document-form.dto'

/**
 * AP 문서성격(채번 대분류) — 목록은 전 직원, 생성/수정/삭제는 GENERAL_ADMIN.
 */
@ApiTags('document-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('document-categories')
export class DocumentCategoriesController {
  constructor(private readonly service: DocumentCategoriesService) {}

  @Get()
  @ApiOperation({ summary: '문서성격 목록 (전 직원)' })
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '문서성격 생성 (GENERAL_ADMIN)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateDocumentCategorySchema)) dto: CreateDocumentCategoryDto,
  ) {
    return this.service.create(companyId, dto)
  }

  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '문서성격 수정 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDocumentCategorySchema)) dto: UpdateDocumentCategoryDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '문서성격 삭제 (사용 중이면 차단, GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id)
  }
}
