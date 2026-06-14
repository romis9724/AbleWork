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
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
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
  CreateFormAccessRuleDto,
  CreateFormAccessRuleSchema,
} from './dto/document-form.dto'

@ApiTags('document-forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
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

  // ── AP-01-07 양식 접근규칙 (조직/직무 단위 작성 권한) ─────────────────────────

  @Get(':id/access-rules')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '양식 접근규칙 목록 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  getAccessRules(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.documentFormsService.getAccessRules(companyId, id)
  }

  @Post(':id/access-rules')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '양식 접근규칙 추가 (조직/직무 scope, GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  createAccessRule(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateFormAccessRuleSchema)) dto: CreateFormAccessRuleDto,
  ) {
    return this.documentFormsService.createAccessRule(companyId, id, dto)
  }

  @Delete(':id/access-rules/:ruleId')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '양식 접근규칙 삭제 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'ruleId', type: String })
  deleteAccessRule(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
  ) {
    return this.documentFormsService.deleteAccessRule(companyId, id, ruleId)
  }
}
