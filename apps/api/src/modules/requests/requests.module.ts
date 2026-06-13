import { Module } from '@nestjs/common'
import { RequestsController } from './requests.controller'
import { RequestsService } from './requests.service'
import { CustomTypesController } from './custom-types.controller'
import { CustomTypesService } from './custom-types.service'
import { LeavesModule } from '../leaves/leaves.module'

@Module({
  imports: [LeavesModule],
  // CustomTypesController를 먼저 등록해 'requests/custom-types' 고정 경로가
  // RequestsController의 ':id' 와일드카드보다 우선 매칭되도록 한다
  controllers: [CustomTypesController, RequestsController],
  providers: [RequestsService, CustomTypesService],
  exports: [RequestsService, CustomTypesService],
})
export class RequestsModule {}
