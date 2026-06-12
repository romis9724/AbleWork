import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { CompanyHolidaysService } from './company-holidays.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateCompanyHolidaySchema,
  CreateCompanyHolidayDto,
} from './dto/create-company-holiday.dto'

@ApiTags('company-holidays')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company-holidays')
export class CompanyHolidaysController {
  constructor(private readonly holidaysService: CompanyHolidaysService) {}

  @Get()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '회사 지정 휴일 목록 조회 (ORG_ADMIN 이상)' })
  findAll(@CompanyId() companyId: string) {
    return this.holidaysService.findAll(companyId)
  }

  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '회사 지정 휴일 등록 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateCompanyHolidaySchema)) dto: CreateCompanyHolidayDto,
  ) {
    return this.holidaysService.create(companyId, dto)
  }

  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '회사 지정 휴일 삭제 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(@CompanyId() companyId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.holidaysService.remove(companyId, id)
  }
}
