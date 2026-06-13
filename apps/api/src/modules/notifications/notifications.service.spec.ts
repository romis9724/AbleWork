import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { PrismaService } from '../../prisma/prisma.service'

// ── 공통 픽스처 ────────────────────────────────────────────────────────────────

const COMPANY_ID = 'company-1'
const OTHER_COMPANY_ID = 'company-2'
const RULE_ID = 'rule-1'

const baseRule = {
  id: RULE_ID,
  companyId: COMPANY_ID,
  eventType: 'clock_in',
  channelType: 'discord',
  webhookUrl: 'https://discord.com/api/webhooks/abc',
  triggerCondition: null,
  embedTemplate: null,
  messageTemplateId: null,
  isActive: true,
  cronExpression: null,
  createdAt: new Date('2024-01-01'),
}

// ── 모킹 ───────────────────────────────────────────────────────────────────────
// 서비스가 실제 사용하는 모델/메서드만 jest.fn()으로 정의한다.

const mockPrisma = {
  notificationRule: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    findFirst: jest.fn(),
  },
  notificationLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let service: NotificationsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile()

    service = module.get<NotificationsService>(NotificationsService)
    jest.clearAllMocks()
  })

  // ── getRules ───────────────────────────────────────────────────────────────

  describe('getRules', () => {
    it('회사 규칙 목록을 페이징 메타와 함께 반환한다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([baseRule])
      mockPrisma.notificationRule.count.mockResolvedValue(1)

      const result = await service.getRules(COMPANY_ID, { page: 1, limit: 20 })

      expect(result).toEqual({ items: [baseRule], total: 1, page: 1, limit: 20 })
    })

    it('멀티테넌시 — findMany/count where에 companyId가 포함된다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([])
      mockPrisma.notificationRule.count.mockResolvedValue(0)

      await service.getRules(COMPANY_ID, { page: 1, limit: 20 })

      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
      expect(mockPrisma.notificationRule.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
    })

    it('페이징 — skip/take 계산이 page·limit에 따라 적용된다 (page=3, limit=10 → skip=20)', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([])
      mockPrisma.notificationRule.count.mockResolvedValue(0)

      await service.getRules(COMPANY_ID, { page: 3, limit: 10 })

      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      )
    })

    it('페이징 경계 — page=1, limit=100 → skip=0, take=100', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([])
      mockPrisma.notificationRule.count.mockResolvedValue(0)

      await service.getRules(COMPANY_ID, { page: 1, limit: 100 })

      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 100 }),
      )
    })

    it('SUPER_ADMIN 교차 회사 조회 — query.companyId가 제공되면 해당 값이 where에 사용된다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([])
      mockPrisma.notificationRule.count.mockResolvedValue(0)

      await service.getRules(COMPANY_ID, {
        page: 1,
        limit: 20,
        companyId: OTHER_COMPANY_ID,
      })

      // queryCompanyId가 JWT companyId를 오버라이드한다 (컨트롤러 SUPER_ADMIN 가드 전제)
      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: OTHER_COMPANY_ID } }),
      )
      expect(mockPrisma.notificationRule.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: OTHER_COMPANY_ID } }),
      )
    })

    it('query.companyId가 없으면 JWT companyId로 폴백한다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([])
      mockPrisma.notificationRule.count.mockResolvedValue(0)

      await service.getRules(COMPANY_ID, { page: 1, limit: 20 })

      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
    })
  })

  // ── createRule ───────────────────────────────────────────────────────────────

  describe('createRule', () => {
    it('규칙을 생성하고 data에 companyId를 주입한다', async () => {
      mockPrisma.notificationRule.create.mockResolvedValue(baseRule)

      const dto = {
        name: '출근 알림',
        eventType: 'clock_in',
        channelType: 'discord' as const,
        webhookUrl: 'https://discord.com/api/webhooks/abc',
        isActive: true,
      }

      const result = await service.createRule(COMPANY_ID, dto)

      expect(result).toEqual(baseRule)
      expect(mockPrisma.notificationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            eventType: 'clock_in',
            channelType: 'discord',
            webhookUrl: 'https://discord.com/api/webhooks/abc',
          }),
        }),
      )
    })

    it('JSON 옵션 필드(triggerCondition, embedTemplate)가 제공되면 그대로 전달한다', async () => {
      mockPrisma.notificationRule.create.mockResolvedValue(baseRule)

      const dto = {
        name: '지각 알림',
        eventType: 'late',
        channelType: 'discord' as const,
        triggerCondition: { minLateMinutes: 10 },
        embedTemplate: { title: '지각' },
        isActive: true,
      }

      await service.createRule(COMPANY_ID, dto)

      expect(mockPrisma.notificationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            triggerCondition: { minLateMinutes: 10 },
            embedTemplate: { title: '지각' },
          }),
        }),
      )
    })

    it('JSON 옵션 필드가 없으면 undefined로 전달한다 (null 미설정)', async () => {
      mockPrisma.notificationRule.create.mockResolvedValue(baseRule)

      const dto = {
        name: '퇴근 알림',
        eventType: 'clock_out',
        channelType: 'discord' as const,
        isActive: true,
      }

      await service.createRule(COMPANY_ID, dto)

      const callArg = mockPrisma.notificationRule.create.mock.calls[0][0] as {
        data: { triggerCondition?: unknown; embedTemplate?: unknown }
      }
      expect(callArg.data.triggerCondition).toBeUndefined()
      expect(callArg.data.embedTemplate).toBeUndefined()
    })
  })

  // ── updateRule ───────────────────────────────────────────────────────────────

  describe('updateRule', () => {
    it('회사 규칙을 수정한다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue({ ...baseRule, isActive: false })

      const result = await service.updateRule(RULE_ID, COMPANY_ID, { isActive: false })

      expect(result.isActive).toBe(false)
    })

    it('멀티테넌시(CRITICAL) — update where에 id뿐 아니라 companyId가 포함된다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue(baseRule)

      await service.updateRule(RULE_ID, COMPANY_ID, { isActive: false })

      // 버그 수정 검증: where가 { id } 단독이 아니라 { id, companyId } 여야 한다.
      expect(mockPrisma.notificationRule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: RULE_ID, companyId: COMPANY_ID }),
        }),
      )
    })

    it('멀티테넌시 — 조회(findFirst) 단계에서도 companyId로 소유권을 검증한다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue(baseRule)

      await service.updateRule(RULE_ID, COMPANY_ID, { isActive: true })

      expect(mockPrisma.notificationRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: RULE_ID, companyId: COMPANY_ID } }),
      )
    })

    it('부분 수정 — eventType만 제공하면 해당 필드만 data에 포함된다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue(baseRule)

      await service.updateRule(RULE_ID, COMPANY_ID, { eventType: 'absent' })

      const callArg = mockPrisma.notificationRule.update.mock.calls[0][0] as {
        data: Record<string, unknown>
      }
      expect(callArg.data).toEqual({ eventType: 'absent' })
    })

    it('부분 수정 — webhookUrl만 제공하면 해당 필드만 data에 포함된다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue(baseRule)

      await service.updateRule(RULE_ID, COMPANY_ID, {
        webhookUrl: 'https://discord.com/api/webhooks/new',
      })

      const callArg = mockPrisma.notificationRule.update.mock.calls[0][0] as {
        data: Record<string, unknown>
      }
      expect(callArg.data).toEqual({
        webhookUrl: 'https://discord.com/api/webhooks/new',
      })
    })

    it('존재하지 않거나 타 회사 규칙이면 NotFoundException(RULE_NOT_FOUND)을 던진다', async () => {
      // 타 회사 규칙은 companyId 조건 때문에 findFirst가 null을 반환한다.
      mockPrisma.notificationRule.findFirst.mockResolvedValue(null)

      await expect(
        service.updateRule(RULE_ID, COMPANY_ID, { isActive: false }),
      ).rejects.toThrow(NotFoundException)
      expect(mockPrisma.notificationRule.update).not.toHaveBeenCalled()
    })
  })

  // ── updateWebhook ─────────────────────────────────────────────────────────────

  describe('updateWebhook', () => {
    it('규칙이 하나도 없으면 7개의 기본 이벤트 규칙을 companyId와 함께 생성한다', async () => {
      mockPrisma.notificationRule.count.mockResolvedValue(0)
      mockPrisma.notificationRule.createMany.mockResolvedValue({ count: 7 })
      mockPrisma.notificationRule.findMany.mockResolvedValue([baseRule])

      const dto = { webhookUrl: 'https://discord.com/api/webhooks/abc' }
      const result = await service.updateWebhook(COMPANY_ID, dto)

      expect(mockPrisma.notificationRule.createMany).toHaveBeenCalledTimes(1)
      const callArg = mockPrisma.notificationRule.createMany.mock.calls[0][0] as {
        data: Array<{ companyId: string; webhookUrl: string | null }>
      }
      expect(callArg.data).toHaveLength(7)
      // 멀티테넌시: 생성되는 모든 기본 규칙에 companyId가 박혀야 한다.
      callArg.data.forEach((row) => {
        expect(row.companyId).toBe(COMPANY_ID)
        expect(row.webhookUrl).toBe('https://discord.com/api/webhooks/abc')
      })
      expect(mockPrisma.notificationRule.updateMany).not.toHaveBeenCalled()
      expect(result).toEqual([baseRule])
    })

    it('규칙이 존재하면 updateMany로 일괄 갱신한다 (멀티테넌시 — where.companyId)', async () => {
      mockPrisma.notificationRule.count.mockResolvedValue(3)
      mockPrisma.notificationRule.updateMany.mockResolvedValue({ count: 3 })
      mockPrisma.notificationRule.findMany.mockResolvedValue([baseRule])

      await service.updateWebhook(COMPANY_ID, {
        webhookUrl: 'https://discord.com/api/webhooks/abc',
      })

      expect(mockPrisma.notificationRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: COMPANY_ID }),
          data: { webhookUrl: 'https://discord.com/api/webhooks/abc' },
        }),
      )
      expect(mockPrisma.notificationRule.createMany).not.toHaveBeenCalled()
    })

    it('빈 문자열 webhookUrl은 null로 변환된다', async () => {
      mockPrisma.notificationRule.count.mockResolvedValue(2)
      mockPrisma.notificationRule.updateMany.mockResolvedValue({ count: 2 })
      mockPrisma.notificationRule.findMany.mockResolvedValue([])

      await service.updateWebhook(COMPANY_ID, { webhookUrl: '' })

      expect(mockPrisma.notificationRule.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { webhookUrl: null } }),
      )
    })

    it('빈 문자열 webhookUrl + 규칙 없음 → 기본 규칙들이 null webhookUrl로 생성된다', async () => {
      mockPrisma.notificationRule.count.mockResolvedValue(0)
      mockPrisma.notificationRule.createMany.mockResolvedValue({ count: 7 })
      mockPrisma.notificationRule.findMany.mockResolvedValue([])

      await service.updateWebhook(COMPANY_ID, { webhookUrl: '' })

      const callArg = mockPrisma.notificationRule.createMany.mock.calls[0][0] as {
        data: Array<{ webhookUrl: string | null }>
      }
      callArg.data.forEach((row) => expect(row.webhookUrl).toBeNull())
    })

    it('멀티테넌시 — 갱신 후 반환 조회(findMany)도 companyId로 필터한다', async () => {
      mockPrisma.notificationRule.count.mockResolvedValue(1)
      mockPrisma.notificationRule.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.notificationRule.findMany.mockResolvedValue([baseRule])

      await service.updateWebhook(COMPANY_ID, {
        webhookUrl: 'https://discord.com/api/webhooks/abc',
      })

      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID } }),
      )
    })
  })

  // ── updateEventRule ───────────────────────────────────────────────────────────

  describe('updateEventRule', () => {
    it('기존 규칙이 있으면 isActive만 갱신한다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue({ ...baseRule, isActive: false })

      const result = await service.updateEventRule(COMPANY_ID, {
        eventType: 'clock_in',
        isActive: false,
      })

      expect(mockPrisma.notificationRule.update).toHaveBeenCalledWith({
        where: { id: RULE_ID },
        data: { isActive: false },
      })
      expect(result.isActive).toBe(false)
      expect(mockPrisma.notificationRule.create).not.toHaveBeenCalled()
    })

    it('멀티테넌시 — 기존 규칙 조회 시 companyId+eventType으로 필터한다', async () => {
      mockPrisma.notificationRule.findFirst.mockResolvedValue(baseRule)
      mockPrisma.notificationRule.update.mockResolvedValue(baseRule)

      await service.updateEventRule(COMPANY_ID, { eventType: 'clock_in', isActive: true })

      expect(mockPrisma.notificationRule.findFirst).toHaveBeenCalledWith({
        where: { companyId: COMPANY_ID, eventType: 'clock_in' },
      })
    })

    it('규칙이 없으면 형제 규칙의 webhookUrl을 상속해 새 규칙을 생성한다', async () => {
      // 첫 findFirst(기존 규칙) → null, 두 번째 findFirst(형제) → webhookUrl 보유 규칙
      mockPrisma.notificationRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...baseRule, webhookUrl: 'https://discord.com/api/webhooks/sib' })
      mockPrisma.notificationRule.create.mockResolvedValue(baseRule)

      await service.updateEventRule(COMPANY_ID, { eventType: 'absent', isActive: true })

      expect(mockPrisma.notificationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            eventType: 'absent',
            channelType: 'discord',
            webhookUrl: 'https://discord.com/api/webhooks/sib',
            isActive: true,
          }),
        }),
      )
    })

    it('형제 규칙이 없으면 webhookUrl=null로 새 규칙을 생성한다', async () => {
      mockPrisma.notificationRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
      mockPrisma.notificationRule.create.mockResolvedValue(baseRule)

      await service.updateEventRule(COMPANY_ID, { eventType: 'absent', isActive: true })

      expect(mockPrisma.notificationRule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ webhookUrl: null, companyId: COMPANY_ID }),
        }),
      )
    })

    it('멀티테넌시 — 형제 규칙 조회도 companyId로 필터한다', async () => {
      mockPrisma.notificationRule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
      mockPrisma.notificationRule.create.mockResolvedValue(baseRule)

      await service.updateEventRule(COMPANY_ID, { eventType: 'absent', isActive: true })

      expect(mockPrisma.notificationRule.findFirst).toHaveBeenNthCalledWith(2, {
        where: { companyId: COMPANY_ID, webhookUrl: { not: null } },
      })
    })
  })

  // ── getLogs ───────────────────────────────────────────────────────────────────

  describe('getLogs', () => {
    const baseLog = {
      id: 'log-1',
      ruleId: RULE_ID,
      eventType: 'clock_in',
      status: 'success',
      retryCount: 0,
      errorMessage: null,
      sentAt: new Date('2024-06-01'),
    }

    it('로그 목록을 페이징 메타와 함께 반환한다', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([baseLog])
      mockPrisma.notificationLog.count.mockResolvedValue(1)

      const result = await service.getLogs(COMPANY_ID, { page: 1, limit: 20 })

      expect(result).toEqual({ items: [baseLog], total: 1, page: 1, limit: 20 })
    })

    it('멀티테넌시 — rule.companyId 관계 조인으로 회사 로그만 조회한다', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([])
      mockPrisma.notificationLog.count.mockResolvedValue(0)

      await service.getLogs(COMPANY_ID, { page: 1, limit: 20 })

      expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rule: { companyId: COMPANY_ID } }),
        }),
      )
      expect(mockPrisma.notificationLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rule: { companyId: COMPANY_ID } }),
        }),
      )
    })

    it('ruleId / status 필터가 where 조건에 적용된다', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([])
      mockPrisma.notificationLog.count.mockResolvedValue(0)

      await service.getLogs(COMPANY_ID, {
        page: 1,
        limit: 20,
        ruleId: RULE_ID,
        status: 'failed',
      })

      expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rule: { companyId: COMPANY_ID },
            ruleId: RULE_ID,
            status: 'failed',
          }),
        }),
      )
    })

    it('날짜 범위 필터 — startDate/endDate가 sentAt gte/lte로 적용된다', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([])
      mockPrisma.notificationLog.count.mockResolvedValue(0)

      const startDate = '2024-06-01T00:00:00+09:00'
      const endDate = '2024-06-30T23:59:59+09:00'

      await service.getLogs(COMPANY_ID, { page: 1, limit: 20, startDate, endDate })

      expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sentAt: { gte: new Date(startDate), lte: new Date(endDate) },
          }),
        }),
      )
    })

    it('startDate만 제공하면 gte만 적용된다 (lte 미포함)', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([])
      mockPrisma.notificationLog.count.mockResolvedValue(0)

      const startDate = '2024-06-01T00:00:00+09:00'
      await service.getLogs(COMPANY_ID, { page: 1, limit: 20, startDate })

      const callArg = mockPrisma.notificationLog.findMany.mock.calls[0][0] as {
        where: { sentAt?: { gte?: Date; lte?: Date } }
      }
      expect(callArg.where.sentAt).toEqual({ gte: new Date(startDate) })
    })

    it('날짜 필터가 없으면 where에 sentAt 조건을 포함하지 않는다', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([])
      mockPrisma.notificationLog.count.mockResolvedValue(0)

      await service.getLogs(COMPANY_ID, { page: 1, limit: 20 })

      const callArg = mockPrisma.notificationLog.findMany.mock.calls[0][0] as {
        where: { sentAt?: unknown }
      }
      expect(callArg.where.sentAt).toBeUndefined()
    })

    it('페이징 — skip/take가 page·limit으로 계산된다 (page=2, limit=50 → skip=50)', async () => {
      mockPrisma.notificationLog.findMany.mockResolvedValue([])
      mockPrisma.notificationLog.count.mockResolvedValue(0)

      await service.getLogs(COMPANY_ID, { page: 2, limit: 50 })

      expect(mockPrisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50, take: 50 }),
      )
    })
  })
})
