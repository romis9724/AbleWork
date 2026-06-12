import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { BullModule } from '@nestjs/bullmq'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './modules/auth/auth.module'
import { CompaniesModule } from './modules/companies/companies.module'
import { OrganizationsModule } from './modules/organizations/organizations.module'
import { EmployeesModule } from './modules/employees/employees.module'
import { PositionsModule } from './modules/positions/positions.module'
import { TimeclockAreasModule } from './modules/timeclock-areas/timeclock-areas.module'
import { ShiftsModule } from './modules/shifts/shifts.module'
import { ShiftTypesModule } from './modules/shift-types/shift-types.module'
import { ShiftTemplatesModule } from './modules/shift-templates/shift-templates.module'
import { SchedulePatternsModule } from './modules/schedule-patterns/schedule-patterns.module'
import { AttendancesModule } from './modules/attendances/attendances.module'
import { LeavesModule } from './modules/leaves/leaves.module'
import { RequestsModule } from './modules/requests/requests.module'
import { ReportsModule } from './modules/reports/reports.module'
import { StandardizationRulesModule } from './modules/standardization-rules/standardization-rules.module'
import { MessagesModule } from './modules/messages/messages.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { MailModule } from './modules/mail/mail.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.', maxListeners: 20 }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.getOrThrow<string>('REDIS_URL') },
      }),
    }),
    BullModule.registerQueue(
      { name: 'message-automation' },
      { name: 'notification' },
      { name: 'leave-accrual' },
      { name: 'attendance-check' },
    ),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    CompaniesModule,
    OrganizationsModule,
    EmployeesModule,
    PositionsModule,
    TimeclockAreasModule,
    ShiftsModule,
    ShiftTypesModule,
    ShiftTemplatesModule,
    SchedulePatternsModule,
    AttendancesModule,
    LeavesModule,
    RequestsModule,
    ReportsModule,
    StandardizationRulesModule,
    MessagesModule,
    NotificationsModule,
    MailModule,
  ],
})
export class AppModule {}
