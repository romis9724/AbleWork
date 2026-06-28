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
  UpdateApprovalRuleDto,
  UpdateApprovalRuleSchema,
  ApproveRejectDto,
  ApproveRejectSchema,
  BulkApproveDto,
  BulkApproveSchema,
  RequestFilterDto,
  RequestFilterSchema,
  UpdateRequestDto,
  UpdateRequestSchema,
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

  // HR-07-03 승인 규칙 목록 (관리자 전용 — 직원 비노출)
  @Roles(AccessLevel.ORG_ADMIN)
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

  // HR-07-04b 승인 규칙 수정
  // NOTE: ':id' 단일 세그먼트 라우트보다 앞에 선언해 라우트 충돌 방지 (NestJS는 선언 순서 우선)
  @Patch('approval-rules/:id')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '승인 규칙 수정 (SUPER_ADMIN, details 전체 교체)' })
  @ApiParam({ name: 'id', type: String })
  updateApprovalRule(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateApprovalRuleSchema)) dto: UpdateApprovalRuleDto,
  ) {
    return this.requestsService.updateApprovalRule(companyId, id, dto)
  }

  // HR-07-04c 승인 규칙 삭제 (소프트)
  @Delete('approval-rules/:id')
  @Roles(AccessLevel.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '승인 규칙 삭제 (SUPER_ADMIN, isActive=false 소프트 삭제)' })
  @ApiParam({ name: 'id', type: String })
  deleteApprovalRule(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestsService.deleteApprovalRule(companyId, id)
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

  // 요청 수정 (본인의 PENDING 요청 내용)
  @Patch(':id')
  @ApiOperation({ summary: '요청 수정 (본인의 PENDING 요청 내용)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateRequestSchema)) dto: UpdateRequestDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.updateRequest(companyId, id, dto.payload, requester)
  }

  // HR-07-10 요청 취소 (본인의 PENDING 요청만)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '요청 취소 (본인의 PENDING 요청만 가능)' })
  @ApiParam({ name: 'id', type: String })
  cancel(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.requestsService.cancel(companyId, id, requester)
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
