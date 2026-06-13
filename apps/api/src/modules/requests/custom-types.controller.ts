import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger'
import { AccessLevel } from '@ablework/shared-constants'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { CustomTypesService } from './custom-types.service'
import {
  CreateCustomRequestTypeSchema,
  CreateCustomRequestTypeDto,
  UpdateCustomRequestTypeSchema,
  UpdateCustomRequestTypeDto,
} from './dto/custom-request-type.dto'

// 주의: RequestsController의 ':id' 와일드카드 라우트와 충돌하지 않도록
// 별도 컨트롤러로 'requests/custom-types' 고정 경로를 사용한다.
@ApiTags('custom-request-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('requests/custom-types')
export class CustomTypesController {
  constructor(private readonly service: CustomTypesService) {}

  @Get()
  @ApiOperation({ summary: '커스텀 요청 유형 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.service.findAll(companyId)
  }

  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '커스텀 요청 유형 생성 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateCustomRequestTypeSchema))
    dto: CreateCustomRequestTypeDto,
  ) {
    return this.service.create(companyId, dto)
  }

  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '커스텀 요청 유형 수정 (fields는 전체 교체)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateCustomRequestTypeSchema))
    dto: UpdateCustomRequestTypeDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '커스텀 요청 유형 삭제 (소프트)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(companyId, id)
  }
}
