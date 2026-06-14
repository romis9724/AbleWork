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
import { SharedApprovalLinesService } from './shared-approval-lines.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateSharedLineDto,
  CreateSharedLineSchema,
  UpdateSharedLineDto,
  UpdateSharedLineSchema,
} from './dto/document-form.dto'

@ApiTags('shared-approval-lines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('shared-approval-lines')
export class SharedApprovalLinesController {
  constructor(private readonly sharedApprovalLinesService: SharedApprovalLinesService) {}

  // AP-01-07 공용 결재선 목록 (전 직원)
  @Get()
  @ApiOperation({ summary: '공용 결재선 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.sharedApprovalLinesService.findAll(companyId)
  }

  // AP-01-08 공용 결재선 생성
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '공용 결재선 생성 (GENERAL_ADMIN)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateSharedLineSchema)) dto: CreateSharedLineDto,
  ) {
    return this.sharedApprovalLinesService.create(companyId, dto)
  }

  // AP-01-09 공용 결재선 수정
  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '공용 결재선 수정 (GENERAL_ADMIN, steps 변경 시 version 증가)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSharedLineSchema)) dto: UpdateSharedLineDto,
  ) {
    return this.sharedApprovalLinesService.update(companyId, id, dto)
  }

  // AP-01-10 공용 결재선 삭제
  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '공용 결재선 삭제 (GENERAL_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.sharedApprovalLinesService.remove(companyId, id)
  }
}
