import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { DocumentFormsService } from './document-forms.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateDocumentFormDto,
  CreateDocumentFormSchema,
  UpdateDocumentFormDto,
  UpdateDocumentFormSchema,
  UpsertNumberRuleDto,
  UpsertNumberRuleSchema,
} from './dto/document-form.dto'

@ApiTags('document-forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('document-forms')
export class DocumentFormsController {
  constructor(private readonly documentFormsService: DocumentFormsService) {}

  // AP-01-01 활성 양식 목록 (전 직원)
  @Get()
  @ApiOperation({ summary: '활성 기안 양식 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.documentFormsService.findAll(companyId)
  }

  // AP-01-02 양식 생성
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '기안 양식 생성 (GENERAL_ADMIN)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateDocumentFormSchema)) dto: CreateDocumentFormDto,
  ) {
    return this.documentFormsService.create(companyId, dto)
  }

  // AP-01-03 양식 수정
  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '기안 양식 수정 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDocumentFormSchema)) dto: UpdateDocumentFormDto,
  ) {
    return this.documentFormsService.update(companyId, id, dto)
  }

  // AP-01-04 양식 삭제 (소프트)
  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '기안 양식 삭제 (GENERAL_ADMIN, isActive=false 소프트 삭제)' })
  @ApiParam({ name: 'id', type: String })
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.documentFormsService.remove(companyId, id)
  }

  // AP-01-05 문서번호 채번 규칙 조회
  @Get(':id/number-rule')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '양식별 문서번호 채번 규칙 조회 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  getNumberRule(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.documentFormsService.getNumberRule(companyId, id)
  }

  // AP-01-06 문서번호 채번 규칙 upsert (양식당 1개)
  @Put(':id/number-rule')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '양식별 문서번호 채번 규칙 등록/수정 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  upsertNumberRule(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpsertNumberRuleSchema)) dto: UpsertNumberRuleDto,
  ) {
    return this.documentFormsService.upsertNumberRule(companyId, id, dto)
  }
}
