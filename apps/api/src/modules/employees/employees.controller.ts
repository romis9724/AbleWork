import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { EmployeesService } from './employees.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import { CreateEmployeeDto, CreateEmployeeSchema } from './dto/create-employee.dto'
import { UpdateEmployeeDto, UpdateEmployeeSchema } from './dto/update-employee.dto'
import { EmployeeFilterDto, EmployeeFilterSchema } from './dto/employee-filter.dto'
import { CreateWageInfoDto, CreateWageInfoSchema } from '../wage-info/dto/create-wage-info.dto'
import { z } from 'zod'

const DeactivateSchema = z
  .object({
    resignedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .optional()
  .default({})

type DeactivateDto = z.infer<typeof DeactivateSchema>

@ApiTags('employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  // HR-03-01 직원 목록
  @Get()
  @ApiOperation({ summary: '직원 목록 조회' })
  findAll(
    @CompanyId() companyId: string,
    @Query(new ZodValidationPipe(EmployeeFilterSchema)) filter: EmployeeFilterDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.findAll(companyId, filter, requester)
  }

  // HR-03-02 직원 등록
  @Post()
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '직원 등록 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateEmployeeSchema)) dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(companyId, dto)
  }

  // HR-03-03 직원 상세
  @Get(':id')
  @ApiOperation({ summary: '직원 상세 조회' })
  @ApiParam({ name: 'id', type: String })
  findOne(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.findOne(companyId, id, requester)
  }

  // HR-03-04 직원 수정
  @Patch(':id')
  @ApiOperation({ summary: '직원 정보 수정' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateEmployeeSchema)) dto: UpdateEmployeeDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.update(companyId, id, dto, requester)
  }

  // HR-03-05 퇴사 처리
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.ORG_ADMIN)
  @ApiOperation({ summary: '직원 퇴사 처리 (ORG_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  deactivate(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(DeactivateSchema)) body: DeactivateDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.deactivate(companyId, id, body?.resignedAt, requester)
  }

  // HR-03-06 기기 초기화
  @Post(':id/reset-device')
  @HttpCode(HttpStatus.OK)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '기기 초기화 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  resetDevice(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.resetDevice(companyId, id, requester)
  }

  // HR-03-08 근로정보 이력 조회
  @Get(':id/wage-info')
  @ApiOperation({ summary: '근로정보 이력 조회' })
  @ApiParam({ name: 'id', type: String })
  findWageInfos(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.findWageInfos(companyId, id, requester)
  }

  // HR-03-09 근로정보 등록
  @Post(':id/wage-info')
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '근로정보 등록 (GENERAL_ADMIN 이상)' })
  @ApiParam({ name: 'id', type: String })
  createWageInfo(
    @CompanyId() companyId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(CreateWageInfoSchema)) dto: CreateWageInfoDto,
    @CurrentUser() requester: JwtPayload,
  ) {
    return this.employeesService.createWageInfo(companyId, id, dto, requester)
  }
}
