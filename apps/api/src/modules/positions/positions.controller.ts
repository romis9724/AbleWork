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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { PositionsService } from './positions.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreatePositionDto,
  CreatePositionSchema,
  UpdatePositionDto,
  UpdatePositionSchema,
  ReorderPositionsDto,
  ReorderPositionsSchema,
} from './dto/create-position.dto'

@ApiTags('positions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  // HR-03-07 직위 목록
  @Get()
  @ApiOperation({ summary: '직위 목록 조회' })
  findAll(@CompanyId() companyId: string) {
    return this.positionsService.findAll(companyId)
  }

  // HR-03-07 직위 생성
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '직위 생성 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreatePositionSchema)) dto: CreatePositionDto,
  ) {
    return this.positionsService.create(companyId, dto)
  }

  // HR-03-07 직위 정렬 순서 변경 (':id'보다 먼저 선언해야 'reorder'가 UUID로 매칭되지 않음)
  @Patch('reorder')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '직위 정렬 순서 변경 (GENERAL_ADMIN 이상)' })
  reorder(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(ReorderPositionsSchema)) dto: ReorderPositionsDto,
  ) {
    return this.positionsService.reorder(companyId, dto.ids)
  }

  // HR-03-07 직위 수정
  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '직위 수정' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdatePositionSchema)) dto: UpdatePositionDto,
  ) {
    return this.positionsService.update(companyId, id, dto)
  }

  // HR-03-07 직위 삭제 (소프트)
  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '직위 삭제 (소프트 삭제)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.positionsService.remove(companyId, id)
  }
}
