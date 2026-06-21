import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { BullModule } from '@nestjs/bullmq'
import { ThrottlerModule } from '@nestjs/throttler'
import { PrismaModule } from './prisma/prisma.module'
import { StorageModule } from './common/storage/storage.module'
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
import { DocumentsModule } from './modules/documents/documents.module'
import { ReportsModule } from './modules/reports/reports.module'
import { StandardizationRulesModule } from './modules/standardization-rules/standardization-rules.module'
import { MessagesModule } from './modules/messages/messages.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { MailModule } from './modules/mail/mail.module'
import { AuditModule } from './modules/audit/audit.module'
import { IntegrationsModule } from './modules/integrations/integrations.module'
import { LlmModule } from './modules/integrations/llm/llm.module'
import { APP_FILTER } from '@nestjs/core'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { ErrorAnalysisModule } from './modules/integrations/error-analysis/error-analysis.module'

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
    StorageModule,
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
    DocumentsModule,
    ReportsModule,
    StandardizationRulesModule,
    MessagesModule,
    NotificationsModule,
    MailModule,
    AuditModule,
    IntegrationsModule,
    LlmModule,
    ErrorAnalysisModule,
  ],
  // GlobalExceptionFilter를 DI로 등록(EventEmitter2 주입 → 에러 분석 이벤트 발행)
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {}
