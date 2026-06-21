/**
 * AbleWork ERP — 신입사원 온보딩·계정 생명주기 E2E
 *
 * 여정 요약 (시간순):
 *   J1-1  admin이 신입 계정 생성 (initialPassword·조직·입사일)
 *   J1-2  신입이 initialPassword로 API 로그인 → 200 토큰
 *   J1-3  비밀번호 변경 → 기존 비번 401 / 새 비번 200
 *   J1-4  새 비번으로 UI 로그인 → /me/* 진입
 *   J1-5  근로정보 등록 → GET 반영 확인
 *   J1-6  퇴사(deactivate) → 로그인 401 → 재활성(activate) → 로그인 200
 *
 * 전략: 셋업·검증은 API 직접, 핵심 UI 액션만 브라우저. AAA 패턴.
 */
import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, API_URL, ACCOUNTS, login, jwtEmployeeId, uiLogin } from './helpers'

// ---------------------------------------------------------------------------
// 헬퍼 — authHeaders
// ---------------------------------------------------------------------------
function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

// ---------------------------------------------------------------------------
// 공유 상태 (describe 범위 내에서 여정 순서대로 전달)
// ---------------------------------------------------------------------------
interface JourneyState {
  orgId: string
  employeeId: string
  newbieEmail: string
  initialPassword: string
  newPassword: string
  adminToken: string
}

