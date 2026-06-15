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
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger'
import { MessagesService } from './messages.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import {
  PaginationSchema,
  PaginationDto,
  MessageQuerySchema,
  MessageQueryDto,
  CreateTemplateSchema,
  CreateTemplateDto,
  UpdateTemplateSchema,
  UpdateTemplateDto,
  SendMessageSchema,
  SendMessageDto,
  ReadMessageSchema,
  ReadMessageDto,
  CreateAutomationSchema,
  CreateAutomationDto,
  UpdateAutomationSchema,
  UpdateAutomationDto,
} from './dto/message.dto'

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // ── MSG-01 템플릿 목록 ────────────────────────────────────────────────────────

  @Roles(AccessLevel.ORG_ADMIN)
  @Get('templates')
  @ApiOperation({ summary: '메시지 템플릿 목록 조회' })
  findTemplates(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ) {
    return this.messagesService.findTemplates(companyId, query)
  }

  // ── MSG-02 템플릿 생성 ────────────────────────────────────────────────────────

  @Post('templates')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '메시지 템플릿 생성 (GENERAL_ADMIN 이상)' })
  createTemplate(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateTemplateSchema)) dto: CreateTemplateDto,
  ) {
    return this.messagesService.createTemplate(companyId, dto)
  }

  // ── MSG-03 템플릿 수정 ────────────────────────────────────────────────────────

  @Patch('templates/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '메시지 템플릿 수정 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  updateTemplate(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateTemplateSchema)) dto: UpdateTemplateDto,
  ) {
    return this.messagesService.updateTemplate(companyId, id, dto)
  }

  // ── MSG-04 템플릿 삭제 ────────────────────────────────────────────────────────

  @Delete('templates/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '메시지 템플릿 삭제 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  deleteTemplate(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagesService.deleteTemplate(companyId, id)
  }

  // ── MSG-05 메시지 발송 ────────────────────────────────────────────────────────

  @Post('send')
  @ApiOperation({ summary: '메시지 발송' })
  sendMessage(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(SendMessageSchema)) dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(companyId, user.sub, dto)
  }

  // ── MSG-06 수신 메시지 목록 ───────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: '수신 메시지 목록 조회' })
  findMyMessages(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(MessageQuerySchema)) query: MessageQueryDto,
  ) {
    return this.messagesService.findMyMessages(user.employeeId, query)
  }

  // ── MSG-07 메시지 읽음 처리 ───────────────────────────────────────────────────

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '메시지 읽음 처리' })
  @ApiParam({ name: 'id', type: String })
  markAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ReadMessageSchema)) dto: ReadMessageDto,
  ) {
    return this.messagesService.markAsRead(id, user.employeeId, dto)
  }

  // ── MSG-08 자동화 목록 ────────────────────────────────────────────────────────

  @Roles(AccessLevel.ORG_ADMIN)
  @Get('automations')
  @ApiOperation({ summary: '메시지 자동화 목록 조회' })
  findAutomations(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ) {
    return this.messagesService.findAutomations(companyId, query)
  }

  // ── MSG-09 자동화 생성 ────────────────────────────────────────────────────────

  @Post('automations')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '메시지 자동화 생성 (GENERAL_ADMIN 이상)' })
  createAutomation(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateAutomationSchema)) dto: CreateAutomationDto,
  ) {
    return this.messagesService.createAutomation(companyId, dto)
  }

  // ── MSG-10 자동화 수정 ────────────────────────────────────────────────────────

  @Patch('automations/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '메시지 자동화 수정 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  updateAutomation(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAutomationSchema)) dto: UpdateAutomationDto,
  ) {
    return this.messagesService.updateAutomation(companyId, id, dto)
  }

  // ── MSG-11 자동화 삭제 ────────────────────────────────────────────────────────

  @Delete('automations/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '메시지 자동화 삭제 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  deleteAutomation(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagesService.deleteAutomation(companyId, id)
  }
}
