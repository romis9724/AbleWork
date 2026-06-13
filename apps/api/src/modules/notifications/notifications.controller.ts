import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateNotificationRuleDto,
  CreateNotificationRuleSchema,
  UpdateNotificationRuleDto,
  UpdateNotificationRuleSchema,
  UpdateWebhookDto,
  UpdateWebhookSchema,
  UpdateEventRuleDto,
  UpdateEventRuleSchema,
  ListNotificationRulesQueryDto,
  ListNotificationRulesQuerySchema,
  ListNotificationLogsQueryDto,
  ListNotificationLogsQuerySchema,
} from './dto/notification-rule.dto'

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // NT-01 알림 규칙 목록
  @Get('rules')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '알림 규칙 목록 조회 (SUPER_ADMIN)' })
  getRules(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ListNotificationRulesQuerySchema)) query: ListNotificationRulesQueryDto,
  ) {
    return this.notificationsService.getRules(companyId, query)
  }

  // NT-02 알림 규칙 생성
  @Post('rules')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '알림 규칙 생성 (SUPER_ADMIN)' })
  createRule(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateNotificationRuleSchema)) dto: CreateNotificationRuleDto,
  ) {
    return this.notificationsService.createRule(companyId, dto)
  }

  // NT-02b 회사 Webhook URL 일괄 설정 (':id' 라우트보다 먼저 선언해야 함)
  @Patch('rules/webhook')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '회사 알림 규칙 Webhook URL 일괄 설정 (SUPER_ADMIN)' })
  updateWebhook(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(UpdateWebhookSchema)) dto: UpdateWebhookDto,
  ) {
    return this.notificationsService.updateWebhook(companyId, dto)
  }

  // NT-02c 이벤트별 알림 활성/비활성 (':id' 라우트보다 먼저 선언해야 함)
  @Patch('rules/event')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '이벤트별 알림 규칙 활성/비활성 (SUPER_ADMIN)' })
  updateEventRule(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(UpdateEventRuleSchema)) dto: UpdateEventRuleDto,
  ) {
    return this.notificationsService.updateEventRule(companyId, dto)
  }

  // NT-03 알림 규칙 수정
  @Patch('rules/:id')
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '알림 규칙 수정 (SUPER_ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  updateRule(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateNotificationRuleSchema)) dto: UpdateNotificationRuleDto,
  ) {
    return this.notificationsService.updateRule(id, companyId, dto)
  }

  // NT-04 알림 로그 목록
  @Get('logs')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '알림 로그 목록 조회 (GENERAL_ADMIN 이상)' })
  getLogs(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ListNotificationLogsQuerySchema)) query: ListNotificationLogsQueryDto,
  ) {
    return this.notificationsService.getLogs(companyId, query)
  }
}
