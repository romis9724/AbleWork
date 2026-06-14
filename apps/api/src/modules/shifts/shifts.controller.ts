import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { ShiftsService } from './shifts.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import { CreateShiftSchema, UpdateShiftSchema, CreateShiftDto, UpdateShiftDto } from './dto/create-shift.dto'
import { BulkCreateShiftSchema, BulkCreateShiftDto } from './dto/bulk-create-shift.dto'
import { ShiftFilterSchema, ShiftFilterDto } from './dto/shift-filter.dto'

@ApiTags('shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  // HR-04-04 근무일정 조회 (비관리자는 본인 일정만 — 서버측 스코핑)
  @Get()
  @ApiOperation({ summary: '근무일정 조회 (EMPLOYEE는 본인 일정만)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(ShiftFilterSchema)) filter: ShiftFilterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.shiftsService.findAll(companyId, filter, user)
  }

  // HR-04-05 단일 근무일정 생성
  @Post()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '근무일정 생성 (ORG_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateShiftSchema)) dto: CreateShiftDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.shiftsService.create(companyId, dto, requester)
  }

  // HR-04-06 일괄 근무일정 생성
  @Post('bulk')
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '근무일정 일괄 생성 (ORG_ADMIN 이상)' })
  bulkCreate(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(BulkCreateShiftSchema)) dto: BulkCreateShiftDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.shiftsService.bulkCreate(companyId, dto, requester)
  }

  // HR-04-07 근무일정 수정
  @Patch(':id')
  @ApiOperation({ summary: '근무일정 수정 (확정된 일정 불가)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateShiftSchema)) dto: UpdateShiftDto,
  ) {
    return this.shiftsService.update(companyId, id, dto)
  }

  // HR-04-08 근무일정 삭제
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '근무일정 삭제 (확정된 일정 불가, ORG_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftsService.remove(companyId, id)
  }

  // HR-04-09 근무일정 확정
  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '근무일정 확정 (ORG_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  confirm(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.shiftsService.confirm(companyId, id, requester)
  }

  // HR-04-14 근무일정 확정 해제
  @Post(':id/unconfirm')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '근무일정 확정 해제 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  unconfirm(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.shiftsService.unconfirm(companyId, id, requester)
  }
}
