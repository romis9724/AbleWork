import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AccessLevel } from '@ablework/shared-constants'
import { AuditService } from './audit.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AuditFilterSchema, AuditFilterDto } from './dto/audit-filter.dto'

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  // 감사 로그 목록 (ORG_ADMIN 이상, 회사 스코핑)
  @Get()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '감사 로그 목록 조회 (ORG_ADMIN 이상)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(AuditFilterSchema)) filter: AuditFilterDto,
  ) {
    return this.auditService.findAll(companyId, filter)
  }
}
