import { Module } from '@nestjs/common'
import { AttendancesController } from './attendances.controller'
import { AttendancesService } from './attendances.service'
import { AttendanceAbsentScheduler } from './attendance-absent.scheduler'
import { CompaniesModule } from '../companies/companies.module'

@Module({
  imports: [CompaniesModule],
  controllers: [AttendancesController],
  providers: [AttendancesService, AttendanceAbsentScheduler],
  exports: [AttendancesService],
})
export class AttendancesModule {}
