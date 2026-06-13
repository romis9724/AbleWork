/**
 * S2. 요청 → 전자결재 자동연동 (CLAUDE.md §10-1).
 * 홍길동(개발팀 EMPLOYEE)이 요청 생성 시 $transaction으로
 * request + document(PENDING) + approvalLine + approvalStep 이 원자적으로 생성되는지 검증.
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const EMP_HONG = 'seed-emp-001' // 홍길동 (개발팀, EMPLOYEE)
const EMP_ADMIN = 'seed-emp-admin' // 최고관리자 (GENERAL_ADMIN↑ → 결재자 fallback)
const COMPANY = 'seed-company-001'
const LEAVE_TYPE = 'seed-leave-type-annual'

/**
 * request → document → approvalLine → steps 를 한 번에 로드.
 * 연동 FK는 request.documentId 에 저장된다(document.requestId 는 미사용 컬럼).
 */
async function loadDocByRequest(prisma: TestContext['prisma'], requestId: string) {
  const req = await prisma.request.findUnique({ where: { id: requestId } })
  if (!req?.documentId) return null
  return prisma.document.findUnique({
    where: { id: req.documentId },
    include: { approvalLines: { include: { steps: { include: { assignee: true } } } }, form: true },
  })
}

describe('S2. 요청→전자결재 자동연동 (request-to-document.e2e)', () => {
  let ctx: TestContext
  let empToken: string

  beforeAll(async () => {
    ctx = await createTestApp()
    empToken = await login(ctx.app, 'employee')
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  it('2-1. LEAVE 요청 → request(PENDING) + document(PENDING) + 결재선/단계 원자 생성', async () => {
    const res = await authedRequest(ctx.app, empToken)
      .post('/requests')
      .send({
        type: 'LEAVE_CREATE',
        payload: {
          leaveTypeId: LEAVE_TYPE,
          startDate: '2026-07-01',
          endDate: '2026-07-03',
          reason: '개인 연차',
        },
      })
    expect([200, 201]).toContain(res.status)

    const requestId: string = res.body.data.id
    expect(requestId).toBeTruthy()

    const reqRow = await ctx.prisma.request.findUnique({ where: { id: requestId } })
    expect(reqRow).toBeTruthy()
    expect(reqRow!.status).toBe('PENDING')
    expect(reqRow!.requesterId).toBe(EMP_HONG)
    expect(reqRow!.companyId).toBe(COMPANY)
    expect(reqRow!.documentId).toBeTruthy()

    const doc = await loadDocByRequest(ctx.prisma, requestId)
    expect(doc).toBeTruthy()
    expect(doc!.status).toBe('PENDING')
    expect(doc!.companyId).toBe(COMPANY)
    expect(doc!.approvalLines.length).toBeGreaterThanOrEqual(1)

    const steps = doc!.approvalLines.flatMap((l) => l.steps)
    expect(steps.length).toBeGreaterThanOrEqual(1)
    const first = steps.sort((a, b) => a.stepOrder - b.stepOrder)[0]
    expect(first.status).toBe('PENDING')
  })

  it('2-2. 결재 단계의 결재자는 GENERAL_ADMIN↑ (시드 기준 최고관리자)', async () => {
    const res = await authedRequest(ctx.app, empToken)
      .post('/requests')
      .send({
        type: 'LEAVE_CREATE',
        payload: { leaveTypeId: LEAVE_TYPE, startDate: '2026-07-10', endDate: '2026-07-10' },
      })
    expect([200, 201]).toContain(res.status)
    const doc = await loadDocByRequest(ctx.prisma, res.body.data.id)
    const approverStep = doc!.approvalLines
      .flatMap((l) => l.steps)
      .find((s) => s.role.includes('APPROVER') || s.role === 'APPROVER')
    expect(approverStep).toBeTruthy()
    expect(approverStep!.assigneeId).toBe(EMP_ADMIN)
  })

  it('2-3. SHIFT_CREATE 요청 → 근무일정 변경 양식 기반 문서 자동생성', async () => {
    const res = await authedRequest(ctx.app, empToken)
      .post('/requests')
      .send({
        type: 'SHIFT_CREATE',
        payload: { date: '2026-07-20', startTime: '09:00', endTime: '18:00' },
      })
    expect([200, 201]).toContain(res.status)
    const doc = await loadDocByRequest(ctx.prisma, res.body.data.id)
    expect(doc).toBeTruthy()
    expect(doc!.status).toBe('PENDING')
    expect(doc!.form.category).toBe('shift_change_request')
  })

  it('2-4. ATTENDANCE_EDIT 요청 → 출퇴근 정정 양식 기반 문서 자동생성', async () => {
    const res = await authedRequest(ctx.app, empToken)
      .post('/requests')
      .send({
        type: 'ATTENDANCE_EDIT',
        payload: { date: '2026-06-10', clockInAt: '09:05', clockOutAt: '18:00', note: '정정' },
      })
    expect([200, 201]).toContain(res.status)
    const doc = await loadDocByRequest(ctx.prisma, res.body.data.id)
    expect(doc).toBeTruthy()
    expect(doc!.form.category).toBe('attendance_correction_request')
  })

  it('2-5. 내 요청 목록 조회 → 생성한 요청이 포함된다', async () => {
    const res = await authedRequest(ctx.app, empToken).get('/requests?scope=mine')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(res.body.data.items.length).toBeGreaterThan(0)
    expect(res.body.data.items.every((r: { requesterId: string }) => r.requesterId === EMP_HONG)).toBe(true)
  })

  it('2-6. 잔액(15일) 초과 휴가(16일) 요청 → 검증 실패(400)', async () => {
    const res = await authedRequest(ctx.app, empToken)
      .post('/requests')
      .send({
        type: 'LEAVE_CREATE',
        payload: { leaveTypeId: LEAVE_TYPE, startDate: '2026-08-01', endDate: '2026-08-16' },
      })
    expect(res.status).toBe(400)
  })

  it('2-7. 필수 payload 누락 → 400 (request/document 미생성)', async () => {
    const before = await ctx.prisma.request.count()
    const res = await authedRequest(ctx.app, empToken)
      .post('/requests')
      .send({ type: 'LEAVE_CREATE', payload: { reason: 'leaveTypeId/날짜 누락' } })
    expect(res.status).toBe(400)
    const after = await ctx.prisma.request.count()
    expect(after).toBe(before) // 부분 생성 없음
  })
})
