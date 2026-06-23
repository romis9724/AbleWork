/**
 * RBAC 브라우저 테스트 — 직원(employees) 화면
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-3 (액션 가시성), §2-4 (CRUD positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * 주요 data-testid 규약 (§3):
 *   employees-add-btn        직원 추가 버튼 (EMPLOYEE_CREATE = GENERAL_ADMIN)
 *   employees-search-input   검색 입력
 *   employees-inactive-toggle 퇴사포함 토글
 *   employees-row            직원 목록 행
 *   emp-detail-reset-pw-btn  비밀번호 재설정 버튼 (EMPLOYEE_RESET_PASSWORD = ORG_ADMIN)
 *   emp-detail-reset-device-btn 기기 초기화 버튼 (EMPLOYEE_RESET_DEVICE = GENERAL_ADMIN)
 *   emp-detail-wage-add-btn  근로정보 추가 버튼 (EMPLOYEE_WAGE_MANAGE = GENERAL_ADMIN)
 *   emp-detail-save-btn      기본정보 저장 버튼 (EMPLOYEE_MANAGE = ORG_ADMIN)
 *
 * 규약: data-testid가 앱에 없으면 → FAIL (앱 수정 필요). 텍스트 셀렉터로 우회하거나 assert 약화 금지.
 */

import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  ROLE_LEVEL,
  loginAs,
  login,
  jwtEmployeeId,
  BASE_URL,
  API_URL,
  assertActionVisible,
  expectForbidden,
} from '../helpers'
import { ACTION_KEYS } from '@ablework/shared-constants'

// 시드 직원 ID (seed.ts와 동기)
const SEED_EMP_ID = 'seed-emp-001'

