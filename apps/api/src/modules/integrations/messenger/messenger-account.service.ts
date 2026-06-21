import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../../prisma/prisma.service'
import { LinkMessengerDto } from './messenger-account.dto'

const ACCOUNT_SELECT = { id: true, platform: true, externalUserId: true, createdAt: true } as const

/**
 * 메신저 계정 연동 — 직원 본인이 자기 메신저 사용자 ID를 등록/조회/해제.
 * 버튼 클릭자(externalUserId) → 직원 역해석으로 결재 본인 검증에 쓰인다(DiscordInteractionService).
 */
@Injectable()
export class MessengerAccountService {
  constructor(private readonly prisma: PrismaService) {}

  /** 본인 연동(동일 platform 재등록 시 externalUserId 갱신) */
  link(companyId: string, employeeId: string, dto: LinkMessengerDto) {
    return this.prisma.messengerAccount.upsert({
      where: { companyId_employeeId_platform: { companyId, employeeId, platform: dto.platform } },
      create: { companyId, employeeId, platform: dto.platform, externalUserId: dto.externalUserId },
      update: { externalUserId: dto.externalUserId },
      select: ACCOUNT_SELECT,
    })
  }

  /** 본인 연동 목록 */
  findMine(companyId: string, employeeId: string) {
    return this.prisma.messengerAccount.findMany({
      where: { companyId, employeeId },
      select: ACCOUNT_SELECT,
    })
  }

  /** 본인 연동 해제 (멀티테넌시 + 본인 소유 검증) */
  async unlink(companyId: string, employeeId: string, id: string) {
    const account = await this.prisma.messengerAccount.findFirst({
      where: { id, companyId, employeeId },
      select: { id: true },
    })
    if (!account) {
      throw new NotFoundException({
        code: 'MESSENGER_ACCOUNT_NOT_FOUND',
        message: '메신저 연동을 찾을 수 없습니다.',
      })
    }
    await this.prisma.messengerAccount.delete({ where: { id } })
    return { deleted: true }
  }
}