// ---------------------------------------------------------------------------
// 여정 — 신입사원 온보딩 계정 생명주기
// ---------------------------------------------------------------------------
test.describe('신입사원 온보딩·계정 생명주기 여정', () => {
  const state: JourneyState = {
    orgId: '',
    employeeId: '',
    newbieEmail: `newbie-onboard-${Date.now()}@ablework.io`,
    initialPassword: 'Initial7890!',
    newPassword: 'Changed9876!',
    adminToken: '',
  }

  // -------------------------------------------------------------------------
  // 사전 셋업: admin 토큰 + 전용 조직 생성 (UUID 필요)
  // -------------------------------------------------------------------------
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    // admin 로그인 → 토큰 확보
    const adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    state.adminToken = adminTokens.accessToken

    // 온보딩 전용 조직 생성 (seed-org-dev는 slug ID라 UUID 검증 통과 안 됨)
    const orgResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: `E2E온보딩조직${Date.now()}`, depth: 0, sortOrder: 0 },
      headers: authHeaders(state.adminToken),
    })
    expect(orgResp.ok()).toBeTruthy()
    const orgBody = await orgResp.json()
    state.orgId = orgBody.data.id

    await ctx.close()
  })

  // -------------------------------------------------------------------------
  // J1-1 admin이 신입 계정 생성
  // -------------------------------------------------------------------------
  test('J1-1: admin이 신입 계정 생성 → 직원 조회로 확인', async ({ page }) => {
    // Arrange: 토큰·조직 준비 완료

    // Act: POST /employees
    const resp = await page.request.post(`${API_URL}/employees`, {
      data: {
        email: state.newbieEmail,
        name: '온보딩신입',
        initialPassword: state.initialPassword,
        joinedAt: '2025-06-21',
        employmentType: 'regular',
        accessLevel: 'EMPLOYEE',
        organizationIds: [state.orgId],
        primaryOrganizationId: state.orgId,
        employeeNumber: `ONB-${Date.now()}`,
      },
      headers: authHeaders(state.adminToken),
    })

    // Assert: 생성 성공
    expect(resp.status()).toBe(201)
    const body = await resp.json()
    expect(body.success).toBe(true)
    const emp = body.data
    expect(emp.id).toBeTruthy()
    expect(emp.isActive).toBe(true)
    state.employeeId = emp.id

    // Assert: GET /employees?search 로 확인
    const searchResp = await page.request.get(
      `${API_URL}/employees?search=${encodeURIComponent('온보딩신입')}&limit=5`,
      { headers: authHeaders(state.adminToken) },
    )
    expect(searchResp.ok()).toBeTruthy()
    const searchBody = await searchResp.json()
    const found = (searchBody.data.items as Array<{ id: string }>).find(
      (e) => e.id === state.employeeId,
    )
    expect(found).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // J1-2 신입이 initialPassword로 API 로그인 → 200 토큰
  // -------------------------------------------------------------------------
  test('J1-2: 신입이 initialPassword로 API 로그인 → 200 토큰', async ({ page }) => {
    // Arrange: J1-1에서 생성된 계정 사용

    // Act: POST /auth/login
    const resp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: state.newbieEmail, password: state.initialPassword },
      headers: { 'Content-Type': 'application/json' },
    })

    // Assert: 200 + accessToken 반환
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.success).toBe(true)
    expect(body.data.accessToken).toBeTruthy()

    // Assert: JWT payload의 employeeId 가 생성된 직원 ID와 일치
    const empId = jwtEmployeeId(body.data.accessToken)
    expect(empId).toBe(state.employeeId)
  })

  // -------------------------------------------------------------------------
  // J1-3 비밀번호 변경 → 기존 비번 401 / 새 비번 200
  // -------------------------------------------------------------------------
  test('J1-3: change-password → 기존 비번 401 / 새 비번 200', async ({ page }) => {
    // Arrange: 신입 토큰 확보
    const loginResp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: state.newbieEmail, password: state.initialPassword },
      headers: { 'Content-Type': 'application/json' },
    })
    const { accessToken } = (await loginResp.json()).data as { accessToken: string }

    // Act: POST /auth/change-password
    const changeResp = await page.request.post(`${API_URL}/auth/change-password`, {
      data: {
        currentPassword: state.initialPassword,
        newPassword: state.newPassword,
        confirmPassword: state.newPassword,
      },
      headers: authHeaders(accessToken),
    })

    // Assert: 204 No Content
    expect(changeResp.status()).toBe(204)

    // Assert: 기존 비번으로 로그인 → 401
    const oldLoginResp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: state.newbieEmail, password: state.initialPassword },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(oldLoginResp.status()).toBe(401)

    // Assert: 새 비번으로 로그인 → 200
    const newLoginResp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: state.newbieEmail, password: state.newPassword },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(newLoginResp.status()).toBe(200)
    expect((await newLoginResp.json()).data.accessToken).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // J1-4 새 비번으로 UI 로그인 → /me/* 진입
  // -------------------------------------------------------------------------
  test('J1-4: UI 로그인(새 비번) → /me/* 진입', async ({ page }) => {
    // Arrange: 새 비번 준비됨

    // Act: 폼 로그인
    await uiLogin(page, state.newbieEmail, state.newPassword)

    // Assert: /me/* 경로 진입
    const path = new URL(page.url()).pathname
    expect(path).toMatch(/^\/me\//)
  })

  // -------------------------------------------------------------------------
  // J1-5 근로정보 등록 → GET 반영
  // -------------------------------------------------------------------------
  test('J1-5: 근로정보 등록 → GET /wage-info 반영', async ({ page }) => {
    // Arrange: admin 토큰 사용

    // Act: POST /employees/:id/wage-info
    const postResp = await page.request.post(
      `${API_URL}/employees/${state.employeeId}/wage-info`,
      {
        data: {
          hourlyWage: 12000,
          contractedWorkDays: 'Mon,Tue,Wed,Thu,Fri',
          contractedHoursPerWeek: 40,
          effectiveFrom: '2025-06-21',
        },
        headers: authHeaders(state.adminToken),
      },
    )

    // Assert: 생성 성공
    expect(postResp.status()).toBe(201)
    const postBody = await postResp.json()
    expect(postBody.success).toBe(true)
    expect(postBody.data.hourlyWage).toBe(12000)

    // Assert: GET /employees/:id/wage-info 반영 확인
    const getResp = await page.request.get(
      `${API_URL}/employees/${state.employeeId}/wage-info`,
      { headers: authHeaders(state.adminToken) },
    )
    expect(getResp.ok()).toBeTruthy()
    const getBody = await getResp.json()
    const records = getBody.data as Array<{ hourlyWage: number }>
    expect(records.length).toBeGreaterThan(0)
    expect(records[0].hourlyWage).toBe(12000)
  })

  // -------------------------------------------------------------------------
  // J1-6 퇴사(deactivate) → 로그인 401 → 재활성(activate) → 로그인 200
  // -------------------------------------------------------------------------
  test('J1-6: deactivate → 로그인 401 → activate → 로그인 200', async ({ page }) => {
    // Act: POST /employees/:id/deactivate
    const deactivateResp = await page.request.post(
      `${API_URL}/employees/${state.employeeId}/deactivate`,
      {
        data: {},
        headers: authHeaders(state.adminToken),
      },
    )
    expect(deactivateResp.ok()).toBeTruthy()
    const deactivateBody = await deactivateResp.json()
    expect(deactivateBody.data.isActive).toBe(false)

    // Assert: 비활성 상태 로그인 → 401
    const inactiveLoginResp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: state.newbieEmail, password: state.newPassword },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(inactiveLoginResp.status()).toBe(401)

    // Act: POST /employees/:id/activate
    const activateResp = await page.request.post(
      `${API_URL}/employees/${state.employeeId}/activate`,
      {
        data: {},
        headers: authHeaders(state.adminToken),
      },
    )
    expect(activateResp.ok()).toBeTruthy()
    const activateBody = await activateResp.json()
    expect(activateBody.data.isActive).toBe(true)

    // Assert: 재활성 후 로그인 → 200
    const activeLoginResp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: state.newbieEmail, password: state.newPassword },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(activeLoginResp.status()).toBe(200)
    expect((await activeLoginResp.json()).data.accessToken).toBeTruthy()
  })
})
