/**
 * S4. 멀티테넌시·권한 보안 통합 테스트.
 * - ORG_ADMIN 조직 범위 제한 (개발팀 ↔ 영업팀)
 * - 역할 가드 (EMPLOYEE는 관리자 전용 엔드포인트 접근 불가)
 * - 인증 가드 (토큰 없음/위조)
 */
import request from 'supertest'
import { closeTestApp, createTestApp, TestContext, API_PREFIX } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const SEED = {
  empDev: 'seed-emp-001', // 홍길동 (개발팀)
  empSales: 'seed-emp-sales', // 박영업 (영업팀)
  orgSales: 'seed-org-sales',
}

describe('S4. 멀티테넌시·권한 보안 (tenancy-security.e2e)', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  it('4-1. ORG_ADMIN(개발팀)이 영업팀 직원 상세 조회 → 403/404 (타 조직 차단)', async () => {
    const token = await login(ctx.app, 'orgadmin')
    const res = await authedRequest(ctx.app, token).get(`/employees/${SEED.empSales}`)
    expect([403, 404]).toContain(res.status)
  })

  it('4-2. ORG_ADMIN(개발팀)이 자기 조직 직원 상세 조회 → 200', async () => {
    const token = await login(ctx.app, 'orgadmin')
    const res = await authedRequest(ctx.app, token).get(`/employees/${SEED.empDev}`)
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(SEED.empDev)
  })

  it('4-2b. ORG_ADMIN 직원 목록은 자기 조직 범위로 제한된다 (영업팀 직원 미포함)', async () => {
    const token = await login(ctx.app, 'orgadmin')
    const res = await authedRequest(ctx.app, token).get('/employees')
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toContain(SEED.empDev)
    expect(ids).not.toContain(SEED.empSales)
  })

  it('4-3. EMPLOYEE가 직원 등록(GENERAL_ADMIN 전용) 시도 → 403', async () => {
    const token = await login(ctx.app, 'employee')
    const res = await authedRequest(ctx.app, token)
      .post('/employees')
      .send({ name: '권한없음', email: 'x@x.io', joinedAt: '2026-01-01' })
    expect(res.status).toBe(403)
  })

  it('4-4a. 토큰 없이 보호 엔드포인트 → 401', async () => {
    const res = await request(ctx.app.getHttpServer()).get(`/${API_PREFIX}/employees`)
    expect(res.status).toBe(401)
  })

  it('4-4b. 위조 토큰으로 보호 엔드포인트 → 401', async () => {
    const res = await authedRequest(ctx.app, 'forged.jwt.token').get('/employees')
    expect(res.status).toBe(401)
  })

  it('4-5. SUPER_ADMIN은 전 직원 조회 가능 (범위 제한 없음)', async () => {
    const token = await login(ctx.app, 'admin')
    const res = await authedRequest(ctx.app, token).get('/employees')
    expect(res.status).toBe(200)
    const ids = (res.body.data.items as Array<{ id: string }>).map((e) => e.id)
    expect(ids).toContain(SEED.empDev)
    expect(ids).toContain(SEED.empSales)
  })
})
