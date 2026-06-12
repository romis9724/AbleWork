import { Module } from '@nestjs/common'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'
import { CompanySettingsController } from './company-settings.controller'
import { CompanySettingsService } from './company-settings.service'
import { PermissionSettingsController } from './permission-settings.controller'
import { PermissionSettingsService } from './permission-settings.service'
import { CompanyHolidaysController } from './company-holidays.controller'
import { CompanyHolidaysService } from './company-holidays.service'

@Module({
  controllers: [
    CompaniesController,
    CompanySettingsController,
    PermissionSettingsController,
    CompanyHolidaysController,
  ],
  providers: [
    CompaniesService,
    CompanySettingsService,
    PermissionSettingsService,
    CompanyHolidaysService,
  ],
  exports: [CompaniesService, CompanySettingsService, PermissionSettingsService],
})
export class CompaniesModule {}