// ─────────────────────────────────────────────────────────────────────────────
// A. 액션 버튼 가시성 (§2-3) — 3개 관리자 역할
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. 액션 버튼 가시성 — /admin/employees 목록', () => {
  const adminRoles = ['admin', 'genAdmin', 'orgAdmin'] as const

  for (const role of adminRoles) {
    test(`[${role}] employees-add-btn 가시성 (EMPLOYEE_CREATE=GENERAL_ADMIN)`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${BASE_URL}/admin/employees`)
      await page.waitForLoadState('networkidle')
      await assertActionVisible(
        page,
        'employees-add-btn',
        ROLE_LEVEL[role],
        ACTION_KEYS.EMPLOYEE_CREATE,
      )
    })
  }
})

test.describe('A. 액션 버튼 가시성 — /admin/employees/[id] 상세', () => {
  const adminRoles = ['admin', 'genAdmin', 'orgAdmin'] as const

  for (const role of adminRoles) {
    test(`[${role}] emp-detail-save-btn 가시성 (EMPLOYEE_MANAGE=ORG_ADMIN)`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${BASE_URL}/admin/employees/${SEED_EMP_ID}`)
      await page.waitForLoadState('networkidle')
      await assertActionVisible(
        page,
        'emp-detail-save-btn',
        ROLE_LEVEL[role],
        ACTION_KEYS.EMPLOYEE_MANAGE,
      )
    })

    test(`[${role}] emp-detail-reset-pw-btn 가시성 (EMPLOYEE_RESET_PASSWORD=ORG_ADMIN)`, async ({
      page,
    }) => {
      await loginAs(page, role)
      await page.goto(`${BASE_URL}/admin/employees/${SEED_EMP_ID}`)
      await page.waitForLoadState('networkidle')
      await assertActionVisible(
        page,
        'emp-detail-reset-pw-btn',
        ROLE_LEVEL[role],
        ACTION_KEYS.EMPLOYEE_RESET_PASSWORD,
      )
    })

    test(`[${role}] emp-detail-reset-device-btn 가시성 (EMPLOYEE_RESET_DEVICE=GENERAL_ADMIN)`, async ({
      page,
    }) => {
      await loginAs(page, role)
      await page.goto(`${BASE_URL}/admin/employees/${SEED_EMP_ID}`)
      await page.waitForLoadState('networkidle')
      // 기기 탭으로 이동 (tab=2)
      await page.getByRole('tab', { name: '기기' }).click()
      await page.waitForLoadState('networkidle')
      await assertActionVisible(
        page,
        'emp-detail-reset-device-btn',
        ROLE_LEVEL[role],
        ACTION_KEYS.EMPLOYEE_RESET_DEVICE,
      )
    })

    test(`[${role}] emp-detail-wage-add-btn 가시성 (EMPLOYEE_WAGE_MANAGE=GENERAL_ADMIN)`, async ({
      page,
    }) => {
      await loginAs(page, role)
      await page.goto(`${BASE_URL}/admin/employees/${SEED_EMP_ID}`)
      await page.waitForLoadState('networkidle')
      // 근로정보 탭으로 이동 (tab=1)
      await page.getByRole('tab', { name: '근로정보' }).click()
      await page.waitForLoadState('networkidle')
      await assertActionVisible(
        page,
        'emp-detail-wage-add-btn',
        ROLE_LEVEL[role],
        ACTION_KEYS.EMPLOYEE_WAGE_MANAGE,
      )
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// B. CRUD · 인터랙션 positive (§2-4) — genAdmin (GENERAL_ADMIN) 기준
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. CRUD positive — /admin/employees 목록 (genAdmin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/employees`)
    await page.waitForLoadState('networkidle')
  })

  test('검색 입력 동작 — employees-search-input', async ({ page }) => {
    const searchInput = page.locator('[data-testid="employees-search-input"]')
    await expect(searchInput, 'employees-search-input 가 보여야 함').toBeVisible()
    await searchInput.fill('테스트')
    // 디바운스 후 필터 적용 (debounce 300ms + 여유)
    await page.waitForTimeout(500)
    // 검색어 입력 후 입력칸에 값이 있는지 확인
    await expect(searchInput).toHaveValue('테스트')
    // 초기화
    await searchInput.clear()
  })

  test('퇴사포함 토글 동작 — employees-inactive-toggle', async ({ page }) => {
    const toggle = page.locator('[data-testid="employees-inactive-toggle"]')
    await expect(toggle, 'employees-inactive-toggle 가 보여야 함').toBeVisible()
    await toggle.click()
    await page.waitForLoadState('networkidle')
    // 재클릭해 원복
    await toggle.click()
  })

  test('직원 목록 행 렌더 — employees-row', async ({ page }) => {
    const firstRow = page.locator('[data-testid="employees-row"]').first()
    await expect(firstRow, 'employees-row 가 최소 1개 렌더돼야 함').toBeVisible()
  })

  test('직원 추가 버튼 존재 — employees-add-btn', async ({ page }) => {
    const addBtn = page.locator('[data-testid="employees-add-btn"]')
    await expect(addBtn, 'employees-add-btn 가 GENERAL_ADMIN 에게 보여야 함').toBeVisible()
  })

  test('직원 추가 모달 열림 및 생성', async ({ page }) => {
    const addBtn = page.locator('[data-testid="employees-add-btn"]')
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    // 모달/다이얼로그 열림 확인
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog, '직원 추가 모달이 열려야 함').toBeVisible({ timeout: 5000 })

    // 고유 이름으로 입력 (실데이터 생성 — 고유 식별자 사용)
    const uniqueName = `E2E_${Date.now()}`
    const uniqueEmail = `e2e_${Date.now()}@ablework.io`

    // 이름 입력 (data-testid 또는 label 기반)
    const nameInput = dialog.locator('[data-testid="emp-create-name"]')
    await expect(nameInput, 'emp-create-name 입력 필드가 보여야 함').toBeVisible()
    await nameInput.fill(uniqueName)

    // 이메일 입력
    const emailInput = dialog.locator('[data-testid="emp-create-email"]')
    await expect(emailInput, 'emp-create-email 입력 필드가 보여야 함').toBeVisible()
    await emailInput.fill(uniqueEmail)

    // 입사일
    const joinedAtInput = dialog.locator('[data-testid="emp-create-joined-at"]')
    await expect(joinedAtInput, 'emp-create-joined-at 입력 필드가 보여야 함').toBeVisible()
    await joinedAtInput.fill('2026-01-01')

    // ── 소속 조직 선택 (MUI Autocomplete multiple) ──────────────────────────────
    // label "소속 조직" 에 연결된 combobox input 을 찾아 "개발팀" 을 입력한 뒤 옵션 클릭
    const orgInput = dialog.getByLabel('소속 조직')
    await expect(orgInput, '소속 조직 Autocomplete 입력이 보여야 함').toBeVisible()
    await orgInput.click()
    await orgInput.fill('개발팀')
    // 드롭다운 리스트박스가 열리고 "개발팀" 옵션이 나타날 때까지 대기
    const orgOption = page.getByRole('option', { name: '개발팀' })
    await expect(orgOption, '"개발팀" 옵션이 드롭다운에 표시되어야 함').toBeVisible({ timeout: 5000 })
    await orgOption.click()

    // ── 본조직 선택 (MUI Select) ────────────────────────────────────────────────
    // organizationIds 에 개발팀이 들어가면 useEffect 가 primaryOrganizationId 를
    // 자동으로 organizationIds[0] 으로 설정한다.
    // MUI Select 의 trigger 는 [role="combobox"] 로 렌더된다.
    // 다이얼로그 안의 combobox 목록: [0]=소속조직Autocomplete, [1]=본조직Select, [2]=직무Autocomplete
    // 본조직 Select 의 combobox 를 직접 찾아 클릭한다.
    const primaryOrgCombobox = dialog.locator('[role="combobox"]').nth(1)
    await expect(primaryOrgCombobox, '본조직 Select 가 활성화되어야 함').toBeEnabled({ timeout: 5000 })
    // Select 를 열어 "개발팀" 옵션을 클릭해 명시적으로 선택
    await primaryOrgCombobox.click()
    const primaryOrgOption = page.getByRole('option', { name: '개발팀' })
    await expect(primaryOrgOption, '본조직 옵션 "개발팀" 이 보여야 함').toBeVisible({ timeout: 3000 })
    await primaryOrgOption.click()

    // 저장 버튼
    const saveBtn = dialog.locator('[data-testid="emp-create-submit-btn"]')
    await expect(saveBtn, 'emp-create-submit-btn 이 보여야 함').toBeVisible()
    await saveBtn.click()

    // 모달 닫힘 확인 (성공 시)
    await expect(dialog).toHaveCount(0, { timeout: 10000 })

    // API로 생성 반영 확인
    const tokens = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const resp = await page.request.get(`${API_URL}/employees`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    const items: Array<{ name: string }> = body?.data?.items ?? body?.items ?? []
    const found = items.some((emp) => emp.name === uniqueName)
    expect(found, `생성한 직원(${uniqueName})이 API 응답에 있어야 함`).toBe(true)
  })
})

test.describe('B. CRUD positive — /admin/employees/[id] 상세 (orgAdmin)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/employees/${SEED_EMP_ID}`)
    await page.waitForLoadState('networkidle')
  })

  test('탭 전환 — 기본정보/근로정보/기기', async ({ page }) => {
    // 기본정보 탭 (기본)
    await expect(page.getByRole('tab', { name: '기본정보' })).toBeVisible()

    // 근로정보 탭 클릭
    await page.getByRole('tab', { name: '근로정보' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('tab', { name: '근로정보' })).toHaveAttribute('aria-selected', 'true')

    // 기기 탭 클릭
    await page.getByRole('tab', { name: '기기' }).click()
    await page.waitForTimeout(300)
    await expect(page.getByRole('tab', { name: '기기' })).toHaveAttribute('aria-selected', 'true')
  })

  test('저장 버튼 존재 — emp-detail-save-btn (ORG_ADMIN 이상)', async ({ page }) => {
    const saveBtn = page.locator('[data-testid="emp-detail-save-btn"]')
    await expect(saveBtn, 'emp-detail-save-btn 가 ORG_ADMIN 에게 보여야 함').toBeVisible()
  })

  test('비밀번호 재설정 버튼 존재 — emp-detail-reset-pw-btn (ORG_ADMIN 이상)', async ({
    page,
  }) => {
    const resetPwBtn = page.locator('[data-testid="emp-detail-reset-pw-btn"]')
    await expect(
      resetPwBtn,
      'emp-detail-reset-pw-btn 가 ORG_ADMIN 에게 보여야 함',
    ).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. negative (§2-5) — 권한 밖 역할이 API를 직접 호출할 때 차단 확인
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. negative — ORG_ADMIN은 직원 생성 API에서 403 차단', () => {
  test('POST /employees → 403 (ORG_ADMIN, EMPLOYEE_CREATE=GENERAL_ADMIN)', async ({ page }) => {
    const tokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, tokens.accessToken, 'post', '/employees', {
      name: 'E2E_Block_Test',
      email: `e2e_block_${Date.now()}@ablework.io`,
      joinedAt: '2026-01-01',
      employmentType: 'regular',
      accessLevel: 'EMPLOYEE',
    })
  })
})

