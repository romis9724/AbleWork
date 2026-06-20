import { Module } from '@nestjs/common'
import { EmployeesController } from './employees.controller'
import { EmployeesService } from './employees.service'
import { CompaniesModule } from '../companies/companies.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [CompaniesModule, AuditModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
