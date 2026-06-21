import { Controller, Get, Patch, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../../common/guards/roles.guard'
import { Roles } from '../../../common/decorators/roles.decorator'
import { CompanyId } from '../../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe'
import { AiSettingsService } from './ai-settings.service'
import { LlmService } from './llm.service'
import { PatchAiSettingsSchema, PatchAiSettingsDto } from './ai-settings.dto'

/** AI 설정 — vLLM 우선, 외부 LLM 확장 대비. apiKey는 마스킹되어 응답된다. */
@ApiTags('ai-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai-settings')
export class AiSettingsController {
  constructor(
    private readonly aiSettings: AiSettingsService,
    private readonly llm: LlmService,
  ) {}

  @Get()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: 'AI 설정 조회 (apiKey 마스킹, ORG_ADMIN 이상)' })
  get(@CompanyId() companyId: string) {
    return this.aiSettings.getForApi(companyId)
  }

  @Patch()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: 'AI 설정 수정 (GENERAL_ADMIN 이상)' })
  patch(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(PatchAiSettingsSchema)) dto: PatchAiSettingsDto,
  ) {
    return this.aiSettings.patchFromApi(companyId, dto)
  }

  @Post('test')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '현재 AI 설정으로 연결 테스트 (GENERAL_ADMIN 이상)' })
  test(@CompanyId() companyId: string) {
    return this.llm.testConnection(companyId)
  }
}
