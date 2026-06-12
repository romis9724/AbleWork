import { Module } from '@nestjs/common'
import { RequestsController } from './requests.controller'
import { RequestsService } from './requests.service'
import { LeavesModule } from '../leaves/leaves.module'

@Module({
  imports: [LeavesModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}
