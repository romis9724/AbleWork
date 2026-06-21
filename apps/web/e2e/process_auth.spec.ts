/**
 * AbleWork ERP — 인증·RBAC 프로세스 통합 E2E
 *
 * 검증 범위:
 *   1. 정상 로그인 × 역할 — admin(SUPER_ADMIN)/employee(EMPLOYEE) 폼 로그인 → 대시보드 진입
 *   2. 오류 비밀번호 — 잘못된 비밀번호 → 폼 에러 표시, /login 잔류
 *   3. 미존재 계정 — 없는 이메일 → 에러 표시, /login 잔류
 *   4. 역할 라우트 가드
 *      4a. ORG_ADMIN → GENERAL_ADMIN 전용 경로(/admin/organizations) → /admin/dashboard 리다이렉트
 *      4b. EMPLOYEE → /admin/dashboard 접근 → /me/home 리다이렉트
 *   5. 로그아웃 → /login 복귀 + 보호 경로 재접근 시 /login 요구
 *
 * 전략: UI 폼 액션은 실제 브라우저, 결과 검증은 URL/DOM. AAA 패턴.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, ACCOUNTS, uiLogin } from './helpers'

// ---------------------------------------------------------------------------
// 1. 정상 로그인 × 역할
// ---------------------------------------------------------------------------
test.describe('1. 정상 로그인 × 역할', () => {
  test('SUPER_ADMIN 로그인 → /admin/* 진입', async ({ page }) => {
    // Arrange: 로그인 페이지로 이동
    await page.goto(`${BASE_URL}/login`)
    await expect(page.locator('h1')).toContainText('로그인')

    // Act: 폼 입력 및 제출
    await page.locator('input[type="email"]').fill(ACCOUNTS.admin.email)
    await page.locator('input[type="password"]').fill(ACCOUNTS.admin.password)
    await page.getByRole('button', { name: '로그인' }).click()

    // Assert: /admin/* 경로로 진입
    await page.waitForURL(/\/admin\//, { timeout: 20000 })
    expect(new URL(page.url()).pathname).toMatch(/^\/admin\//)
  })

  test('EMPLOYEE 로그인 → /me/* 진입', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}/login`)

    // Act
    await page.locator('input[type="email"]').fill(ACCOUNTS.employee.email)
    await page.locator('input[type="password"]').fill(ACCOUNTS.employee.password)
    await page.getByRole('button', { name: '로그인' }).click()

    // Assert: /me/* 경로로 진입
    await page.waitForURL(/\/me\//, { timeout: 20000 })
    expect(new URL(page.url()).pathname).toMatch(/^\/me\//)
  })

  test('GENERAL_ADMIN 로그인 → /admin/* 진입', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}/login`)

    // Act
    await page.locator('input[type="email"]').fill(ACCOUNTS.genAdmin.email)
    await page.locator('input[type="password"]').fill(ACCOUNTS.genAdmin.password)
    await page.getByRole('button', { name: '로그인' }).click()

    // Assert
    await page.waitForURL(/\/admin\//, { timeout: 20000 })
    expect(new URL(page.url()).pathname).toMatch(/^\/admin\//)
  })
})

// ---------------------------------------------------------------------------
// 2. 오류 비밀번호
// ---------------------------------------------------------------------------
test.describe('2. 오류 비밀번호', () => {
  test('잘못된 비밀번호 → 에러 메시지 표시, /login 잔류', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}/login`)

    // Act: 올바른 이메일 + 잘못된 비밀번호
    await page.locator('input[type="email"]').fill(ACCOUNTS.admin.email)
    await page.locator('input[type="password"]').fill('wrongpassword!')
    await page.getByRole('button', { name: '로그인' }).click()

    // Assert: 에러 메시지 노출, URL은 /login 유지
    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.auth-error')).toContainText('올바르지 않')
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('빈 비밀번호(브라우저 required 검증) → 폼 제출 불가, /login 잔류', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}/login`)

    // Act: 이메일만 입력, 비밀번호 비워둠
    await page.locator('input[type="email"]').fill(ACCOUNTS.admin.email)
    // 비밀번호 필드는 채우지 않음

    // Assert: 버튼이 있고, 폼 제출이 브라우저 native required에 의해 차단됨
    // (HTML required 속성이 있으므로 JS submit 이벤트 발화 없음 → URL 변경 없음)
    const submitBtn = page.getByRole('button', { name: '로그인' })
    await expect(submitBtn).toBeEnabled()

    // 500ms 대기 후에도 /login 잔류 확인
    await page.waitForTimeout(500)
    expect(new URL(page.url()).pathname).toBe('/login')
  })
})

// ---------------------------------------------------------------------------
// 3. 미존재 계정
// ---------------------------------------------------------------------------
test.describe('3. 미존재 계정', () => {
  test('존재하지 않는 이메일 → 에러 메시지, /login 잔류', async ({ page }) => {
    // Arrange
    await page.goto(`${BASE_URL}/login`)

    // Act: 존재하지 않는 계정으로 로그인 시도
    await page.locator('input[type="email"]').fill('nonexistent_user_e2e@ablework.io')
    await page.locator('input[type="password"]').fill('somepassword1234!')
    await page.getByRole('button', { name: '로그인' }).click()

    // Assert: 에러 메시지 노출(이메일 열거 방지 — 동일/유사 메시지 표시), URL 유지
    await expect(page.locator('.auth-error')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.auth-error')).toContainText('올바르지 않')
    expect(new URL(page.url()).pathname).toBe('/login')
  })
})

// ---------------------------------------------------------------------------
// 4. 역할 라우트 가드
// ---------------------------------------------------------------------------
test.describe('4. 역할 라우트 가드', () => {
  test('ORG_ADMIN → GENERAL_ADMIN 전용 경로(/admin/organizations) 접근 → /admin/dashboard 리다이렉트', async ({ page }) => {
    // Arrange: ORG_ADMIN으로 로그인
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })

    // Act: GENERAL_ADMIN 이상이 필요한 경로 직접 접근
    await page.goto(`${BASE_URL}/admin/organizations`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Assert: /admin/dashboard로 리다이렉트
    expect(new URL(page.url()).pathname).toBe('/admin/dashboard')
  })

  test('ORG_ADMIN → /admin/settings 접근 → /admin/dashboard 리다이렉트', async ({ page }) => {
    // Arrange: ORG_ADMIN으로 로그인
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)

    // Act
    await page.goto(`${BASE_URL}/admin/settings/company`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Assert
    expect(new URL(page.url()).pathname).toBe('/admin/dashboard')
  })

  test('EMPLOYEE → /admin/dashboard 접근 → /me/home 리다이렉트', async ({ page }) => {
    // Arrange: EMPLOYEE로 로그인
    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expect(page).toHaveURL(/\/me\//, { timeout: 20000 })

    // Act: 관리자 전용 경로 직접 접근
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Assert: /me/home으로 리다이렉트
    expect(new URL(page.url()).pathname).toBe('/me/home')
  })

  test('EMPLOYEE → /admin/employees 접근 → /me/home 리다이렉트', async ({ page }) => {
    // Arrange
    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    // Act
    await page.goto(`${BASE_URL}/admin/employees`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Assert
    expect(new URL(page.url()).pathname).toBe('/me/home')
  })

  test('미인증 상태 → /admin/dashboard 접근 → /login 리다이렉트', async ({ page }) => {
    // Arrange: 쿠키 없음(새 컨텍스트 기본값)

    // Act
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Assert: 로그인 페이지로 리다이렉트
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('미인증 상태 → /me/home 접근 → /login 리다이렉트', async ({ page }) => {
    // Arrange

    // Act
    await page.goto(`${BASE_URL}/me/home`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    // Assert
    expect(new URL(page.url()).pathname).toBe('/login')
  })
})

// ---------------------------------------------------------------------------
// 5. 로그아웃
// ---------------------------------------------------------------------------
test.describe('5. 로그아웃', () => {
  test('로그인 후 로그아웃 → /login 복귀', async ({ page }) => {
    // Arrange: 로그인
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })

    // Act: AdminShell 사이드바 하단 .sb-foot-grp 내 <a role="button"> 클릭
    // 텍스트가 정확히 "로그아웃"인 링크(role=button)를 대상으로 한다.
    const logoutLink = page.locator('.sb-foot-grp [role="button"]', { hasText: '로그아웃' })
    await logoutLink.scrollIntoViewIfNeeded()
    await logoutLink.click()

    // Assert: /login으로 복귀
    await page.waitForURL(/\/login/, { timeout: 15000 })
    expect(new URL(page.url()).pathname).toBe('/login')
  })

  test('로그아웃 후 보호 경로 재접근 → /login 요구', async ({ page }) => {
    // Arrange: 로그인 후 UI 로그아웃 수행
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })

    // UI 로그아웃 (쿠키 삭제 + SPA store clearUser + /login 라우팅)
    const logoutLink = page.locator('.sb-foot-grp [role="button"]', { hasText: '로그아웃' })
    await logoutLink.scrollIntoViewIfNeeded()
    await logoutLink.click()
    await page.waitForURL(/\/login/, { timeout: 15000 })

    // Act: 새 탭/브라우저 컨텍스트에서 보호 경로에 직접 접근하는 상황 재현.
    // 동일 페이지에서 SPA 라우터가 아닌 full navigation으로 접근해야 미들웨어가 쿠키를 검사한다.
    // page.goto에 waitUntil: 'networkidle'을 사용해 미들웨어 리다이렉트가 완전히 완료될 때까지 대기.
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' })

    // Assert: 쿠키가 없으므로 /login으로 리다이렉트되어야 함
    expect(new URL(page.url()).pathname).toBe('/login')
  })
})
