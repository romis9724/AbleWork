import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { z } from 'zod'
import { PermissionSettingsService } from './permission-settings.service'
import {
  ORG_ADMIN_PERMISSION_FIELDS,
  EMPLOYEE_PERMISSION_FIELDS,
} from './permission-settings.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'

/** 알려진 권한 필드만 허용 — 알 수 없는 키는 strip */
function permissionGroupSchema(fields: Record<string, unknown>) {
  const shape: Record<string, z.ZodOptional<z.ZodBoolean>> = {}
  for (const field of Object.keys(fields)) {
    shape[field] = z.boolean().optional()
  }
  return z.object(shape).strip()
}

const PatchPermissionSettingsSchema = z
  .object({
    orgAdmin: permissionGroupSchema(ORG_ADMIN_PERMISSION_FIELDS).optional(),
    employee: permissionGroupSchema(EMPLOYEE_PERMISSION_FIELDS).optional(),
  })
  .strip()

type PatchPermissionSettingsDto = z.infer<typeof PatchPermissionSettingsSchema>

@ApiTags('permission-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permission-settings')
export class PermissionSettingsController {
  constructor(private readonly permissionSettings: PermissionSettingsService) {}

  @Get()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '권한 설정 조회 (ORG_ADMIN 이상)' })
  getAll(@CompanyId() companyId: string) {
    return this.permissionSettings.getForApi(companyId)
  }

  @Patch()
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiOperation({ summary: '권한 설정 수정 (SUPER_ADMIN 전용)' })
  patch(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(PatchPermissionSettingsSchema)) dto: PatchPermissionSettingsDto,
  ) {
    return this.permissionSettings.patchFromApi(companyId, dto)
  }
}
