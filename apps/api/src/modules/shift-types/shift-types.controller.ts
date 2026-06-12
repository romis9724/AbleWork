import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { ShiftTypesService, CreateShiftTypeSchema, UpdateShiftTypeSchema } from './shift-types.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'

@ApiTags('shift-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shift-types')
export class ShiftTypesController {
  constructor(private readonly service: ShiftTypesService) {}

  @Get()
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  @Post()
  @Roles('GENERAL_ADMIN')
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateShiftTypeSchema)) dto: ReturnType<typeof CreateShiftTypeSchema.parse>,
  ) {
    return this.service.create(companyId, dto)
  }

  @Patch(':id')
  @Roles('GENERAL_ADMIN')
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateShiftTypeSchema)) dto: ReturnType<typeof UpdateShiftTypeSchema.parse>,
  ) {
    return this.service.update(companyId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('GENERAL_ADMIN')
  remove(@CompanyId() companyId: string, @Param('id') id: string) {
    return this.service.remove(companyId, id)
  }
}
