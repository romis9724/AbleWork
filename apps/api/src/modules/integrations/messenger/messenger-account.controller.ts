import { Controller, Post, Get, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard'
import { CompanyId } from '../../../common/decorators/company-id.decorator'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import { JwtPayload } from '../../../common/types/jwt-payload.type'
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe'
import { MessengerAccountService } from './messenger-account.service'
import { LinkMessengerSchema, LinkMessengerDto } from './messenger-account.dto'

/** 메신저 계정 연동 — 직원 본인(JWT)이 자기 메신저 사용자 ID를 관리 */
@ApiTags('messenger-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('integrations/messenger/accounts')
export class MessengerAccountController {
  constructor(private readonly service: MessengerAccountService) {}

  @Post()
  @ApiOperation({ summary: '본인 메신저 계정 연동(등록/갱신)' })
  link(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(LinkMessengerSchema)) dto: LinkMessengerDto,
  ) {
    return this.service.link(companyId, user.employeeId, dto)
  }

  @Get('me')
  @ApiOperation({ summary: '본인 메신저 연동 목록' })
  mine(@CompanyId() companyId: string, @CurrentUser() user: JwtPayload) {
    return this.service.findMine(companyId, user.employeeId)
  }

  @Delete(':id')
  @ApiOperation({ summary: '본인 메신저 연동 해제' })
  @ApiParam({ name: 'id', type: String })
  unlink(
    @CompanyId() companyId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.unlink(companyId, user.employeeId, id)
  }
}
