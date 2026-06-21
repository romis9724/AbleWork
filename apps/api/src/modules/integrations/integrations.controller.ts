import {
  Controller,
  Post,
  Req,
  Res,
  Headers,
  HttpCode,
  RawBodyRequest,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { DiscordInteractionService } from './messenger/discord/discord-interaction.service'
import { verifyDiscordSignature } from './messenger/discord/discord-signature'

@ApiTags('integrations')
@Controller('integrations/discord')
export class IntegrationsController {
  constructor(private readonly interactionService: DiscordInteractionService) {}

  /**
   * Discord Interactions Endpoint (메신저 양방향 결재 콜백).
   *
   * - JWT 가드 없음: Discord가 호출하므로 인증은 **Ed25519 서명검증**으로 한다.
   * - `@Res`로 직접 응답: Discord 고유 응답 형식({type,data})이라 글로벌
   *   ResponseTransformInterceptor의 {success,data} 래핑을 우회해야 한다.
   * - rawBody 필요: 서명검증은 원문 바이트 대상(main.ts `rawBody: true`).
   */
  @Post('interactions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Discord Interactions 콜백(서명검증)' })
  @ApiExcludeEndpoint()
  async interactions(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
    @Headers('x-signature-ed25519') signature: string,
    @Headers('x-signature-timestamp') timestamp: string,
  ): Promise<void> {
    const publicKey = process.env.DISCORD_PUBLIC_KEY ?? ''
    const rawBody = req.rawBody
    const verified =
      !!rawBody && verifyDiscordSignature({ publicKey, signature, timestamp, rawBody })

    if (!verified) {
      res.status(401).json({ error: 'invalid request signature' })
      return
    }

    const interaction = JSON.parse(rawBody.toString('utf8'))
    const result = await this.interactionService.handle(interaction)
    res.status(200).json(result)
  }
}
