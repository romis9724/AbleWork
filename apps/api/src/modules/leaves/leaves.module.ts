import { Module } from '@nestjs/common'
import { LeavesController } from './leaves.controller'
import { LeavesService } from './leaves.service'
import { LeaveAccrualScheduler } from './leave-accrual.scheduler'

@Module({
  controllers: [LeavesController],
  providers: [LeavesService, LeaveAccrualScheduler],
  exports: [LeavesService],
})
export class LeavesModule {}
