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
import { AttendancesService } from './attendances.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import { ClockInSchema, ClockInDto } from './dto/clock-in.dto'
import {
  ClockOutSchema,
  ClockOutDto,
  BreakStartSchema,
  BreakStartDto,
  BreakEndSchema,
  BreakEndDto,
} from './dto/clock-out.dto'
import {
  AttendanceFilterSchema,
  AttendanceFilterDto,
  ConfirmPeriodSchema,
  ConfirmPeriodDto,
  UnconfirmAttendancesSchema,
  UnconfirmAttendancesDto,
} from './dto/attendance-filter.dto'
import { UpdateAttendanceSchema, UpdateAttendanceDto } from './dto/update-attendance.dto'

@ApiTags('attendances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendances')
export class AttendancesController {
  constructor(private readonly service: AttendancesService) {}

  // HR-05-02 출퇴근 목록
  @Get()
  @ApiOperation({ summary: '출퇴근 목록 조회 (기간/조직/직원 필터, 페이지네이션)' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(AttendanceFilterSchema)) filter: AttendanceFilterDto,
  ) {
    return this.service.findAll(companyId, filter)
  }

  // HR-05-03 현재 근무 현황
  @Get('now-at-work')
  @ApiOperation({ summary: '현재 근무 현황 조회 (companyId 기준)' })
  getNowAtWork(@CompanyId() companyId: string) {
    return this.service.getNowAtWork(companyId)
  }

  // HR-05-04 출근 기록
  @Post('clock-in')
  @ApiOperation({ summary: '출근 기록 (JWT에서 employeeId 자동 추출, 서버 시각 사용)' })
  clockIn(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ClockInSchema)) dto: ClockInDto,
  ) {
    return this.service.clockIn(companyId, user.employeeId, dto)
  }

  // HR-05-05 퇴근 기록
  @Post('clock-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '퇴근 기록 (진행 중인 출근 기록 자동 조회)' })
  clockOut(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ClockOutSchema)) dto: ClockOutDto,
  ) {
    return this.service.clockOut(companyId, user.employeeId, dto)
  }

  // HR-05-06 휴게 시작
  @Post('break-start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '휴게 시작 (현재 출근 기록 자동 조회)' })
  breakStart(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(BreakStartSchema)) dto: BreakStartDto,
  ) {
    return this.service.breakStart(companyId, user.employeeId, dto)
  }

  // HR-05-07 휴게 종료
  @Post('break-end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '휴게 종료 (현재 출근 기록 자동 조회)' })
  breakEnd(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(BreakEndSchema)) dto: BreakEndDto,
  ) {
    return this.service.breakEnd(companyId, user.employeeId, dto)
  }

  // HR-05-14 기간 확정
  @Post('confirm-period')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '기간 출퇴근 확정 (GENERAL_ADMIN 이상)' })
  confirmPeriod(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(ConfirmPeriodSchema)) dto: ConfirmPeriodDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.service.confirmPeriod(companyId, dto, requester.employeeId)
  }

  // HR-05-15 확정 해제
  @Post('unconfirm')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '출퇴근 확정 해제 (GENERAL_ADMIN 이상, ID 목록 또는 기간)' })
  unconfirm(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(UnconfirmAttendancesSchema)) dto: UnconfirmAttendancesDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.service.unconfirm(companyId, dto, requester)
  }

  // HR-05-12 출퇴근 수정 (관리자)
  @Patch(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '출퇴근 기록 수정 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAttendanceSchema)) dto: UpdateAttendanceDto,
  ) {
    return this.service.update(companyId, id, dto)
  }

  // HR-05-13 출퇴근 삭제 (관리자)
  @Delete(':id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '출퇴근 기록 삭제 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.remove(companyId, id)
  }
}