test.describe('C. negative — EMPLOYEE는 직원 목록 조회 API에서 403/401 차단', () => {
  test('GET /employees → 403 (EMPLOYEE 역할)', async ({ page }) => {
    const tokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, tokens.accessToken, 'get', '/employees')
  })
})

test.describe('C. negative — ORG_ADMIN은 기기 초기화 API에서 403 차단', () => {
  // API 실제 메서드: POST /employees/:id/reset-device (controller.ts 151)
  test(`POST /employees/${SEED_EMP_ID}/reset-device → 403 (EMPLOYEE_RESET_DEVICE=GENERAL_ADMIN)`, async ({
    page,
  }) => {
    const tokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(
      page,
      tokens.accessToken,
      'post',
      `/employees/${SEED_EMP_ID}/reset-device`,
      {},
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. negative — EMPLOYEE 수평 PII/임금 노출 차단 (백엔드 보안 수정 회귀)
// 동료 조회/임금 차단, 본인 조회는 허용돼야 함
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. negative — EMPLOYEE는 본인 상세 조회 허용 / 동료 상세 차단', () => {
  test('GET /employees/{본인id} → 200 (본인은 허용)', async ({ page }) => {
    const empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    const empId = jwtEmployeeId(empTokens.accessToken)
    const resp = await page.request.get(`${API_URL}/employees/${empId}`, {
      headers: { Authorization: `Bearer ${empTokens.accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.status(), `GET /employees/${empId} (본인) 은 200이어야 함`).toBe(200)
  })

  test('GET /employees/{동료id} → 403 (EMPLOYEE는 동료 PII 차단)', async ({ page }) => {
    // admin과 employee는 같은 개발팀 — admin의 employeeId를 동적으로 도출해 동료로 사용
    const adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const colleagueId = jwtEmployeeId(adminTokens.accessToken)

    const empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, empTokens.accessToken, 'get', `/employees/${colleagueId}`)
  })
})

test.describe('C. negative — EMPLOYEE는 동료 임금 정보 조회 차단', () => {
  test('GET /employees/{동료id}/wage-info → 403 (EMPLOYEE는 동료 임금 차단)', async ({ page }) => {
    // admin의 employeeId를 동적으로 도출해 동료로 사용
    const adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const colleagueId = jwtEmployeeId(adminTokens.accessToken)

    const empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, empTokens.accessToken, 'get', `/employees/${colleagueId}/wage-info`)
  })
})
