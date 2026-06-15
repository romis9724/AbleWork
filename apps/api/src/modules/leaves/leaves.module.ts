import { Module } from '@nestjs/common'
import { LeavesController } from './leaves.controller'
import { LeavesService } from './leaves.service'
import { LeaveAccrualScheduler } from './leave-accrual.scheduler'
import { AuditModule } from '../audit/audit.module'

@Module({
  imports: [AuditModule],
  controllers: [LeavesController],
  providers: [LeavesService, LeaveAccrualScheduler],
  exports: [LeavesService],
})
export class LeavesModule {}
