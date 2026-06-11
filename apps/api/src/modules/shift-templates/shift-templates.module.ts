import { Module } from '@nestjs/common'
import { ShiftTemplatesController } from './shift-templates.controller'
import { ShiftTemplatesService } from './shift-templates.service'

@Module({
  controllers: [ShiftTemplatesController],
  providers: [ShiftTemplatesService],
  exports: [ShiftTemplatesService],
})
export class ShiftTemplatesModule {}
