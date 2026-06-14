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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { DocumentsService } from './documents.service'
import { ApprovalActionsService } from './approval-actions.service'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import {
  CreateDocumentDto,
  CreateDocumentSchema,
  UpdateDocumentDto,
  UpdateDocumentSchema,
  SubmitDocumentDto,
  SubmitDocumentSchema,
  ApprovalCommentDto,
  ApprovalCommentSchema,
  DocumentBoxFilterDto,
  DocumentBoxFilterSchema,
  BulkForceDeleteDto,
  BulkForceDeleteSchema,
} from './dto/document.dto'

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly approvalActionsService: ApprovalActionsService,
  ) {}

  // ── 문서함 / 상세 ────────────────────────────────────────────────────────────

  // AP-04-01 문서함 목록
  @Get()
  @ApiOperation({ summary: '문서함 목록 (draft/in_progress/completed/pending_approval/reference/viewer/receiver/dept-docs/status/ledger)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(DocumentBoxFilterSchema)) filter: DocumentBoxFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.findAll(companyId, filter, user)
  }

  // AP-04-02 문서 상세
  @Get(':id')
  @ApiOperation({ summary: '문서 상세 (기안자/결재 관계자/관리자만)' })
  @ApiParam({ name: 'id', type: String })
  findOne(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.findOne(companyId, id, user)
  }

  // ── 기안 ─────────────────────────────────────────────────────────────────────

  // AP-02-01 기안 작성 (DRAFT)
  @Post()
  @ApiOperation({ summary: '기안 작성 (임시저장 DRAFT)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateDocumentSchema)) dto: CreateDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.create(companyId, dto, user)
  }

  // AP-02-02 기안 수정
  @Patch(':id')
  @ApiOperation({ summary: '기안 수정 (DRAFT/RECALLED/REJECTED, 기안자 본인)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateDocumentSchema)) dto: UpdateDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.update(companyId, id, dto, user)
  }

  // AP-02-03 기안 삭제
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '기안 삭제 (DRAFT만, 기안자 본인)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.remove(companyId, id, user)
  }

  // AP-05-06 결재 현황 다중 삭제 (체크박스 선택삭제 — GENERAL_ADMIN 이상, 상신/진행중/반려만)
  @Post('bulk-force-delete')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '결재 현황 다중 삭제 (관리자, 상신/진행중/반려)' })
  bulkForceDelete(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(BulkForceDeleteSchema)) dto: BulkForceDeleteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.bulkForceDelete(companyId, dto.ids, user)
  }

  // AP-05-06 관리자 강제 삭제 (결재 현황 — 임의 상태, GENERAL_ADMIN 이상)
  @Delete(':id/force')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '문서 강제 삭제 (관리자, 결재 현황)' })
  @ApiParam({ name: 'id', type: String })
  forceDelete(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.forceDelete(companyId, id, user)
  }

  // AP-02-04 상신 / 재상신
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '상신/재상신 (문서번호 채번 + 첫 결재단계 활성화)' })
  @ApiParam({ name: 'id', type: String })
  submit(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(SubmitDocumentSchema)) dto: SubmitDocumentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.submit(companyId, id, dto, user)
  }

  // AP-02-05 회수
  @Post(':id/recall')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '회수 (기안자 본인, 결재 처리 전만)' })
  @ApiParam({ name: 'id', type: String })
  recall(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.documentsService.recall(companyId, id, user)
  }

  // ── 결재 처리 ────────────────────────────────────────────────────────────────

  // AP-03-01 승인 (대결 포함)
  @Post(':id/steps/:stepId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '결재 승인 (대결 시 PROXY_APPROVED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  approve(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.approve(companyId, id, stepId, dto, user)
  }

  // AP-03-02 반려
  @Post(':id/steps/:stepId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '결재 반려 (문서 REJECTED, 남은 단계 CANCELLED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  reject(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.reject(companyId, id, stepId, dto, user)
  }

  // AP-03-03 전결
  @Post(':id/steps/:stepId/pre-approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '전결 (이후 결재 단계 SKIPPED, 문서 즉시 APPROVED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  preApprove(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.preApprove(companyId, id, stepId, dto, user)
  }

  // AP-03-04 전단계 반려
  @Post(':id/steps/:stepId/return-prev')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '전단계 반려 (직전 결재자에게 결재권 반환)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  returnToPrevious(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.returnToPrevious(companyId, id, stepId, dto, user)
  }

  // AP-03-05 결재취소
  @Post(':id/steps/:stepId/cancel-approval')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '결재취소 (다음 결재자 처리 전만)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  cancelApproval(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.cancelApproval(companyId, id, stepId, dto, user)
  }

  // AP-03-06 협조 승인
  @Post(':id/steps/:stepId/agree')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '협조 승인 (AGREEMENT 단계, 승인과 동일 진행)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  agree(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.agree(companyId, id, stepId, dto, user)
  }

  // AP-03-07 참조/공람 확인
  @Post(':id/steps/:stepId/view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '참조/공람 확인 (비차단, VIEWED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  view(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.view(companyId, id, stepId, dto, user)
  }

  // AP-03-08 수신 처리 (RECEIVER + 부서수신)
  @Post(':id/steps/:stepId/receive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '수신 처리 (문서 APPROVED 이후, RECEIVED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  receive(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.receive(companyId, id, stepId, dto, user)
  }

  // AP-04-02 부서협조 완료 (부서 문서담당자 단일 결정 — 반려는 /reject 사용)
  @Post(':id/steps/:stepId/dept-collab')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '부서협조 완료 (DEPT_COLLABORATOR, 흐름 진행)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  deptCollab(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.deptCollab(companyId, id, stepId, dto, user)
  }

  // AP-04-06 부서수신 반송 (문서 APPROVED 이후, BOUNCED → 기안자 통지)
  @Post(':id/steps/:stepId/bounce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '부서수신 반송 (DEPT_RECEIVER, BOUNCED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'stepId', type: String })
  bounce(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body(new ZodValidationPipe(ApprovalCommentSchema)) dto: ApprovalCommentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.approvalActionsService.bounce(companyId, id, stepId, dto, user)
  }
}
