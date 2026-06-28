import { EventEmitter2 } from '@nestjs/event-emitter'
import { MessengerApprovalListener } from './messenger-approval.listener'
import { PrismaService } from '../../../prisma/prisma.service'
import { MessengerProvider } from './messenger-provider.interface'
import { LlmService } from '../llm/llm.service'

const prisma = {
  approvalStep: { findMany: jest.fn() },
  document: { findFirst: jest.fn() },
  messengerAccount: { findFirst: jest.fn() },
  employee: { findUnique: jest.fn() },
}
const messenger = {
  platform: 'discord',
  sendApprovalRequest: jest.fn(),
  sendApprovalRequestToUser: jest.fn(),
  sendDirectMessage: jest.fn(),
}
const eventEmitter = { on: jest.fn() }
const llm = { isEnabled: jest.fn(), chat: jest.fn() }

describe('MessengerApprovalListener', () => {
  let listener: MessengerApprovalListener
  const base = { requestId: 'req-1', documentId: 'doc-1', companyId: 'c1' }

  beforeEach(() => {
    jest.clearAllMocks()
    llm.isEnabled.mockResolvedValue(false) // 기본 비활성(요약 없음) — 개별 테스트에서 활성화
    listener = new MessengerApprovalListener(
      eventEmitter as unknown as EventEmitter2,
      prisma as unknown as PrismaService,
      messenger as unknown as MessengerProvider,
      llm as unknown as LlmService,
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
    // 라벨 매핑 + ID성 필드(leaveTypeId) 제외 + 정의 순서로 정렬
    expect(sent.fields).toEqual([
      { name: '시작일', value: '2026-06-23' },
      { name: '종료일', value: '2026-06-24' },
      { name: '일수', value: '2' },
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

  it('documentId가 없고 assigneeId도 없으면 결재자 조회/발송을 하지 않는다', async () => {
    await listener.handleRequested('leave.requested', { requestId: 'r', companyId: 'c1' })

    expect(prisma.approvalStep.findMany).not.toHaveBeenCalled()
    expect(messenger.sendApprovalRequestToUser).not.toHaveBeenCalled()
  })

  it('documentId 없는 HR 요청(양식 미설정)은 payload.assigneeId(부서 승인자)에게 DM을 보낸다', async () => {
    prisma.employee.findUnique.mockResolvedValue({ name: '김철수' })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd-hong' })

    await listener.handleRequested('leave.requested', {
      requestId: 'req-9',
      companyId: 'c1',
      assigneeId: 'emp-hong',
      requesterId: 'emp-kcs',
      payload: { leaveTypeId: 'lt-1', startDate: '2026-07-01', endDate: '2026-07-02', reason: '개인' },
    })

    // 문서 경로를 타지 않음
    expect(prisma.approvalStep.findMany).not.toHaveBeenCalled()
    // 부서 승인자(emp-hong)의 discord 계정 조회 후 DM
    expect(prisma.messengerAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'c1', employeeId: 'emp-hong', platform: 'discord' } }),
    )
    const sent = messenger.sendApprovalRequestToUser.mock.calls[0][1]
    expect(sent.action).toEqual({ kind: 'request', requestId: 'req-9' })
    expect(sent.requesterName).toBe('김철수')
    expect(sent.fields).toEqual([
      { name: '시작일', value: '2026-07-01' },
      { name: '종료일', value: '2026-07-02' },
      { name: '사유', value: '개인' },
    ])
  })

  it('승인/반려 결과는 신청자에게 결과 DM(버튼 없음)을 보낸다', async () => {
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd-kcs' })

    await listener.handleResult('leave.approved', {
      companyId: 'c1',
      requesterId: 'emp-kcs',
      payload: { startDate: '2026-07-01', endDate: '2026-07-02' },
    })

    expect(prisma.messengerAccount.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 'c1', employeeId: 'emp-kcs', platform: 'discord' } }),
    )
    const arg = messenger.sendDirectMessage.mock.calls[0]
    expect(arg[0]).toBe('d-kcs')
    expect(arg[1].description).toContain('승인')
  })

  it('결과 DM — 신청자가 메신저 미연동이면 보내지 않는다', async () => {
    prisma.messengerAccount.findFirst.mockResolvedValue(null)

    await listener.handleResult('leave.rejected', { companyId: 'c1', requesterId: 'emp-x', payload: {} })

    expect(messenger.sendDirectMessage).not.toHaveBeenCalled()
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

  it('AI 활성 시 신청 내용을 요약해 summary로 담는다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'a' }])
    prisma.document.findFirst.mockResolvedValue({
      title: 't',
      docNumber: null,
      content: { reason: '가족 여행', days: 2 },
      drafter: { name: '홍길동' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })
    llm.isEnabled.mockResolvedValue(true)
    llm.chat.mockResolvedValue('연차 2일, 가족 여행 — 특이사항 없음')

    await listener.handleRequested('leave.requested', base)

    expect(messenger.sendApprovalRequestToUser.mock.calls[0][1].summary).toBe(
      '연차 2일, 가족 여행 — 특이사항 없음',
    )
  })

  it('AI 요약이 실패해도 DM은 요약 없이 정상 발송한다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'a' }])
    prisma.document.findFirst.mockResolvedValue({
      title: 't',
      docNumber: null,
      content: { reason: 'x' },
      drafter: { name: '홍' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })
    llm.isEnabled.mockResolvedValue(true)
    llm.chat.mockRejectedValue(new Error('timeout'))

    await listener.handleRequested('leave.requested', base)

    const sent = messenger.sendApprovalRequestToUser.mock.calls[0][1]
    expect(sent.summary).toBeUndefined()
    expect(messenger.sendApprovalRequestToUser).toHaveBeenCalled()
  })

  it('요약 호출은 짧은 타임아웃 예산을 넘겨 핵심 DM이 오래 막히지 않게 한다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'a' }])
    prisma.document.findFirst.mockResolvedValue({
      title: 't',
      docNumber: null,
      content: { reason: '연수' },
      drafter: { name: '홍' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })
    llm.isEnabled.mockResolvedValue(true)
    llm.chat.mockResolvedValue('요약')

    await listener.handleRequested('leave.requested', base)

    // 세 번째 인자 opts.timeoutMs가 짧은(<30s provider 기본보다 작은) 예산으로 전달됨
    const opts = llm.chat.mock.calls[0][2] as { timeoutMs?: number } | undefined
    expect(opts?.timeoutMs).toBeGreaterThan(0)
    expect(opts?.timeoutMs).toBeLessThan(30_000)
  })

  it('추론 모델이 남긴 <think> 블록은 요약에서 제거한다(닫힌 블록)', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'a' }])
    prisma.document.findFirst.mockResolvedValue({
      title: 't',
      docNumber: null,
      content: { reason: '가족 여행', days: 2 },
      drafter: { name: '홍길동' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })
    llm.isEnabled.mockResolvedValue(true)
    llm.chat.mockResolvedValue(
      '<think>사용자가 휴가를 신청했다. 핵심은 기간과 사유.</think>\n홍길동 연차 2일, 가족 여행',
    )

    await listener.handleRequested('leave.requested', base)

    expect(messenger.sendApprovalRequestToUser.mock.calls[0][1].summary).toBe('홍길동 연차 2일, 가족 여행')
  })

  it('토큰 한도로 닫히지 않은 <think> 블록만 남으면 요약을 비워 발송한다', async () => {
    prisma.approvalStep.findMany.mockResolvedValue([{ assigneeId: 'a' }])
    prisma.document.findFirst.mockResolvedValue({
      title: 't',
      docNumber: null,
      content: { reason: 'x' },
      drafter: { name: '홍' },
    })
    prisma.messengerAccount.findFirst.mockResolvedValue({ externalUserId: 'd' })
    llm.isEnabled.mockResolvedValue(true)
    // <think>가 열린 채 num_predict 한도로 잘림 → 본문 요약이 없음
    llm.chat.mockResolvedValue('<think>먼저 신청 내용을 분석하면 기간은')

    await listener.handleRequested('leave.requested', base)

    const sent = messenger.sendApprovalRequestToUser.mock.calls[0][1]
    expect(sent.summary).toBeUndefined()
    expect(messenger.sendApprovalRequestToUser).toHaveBeenCalled()
  })
})
