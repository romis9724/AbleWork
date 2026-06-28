import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { AttendancesController } from './attendances.controller'
import { AttendancesService } from './attendances.service'
import { AttendanceAbsentScheduler } from './attendance-absent.scheduler'
import { AttendanceNotificationListener } from './attendance-notification.listener'
import { AttendanceReminderScheduler } from './attendance-reminder.scheduler'
import { AttendanceReminderProcessor } from './attendance-reminder.processor'
import { CompaniesModule } from '../companies/companies.module'
import { AuditModule } from '../audit/audit.module'
import { IntegrationsModule } from '../integrations/integrations.module'

@Module({
  imports: [
    CompaniesModule,
    AuditModule,
    IntegrationsModule,
    BullModule.registerQueue({ name: 'attendance-reminder' }),
  ],
  controllers: [AttendancesController],
  providers: [
    AttendancesService,
    AttendanceAbsentScheduler,
    AttendanceNotificationListener,
    AttendanceReminderScheduler,
    AttendanceReminderProcessor,
  ],
  exports: [AttendancesService],
})
export class AttendancesModule {}
