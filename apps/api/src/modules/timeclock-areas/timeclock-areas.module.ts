import { Module } from '@nestjs/common'
import { TimeclockAreasController } from './timeclock-areas.controller'
import { TimeclockAreasService } from './timeclock-areas.service'

@Module({
  controllers: [TimeclockAreasController],
  providers: [TimeclockAreasService],
  exports: [TimeclockAreasService],
})
export class TimeclockAreasModule {}
