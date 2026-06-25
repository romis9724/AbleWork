import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiExcludeEndpoint } from '@nestjs/swagger'
import type { Response } from 'express'
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../../../common/decorators/current-user.decorator'
import { JwtPayload } from '../../../../common/types/jwt-payload.type'
import { DiscordOAuthService } from './discord-oauth.service'

/** FE 연동 결과 리다이렉트 대상(기본 프로덕션 도메인) */
const WEB_BASE_URL = process.env.WEB_BASE_URL ?? 'https://work.abmwc.net'
const RESULT_PATH = '/me/profile'

/**
 * 직원 Discord 계정 OAuth 연동.
 * - start: JWT 인증된 직원이 호출 → 인증 URL을 JSON으로 반환(FE가 window.location 이동).
 *   (브라우저 직접 이동은 Authorization 헤더가 없어 JWT 가드를 못 통과하므로 URL만 내려준다.)
 * - callback: Discord가 브라우저 리다이렉트로 호출(무인증, state로 본인 검증) → 처리 후 FE로 302.
 */
@ApiTags('integrations')
@Controller('integrations/discord/oauth')
export class DiscordOAuthController {
  constructor(private readonly oauth: DiscordOAuthService) {}

  @Get('start')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Discord 연동 시작 — 인증 URL 반환(FE가 이동)' })
  start(@CurrentUser() user: JwtPayload): { url: string } {
    return { url: this.oauth.buildAuthorizeUrl(user) }
  }

  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      await this.oauth.handleCallback(code, state)
      res.redirect(`${WEB_BASE_URL}${RESULT_PATH}?discord=linked`)
    } catch {
      // 실패 사유는 서버 로그로, 사용자에겐 결과 플래그만 전달
      res.redirect(`${WEB_BASE_URL}${RESULT_PATH}?discord=error`)
    }
  }
}
