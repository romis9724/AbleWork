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
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger'
import { SharedApprovalLinesService } from './shared-approval-lines.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { ApprovalEnabledGuard } from '../../common/guards/approval-enabled.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import {
  CreateSharedLineDto,
  CreateSharedLineSchema,
  UpdateSharedLineDto,
  UpdateSharedLineSchema,
  PersonalLineFilterDto,
  PersonalLineFilterSchema,
} from './dto/document-form.dto'

/**
 * AP — 개인 결재선 (빠른 결재선 불러오기)
 * 작성자 본인(JWT employeeId)만 자신의 결재선을 조회·생성·수정·삭제할 수 있다.
 * @Roles 미지정 — 인증된 전 직원(EMPLOYEE+)이 사용. 소유자 검증은 서비스가 강제한다.
 */
@ApiTags('personal-approval-lines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, ApprovalEnabledGuard)
@Controller('personal-approval-lines')
export class PersonalApprovalLinesController {
  constructor(private readonly sharedApprovalLinesService: SharedApprovalLinesService) {}

  @Get()
  @ApiOperation({ summary: '내 결재선 목록 조회 (본인 소유, 결재선명 부분검색)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: '결재선명' })
  findAll(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(PersonalLineFilterSchema)) filter: PersonalLineFilterDto,
  ) {
    return this.sharedApprovalLinesService.findPersonal(companyId, user.employeeId, filter)
  }

  @Post()
  @ApiOperation({ summary: '내 결재선 저장 (현재 결재선 구성을 개인용으로 보관)' })
  create(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateSharedLineSchema)) dto: CreateSharedLineDto,
  ) {
    return this.sharedApprovalLinesService.createPersonal(companyId, dto, user.employeeId)
  }

  @Patch(':id')
  @ApiOperation({ summary: '내 결재선 수정 (본인 소유분만)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateSharedLineSchema)) dto: UpdateSharedLineDto,
  ) {
    return this.sharedApprovalLinesService.updatePersonal(companyId, id, dto, user.employeeId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '내 결재선 삭제 (본인 소유분만)' })
  @ApiParam({ name: 'id', type: String })
  remove(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.sharedApprovalLinesService.removePersonal(companyId, id, user.employeeId)
  }
}
