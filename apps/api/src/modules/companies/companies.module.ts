import { Module } from '@nestjs/common'
import { CompaniesController } from './companies.controller'
import { CompaniesService } from './companies.service'
import { CompanySettingsController } from './company-settings.controller'
import { CompanySettingsService } from './company-settings.service'

@Module({
  controllers: [CompaniesController, CompanySettingsController],
  providers: [CompaniesService, CompanySettingsService],
  exports: [CompaniesService, CompanySettingsService],
})
export class CompaniesModule {}
