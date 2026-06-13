/**
 * S3. 결재 처리 → 실데이터 반영 + 상태머신 (CLAUDE.md §10-2, §10-4).
 * A. 요청 승인 → 휴가 잔액 차감 원자성 (/requests/:id/approve)
 * B. 표준 문서 상태머신: 상신 → 회수 → 재상신 → 승인 (/documents/:id/...)
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const EMP_HONG = 'seed-emp-001'
const EMP_ADMIN = 'seed-emp-admin'
const LEAVE_TYPE = 'seed-leave-type-annual'
const YEAR = 2026
const FORM_CUSTOM = 'seed-form-custom'

async function readBalance(prisma: TestContext['prisma'], employeeId: string) {
  const b = await prisma.leaveBalance.findUnique({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: LEAVE_TYPE, year: YEAR } },
  })
  return b ? { remaining: Number(b.remainingDays), used: Number(b.usedDays) } : null
}

async function createLeaveRequest(
  ctx: TestContext,
  token: string,
  startDate: string,
  endDate: string,
) {
  const res = await authedRequest(ctx.app, token)
    .post('/requests')
    .send({ type: 'LEAVE_CREATE', payload: { leaveTypeId: LEAVE_TYPE, startDate, endDate } })
  expect([200, 201]).toContain(res.status)
  return res.body.data.id as string
}

describe('S3. 결재 처리 → 실데이터 반영 (approval-flow.e2e)', () => {
  let ctx: TestContext
  let empToken: string
  let adminToken: string

  beforeAll(async () => {
    ctx = await createTestApp()
    empToken = await login(ctx.app, 'employee')
    adminToken = await login(ctx.app, 'admin')
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  // ── A. 잔액 차감 원자성 ──────────────────────────────────────────────────────

  it('3-1·3-2. 휴가 승인 → 문서 APPROVED + 잔액 정확히 차감(3일)', async () => {
    const before = await readBalance(ctx.prisma, EMP_HONG)
    expect(before).toBeTruthy()

    const reqId = await createLeaveRequest(ctx, empToken, '2026-09-01', '2026-09-03') // 3일

    const approve = await authedRequest(ctx.app, adminToken)
      .post(`/requests/${reqId}/approve`)
      .send({ comment: '승인합니다' })
    expect([200, 201]).toContain(approve.status)

    const reqRow = await ctx.prisma.request.findUnique({ where: { id: reqId } })
    expect(reqRow!.status).toBe('APPROVED')
    const doc = await ctx.prisma.document.findUnique({ where: { id: reqRow!.documentId! } })
    expect(doc!.status).toBe('APPROVED')

    const after = await readBalance(ctx.prisma, EMP_HONG)
    expect(after!.remaining).toBeCloseTo(before!.remaining - 3, 2)
    expect(after!.used).toBeCloseTo(before!.used + 3, 2)

    // 실제 휴가 레코드 생성됨
    const leave = await ctx.prisma.leave.findFirst({
      where: { employeeId: EMP_HONG, startDate: new Date('2026-09-01') },
    })
    expect(leave).toBeTruthy()
    expect(Number(leave!.daysUsed)).toBeCloseTo(3, 2)
  })

  it('3-3. 휴가 반려 → 잔액 미차감', async () => {
    const before = await readBalance(ctx.prisma, EMP_HONG)
    const reqId = await createLeaveRequest(ctx, empToken, '2026-10-01', '2026-10-02')

    const reject = await authedRequest(ctx.app, adminToken)
      .post(`/requests/${reqId}/reject`)
      .send({ comment: '반려' })
    expect([200, 201]).toContain(reject.status)

    const reqRow = await ctx.prisma.request.findUnique({ where: { id: reqId } })
    expect(reqRow!.status).toBe('REJECTED')

    const after = await readBalance(ctx.prisma, EMP_HONG)
    expect(after!.remaining).toBeCloseTo(before!.remaining, 2) // 변동 없음
  })

  it('3-4. 결재자가 아닌 사용자가 승인 시도 → 403', async () => {
    const reqId = await createLeaveRequest(ctx, empToken, '2026-11-01', '2026-11-01')
    // 요청자 본인(홍길동)이 자기 요청 승인 시도
    const res = await authedRequest(ctx.app, empToken)
      .post(`/requests/${reqId}/approve`)
      .send({})
    expect(res.status).toBe(403)
  })

  it('3-8. 이미 승인된 요청 재승인 → 거부(중복 차감 없음)', async () => {
    const reqId = await createLeaveRequest(ctx, empToken, '2026-12-01', '2026-12-01')
    const first = await authedRequest(ctx.app, adminToken).post(`/requests/${reqId}/approve`).send({})
    expect([200, 201]).toContain(first.status)

    const balAfterFirst = await readBalance(ctx.prisma, EMP_HONG)
    const second = await authedRequest(ctx.app, adminToken).post(`/requests/${reqId}/approve`).send({})
    expect(second.status).toBeGreaterThanOrEqual(400) // 재승인 거부

    const balAfterSecond = await readBalance(ctx.prisma, EMP_HONG)
    expect(balAfterSecond!.remaining).toBeCloseTo(balAfterFirst!.remaining, 2) // 추가 차감 없음
  })

  // ── B. 표준 문서 상태머신 (회수 → 재상신 → 승인) ───────────────────────────────

  it('3-5. 상신 → 회수 → 재상신 → 승인 전 구간 상태 전이', async () => {
    // 1) DRAFT 생성 (결재자=admin)
    const create = await authedRequest(ctx.app, empToken)
      .post('/documents')
      .send({
        formId: FORM_CUSTOM,
        title: '일반 기안 — 상태머신 검증',
        content: { note: 'e2e' },
        steps: [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }],
      })
    expect([200, 201]).toContain(create.status)
    const docId: string = create.body.data.id
    expect(docId).toBeTruthy()

    // 2) 상신 → PENDING
    const submit1 = await authedRequest(ctx.app, empToken).post(`/documents/${docId}/submit`).send({})
    expect([200, 201]).toContain(submit1.status)
    let doc = await ctx.prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).toBe('PENDING')

    // 3) 회수 (기안자) → RECALLED
    const recall = await authedRequest(ctx.app, empToken).post(`/documents/${docId}/recall`).send({})
    expect([200, 201]).toContain(recall.status)
    doc = await ctx.prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).toBe('RECALLED')

    // 4) 재상신 → PENDING
    const submit2 = await authedRequest(ctx.app, empToken).post(`/documents/${docId}/submit`).send({})
    expect([200, 201]).toContain(submit2.status)
    doc = await ctx.prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).toBe('PENDING')

    // 5) 결재자(admin) 승인 → APPROVED
    const step = await ctx.prisma.approvalStep.findFirst({
      where: { assigneeId: EMP_ADMIN, line: { documentId: docId }, status: 'PENDING' },
    })
    expect(step).toBeTruthy()
    const approve = await authedRequest(ctx.app, adminToken)
      .post(`/documents/${docId}/steps/${step!.id}/approve`)
      .send({ comment: '최종 승인' })
    expect([200, 201]).toContain(approve.status)

    doc = await ctx.prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).toBe('APPROVED')
    const approvedStep = await ctx.prisma.approvalStep.findUnique({ where: { id: step!.id } })
    expect(['APPROVED', 'PROXY_APPROVED']).toContain(approvedStep!.status)
  })

  it('3-6. 회수는 기안자만 가능 (타인 회수 시도 → 4xx)', async () => {
    const create = await authedRequest(ctx.app, empToken)
      .post('/documents')
      .send({
        formId: FORM_CUSTOM,
        title: '회수 권한 검증',
        content: {},
        steps: [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }],
      })
    const docId = create.body.data.id
    await authedRequest(ctx.app, empToken).post(`/documents/${docId}/submit`).send({})

    // 관리자(기안자 아님)가 회수 시도
    const recall = await authedRequest(ctx.app, adminToken).post(`/documents/${docId}/recall`).send({})
    expect(recall.status).toBeGreaterThanOrEqual(400)
  })
})
