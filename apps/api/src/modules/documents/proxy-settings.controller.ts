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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger'
import { ProxySettingsService } from './proxy-settings.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { CompanyId } from '../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe'
import { JwtPayload } from '../../common/types/jwt-payload.type'
import {
  CreateProxySettingDto,
  CreateProxySettingSchema,
  UpdateProxySettingDto,
  UpdateProxySettingSchema,
} from './dto/proxy-setting.dto'

@ApiTags('proxy-settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('proxy-settings')
export class ProxySettingsController {
  constructor(private readonly proxySettingsService: ProxySettingsService) {}

  // AP-05-01 내 대리결재 설정 목록
  @Get()
  @ApiOperation({ summary: '내 대리결재자 설정 목록 조회' })
  findMine(@CurrentUser() user: JwtPayload) {
    return this.proxySettingsService.findMine(user.employeeId)
  }

  // AP-05-02 대리결재자 지정 (principal=본인)
  @Post()
  @ApiOperation({ summary: '대리결재자 지정 (본인지정 금지, 기간 검증)' })
  create(
    @CompanyId() companyId: string,
    @Body(new ZodValidationPipe(CreateProxySettingSchema)) dto: CreateProxySettingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.proxySettingsService.create(companyId, user.employeeId, dto)
  }

  // AP-05-03 대리결재 설정 수정 (본인만)
  @Patch(':id')
  @ApiOperation({ summary: '대리결재 설정 수정 (isActive/endDate, 본인만)' })
  @ApiParam({ name: 'id', type: String })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProxySettingSchema)) dto: UpdateProxySettingDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.proxySettingsService.update(user.employeeId, id, dto)
  }

  // AP-05-04 대리결재 설정 삭제 (본인만)
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '대리결재 설정 삭제 (본인만)' })
  @ApiParam({ name: 'id', type: String })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.proxySettingsService.remove(user.employeeId, id)
  }
}
