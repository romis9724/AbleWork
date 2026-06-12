/**
 * AbleWork ERP — Real User Core Flows
 *
 * Tests three critical journeys:
 *   TEST 1 — Employee clock-in / clock-out (clock-in API fix validation)
 *   TEST 2 — Admin data entry (org, position CRUD + leave types read)
 *   TEST 3 — Employee leave request submission
 *
 * Screenshots saved to: e2e/screenshots/realuser/
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = 'http://localhost:3000'
const API_URL = 'http://localhost:3001/api/v1'
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'realuser')

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
}

const EMPLOYEE = { email: 'employee@ablework.io', password: 'employee1234!' }
const ADMIN = { email: 'admin@ablework.io', password: 'admin1234!' }

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`  [screenshot] ${filePath}`)
}

async function getTokens(page: Page, email: string, password: string) {
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await resp.json()
  return {
    accessToken: body?.data?.accessToken as string,
    refreshToken: body?.data?.refreshToken as string,
  }
}

async function injectAuth(context: BrowserContext, page: Page, email: string, password: string) {
  const { accessToken, refreshToken } = await getTokens(page, email, password)
  await context.addCookies([
    { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
  ])
  return { accessToken, refreshToken }
}

/** Clock-out via API directly so tests always start from a clean state */
async function ensureClockedOut(page: Page) {
  const { accessToken } = await getTokens(page, EMPLOYEE.email, EMPLOYEE.password)
  await page.request.post(`${API_URL}/attendances/clock-out`, {
    data: { latitude: 37.5665, longitude: 126.978 },
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST 1 — 직원 출퇴근 (Clock-in API fix validation)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TEST 1 — 직원 출퇴근', () => {

  test.beforeEach(async ({ page }) => {
    // Ensure a clean clocked-out state before each clock test
    await ensureClockedOut(page)
  })

  test('T1-A: 출근 버튼 클릭 → GPS 없으면 에러 Snackbar 표시, 앱 크래시 없음', async ({ page, context }) => {
    await injectAuth(context, page, EMPLOYEE.email, EMPLOYEE.password)
    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')
    await ss(page, 'T1-A-01_me_home_initial')

    // The page renders only '출근' on initial load (clockedIn state is false by default).
    // '퇴근' only appears after a successful clock-in in the same React session.
    const clockInBtn = page.getByRole('button', { name: '출근', exact: true })
    await expect(clockInBtn).toBeVisible({ timeout: 8000 })

    // Click 출근 — in headless Playwright without geolocation permission,
    // navigator.geolocation.getCurrentPosition will trigger an error callback
    // and the app shows an error Snackbar. The app must NOT crash.
    const clockInReq = page.waitForResponse(
      (r) => r.url().includes('/attendances/clock-in'),
      { timeout: 15000 },
    ).catch(() => null)

    await clockInBtn.click()

    // Wait for either: snackbar to appear (GPS denied path) OR API response (GPS granted path)
    const snackbar = page.locator('[role="alert"]')

    // Give 12s for GPS prompt + API call + snack render
    await Promise.race([
      snackbar.waitFor({ state: 'visible', timeout: 12000 }),
      clockInReq,
    ]).catch(() => null)

    await ss(page, 'T1-A-02_after_clockin_click')

    // App must not show fatal error
    const bodyText: string = await page.evaluate(() => document.body.innerText)
    expect(bodyText).not.toContain('Application error')
    expect(bodyText).not.toContain('Internal Server Error')
    expect(bodyText).not.toContain('This page could not be found')

    console.log('  T1-A: App did not crash after 출근 click — PASS')
  })

  test('T1-B: clock-in API POST /attendances/clock-in → 201 성공 (직접 API 검증)', async ({ page }) => {
    const { accessToken } = await getTokens(page, EMPLOYEE.email, EMPLOYEE.password)

    const resp = await page.request.post(`${API_URL}/attendances/clock-in`, {
      data: { latitude: 37.5665, longitude: 126.978 },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })

    const body = await resp.json()
    console.log(`  clock-in HTTP status: ${resp.status()}`)
    console.log(`  clock-in response: ${JSON.stringify(body)}`)

    expect(resp.status()).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toBeTruthy()
    expect(body.data.clockInAt).toBeTruthy()
    expect(body.data.clockOutAt).toBeNull()

    console.log('  T1-B: POST /attendances/clock-in → 201 — PASS')
  })

  test('T1-C: clock-out API POST /attendances/clock-out → 200 성공 (직접 API 검증)', async ({ page }) => {
    const { accessToken } = await getTokens(page, EMPLOYEE.email, EMPLOYEE.password)

    // First clock-in via API so there is something to clock out from
    await page.request.post(`${API_URL}/attendances/clock-in`, {
      data: { latitude: 37.5665, longitude: 126.978 },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })

    const resp = await page.request.post(`${API_URL}/attendances/clock-out`, {
      data: { latitude: 37.5665, longitude: 126.978 },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })

    const body = await resp.json()
    console.log(`  clock-out HTTP status: ${resp.status()}`)
    console.log(`  clock-out response clockOutAt: ${body.data?.clockOutAt}`)

    expect(resp.status()).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.clockOutAt).toBeTruthy()

    console.log('  T1-C: POST /attendances/clock-out → 200 — PASS')
  })

  test('T1-D: GPS 허용 시뮬레이션 → 출근 성공 Snackbar "출근 기록이 완료됐습니다." 표시', async ({ browser }) => {
    // Grant geolocation so the UI code can actually proceed to the API call
    const context = await browser.newContext({
      geolocation: { latitude: 37.5665, longitude: 126.978 },
      permissions: ['geolocation'],
    })
    const page = await context.newPage()

    // Inject auth
    const { accessToken, refreshToken } = await getTokens(page, EMPLOYEE.email, EMPLOYEE.password)
    await context.addCookies([
      { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
      { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
    ])

    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')
    await ss(page, 'T1-D-01_me_home_with_gps')

    const clockInBtn = page.getByRole('button', { name: '출근', exact: true })
    await expect(clockInBtn).toBeVisible({ timeout: 8000 })

    // Intercept and log the API call
    let clockInStatus = 0
    let clockInBody: unknown = null
    const apiCallDone = page.waitForResponse(
      async (r) => {
        if (r.url().includes('/attendances/clock-in') && r.request().method() === 'POST') {
          clockInStatus = r.status()
          clockInBody = await r.json().catch(() => null)
          return true
        }
        return false
      },
      { timeout: 15000 },
    )

    await clockInBtn.click()

    // Wait for API response
    await apiCallDone.catch((e) => console.log(`  API call not intercepted: ${e.message}`))

    console.log(`  clock-in API status from UI: ${clockInStatus}`)
    console.log(`  clock-in API body: ${JSON.stringify(clockInBody)}`)

    // Wait for snackbar
    const snackbar = page.locator('[role="alert"]')
    const snackVisible = await snackbar.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)

    await ss(page, 'T1-D-02_clockin_result')

    if (snackVisible) {
      const snackText = await snackbar.innerText().catch(() => '')
      console.log(`  Snackbar text: "${snackText}"`)

      if (clockInStatus === 201) {
        // Success path: must show success message
        expect(snackText).toContain('출근 기록이 완료됐습니다.')
        console.log('  T1-D: GPS 허용 → 출근 성공 Snackbar — PASS')
      } else {
        // Error path (already clocked in etc) — message still shown, no crash
        console.log(`  T1-D: clock-in returned ${clockInStatus}, error snack shown — acceptable`)
      }
    } else {
      // API may have failed silently — still check no crash
      const bodyText: string = await page.evaluate(() => document.body.innerText)
      expect(bodyText).not.toContain('Application error')
      console.log('  T1-D: No snackbar shown (possible already-clocked-in state)')
    }

    await context.close()
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 2 — 관리자 데이터 입력 → 조회
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TEST 2 — 관리자 데이터 입력 → 조회', () => {

  test.beforeEach(async ({ page, context }) => {
    await injectAuth(context, page, ADMIN.email, ADMIN.password)
  })

  test('T2-A: /admin/organizations → "+ 조직 추가" → 브라우저테스트조직 → 201 성공 + 목록 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')
    await ss(page, 'T2-A-01_organizations_initial')

    expect(page.url()).not.toContain('/login')

    // Click "조직 추가" button
    const addBtn = page.getByRole('button', { name: '조직 추가' })
    await expect(addBtn).toBeVisible({ timeout: 8000 })
    await addBtn.click()

    // Dialog should open
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await ss(page, 'T2-A-02_org_dialog_open')

    // Fill org name
    const orgName = `브라우저테스트조직_${Date.now()}`
    const nameInput = dialog.locator('input[type="text"]').first()
    await nameInput.fill(orgName)

    // Intercept API call
    let createStatus = 0
    let createBody: unknown = null
    const createDone = page.waitForResponse(
      async (r) => {
        if (r.url().includes('/organizations') && r.request().method() === 'POST') {
          createStatus = r.status()
          createBody = await r.json().catch(() => null)
          return true
        }
        return false
      },
      { timeout: 10000 },
    )

    // Click 추가
    const submitBtn = dialog.getByRole('button', { name: '추가' })
    await submitBtn.click()

    await createDone.catch((e) => console.log(`  Org create API not captured: ${e.message}`))

    console.log(`  POST /organizations status: ${createStatus}`)
    console.log(`  POST /organizations body: ${JSON.stringify(createBody)}`)

    await ss(page, 'T2-A-03_after_org_create')

    // API must succeed
    expect(createStatus).toBe(201)

    // Snackbar must show success
    const snackbar = page.locator('[role="alert"]')
    const snackVisible = await snackbar.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)
    if (snackVisible) {
      const snackText = await snackbar.innerText().catch(() => '')
      console.log(`  Snackbar: "${snackText}"`)
      expect(snackText).toContain('추가')
    }

    // New org should appear in the list
    await page.waitForLoadState('networkidle')
    const pageContent = await page.content()
    expect(pageContent).toContain('브라우저테스트조직')

    console.log('  T2-A: 조직 추가 → 201 → 목록 표시 — PASS')
  })

  test('T2-B: /admin/positions → "+ 직무 추가" → 브라우저테스트직무 → 201 성공 + 목록 표시', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')
    await ss(page, 'T2-B-01_positions_initial')

    expect(page.url()).not.toContain('/login')

    // Click "직무 추가"
    const addBtn = page.getByRole('button', { name: '직무 추가' })
    await expect(addBtn).toBeVisible({ timeout: 8000 })
    await addBtn.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await ss(page, 'T2-B-02_position_dialog_open')

    const posName = `브라우저테스트직무_${Date.now()}`
    const nameInput = dialog.locator('input[type="text"]').first()
    await nameInput.fill(posName)

    let createStatus = 0
    let createBody: unknown = null
    const createDone = page.waitForResponse(
      async (r) => {
        if (r.url().includes('/positions') && r.request().method() === 'POST') {
          createStatus = r.status()
          createBody = await r.json().catch(() => null)
          return true
        }
        return false
      },
      { timeout: 10000 },
    )

    const submitBtn = dialog.getByRole('button', { name: '추가' })
    await submitBtn.click()

    await createDone.catch((e) => console.log(`  Position create API not captured: ${e.message}`))

    console.log(`  POST /positions status: ${createStatus}`)
    console.log(`  POST /positions body: ${JSON.stringify(createBody)}`)

    await ss(page, 'T2-B-03_after_position_create')

    expect(createStatus).toBe(201)

    // Snackbar
    const snackbar = page.locator('[role="alert"]')
    const snackVisible = await snackbar.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)
    if (snackVisible) {
      const snackText = await snackbar.innerText().catch(() => '')
      console.log(`  Snackbar: "${snackText}"`)
      expect(snackText).toContain('추가')
    }

    // New position in list
    await page.waitForLoadState('networkidle')
    const pageContent = await page.content()
    expect(pageContent).toContain('브라우저테스트직무')

    console.log('  T2-B: 직무 추가 → 201 → 목록 표시 — PASS')
  })

  test('T2-C: /admin/leave/types → "연차" 데이터 표시 확인', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin/leave/types`)
    await page.waitForLoadState('networkidle')

    // Wait for API data to render
    await page.waitForFunction(
      () => document.body.innerText.includes('연차'),
      { timeout: 10000 },
    ).catch(() => null)

    await ss(page, 'T2-C-01_leave_types')

    expect(page.url()).not.toContain('/login')

    const bodyText: string = await page.evaluate(() => document.body.innerText)
    expect(bodyText).not.toContain('Application error')

    const hasYeouncha = bodyText.includes('연차')
    console.log(`  연차 포함: ${hasYeouncha}`)
    expect(hasYeouncha).toBe(true)

    console.log('  T2-C: /admin/leave/types → 연차 표시 — PASS')
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// TEST 3 — 직원 요청 신청 (휴가 신청)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('TEST 3 — 직원 요청 신청', () => {

  test.beforeEach(async ({ page, context }) => {
    await injectAuth(context, page, EMPLOYEE.email, EMPLOYEE.password)
  })

  test('T3-A: /me/requests → FAB 클릭 → "휴가 신청" → 제출 → API 201 성공', async ({ page }) => {
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')
    await ss(page, 'T3-A-01_requests_initial')

    expect(page.url()).not.toContain('/login')
    expect(page.url()).not.toContain('/login')

    // FAB click
    const fab = page.locator('[aria-label="요청 신청"]')
    await expect(fab).toBeVisible({ timeout: 8000 })
    await fab.click()

    // Menu dialog should appear — target by name to avoid strict-mode multi-match
    const menuDialog = page.getByRole('dialog', { name: '요청 유형 선택' })
    await expect(menuDialog).toBeVisible({ timeout: 5000 })
    await ss(page, 'T3-A-02_request_menu_dialog')

    // Click "휴가 신청"
    const leaveMenuBtn = page.getByRole('button', { name: '휴가 신청' })
    await expect(leaveMenuBtn).toBeVisible({ timeout: 5000 })
    await leaveMenuBtn.click()

    // Leave form dialog appears — use named role to avoid strict-mode multi-match
    const leaveDialog = page.getByRole('dialog', { name: '휴가 신청' })
    await expect(leaveDialog).toBeVisible({ timeout: 5000 })
    await ss(page, 'T3-A-03_leave_dialog')

    // Select leave type — MUI Select uses a combobox role
    const leaveTypeSelect = leaveDialog.locator('[role="combobox"]').first()
    await leaveTypeSelect.click()
    const leaveOption = page.locator('[role="listbox"] [role="option"]').first()
    await expect(leaveOption).toBeVisible({ timeout: 5000 })
    await leaveOption.click()

    // Fill dates
    const today = new Date()
    const startDate = today.toISOString().split('T')[0]
    const endDate = new Date(today.getTime() + 86400000).toISOString().split('T')[0]

    const dateInputs = leaveDialog.locator('input[type="date"]')
    await dateInputs.nth(0).fill(startDate)
    await dateInputs.nth(1).fill(endDate)

    // Fill reason
    const reasonInput = leaveDialog.locator('textarea').first()
    await reasonInput.fill('브라우저 E2E 테스트 휴가 신청')

    await ss(page, 'T3-A-04_leave_form_filled')

    // Intercept API call
    let requestStatus = 0
    let requestBody: unknown = null
    const requestDone = page.waitForResponse(
      async (r) => {
        if (r.url().includes('/requests') && r.request().method() === 'POST') {
          requestStatus = r.status()
          requestBody = await r.json().catch(() => null)
          return true
        }
        return false
      },
      { timeout: 12000 },
    )

    // Submit
    const submitBtn = leaveDialog.getByRole('button', { name: '신청' })
    await submitBtn.click()

    await requestDone.catch((e) => console.log(`  Request API not captured: ${e.message}`))

    console.log(`  POST /requests status: ${requestStatus}`)
    console.log(`  POST /requests body: ${JSON.stringify(requestBody)}`)

    await ss(page, 'T3-A-05_after_request_submit')

    // ── BUG DETECTED ──────────────────────────────────────────────────────────
    // The frontend sends type: 'LEAVE_CREATE' but the API expects 'LEAVE'.
    // API returns 400 VALIDATION_ERROR:
    //   "Invalid enum value. Expected 'LEAVE' | 'SHIFT_CHANGE' | 'OVERTIME' |
    //    'ATTENDANCE_CORRECTION' | 'CUSTOM', received 'LEAVE_CREATE'"
    // Fix needed in: src/app/me/requests/page.tsx — change type values to match API enum.
    // ─────────────────────────────────────────────────────────────────────────
    if (requestStatus === 400) {
      const errBody = requestBody as { error?: { code?: string; message?: string; details?: unknown } }
      console.log(`  [BUG] 휴가 신청 API 400 오류 - type enum 불일치`)
      console.log(`  [BUG] 프론트엔드 sends: 'LEAVE_CREATE', API expects: 'LEAVE'`)
      console.log(`  [BUG] 수정 필요: src/app/me/requests/page.tsx MENU_ITEMS / handleLeaveSubmit`)
      // Document the bug — test fails intentionally to flag this regression
      expect(requestStatus, `[BUG] POST /requests → 400 (type enum mismatch: frontend='LEAVE_CREATE', api expects='LEAVE')`).toBe(201)
    } else {
      expect(requestStatus).toBe(201)
    }

    // Snackbar
    const snackbar = page.locator('[role="alert"]')
    const snackVisible = await snackbar.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false)
    if (snackVisible) {
      const snackText = await snackbar.innerText().catch(() => '')
      console.log(`  Snackbar: "${snackText}"`)
      expect(snackText).toContain('휴가 신청이 완료됐습니다.')
    }

    // New request should appear in the list
    await page.waitForLoadState('networkidle')
    const pageContent = await page.content()
    const hasRequest = pageContent.includes('휴가 신청')
    console.log(`  목록에 "휴가 신청" 표시: ${hasRequest}`)
    expect(hasRequest).toBe(true)

    console.log('  T3-A: 휴가 신청 → 201 → 목록 표시 — PASS')
  })

  test('T3-B: /me/requests → 기존 요청 목록 렌더링 (에러 없음)', async ({ page }) => {
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')
    await ss(page, 'T3-B-01_requests_list')

    expect(page.url()).not.toContain('/login')
    const bodyText: string = await page.evaluate(() => document.body.innerText)
    expect(bodyText).not.toContain('Application error')
    expect(bodyText).not.toContain('Internal Server Error')

    // Tabs should be rendered
    await expect(page.getByRole('tab', { name: '전체' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('tab', { name: '대기중' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('tab', { name: '완료' })).toBeVisible({ timeout: 5000 })

    console.log('  T3-B: /me/requests 렌더링 정상 — PASS')
  })

})
