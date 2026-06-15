import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { CompaniesService } from './companies.service'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import { AccessLevel } from '@ablework/shared-constants'
import { CreateCompanySchema, CreateCompanyDto } from './dto/create-company.dto'
import { UpdateCompanySchema, UpdateCompanyDto } from './dto/update-company.dto'
import { JoinCompanySchema, JoinCompanyDto } from './dto/join-company.dto'

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '회사 생성 (최초 가입)' })
  create(@Body(new ZodValidationPipe(CreateCompanySchema)) dto: CreateCompanyDto) {
    return this.companiesService.create(dto)
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '회사 정보 조회' })
  findById(@Param('id') id: string, @CompanyId() companyId: string) {
    return this.companiesService.findById(id, companyId)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccessLevel.SUPER_ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '회사 정보 수정 (SUPER_ADMIN)' })
  update(
    @Param('id') id: string,
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(UpdateCompanySchema)) dto: UpdateCompanyDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.companiesService.update(id, companyId, dto, user.employeeId)
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '합류코드로 회사 합류' })
  join(@Body(new ZodValidationPipe(JoinCompanySchema)) dto: JoinCompanyDto) {
    return this.companiesService.joinByInviteCode(dto)
  }

  @Post('invite-code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccessLevel.GENERAL_ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '합류코드 발급 (GENERAL_ADMIN 이상)' })
  generateInviteCode(@CompanyId() companyId: string) {
    return this.companiesService.generateInviteCode(companyId)
  }
}
