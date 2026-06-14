import { Test, TestingModule } from '@nestjs/testing'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { NOTIFIABLE_EVENTS } from '@ablework/shared-constants'
import { NotificationListener } from './notification.listener'
import { DiscordWebhookService } from './discord-webhook.service'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../../prisma/prisma.service'

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('NotificationListener', () => {
  let listener: NotificationListener
  const handlers: Record<string, (payload: Record<string, unknown>) => void> = {}

  const mockEmitter = {
    on: jest.fn((event: string, cb: (payload: Record<string, unknown>) => void): void => {
      handlers[event] = cb
    }),
  }
  const mockDiscord = { send: jest.fn().mockResolvedValue(undefined) }
  const mockMail = { sendMessageMail: jest.fn().mockResolvedValue(undefined) }
  const mockPrisma = {
    notificationRule: { findMany: jest.fn() },
    notificationLog: { create: jest.fn().mockResolvedValue({}) },
    employee: { findFirst: jest.fn() },
    message: { create: jest.fn().mockResolvedValue({}) },
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationListener,
        { provide: DiscordWebhookService, useValue: mockDiscord },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEmitter },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile()

    listener = module.get<NotificationListener>(NotificationListener)
    jest.clearAllMocks()
    for (const k of Object.keys(handlers)) delete handlers[k]
  })

  describe('onApplicationBootstrap', () => {
    it('NOTIFIABLE_EVENTS 전체에 대해 리스너를 등록한다', () => {
      listener.onApplicationBootstrap()

      expect(mockEmitter.on).toHaveBeenCalledTimes(NOTIFIABLE_EVENTS.length)
      for (const { event } of NOTIFIABLE_EVENTS) {
        expect(handlers[event]).toBeInstanceOf(Function)
      }
    })

    it('이전에 누락됐던 비휴가 요청 이벤트(shift/attendance/device/offsite/custom)도 구독한다', () => {
      listener.onApplicationBootstrap()

      const previouslyMissing = [
        'shift.requested', 'shift.approved', 'shift.rejected',
        'attendance.requested', 'attendance.approved', 'attendance.rejected',
        'device.change_requested', 'device.change_approved', 'device.change_rejected',
        'offsite.requested', 'offsite.approved', 'offsite.rejected',
        'custom.requested', 'custom.approved', 'custom.rejected',
      ]
      for (const ev of previouslyMissing) {
        expect(handlers[ev]).toBeInstanceOf(Function)
      }
    })
  })

  describe('이벤트 수신 → 발송', () => {
    it('활성 discord 규칙이 있으면 해당 이벤트로 webhook을 발송하고 로그를 남긴다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', channelType: 'discord', webhookUrl: 'https://discord/x', embedTemplate: null },
      ])
      listener.onApplicationBootstrap()

      // 이전에는 핸들러가 없어 버려지던 이벤트
      handlers['shift.requested']({ companyId: 'company-1', requestId: 'req-1' })
      await flush()

      expect(mockPrisma.notificationRule.findMany).toHaveBeenCalledWith({
        where: { eventType: 'shift.requested', companyId: 'company-1', isActive: true },
      })
      // L3 구조화 embed — 이벤트 라벨 title + 그룹 footer + 브랜드 색
      expect(mockDiscord.send).toHaveBeenCalledWith(
        'https://discord/x',
        expect.objectContaining({ title: '근무일정 변경 신청', color: 0xf36f20 }),
      )
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'success', eventType: 'shift.requested' }) }),
      )
    })

    it('L3: payload.title→description, docNumber→fields로 구조화된 embed를 보낸다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', channelType: 'discord', webhookUrl: 'https://discord/x', embedTemplate: null },
      ])
      listener.onApplicationBootstrap()

      handlers['document.submitted']({
        companyId: 'company-1', documentId: 'doc-1', title: '지출결의서', docNumber: 'DOC-2026-0001',
      })
      await flush()

      expect(mockDiscord.send).toHaveBeenCalledWith(
        'https://discord/x',
        expect.objectContaining({
          title: '문서 상신',
          description: '지출결의서',
          fields: [{ name: '문서번호', value: 'DOC-2026-0001', inline: true }],
        }),
      )
    })

    it('companyId가 없으면 규칙을 조회하지 않는다', async () => {
      listener.onApplicationBootstrap()

      handlers['document.approved']({ documentId: 'doc-1' })
      await flush()

      expect(mockPrisma.notificationRule.findMany).not.toHaveBeenCalled()
      expect(mockDiscord.send).not.toHaveBeenCalled()
    })

    it('webhook 발송 실패 시 status=failed 로그를 남기고 리스너는 죽지 않는다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', channelType: 'discord', webhookUrl: 'https://discord/x', embedTemplate: null },
      ])
      mockDiscord.send.mockRejectedValueOnce(new Error('discord down'))
      listener.onApplicationBootstrap()

      handlers['leave.approved']({ companyId: 'company-1' })
      await flush()

      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorMessage: 'discord down' }) }),
      )
    })

    it('활성 규칙이 없으면 아무것도 발송하지 않는다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([])
      listener.onApplicationBootstrap()

      handlers['custom.requested']({ companyId: 'company-1' })
      await flush()

      expect(mockDiscord.send).not.toHaveBeenCalled()
      expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled()
    })

    it('규칙 조회(findMany)가 실패해도 unhandled rejection 없이 흡수된다', async () => {
      mockPrisma.notificationRule.findMany.mockRejectedValue(new Error('db down'))
      listener.onApplicationBootstrap()

      // fire-and-forget(void) 호출이므로 throw가 전파되면 안 된다.
      expect(() => handlers['leave.requested']({ companyId: 'company-1' })).not.toThrow()
      await expect(flush()).resolves.toBeUndefined()
      expect(mockDiscord.send).not.toHaveBeenCalled()
    })
  })

  // ── M2 email / in_app 채널 ─────────────────────────────────────────────────────

  describe('email / in_app 채널 디스패치', () => {
    it('email 규칙: 수신자(drafterId) 메일 주소로 발송한다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-e', channelType: 'email', webhookUrl: null },
      ])
      mockPrisma.employee.findFirst.mockResolvedValue({ user: { email: 'drafter@x.io' } })
      listener.onApplicationBootstrap()

      handlers['document.approved']({ companyId: 'company-1', drafterId: 'emp-1', title: '지출결의서' })
      await flush()

      expect(mockPrisma.employee.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'emp-1', companyId: 'company-1' } }),
      )
      expect(mockMail.sendMessageMail).toHaveBeenCalledWith(
        'drafter@x.io',
        expect.stringContaining('문서 최종 승인'),
        expect.stringContaining('지출결의서'),
      )
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'success' }) }),
      )
    })

    it('in_app 규칙: 수신자(assigneeId)에게 사내 메시지를 생성한다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-i', channelType: 'in_app', webhookUrl: null },
      ])
      listener.onApplicationBootstrap()

      handlers['document.step_pending']({ companyId: 'company-1', assigneeId: 'approver-9' })
      await flush()

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            recipients: { create: [{ recipientId: 'approver-9' }] },
          }),
        }),
      )
    })

    it('수신자를 특정할 수 없으면(payload에 대상 없음) email/in_app 발송을 건너뛴다', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { id: 'rule-e', channelType: 'email', webhookUrl: null },
      ])
      listener.onApplicationBootstrap()

      handlers['leave.accrued']?.({ companyId: 'company-1' }) // 대상 필드 없음
      // leave.accrued가 미구독이면 무발송 — 대상 필드 없는 임의 이벤트로 대체 검증
      handlers['document.recalled']({ companyId: 'company-1' }) // drafterId 없음
      await flush()

      expect(mockMail.sendMessageMail).not.toHaveBeenCalled()
    })
  })
})
