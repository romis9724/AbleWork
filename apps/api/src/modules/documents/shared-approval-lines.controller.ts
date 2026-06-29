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
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { SharedApprovalLinesService } from './shared-approval-lines.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateSharedLineDto,
  CreateSharedLineSchema,
  UpdateSharedLineDto,
  UpdateSharedLineSchema,
  SharedLineFilterDto,
  SharedLineFilterSchema,
} from './dto/document-form.dto'

@ApiTags('shared-approval-lines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('shared-approval-lines')
export class SharedApprovalLinesController {
  constructor(private readonly sharedApprovalLinesService: SharedApprovalLinesService) {}

  // AP-01-08b 공용 결재선명 중복 확인 — 등록/수정 모달 [중복체크] 버튼 (정적 경로 우선)
  @Get('check-name')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '공용 결재선명 중복 확인 (GENERAL_ADMIN)' })
  @ApiQuery({ name: 'name', required: true, type: String, description: '확인할 결재선명' })
  @ApiQuery({ name: 'excludeId', required: false, type: String, description: '수정 시 제외할 결재선 id' })
  checkName(
    @CompanyId() companyId: string,
    @Query('name') name: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.sharedApprovalLinesService.checkNameDuplicate(companyId, name ?? '', excludeId)
  }

  // AP-01-07 공용 결재선 목록 (전 직원) — 결재선명·작성자·결재자·작성일 필터 (C-9b)
  @Get()
  @ApiOperation({ summary: '공용 결재선 목록 조회 (결재선명·작성자·결재자·작성일 필터)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '결재선명' })
  @ApiQuery({ name: 'author', required: false, type: String, description: '작성자명/사번' })
  @ApiQuery({ name: 'approver', required: false, type: String, description: '결재자명/사번' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '작성일 시작(YYYY-MM-DD)' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '작성일 종료(YYYY-MM-DD)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(SharedLineFilterSchema)) filter: SharedLineFilterDto,
  ) {
    return this.sharedApprovalLinesService.findAll(companyId, filter)
  }

  // AP-01-08 공용 결재선 생성
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '공용 결재선 생성 (GENERAL_ADMIN)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateSharedLineSchema)) dto: CreateSharedLineDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sharedApprovalLinesService.create(companyId, dto, user.employeeId)
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
