/**
 * S1. 인증 통합 테스트 — 로그인 / 토큰 갱신 / 비밀번호 변경.
 * 실 DB(ablework_test) + 시드 계정 사용.
 */
import request from 'supertest'
import { closeTestApp, createTestApp, TestContext, API_PREFIX } from './utils/test-app'
import { login, SEED_ACCOUNTS } from './utils/auth'

describe('S1. 인증 (auth.e2e)', () => {
  let ctx: TestContext
  const url = (p: string) => `/${API_PREFIX}${p}`

  beforeAll(async () => {
    ctx = await createTestApp()
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  it('1-1. 올바른 자격증명 → 200 + accessToken/refreshToken', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: SEED_ACCOUNTS.admin.email, password: SEED_ACCOUNTS.admin.password })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.data.accessToken).toBe('string')
    expect(typeof res.body.data.refreshToken).toBe('string')
  })

  it('1-2. 잘못된 비밀번호 → 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: SEED_ACCOUNTS.admin.email, password: 'wrong-password' })
    expect(res.status).toBe(401)
  })

  it('1-3. 미존재 이메일 → 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: 'nobody@nowhere.io', password: 'whatever1234!' })
    expect(res.status).toBe(401)
  })

  it('1-4. refreshToken으로 토큰 갱신 → 200 + 새 토큰', async () => {
    const loginRes = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: SEED_ACCOUNTS.employee.email, password: SEED_ACCOUNTS.employee.password })
    const refreshToken = loginRes.body.data.refreshToken

    const res = await request(ctx.app.getHttpServer())
      .post(url('/auth/refresh'))
      .send({ refreshToken })
    expect(res.status).toBe(200)
    expect(typeof res.body.data.accessToken).toBe('string')
    expect(typeof res.body.data.refreshToken).toBe('string')
  })

  it('1-5. 위조 refreshToken → 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(url('/auth/refresh'))
      .send({ refreshToken: 'this.is.not-a-valid-jwt' })
    expect(res.status).toBe(401)
  })

  it('1-6. 비밀번호 변경: 신규 비번 로그인 가능, 기존 비번 거부 (변경 후 원복)', async () => {
    const token = await login(ctx.app, 'sales')
    const newPw = 'salesNew1234!'

    // 변경
    const change = await request(ctx.app.getHttpServer())
      .post(url('/auth/change-password'))
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: SEED_ACCOUNTS.sales.password,
        newPassword: newPw,
        confirmPassword: newPw,
      })
    expect([200, 204]).toContain(change.status)

    // 기존 비번 → 401
    const oldLogin = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: SEED_ACCOUNTS.sales.email, password: SEED_ACCOUNTS.sales.password })
    expect(oldLogin.status).toBe(401)

    // 신규 비번 → 200
    const newLogin = await request(ctx.app.getHttpServer())
      .post(url('/auth/login'))
      .send({ email: SEED_ACCOUNTS.sales.email, password: newPw })
    expect(newLogin.status).toBe(200)

    // 원복 (다른 테스트 영향 방지)
    const restore = await request(ctx.app.getHttpServer())
      .post(url('/auth/change-password'))
      .set('Authorization', `Bearer ${newLogin.body.data.accessToken}`)
      .send({
        currentPassword: newPw,
        newPassword: SEED_ACCOUNTS.sales.password,
        confirmPassword: SEED_ACCOUNTS.sales.password,
      })
    expect([200, 204]).toContain(restore.status)
  })

  it('1-7. 비밀번호 변경 시 현재 비번 오류 → 400', async () => {
    const token = await login(ctx.app, 'employee')
    const res = await request(ctx.app.getHttpServer())
      .post(url('/auth/change-password'))
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'definitely-wrong',
        newPassword: 'whatever1234!',
        confirmPassword: 'whatever1234!',
      })
    expect(res.status).toBe(400)
  })
})
