/**
 * S5. 무결성·권한 심층 보안 테스트.
 * 이번 라운드에서 추가한 비즈니스 가드를 실 DB로 검증:
 * - HR 요청의 타 직원 레코드 조작 차단 (소유권 검증)
 * - 자기결재 방지 (결재 가능한 외부 관리자 없으면 요청 거부)
 * - 휴가 잔액 조회 권한 (본인 또는 ORG_ADMIN↑만)
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const EMP_HONG = 'seed-emp-001' // 홍길동 (개발팀, EMPLOYEE)
const EMP_SALES = 'seed-emp-sales' // 박영업 (영업팀, EMPLOYEE)
const LEAVE_TYPE = 'seed-leave-type-annual'

/** LEAVE_CREATE 요청 생성 → admin 승인 → 생성된 Leave 레코드 반환 */
async function createApprovedLeave(
  ctx: TestContext,
  empToken: string,
  adminToken: string,
  startDate: string,
  endDate: string,
) {
  const req = await authedRequest(ctx.app, empToken)
    .post('/requests')
    .send({ type: 'LEAVE_CREATE', payload: { leaveTypeId: LEAVE_TYPE, startDate, endDate } })
  expect([200, 201]).toContain(req.status)
  const approve = await authedRequest(ctx.app, adminToken)
    .post(`/requests/${req.body.data.id}/approve`)
    .send({})
  expect([200, 201]).toContain(approve.status)
  return ctx.prisma.leave.findFirst({ where: { startDate: new Date(startDate) }, orderBy: { createdAt: 'desc' } })
}

describe('S5. 무결성·권한 (integrity-security.e2e)', () => {
  let ctx: TestContext
  let hongToken: string
  let salesToken: string
  let adminToken: string

  beforeAll(async () => {
    ctx = await createTestApp()
    hongToken = await login(ctx.app, 'employee')
    salesToken = await login(ctx.app, 'sales')
    adminToken = await login(ctx.app, 'admin')
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  // ── 소유권 검증 ─────────────────────────────────────────────────────────────

  it('5-1. 타 직원의 휴가를 LEAVE_DELETE 요청·승인해도 삭제되지 않는다 (소유권)', async () => {
    // 홍길동의 휴가 1건 생성·승인
    const hongLeave = await createApprovedLeave(ctx, hongToken, adminToken, '2026-09-10', '2026-09-10')
    expect(hongLeave).toBeTruthy()
    expect(hongLeave!.employeeId).toBe(EMP_HONG)

    // 박영업이 홍길동의 휴가 삭제를 신청
    const req = await authedRequest(ctx.app, salesToken)
      .post('/requests')
      .send({ type: 'LEAVE_DELETE', payload: { leaveId: hongLeave!.id } })
    expect([200, 201]).toContain(req.status)

    // admin 승인 시도 → apply 단계에서 소유권 불일치로 실패(롤백)
    const approve = await authedRequest(ctx.app, adminToken)
      .post(`/requests/${req.body.data.id}/approve`)
      .send({})
    expect(approve.status).toBeGreaterThanOrEqual(400)

    // 홍길동의 휴가는 그대로 존재
    const stillThere = await ctx.prisma.leave.findUnique({ where: { id: hongLeave!.id } })
    expect(stillThere).toBeTruthy()
  })

  // ── 자기결재 방지 ───────────────────────────────────────────────────────────

  it('5-2. 결재 가능한 외부 관리자가 없으면 요청 생성이 거부된다 (자기결재 방지)', async () => {
    // admin(유일한 GENERAL_ADMIN↑)이 휴가를 신청 → 본인 외 결재자 없음 → 거부
    const res = await authedRequest(ctx.app, adminToken)
      .post('/requests')
      .send({
        type: 'LEAVE_CREATE',
        payload: { leaveTypeId: LEAVE_TYPE, startDate: '2026-09-20', endDate: '2026-09-20' },
      })
    expect(res.status).toBe(400)
    expect(res.body.error?.code).toBe('REQUEST_NO_APPROVER')
  })

  // ── 휴가 잔액 조회 권한 ───────────────────────────────────────────────────────

  it('5-3. EMPLOYEE는 본인 휴가 잔액만 조회 가능', async () => {
    const own = await authedRequest(ctx.app, salesToken).get(`/leaves/balance/${EMP_SALES}`)
    expect(own.status).toBe(200)
    expect(Array.isArray(own.body.data)).toBe(true)
  })

  it('5-4. EMPLOYEE가 타 직원 휴가 잔액 조회 → 403', async () => {
    const other = await authedRequest(ctx.app, salesToken).get(`/leaves/balance/${EMP_HONG}`)
    expect(other.status).toBe(403)
  })

  it('5-5. 관리자(SUPER_ADMIN)는 타 직원 휴가 잔액 조회 가능', async () => {
    const res = await authedRequest(ctx.app, adminToken).get(`/leaves/balance/${EMP_HONG}`)
    expect(res.status).toBe(200)
  })

  // ── 기초 데이터 삭제 가드 (admin 설정 마스터 데이터) ──────────────────────────

  it('5-6. 사용 중인 기안양식 삭제 → 403 (FORM_IN_USE)', async () => {
    // 휴가 요청 1건 생성 → 휴가신청서 양식(seed-form-leave)을 참조하는 문서 생성
    const req = await authedRequest(ctx.app, hongToken)
      .post('/requests')
      .send({ type: 'LEAVE_CREATE', payload: { leaveTypeId: LEAVE_TYPE, startDate: '2026-11-05', endDate: '2026-11-05' } })
    expect([200, 201]).toContain(req.status)

    const del = await authedRequest(ctx.app, adminToken).delete('/document-forms/seed-form-leave')
    expect(del.status).toBe(403)
    expect(del.body.error?.code).toBe('FORM_IN_USE')
  })

  it('5-7. 진행 중 요청이 있는 승인 규칙 삭제 → 403 (APPROVAL_RULE_IN_USE)', async () => {
    // 실제 규칙 생성(UUID 발급) — seed 규칙 ID는 UUID가 아니라 엔드포인트 ParseUUIDPipe에 걸림
    const created = await authedRequest(ctx.app, adminToken)
      .post('/requests/approval-rules')
      .send({
        name: 'e2e 임시 LEAVE 규칙',
        requestType: 'LEAVE_CREATE',
        details: [{ round: 1, requiredCount: 1, sortOrder: 0 }],
      })
    expect([200, 201]).toContain(created.status)
    const ruleId: string = created.body.data.id
    expect(ruleId).toBeTruthy()

    // PENDING 상태의 LEAVE_CREATE 요청 생성 (승인하지 않음)
    const req = await authedRequest(ctx.app, hongToken)
      .post('/requests')
      .send({ type: 'LEAVE_CREATE', payload: { leaveTypeId: LEAVE_TYPE, startDate: '2026-11-10', endDate: '2026-11-10' } })
    expect([200, 201]).toContain(req.status)

    const del = await authedRequest(ctx.app, adminToken).delete(`/requests/approval-rules/${ruleId}`)
    expect(del.status).toBe(403)
    expect(del.body.error?.code).toBe('APPROVAL_RULE_IN_USE')
  })
})
