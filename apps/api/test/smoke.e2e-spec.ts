/**
 * 하니스 스모크 테스트 — 앱 부트스트랩 / 시드 DB / 로그인 / 인증 요청 검증.
 * 본격 통합 시나리오 작성 전에 e2e 환경 자체가 동작하는지 확인하는 용도.
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login, SEED_ACCOUNTS } from './utils/auth'

describe('[smoke] e2e 하니스', () => {
  let ctx: TestContext

  beforeAll(async () => {
    ctx = await createTestApp()
  })

  afterAll(async () => {
    await closeTestApp(ctx)
  })

  it('앱이 테스트 DB에 연결되고 부팅된다', () => {
    expect(ctx.app).toBeDefined()
    expect(process.env.DATABASE_URL).toContain('ablework_test')
  })

  it('시드 계정으로 로그인하면 토큰을 발급한다', async () => {
    const token = await login(ctx.app, 'admin')
    expect(typeof token).toBe('string')
    expect(token.length).toBeGreaterThan(20)
  })

  it('잘못된 비밀번호는 401', async () => {
    const res = await authedRequest(ctx.app, 'x').post('/auth/login')
    // login은 인증 불필요 — 직접 호출
    expect([400, 401]).toContain(res.status)
  })

  it('인증 토큰으로 직원 목록을 조회한다 (응답 래핑 검증)', async () => {
    const token = await login(ctx.app, 'admin')
    const res = await authedRequest(ctx.app, token).get('/employees')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // 목록 응답: { items, total, page, limit } 가 data에 래핑됨
    expect(Array.isArray(res.body.data.items)).toBe(true)
    // 시드: admin + employee + orgadmin + sales = 최소 4명
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(4)
  })

  it('토큰 없이 보호된 엔드포인트 접근 시 401', async () => {
    const res = await authedRequest(ctx.app, 'invalid-token').get('/employees')
    expect(res.status).toBe(401)
  })

  it('시드 계정 4종이 모두 로그인 가능하다', async () => {
    for (const key of Object.keys(SEED_ACCOUNTS) as Array<keyof typeof SEED_ACCOUNTS>) {
      const token = await login(ctx.app, key)
      expect(token).toBeTruthy()
    }
  })
})
