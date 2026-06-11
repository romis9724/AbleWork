import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { RequestsService } from './requests.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateRequestDto,
  CreateRequestSchema,
  CreateApprovalRuleDto,
  CreateApprovalRuleSchema,
  ApproveRejectDto,
  ApproveRejectSchema,
  BulkApproveDto,
  BulkApproveSchema,
  RequestFilterDto,
  RequestFilterSchema,
} from './dto/create-request.dto'

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  // HR-07-01 요청 목록
  @Get()
  @ApiOperation({ summary: '요청 목록 조회 (내 요청 / 승인 필요 / 완료 / 참조 필터)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(RequestFilterSchema)) filter: RequestFilterDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.findAll(companyId, filter, requester)
  }

  // HR-07-02 요청 생성
  @Post()
  @ApiOperation({ summary: '요청 생성 (Document 자동 생성)' })
  createRequest(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateRequestSchema)) dto: CreateRequestDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.createRequest(companyId, dto, requester)
  }

  // HR-07-03 승인 규칙 목록
  @Get('approval-rules')
  @ApiOperation({ summary: '승인 규칙 목록 조회' })
  findApprovalRules(@CompanyId() companyId: string) {
    return this.requestsService.findApprovalRules(companyId)
  }

  // HR-07-04 승인 규칙 생성
  @Post('approval-rules')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '승인 규칙 생성 (SUPER_ADMIN)' })
  createApprovalRule(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateApprovalRuleSchema)) dto: CreateApprovalRuleDto,
  ) {
    return this.requestsService.createApprovalRule(companyId, dto)
  }

  // HR-07-05 승인
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '요청 승인' })
  @ApiParam({ name: 'id', type: String })
  approve(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveRejectSchema)) dto: ApproveRejectDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.approve(companyId, id, dto, requester)
  }

  // HR-07-06 거절
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '요청 거절' })
  @ApiParam({ name: 'id', type: String })
  reject(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveRejectSchema)) dto: ApproveRejectDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.reject(companyId, id, dto, requester)
  }

  // HR-07-07 강제 승인
  @Post(':id/force-approve')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '강제 승인 (SUPER_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  forceApprove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveRejectSchema)) dto: ApproveRejectDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.forceApprove(companyId, id, dto, requester)
  }

  // HR-07-08 강제 거절
  @Post(':id/force-reject')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '강제 거절 (SUPER_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  forceReject(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveRejectSchema)) dto: ApproveRejectDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.forceReject(companyId, id, dto, requester)
  }

  // HR-07-09 일괄 승인
  @Post('bulk-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '요청 일괄 승인' })
  bulkApprove(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(BulkApproveSchema)) dto: BulkApproveDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.bulkApprove(companyId, dto, requester)
  }
}
