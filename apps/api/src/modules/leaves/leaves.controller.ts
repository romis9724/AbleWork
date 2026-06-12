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
import { LeavesService } from './leaves.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { AccessLevel } from '@ablework/shared-constants'
import {
  CreateLeaveGroupDto,
  CreateLeaveGroupSchema,
  UpdateLeaveGroupDto,
  UpdateLeaveGroupSchema,
} from './dto/create-leave-group.dto'
import {
  CreateLeaveTypeDto,
  CreateLeaveTypeSchema,
  UpdateLeaveTypeDto,
  UpdateLeaveTypeSchema,
} from './dto/create-leave-type.dto'
import {
  CreateAccrualRuleDto,
  CreateAccrualRuleSchema,
  UpdateAccrualRuleDto,
  UpdateAccrualRuleSchema,
  RunAccrualRuleDto,
  RunAccrualRuleSchema,
} from './dto/accrual-rule.dto'
import {
  CreateLeaveDto,
  CreateLeaveSchema,
  ManualAccrualDto,
  ManualAccrualSchema,
  CompensationLeaveDto,
  CompensationLeaveSchema,
  LeaveFilterDto,
  LeaveFilterSchema,
} from './dto/create-leave.dto'

@ApiTags('leaves')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  // HR-06-01 휴가 그룹 목록
  @Get('groups')
  @ApiOperation({ summary: '휴가 그룹 목록 조회' })
  findGroups(@CompanyId() companyId: string) {
    return this.leavesService.findGroups(companyId)
  }

  // HR-06-02 휴가 그룹 생성
  @Post('groups')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '휴가 그룹 생성 (GENERAL_ADMIN 이상)' })
  createGroup(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateLeaveGroupSchema)) dto: CreateLeaveGroupDto,
  ) {
    return this.leavesService.createGroup(companyId, dto)
  }

  // 휴가 그룹 수정
  @Patch('groups/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '휴가 그룹 수정 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  updateGroup(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateLeaveGroupSchema)) dto: UpdateLeaveGroupDto,
  ) {
    return this.leavesService.updateGroup(companyId, id, dto)
  }

  // 휴가 그룹 삭제 (소프트)
  @Delete('groups/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '휴가 그룹 삭제 (소프트 — isActive=false)' })
  @ApiParam({ name: 'id', type: String })
  deleteGroup(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leavesService.deleteGroup(companyId, id)
  }

  // HR-06-03 휴가 유형 목록
  @Get('types')
  @ApiOperation({ summary: '휴가 유형 목록 조회' })
  findTypes(@CompanyId() companyId: string) {
    return this.leavesService.findTypes(companyId)
  }

  // HR-06-04 휴가 유형 생성
  @Post('types')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '휴가 유형 생성 (GENERAL_ADMIN 이상)' })
  createType(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateLeaveTypeSchema)) dto: CreateLeaveTypeDto,
  ) {
    return this.leavesService.createType(companyId, dto)
  }

  // HR-06-05 휴가 유형 수정
  @Patch('types/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '휴가 유형 수정' })
  @ApiParam({ name: 'id', type: String })
  updateType(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateLeaveTypeSchema)) dto: UpdateLeaveTypeDto,
  ) {
    return this.leavesService.updateType(companyId, id, dto)
  }

  // 휴가 유형 삭제 (소프트)
  @Delete('types/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '휴가 유형 삭제 (소프트 — isActive=false)' })
  @ApiParam({ name: 'id', type: String })
  deleteType(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leavesService.deleteType(companyId, id)
  }

  // HR-06-06 발생 규칙 목록
  @Get('accrual-rules')
  @ApiOperation({ summary: '발생 규칙 목록 조회' })
  findAccrualRules(@CompanyId() companyId: string) {
    return this.leavesService.findAccrualRules(companyId)
  }

  // HR-06-07 발생 규칙 생성
  @Post('accrual-rules')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '발생 규칙 생성' })
  createAccrualRule(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateAccrualRuleSchema)) dto: CreateAccrualRuleDto,
  ) {
    return this.leavesService.createAccrualRule(companyId, dto)
  }

  // 발생 규칙 수정 (items 전체 교체)
  @Patch('accrual-rules/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '발생 규칙 수정 (items 제공 시 전체 교체)' })
  @ApiParam({ name: 'id', type: String })
  updateAccrualRule(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateAccrualRuleSchema)) dto: UpdateAccrualRuleDto,
  ) {
    return this.leavesService.updateAccrualRule(companyId, id, dto)
  }

  // 발생 규칙 삭제
  @Delete('accrual-rules/:id')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '발생 규칙 삭제' })
  @ApiParam({ name: 'id', type: String })
  deleteAccrualRule(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leavesService.deleteAccrualRule(companyId, id)
  }

  // HR-06-08 발생 규칙 기반 발생 실행
  @Post('accrual-rules/:id/run')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '발생 규칙 실행 (특정 직원 또는 전체)' })
  @ApiParam({ name: 'id', type: String })
  runAccrualRule(
    @CompanyId() companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RunAccrualRuleSchema)) dto: RunAccrualRuleDto,
  ) {
    return this.leavesService.runAccrualRule(companyId, id, dto)
  }

  // HR-06-09 잔여 휴가 조회
  @Get('balance/:employeeId')
  @ApiOperation({ summary: '직원 잔여 휴가 조회' })
  @ApiParam({ name: 'employeeId', type: String })
  getBalance(
    @CompanyId() companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.leavesService.getBalance(companyId, employeeId)
  }

  // HR-06-10 수동 발생 (관리자 임의 부여)
  @Post('accrual')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '수동 휴가 발생 (관리자 임의 부여)' })
  manualAccrual(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(ManualAccrualSchema)) dto: ManualAccrualDto,
  ) {
    return this.leavesService.manualAccrual(companyId, dto)
  }

  // 관리자 휴가 직접 추가 (잔액 검증 + 차감)
  @Post()
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '관리자 휴가 직접 추가 (ORG_ADMIN 이상)' })
  createLeave(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateLeaveSchema)) dto: CreateLeaveDto,
  ) {
    return this.leavesService.createLeave(companyId, dto)
  }

  // HR-06-11 휴가 일정 조회
  @Get()
  @ApiOperation({ summary: '휴가 일정 조회 (기간/직원 필터)' })
  findLeaves(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(LeaveFilterSchema)) filter: LeaveFilterDto,
  ) {
    return this.leavesService.findLeaves(companyId, filter)
  }

  // HR-06-12 보상휴가 발생
  @Post('compensation')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '보상휴가 발생' })
  createCompensationLeave(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CompensationLeaveSchema)) dto: CompensationLeaveDto,
  ) {
    return this.leavesService.createCompensationLeave(companyId, dto)
  }
}
