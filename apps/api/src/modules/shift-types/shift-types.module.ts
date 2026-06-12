import { Module } from '@nestjs/common'
import { ShiftTypesController } from './shift-types.controller'
import { ShiftTypesService } from './shift-types.service'

@Module({
  controllers: [ShiftTypesController],
  providers: [ShiftTypesService],
  exports: [ShiftTypesService],
})
export class ShiftTypesModule {}
