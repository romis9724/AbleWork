import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { z } from 'zod'
import { CompanySettingsService } from './company-settings.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'

/** 알려진 설정 필드만 허용 — 알 수 없는 키는 strip */
const PatchSettingsSchema = z
  .object({
    nightShiftStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    nightShiftEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    weekStartDay: z
      .enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
      .optional(),
    timeFormat: z.enum(['24h', '12h']).optional(),
    noShiftClockPolicy: z.enum(['always', 'if_no_shift', 'never']).optional(),
    lateGracePeriodMinutes: z.number().int().min(0).max(120).optional(),
    earlyArrivalAllowedMinutes: z.number().int().min(0).max(720).optional(),
    pcTimeclockEnabled: z.boolean().optional(),
    timeclockConfirmEnabled: z.boolean().optional(),
    shiftConfirmEnabled: z.boolean().optional(),
    shiftTemplateCodeEnabled: z.boolean().optional(),
    impliedWorkEnabled: z.boolean().optional(),
    autoBreakEnabled: z.boolean().optional(),
    shiftBreakEnabled: z.boolean().optional(),
    approvalServiceEnabled: z.boolean().optional(),
    approvalPrevStepReject: z.boolean().optional(),
    approvalUpperLineChange: z.boolean().optional(),
    approvalAllowZipUpload: z.boolean().optional(),
    approvalMobilePush: z.boolean().optional(),
    approvalEmailNotify: z.boolean().optional(),
    approvalUserDisplay: z.enum(['name_nick', 'name', 'nick']).optional(),
  })
  .strip()

type PatchSettingsDto = z.infer<typeof PatchSettingsSchema>

@ApiTags('company-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-settings')
export class CompanySettingsController {
  constructor(private readonly settingsService: CompanySettingsService) {}

  @Get()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '회사 설정 전체 조회 (ORG_ADMIN 이상)' })
  getAll(@CompanyId() companyId: string) {
    return this.settingsService.getAllForApi(companyId)
  }

  @Patch()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '회사 설정 일괄 수정 (GENERAL_ADMIN 이상)' })
  patch(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(PatchSettingsSchema)) dto: PatchSettingsDto,
  ) {
    return this.settingsService.patchFromApi(companyId, dto as Record<string, unknown>)
  }
}
