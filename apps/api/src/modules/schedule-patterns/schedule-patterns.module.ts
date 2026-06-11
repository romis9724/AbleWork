import { Module } from '@nestjs/common'
import { SchedulePatternsController } from './schedule-patterns.controller'
import { SchedulePatternsService } from './schedule-patterns.service'

@Module({
  controllers: [SchedulePatternsController],
  providers: [SchedulePatternsService],
  exports: [SchedulePatternsService],
})
export class SchedulePatternsModule {}
