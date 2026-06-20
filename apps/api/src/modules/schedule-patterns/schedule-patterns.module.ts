import { Module } from '@nestjs/common'
import { SchedulePatternsController } from './schedule-patterns.controller'
import { SchedulePatternsService } from './schedule-patterns.service'
import { ShiftsModule } from '../shifts/shifts.module'

@Module({
  imports: [ShiftsModule],
  controllers: [SchedulePatternsController],
  providers: [SchedulePatternsService],
  exports: [SchedulePatternsService],
})
export class SchedulePatternsModule {}
