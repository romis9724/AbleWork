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
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { OrganizationsService } from './organizations.service'
import { OrganizationNode } from './organizations.types'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { AccessLevel } from '@ablework/shared-constants'
import { CreateOrganizationSchema, CreateOrganizationDto } from './dto/create-organization.dto'
import { UpdateOrganizationSchema, UpdateOrganizationDto } from './dto/update-organization.dto'
import { SetDocManagersSchema, SetDocManagersDto } from './dto/set-doc-managers.dto'
import { SetTimeclockAreasSchema, SetTimeclockAreasDto } from './dto/set-timeclock-areas.dto'

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: '조직 트리 조회' })
  findTree(@CompanyId() companyId: string): Promise<OrganizationNode[]> {
    return this.organizationsService.findTree(companyId)
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '조직 생성 (GENERAL_ADMIN 이상)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateOrganizationSchema)) dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(companyId, dto)
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '조직 수정 (GENERAL_ADMIN 이상)' })
  update(
    @Param('id') id: string,
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(UpdateOrganizationSchema)) dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, companyId, dto)
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '조직 소프트 삭제 (GENERAL_ADMIN 이상)' })
  remove(@Param('id') id: string, @CompanyId() companyId: string) {
    return this.organizationsService.remove(id, companyId)
  }

  // ── AP-04-07 부서 문서담당자(다중) ─────────────────────────────────────────────

  @Get(':id/doc-managers')
  @ApiOperation({ summary: '부서 문서담당자 목록 (대표=첫 번째)' })
  getDocManagers(@Param('id') id: string, @CompanyId() companyId: string) {
    return this.organizationsService.getDocManagers(companyId, id)
  }

  @Patch(':id/doc-managers')
  @UseGuards(RolesGuard)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '부서 문서담당자 집합 교체 (GENERAL_ADMIN 이상)' })
  setDocManagers(
    @Param('id') id: string,
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(SetDocManagersSchema)) dto: SetDocManagersDto,
  ) {
    return this.organizationsService.setDocManagers(companyId, id, dto.employeeIds)
  }

  // ── 출퇴근 장소 연결(다중, N:N) ─────────────────────────────────────────────

  @Get(':id/timeclock-areas')
  @ApiOperation({ summary: '조직에 연결된 출퇴근 장소 목록' })
  getTimeclockAreas(@Param('id') id: string, @CompanyId() companyId: string) {
    return this.organizationsService.getTimeclockAreas(companyId, id)
  }

  @Patch(':id/timeclock-areas')
  @UseGuards(RolesGuard)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiOperation({ summary: '조직 출퇴근 장소 연결 집합 교체 (GENERAL_ADMIN 이상)' })
  setTimeclockAreas(
    @Param('id') id: string,
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(SetTimeclockAreasSchema)) dto: SetTimeclockAreasDto,
  ) {
    return this.organizationsService.setTimeclockAreas(companyId, id, dto.areaIds)
  }
}
