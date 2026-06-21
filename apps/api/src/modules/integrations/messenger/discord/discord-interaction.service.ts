import { Injectable, Logger } from '@nestjs/common'
import { AccessLevel } from '@ablework/shared-constants'
import { PrismaService } from '../../../../prisma/prisma.service'
import { RequestsService } from '../../../requests/requests.service'
import { JwtPayload } from '../../../../common/types/jwt-payload.type'

// Discord interaction type
const INTERACTION_PING = 1
const INTERACTION_COMPONENT = 3
// Discord interaction response type
const RESP_PONG = 1
const RESP_CHANNEL_MESSAGE = 4
const RESP_UPDATE_MESSAGE = 7
// message flag — ephemeral(클릭자에게만 표시)
const EPHEMERAL = 64
const BRAND_COLOR = 0xf36f20

interface DiscordInteraction {
  type: number
  data?: { custom_id?: string }
  member?: { user?: { id?: string } }
  user?: { id?: string }
}

/**
 * Discord Interaction 처리 — 서명검증을 통과한 요청만 들어온다.
 * PING은 PONG으로, 버튼(MESSAGE_COMPONENT)은 custom_id를 파싱해 본인 검증 후
 * 기존 결재 액션(RequestsService)을 호출하고 원 메시지를 결과로 갱신한다.
 */
@Injectable()
export class DiscordInteractionService {
  private readonly logger = new Logger(DiscordInteractionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {}

  async handle(interaction: DiscordInteraction): Promise<object> {
    if (interaction.type === INTERACTION_PING) return { type: RESP_PONG }
    if (interaction.type === INTERACTION_COMPONENT) return this.handleButton(interaction)
    return this.ephemeral('처리할 수 없는 상호작용입니다.')
  }

  private async handleButton(interaction: DiscordInteraction): Promise<object> {
    const [ns, action, kind, refId] = (interaction.data?.custom_id ?? '').split(':')
    if (ns !== 'ablework' || kind !== 'request' || !refId) {
      return this.ephemeral('알 수 없는 동작입니다.')
    }

    const discordUserId = interaction.member?.user?.id ?? interaction.user?.id
    if (!discordUserId) return this.ephemeral('사용자를 식별할 수 없습니다.')

    // 메신저 계정 → 직원/회사 역해석 (본인 검증)
    const account = await this.prisma.messengerAccount.findFirst({
      where: { platform: 'discord', externalUserId: discordUserId },
    })
    if (!account) {
      return this.ephemeral('연동된 계정이 없습니다. 관리자에게 메신저 연동을 요청하세요.')
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: account.employeeId, companyId: account.companyId },
      select: { id: true, userId: true, accessLevel: true, companyId: true },
    })
    if (!employee) return this.ephemeral('직원 정보를 찾을 수 없습니다.')

    const requester: JwtPayload = {
      sub: employee.userId ?? '',
      employeeId: employee.id,
      companyId: employee.companyId,
      accessLevel: employee.accessLevel as AccessLevel,
    }

    try {
      if (action === 'approve') {
        await this.requestsService.approve(account.companyId, refId, {}, requester)
        return this.updateResult('✅ 승인 완료', '결재가 승인되었습니다.')
      }
      if (action === 'reject') {
        await this.requestsService.reject(account.companyId, refId, { comment: '메신저에서 반려' }, requester)
        return this.updateResult('❌ 반려', '결재가 반려되었습니다.')
      }
      return this.ephemeral('알 수 없는 동작입니다.')
    } catch (err) {
      const message = this.errorMessage(err)
      this.logger.warn(`메신저 결재 처리 실패 (request=${refId}, action=${action}): ${message}`)
      return this.ephemeral(`처리하지 못했습니다 — ${message}`)
    }
  }

  /** type 7: 원 메시지(버튼 포함)를 결과 embed로 갱신하고 버튼 제거 */
  private updateResult(title: string, description: string): object {
    return {
      type: RESP_UPDATE_MESSAGE,
      data: { embeds: [{ title, description, color: BRAND_COLOR }], components: [] },
    }
  }

  /** type 4 + ephemeral flag: 클릭자에게만 보이는 안내 메시지 */
  private ephemeral(content: string): object {
    return { type: RESP_CHANNEL_MESSAGE, data: { content, flags: EPHEMERAL } }
  }

  /** NestJS HttpException(커스텀 {code,message}) 또는 일반 에러에서 사용자 메시지 추출 */
  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const response = (err as { response?: { message?: string } }).response
      if (response?.message) return response.message
    }
    return err instanceof Error ? err.message : '알 수 없는 오류'
  }
}
