import { Module } from '@nestjs/common'
import { EmployeesController } from './employees.controller'
import { EmployeesService } from './employees.service'
import { EmployeePermissionService } from './employee-permission.service'
import { EmployeeWageService } from './employee-wage.service'
import { EmployeeQueryService } from './employee-query.service'
import { CompaniesModule } from '../companies/companies.module'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [CompaniesModule, AuditModule],
  controllers: [EmployeesController],
  providers: [
    EmployeesService,
    EmployeePermissionService,
    EmployeeWageService,
    EmployeeQueryService,
  ],
  exports: [EmployeesService],
})
export class EmployeesModule {}
