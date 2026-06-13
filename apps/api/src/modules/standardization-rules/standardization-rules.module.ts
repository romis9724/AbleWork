import { Module } from '@nestjs/common'
import { StandardizationRulesController } from './standardization-rules.controller'
import { StandardizationRulesService } from './standardization-rules.service'

@Module({
  controllers: [StandardizationRulesController],
  providers: [StandardizationRulesService],
  exports: [StandardizationRulesService],
})
export class StandardizationRulesModule {}
