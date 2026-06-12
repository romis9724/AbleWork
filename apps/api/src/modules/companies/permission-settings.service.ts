import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CompanySettingsService } from './company-settings.service'

const PERMISSION_SECTION = 'permission'

interface PermissionField {
  key: string
  defaultValue: boolean
}

/** FE orgAdmin 그룹 필드 ↔ DB key (section='permission') 매핑 */
export const ORG_ADMIN_PERMISSION_FIELDS: Record<string, PermissionField> = {
  employee_manage: { key: 'org_admin_can_manage_employees', defaultValue: true },
  employee_device_reset: { key: 'org_admin_can_reset_devices', defaultValue: true },
  work_info_manage: { key: 'org_admin_can_manage_work_info', defaultValue: true },
  shift_manage: { key: 'org_admin_can_manage_shifts', defaultValue: true },
  shift_template_manage: { key: 'org_admin_can_manage_shift_templates', defaultValue: true },
  leave_manage: { key: 'org_admin_can_manage_leaves', defaultValue: true },
  attendance_manage: { key: 'org_admin_can_manage_attendances', defaultValue: true },
}

/** FE employee 그룹 필드 ↔ DB key (section='permission') 매핑 */
export const EMPLOYEE_PERMISSION_FIELDS: Record<string, PermissionField> = {
  org_view_all: { key: 'employee_can_view_all_orgs', defaultValue: false },
  shift_view_others: { key: 'employee_can_view_others_shifts', defaultValue: false },
  attendance_view: { key: 'employee_can_view_attendance', defaultValue: true },
}

export interface PermissionSettingsDto {
  orgAdmin: Record<string, boolean>
  employee: Record<string, boolean>
}

/** PATCH 입력 — Zod optional 필드 특성상 undefined 허용 (undefined는 저장 시 무시) */
export interface PatchPermissionSettingsInput {
  orgAdmin?: Record<string, boolean | undefined>
  employee?: Record<string, boolean | undefined>
}

/**
 * 권한 설정 서비스 — CompanySetting(section='permission')에 저장
 * FE 계약: { orgAdmin: { employee_manage: true, ... }, employee: { org_view_all: false, ... } }
 */
@Injectable()
export class PermissionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: CompanySettingsService,
  ) {}

  async getForApi(companyId: string): Promise<PermissionSettingsDto> {
    return {
      orgAdmin: await this.readGroup(companyId, ORG_ADMIN_PERMISSION_FIELDS),
      employee: await this.readGroup(companyId, EMPLOYEE_PERMISSION_FIELDS),
    }
  }

  async patchFromApi(
    companyId: string,
    patch: PatchPermissionSettingsInput,
  ): Promise<PermissionSettingsDto> {
    const upserts = [
      ...this.buildUpserts(companyId, ORG_ADMIN_PERMISSION_FIELDS, patch.orgAdmin),
      ...this.buildUpserts(companyId, EMPLOYEE_PERMISSION_FIELDS, patch.employee),
    ]

    if (upserts.length > 0) {
      await this.prisma.$transaction(upserts)
      this.settingsService.invalidate(companyId)
    }

    return this.getForApi(companyId)
  }

  private async readGroup(
    companyId: string,
    fields: Record<string, PermissionField>,
  ): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {}
    for (const [field, { key, defaultValue }] of Object.entries(fields)) {
      const value = await this.settingsService.get<unknown>(
        companyId,
        PERMISSION_SECTION,
        key,
        defaultValue,
      )
      result[field] = typeof value === 'boolean' ? value : defaultValue
    }
    return result
  }

  private buildUpserts(
    companyId: string,
    fields: Record<string, PermissionField>,
    patch?: Record<string, boolean | undefined>,
  ) {
    if (!patch) return []

    return Object.entries(patch)
      .filter(([field, value]) => fields[field] !== undefined && typeof value === 'boolean')
      .map(([field, value]) =>
        this.prisma.companySetting.upsert({
          where: {
            companyId_section_key: {
              companyId,
              section: PERMISSION_SECTION,
              key: fields[field].key,
            },
          },
          update: { value: value as Prisma.InputJsonValue },
          create: {
            companyId,
            section: PERMISSION_SECTION,
            key: fields[field].key,
            value: value as Prisma.InputJsonValue,
          },
        }),
      )
  }
}
