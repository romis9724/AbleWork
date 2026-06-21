import { EventEmitter2 } from '@nestjs/event-emitter'
import { MessengerApprovalListener } from './messenger-approval.listener'
import { PrismaService } from '../../../prisma/prisma.service'
import { MessengerProvider } from './messenger-provider.interface'

const prisma = {
  approvalStep: { findMany: jest.fn() },
  document: { findFirst: jest.fn() },
  messengerAccount: { findFirst: jest.fn() },
}
const messenger = {
  platform: 'discord',
  sendApprovalRequest: jest.fn(),
  sendApprovalRequestToUser: jest.fn(),
}
const eventEmitter = { on: jest.fn() }

describe('MessengerApprovalListener', () => {
  let listener: MessengerApprovalListener
  const base = { requestId: 'req-1', documentId: 'doc-1', companyId: 'c1' }

  beforeEach(() => {
    jest.clearAllMocks()
    listener = new MessengerApprovalListener(
      eventEmitter as unknown as EventEmitter2,
      prisma as unknown as PrismaService,
      messenger as unknown as MessengerProvider,
    )
  })

  it('상신 시 현재 결재자에게 DM 버튼(요청 id 인코딩)을 발송한다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'emp-approver' }])
    prisma.document.findFirst.mockResolvedValue({ title: '홍길동 연차 2일', docNumber: 'LEAVE-1' })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'discord-1' })

    await listener.handleRequested('leave.requested', base)

    // 결재자의 discord 계정을 회사/플랫폼 스코프로 조회
    expect(prisma.messengerAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'c1', employeeId: 'emp-approver', platform: 'discord' },
      }),
    )
    // 그 계정으로 DM 발송 — 제목/문서번호/요청 id 전달
    expect(messenger.sendApprovalRequestToUser).toHaveBeenCalledWith(
      'discord-1',
      expect.objectContaining({
        title: '홍길동 연차 2일',
        docNumber: 'LEAVE-1',
        action: { kind: 'request', requestId: 'req-1' },
      }),
    )
    // 이벤트 라벨이 한국어로 반영("휴가 신청 결재 요청")
    expect(messenger.sendApprovalRequestToUser.mock.calls[0][1].eventLabel).toContain('휴가 신청')
  })

  it('신청자명과 신청 내용(라벨 적용·ID성 필드 제외)을 메시지에 담는다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'emp-approver' }])
    prisma.document.findFirst.mockResolvedValue({
      title: '홍길동 연차 신청',
      docNumber: null,
      content: {
        leaveTypeId: 'lt-1', // ID성 → 제외돼야 함
        startDate: '2026-06-23',
        endDate: '2026-06-24',
        days: 2,
        reason: '개인 사정',
      },
      drafter: { name: '홍길동' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'discord-1' })

    await listener.handleRequested('leave.requested', base)

    const sent = messenger.sendApprovalRequestToUser.mock.calls[0][1]
    expect(sent.requesterName).toBe('홍길동')
    // 라벨 매핑 + ID성 필드(leaveTypeId) 제외 + 정의 순서로 정렬 + 날짜·수량 inline
    expect(sent.fields).toEqual([
      { name: '시작일', value: '2026-06-23', inline: true },
      { name: '종료일', value: '2026-06-24', inline: true },
      { name: '일수', value: '2', inline: true },
      { name: '사유', value: '개인 사정' },
    ])
  })

  it('JSONB 키 순서가 뒤섞여 들어와도 정의된 표시 순서로 정렬한다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'emp-approver' }])
    // 실제 JSONB처럼 비논리적 순서로 도착
    prisma.document.findFirst.mockResolvedValue({
      title: 't',
      docNumber: null,
      content: { days: 2, reason: '가족 여행', endDate: '2026-06-24', startDate: '2026-06-23', content: '하계 휴가' },
      drafter: { name: '홍길동' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'discord-1' })

    await listener.handleRequested('custom.requested', base)

    // 내용 → 시작일 → 종료일 → 일수 → 사유 (PAYLOAD_LABELS 정의 순)
    const names = messenger.sendApprovalRequestToUser.mock.calls[0][1].fields.map((f: { name: string }) => f.name)
    expect(names).toEqual(['내용', '시작일', '종료일', '일수', '사유'])
  })

  it('결재자가 메신저 미연동이면 발송하지 않는다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'emp-x' }])
    prisma.document.findFirst.mockResolvedValue({ title: 'x', docNumber: null })
    prisma.messengerAccount.findFirst.mockResolvedValue(null)

    await listener.handleRequested('leave.requested', base)

    expect(messenger.sendApprovalRequestToUser).not.toHaveBeenCalled()
  })

  it('현재 PENDING 결재 단계가 없으면 문서 조회/발송을 건너뛴다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([])

    await listener.handleRequested('leave.requested', base)

    expect(prisma.document.findFirst).not.toHaveBeenCalled()
    expect(messenger.sendApprovalRequestToUser).not.toHaveBeenCalled()
  })

  it('documentId가 없으면(양식 미연동 요청) 결재자 조회 자체를 하지 않는다', async () => {
    await listener.handleRequested('leave.requested', { requestId: 'r', companyId: 'c1' })

    expect(prisma.approvalStep.findMany).not.toHaveBeenCalled()
  })

  it('병렬 결재면 모든 결재자에게 발송하되 중복 결재자는 1회만', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([
      { assigneeId: 'a' },
      { assigneeId: 'b' },
      { assigneeId: 'a' },
    ])
    prisma.document.findFirst.mockResolvedValue({ title: 't', docNumber: null })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })

    await listener.handleRequested('shift.requested', base)

    // a, b 두 명만(중복 a 제거)
    expect(prisma.messengerAccount.findFirst).toHaveBeenCalledTimes(2)
    expect(messenger.sendApprovalRequestToUser).toHaveBeenCalledTimes(2)
  })

  it('한 결재자 발송 실패가 다른 결재자 발송을 막지 않는다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'a' }, { assigneeId: 'b' }])
    prisma.document.findFirst.mockResolvedValue({ title: 't', docNumber: null })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })
    messenger.sendApprovalRequestToUser
      .mockRejectedValueOnce(new Error('discord 5xx'))
      .mockResolvedValueOnce('msg-ok')

    // 에러를 흡수하므로 throw하지 않는다
    await expect(listener.handleRequested('shift.requested', base)).resolves.toBeUndefined()
    expect(messenger.sendApprovalRequestToUser).toHaveBeenCalledTimes(2)
  })
})
