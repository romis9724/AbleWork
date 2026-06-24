/**
 * RBAC 브라우저 테스트 — 요청(requests) 화면
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-4 (positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * requests.controller.ts 엔드포인트별 @Roles 레벨:
 *   GET  /requests              — 인증만 (EMPLOYEE는 본인만, ORG_ADMIN+ 는 allEmployees 허용)
 *   POST /requests              — 인증만 (직원 요청 생성)
 *   GET  /requests/approval-rules — @Roles(ORG_ADMIN) — EMPLOYEE 403
 *   POST /requests/approval-rules — @Roles(SUPER_ADMIN)
 *   PATCH /requests/approval-rules/:id — @Roles(SUPER_ADMIN)
 *   DELETE /requests/approval-rules/:id — @Roles(SUPER_ADMIN)
 *   POST /requests/:id/approve  — 인증만 (결재선 검증은 service)
 *   POST /requests/:id/reject   — 인증만
 *   POST /requests/:id/force-approve — @Roles(SUPER_ADMIN)
 *   POST /requests/:id/force-reject  — @Roles(SUPER_ADMIN)
 *   POST /requests/:id/cancel   — 인증만 (본인 PENDING만)
 *   POST /requests/bulk-approve — 인증만
 *
 * 매트릭스 2-3: REQUEST_FORCE = SUPER_ADMIN
 *
 * data-testid 규약 (§3) — 이 spec에서 기대하는 testid 목록:
 *   req-status-tab-전체       상태 탭 — 전체
 *   req-status-tab-승인필요   상태 탭 — 승인필요
 *   req-status-tab-완료       상태 탭 — 완료
 *   req-status-tab-거절됨     상태 탭 — 거절됨
 *   req-filter-all            필터 칩 — 모든 직원 요청 토글
 *   req-filter-myturn         필터 칩 — 내 승인 차례 토글
 *   req-row                   테이블 행 (복수)
 *   req-approve-btn           인라인 승인 버튼 (PENDING 행)
 *   req-reject-btn            인라인 거절 버튼 (PENDING 행)
 *   req-bulk-approve-btn      일괄 승인 버튼 (.tbl-bar 내)
 *   req-force-approve-btn     상세 모달 내 강제 승인 버튼 (SUPER_ADMIN 전용)
 *   req-force-reject-btn      상세 모달 내 강제 거절 버튼 (SUPER_ADMIN 전용)
 *
 * 규약: testid가 앱에 없으면 FAIL (앱 수정 필요). 텍스트 셀렉터로 핵심 인터랙션 우회 금지.
 */

import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  ROLE_LEVEL,
  loginAs,
  login,
  BASE_URL,
  API_URL,
  expectForbidden,
  jwtEmployeeId,
} from '../helpers'

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: API로 요청 생성 (employee 토큰)
// ─────────────────────────────────────────────────────────────────────────────

async function createRequest(
  page: Parameters<typeof login>[0],
  token: string,
  type = 'OFFSITE_WORK',
  payload: Record<string, unknown> = {},
): Promise<string> {
  const defaultPayload: Record<string, unknown> = {
    reason: `E2E_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
  }
  const resp = await page.request.post(`${API_URL}/requests`, {
    data: { type, payload: { ...defaultPayload, ...payload } },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  expect(resp.ok(), `POST /requests 실패: ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  const id = (body?.data ?? body).id as string
  expect(id, 'request id 없음').toBeTruthy()
  return id
}

async function getRequestStatus(
  page: Parameters<typeof login>[0],
  token: string,
  id: string,
): Promise<string> {
  const resp = await page.request.get(`${API_URL}/requests?scope=mine&limit=100`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  const body = await resp.json()
  const data = body?.data ?? []
  const items: Array<{ id: string; status: string }> = Array.isArray(data) ? data : data.items ?? []
  return items.find((r) => r.id === id)?.status ?? 'UNKNOWN'
}

// ─────────────────────────────────────────────────────────────────────────────
// A. positive — genAdmin으로 /admin/requests 목록 화면 탐색
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. positive — genAdmin /admin/requests 목록 탐색', () => {
  test('목록 화면 렌더: 탭·테이블 또는 빈 상태 존재', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // 페이지 제목 또는 탭 영역 존재
    const hasTabs = await page.locator('.tabs').count()
    const hasContent = await page.locator('table, .ab-loading, .tbl-empty').count()
    expect(hasTabs + hasContent, '/admin/requests 화면에 콘텐츠 없음').toBeGreaterThan(0)
  })

  test('상태 탭 전체 존재: req-status-tab-* testid 기대', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // 기대 testid — 앱에 없으면 FAIL (수정 에이전트 대상)
    await expect(
      page.locator('[data-testid="req-status-tab-전체"]'),
      'req-status-tab-전체 없음 — 앱 수정 필요',
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="req-status-tab-승인필요"]'),
      'req-status-tab-승인필요 없음 — 앱 수정 필요',
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="req-status-tab-완료"]'),
      'req-status-tab-완료 없음 — 앱 수정 필요',
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="req-status-tab-거절됨"]'),
      'req-status-tab-거절됨 없음 — 앱 수정 필요',
    ).toBeVisible()
  })

  test('상태 탭 전환: 전체→승인필요 클릭 시 해당 탭 active(.on)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    await expect(tabPending, 'req-status-tab-승인필요 없음 — 앱 수정 필요').toBeVisible()
    await tabPending.click()

    // 클릭 후 active 클래스(.on) 또는 aria-selected 확인
    const hasOn = await tabPending.evaluate((el) => el.classList.contains('on'))
    const hasAria = await tabPending.getAttribute('aria-selected')
    expect(
      hasOn || hasAria === 'true',
      '승인필요 탭 클릭 후 active 상태 미반영 — .on 클래스 또는 aria-selected="true" 필요',
    ).toBeTruthy()
  })

  test('상태 탭 전환: 완료 탭 클릭', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    const tabDone = page.locator('[data-testid="req-status-tab-완료"]')
    await expect(tabDone, 'req-status-tab-완료 없음 — 앱 수정 필요').toBeVisible()
    await tabDone.click()

    const hasOn = await tabDone.evaluate((el) => el.classList.contains('on'))
    const hasAria = await tabDone.getAttribute('aria-selected')
    expect(hasOn || hasAria === 'true', '완료 탭 클릭 후 active 미반영').toBeTruthy()
  })

  test('상태 탭 전환: 거절됨 탭 클릭', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    const tabRejected = page.locator('[data-testid="req-status-tab-거절됨"]')
    await expect(tabRejected, 'req-status-tab-거절됨 없음 — 앱 수정 필요').toBeVisible()
    await tabRejected.click()

    const hasOn = await tabRejected.evaluate((el) => el.classList.contains('on'))
    const hasAria = await tabRejected.getAttribute('aria-selected')
    expect(hasOn || hasAria === 'true', '거절됨 탭 클릭 후 active 미반영').toBeTruthy()
  })

  test('필터 칩: req-filter-all testid 존재 및 클릭 시 active 스타일 변화', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    const chip = page.locator('[data-testid="req-filter-all"]')
    await expect(chip, 'req-filter-all 없음 — 앱 수정 필요').toBeVisible()

    // 초기 상태 색상 / 스타일 (비활성)
    const styleBefore = await chip.getAttribute('style')

    // 클릭
    await chip.click()

    // 활성 스타일 변화 확인 (오렌지 테두리 또는 색상)
    const styleAfter = await chip.getAttribute('style')
    expect(
      styleAfter !== styleBefore || styleAfter?.includes('--ab-orange'),
      'req-filter-all 클릭 후 활성 스타일 미변경',
    ).toBeTruthy()
  })

  test('필터 칩: req-filter-myturn testid 존재 및 클릭 시 active 스타일 변화', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    const chip = page.locator('[data-testid="req-filter-myturn"]')
    await expect(chip, 'req-filter-myturn 없음 — 앱 수정 필요').toBeVisible()

    const styleBefore = await chip.getAttribute('style')
    await chip.click()
    const styleAfter = await chip.getAttribute('style')
    expect(
      styleAfter !== styleBefore || styleAfter?.includes('--ab-orange'),
      'req-filter-myturn 클릭 후 활성 스타일 미변경',
    ).toBeTruthy()
  })

  test('PENDING 요청 존재 시 req-row testid 및 인라인 버튼 확인', async ({ page }) => {
    // API로 PENDING 요청 셋업 (employee 계정으로 생성)
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — 기본값은 본인만 표시, employee가 만든 요청 보이게 함
    const filterAll = page.locator('[data-testid="req-filter-all"]')
    if (await filterAll.count()) {
      await filterAll.click()
      await page.waitForLoadState('networkidle')
    }

    // 승인필요 탭으로 전환해 PENDING 행만 표시
    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    // req-row testid 기대
    const rows = page.locator('[data-testid="req-row"]')
    await expect(rows.first(), 'req-row 없음 — 앱 수정 필요').toBeVisible({ timeout: 10000 })

    // 인라인 승인/거절 버튼 testid 기대
    await expect(
      page.locator('[data-testid="req-approve-btn"]').first(),
      'req-approve-btn 없음 — 앱 수정 필요',
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="req-reject-btn"]').first(),
      'req-reject-btn 없음 — 앱 수정 필요',
    ).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A2. positive — 일괄 승인 및 강제 승인/거절 흐름 (결정적 경로)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A2. positive — 강제 승인/거절 (admin/SUPER_ADMIN) — 결정적 경로', () => {
  test('admin: API 강제 승인 → request.status APPROVED (forceApprove는 request에 APPROVED 기록)', async ({
    page,
  }) => {
    // 서비스 구현: request.status='APPROVED', requestApproval.status='FORCE_APPROVED'
    // (FORCE_APPROVED 는 requestApproval 레코드에만 기록됨)
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const reqId = await createRequest(page, empToken)

    const { accessToken: adminToken } = await login(
      page,
      ACCOUNTS.admin.email,
      ACCOUNTS.admin.password,
    )

    const resp = await page.request.post(`${API_URL}/requests/${reqId}/force-approve`, {
      data: { comment: 'E2E force approve' },
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.ok(), `force-approve 실패: ${resp.status()}`).toBeTruthy()
    const body = await resp.json()
    const status = (body?.data ?? body).status as string
    // request 레코드 자체는 APPROVED (requestApproval에 FORCE_APPROVED 별도 기록)
    expect(status, '강제 승인 후 request.status').toBe('APPROVED')
    // GET 재조회로 영속성 검증 (응답값뿐 아니라 저장 상태 확인)
    expect(await getRequestStatus(page, empToken, reqId), '재조회 시 APPROVED 유지').toBe('APPROVED')
  })

  test('admin: API 강제 거절 → request.status REJECTED (forceReject는 request에 REJECTED 기록)', async ({
    page,
  }) => {
    // 서비스 구현: request.status='REJECTED', requestApproval.status='FORCE_REJECTED'
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const reqId = await createRequest(page, empToken)

    const { accessToken: adminToken } = await login(
      page,
      ACCOUNTS.admin.email,
      ACCOUNTS.admin.password,
    )

    const resp = await page.request.post(`${API_URL}/requests/${reqId}/force-reject`, {
      data: { comment: 'E2E force reject' },
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.ok(), `force-reject 실패: ${resp.status()}`).toBeTruthy()
    const body = await resp.json()
    const status = (body?.data ?? body).status as string
    // request 레코드 자체는 REJECTED
    expect(status, '강제 거절 후 request.status').toBe('REJECTED')
    // GET 재조회로 영속성 검증
    expect(await getRequestStatus(page, empToken, reqId), '재조회 시 REJECTED 유지').toBe('REJECTED')
  })

  test('일괄 승인 바: PENDING 요청 체크박스 선택 → req-bulk-approve-btn 노출', async ({ page }) => {
    // API로 PENDING 요청 셋업
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — employee가 만든 요청 보이게 함
    const filterAll2 = page.locator('[data-testid="req-filter-all"]')
    if (await filterAll2.count()) {
      await filterAll2.click()
      await page.waitForLoadState('networkidle')
    }

    // 승인필요 탭으로 이동
    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    // PENDING 행의 체크박스 클릭 (첫 번째) — 셋업이 성공했으면 반드시 존재해야 함
    const checkboxes = page.locator('table tbody input[type="checkbox"].ck')
    await expect(checkboxes.first(), 'PENDING 체크박스 없음 — allEmployees 필터 또는 셋업 문제').toBeVisible({ timeout: 10000 })
    await checkboxes.first().check()

    // req-bulk-approve-btn testid 기대
    await expect(
      page.locator('[data-testid="req-bulk-approve-btn"]'),
      'req-bulk-approve-btn 없음 — 앱 수정 필요',
    ).toBeVisible({ timeout: 5000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. negative — API 403 차단 (expectForbidden)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. negative — force-approve/reject: 비SUPER_ADMIN 403', () => {
  const DUMMY_ID = '00000000-0000-0000-0000-000000000001'

  test('genAdmin: force-approve → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await expectForbidden(page, accessToken, 'post', `/requests/${DUMMY_ID}/force-approve`)
  })

  test('orgAdmin: force-approve → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', `/requests/${DUMMY_ID}/force-approve`)
  })

  test('employee: force-approve → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', `/requests/${DUMMY_ID}/force-approve`)
  })

  test('genAdmin: force-reject → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await expectForbidden(page, accessToken, 'post', `/requests/${DUMMY_ID}/force-reject`)
  })

  test('orgAdmin: force-reject → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', `/requests/${DUMMY_ID}/force-reject`)
  })

  test('employee: force-reject → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', `/requests/${DUMMY_ID}/force-reject`)
  })
})

test.describe('B. negative — approval-rules CUD: SUPER_ADMIN 전용 → 비SUPER_ADMIN 403', () => {
  const DUMMY_ID = '00000000-0000-0000-0000-000000000001'
  const RULE_PAYLOAD = {
    name: `E2E_FORBIDDEN_${Date.now()}`,
    requestType: 'OFFSITE_WORK',
    maxApprovalRounds: 1,
    details: [],
  }

  test('genAdmin: POST /approval-rules → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/requests/approval-rules', RULE_PAYLOAD)
  })

  test('orgAdmin: POST /approval-rules → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/requests/approval-rules', RULE_PAYLOAD)
  })

  test('genAdmin: PATCH /approval-rules/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await expectForbidden(page, accessToken, 'patch', `/requests/approval-rules/${DUMMY_ID}`, {
      name: 'FORBIDDEN_UPDATE',
    })
  })

  test('genAdmin: DELETE /approval-rules/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/requests/approval-rules/${DUMMY_ID}`)
  })
})

test.describe('B. negative — GET /approval-rules: EMPLOYEE → 403 (ORG_ADMIN 전용)', () => {
  test('employee: GET /approval-rules → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'get', '/requests/approval-rules')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B2. negative — 멀티테넌시: EMPLOYEE의 allEmployees=true → 본인 요청만 반환 (타인 노출 없음)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B2. negative — 멀티테넌시: employee allEmployees=true 본인 스코핑', () => {
  test('employee: GET /requests?allEmployees=true → 200이지만 전부 본인(requesterId) 요청', async ({
    page,
  }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    const empId = jwtEmployeeId(accessToken)

    const resp = await page.request.get(`${API_URL}/requests?allEmployees=true&limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    // 403이 아닌 200
    expect(resp.status(), 'employee allEmployees=true 는 200이어야 함 (403 아님)').toBe(200)

    const body = await resp.json()
    const data = body?.data ?? []
    const items: Array<{ id: string; requesterId: string }> = Array.isArray(data)
      ? data
      : data.items ?? []

    // 반환된 요청이 있다면 전부 본인 requesterId
    for (const item of items) {
      expect(
        item.requesterId,
        `타인(requesterId=${item.requesterId}) 요청이 employee 응답에 포함됨 — 멀티테넌시 위반`,
      ).toBe(empId)
    }
  })

  test('employee: GET /requests?allEmployees=true → 403이 아님을 명시적 확인', async ({
    page,
  }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    const resp = await page.request.get(`${API_URL}/requests?allEmployees=true`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    // 서비스가 조용히 무시하므로 200
    expect(resp.status()).not.toBe(403)
    expect(resp.status()).not.toBe(401)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. UI 게이팅 관찰 — 강제 승인/거절 버튼 (REQUEST_FORCE = SUPER_ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. UI 게이팅 — 강제 버튼 (req-force-approve-btn, req-force-reject-btn)', () => {
  /**
   * PENDING 요청 행 클릭 → 상세 모달(.modal) 열기
   * 모달 내에서 강제 버튼 testid 확인
   */

  test('admin(SUPER_ADMIN): 모달에서 req-force-approve-btn, req-force-reject-btn 노출', async ({
    page,
  }) => {
    // PENDING 요청 셋업
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — employee가 만든 요청 보이게 함
    const filterAllA = page.locator('[data-testid="req-filter-all"]')
    if (await filterAllA.count()) {
      await filterAllA.click()
      await page.waitForLoadState('networkidle')
    }

    // 승인필요 탭
    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    // 첫 번째 PENDING 행 클릭 — role=button 속성 사용
    const firstRow = page.locator('table tbody tr[role="button"]').first()
    await expect(firstRow, '클릭 가능한 tr[role="button"] 없음').toBeVisible({ timeout: 10000 })
    await firstRow.click()

    // 모달 열림
    await expect(page.locator('.modal'), '상세 모달(.modal) 없음').toBeVisible({ timeout: 8000 })

    // 강제 버튼 testid 기대 (SUPER_ADMIN 전용)
    await expect(
      page.locator('[data-testid="req-force-approve-btn"]'),
      'req-force-approve-btn 없음 — 앱 수정 필요',
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="req-force-reject-btn"]'),
      'req-force-reject-btn 없음 — 앱 수정 필요',
    ).toBeVisible()
  })

  test('genAdmin: 모달에서 req-force-approve-btn, req-force-reject-btn 숨겨져야 함', async ({
    page,
  }) => {
    // PENDING 요청 셋업
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — employee가 만든 요청 보이게 함
    const filterAllG = page.locator('[data-testid="req-filter-all"]')
    if (await filterAllG.count()) {
      await filterAllG.click()
      await page.waitForLoadState('networkidle')
    }

    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    const firstRow = page.locator('table tbody tr[role="button"]').first()
    await expect(firstRow, 'PENDING 행 없음 — genAdmin allEmployees 필터 또는 셋업 문제').toBeVisible({ timeout: 10000 })
    await firstRow.click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    // 강제 버튼 숨김 확인 (genAdmin은 SUPER_ADMIN 아님)
    await expect(
      page.locator('[data-testid="req-force-approve-btn"]'),
      '[방어심층 갭] req-force-approve-btn 이 genAdmin에게 노출됨. REQUEST_FORCE=SUPER_ADMIN. 앱 수정 필요',
    ).toHaveCount(0)
    await expect(
      page.locator('[data-testid="req-force-reject-btn"]'),
      '[방어심층 갭] req-force-reject-btn 이 genAdmin에게 노출됨. 앱 수정 필요',
    ).toHaveCount(0)
  })

  test('orgAdmin: 모달에서 req-force-approve-btn, req-force-reject-btn 숨겨져야 함', async ({
    page,
  }) => {
    // PENDING 요청 셋업
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — employee가 만든 요청 보이게 함
    const filterAllO = page.locator('[data-testid="req-filter-all"]')
    if (await filterAllO.count()) {
      await filterAllO.click()
      await page.waitForLoadState('networkidle')
    }

    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    const firstRow = page.locator('table tbody tr[role="button"]').first()
    await expect(firstRow, 'PENDING 행 없음 — orgAdmin allEmployees 필터 또는 셋업 문제').toBeVisible({ timeout: 10000 })
    await firstRow.click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    await expect(
      page.locator('[data-testid="req-force-approve-btn"]'),
      '[방어심층 갭] req-force-approve-btn 이 orgAdmin에게 노출됨. 앱 수정 필요',
    ).toHaveCount(0)
    await expect(
      page.locator('[data-testid="req-force-reject-btn"]'),
      '[방어심층 갭] req-force-reject-btn 이 orgAdmin에게 노출됨. 앱 수정 필요',
    ).toHaveCount(0)
  })

  test('admin: 모달에서 일반 승인/거절 버튼(btn-approve/btn-reject)도 노출됨', async ({ page }) => {
    // PENDING 요청 셋업
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — employee가 만든 요청 보이게 함
    const filterAllAM = page.locator('[data-testid="req-filter-all"]')
    if (await filterAllAM.count()) {
      await filterAllAM.click()
      await page.waitForLoadState('networkidle')
    }

    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    const firstRow = page.locator('table tbody tr[role="button"]').first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })
    await firstRow.click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    // 일반 승인/거절 버튼도 함께 있는지 (testid 기준)
    const approveBtn = page.locator('[data-testid="req-modal-approve-btn"]')
    const rejectBtn = page.locator('[data-testid="req-modal-reject-btn"]')
    await expect(approveBtn, '모달 내 req-modal-approve-btn 없음 — 앱 수정 필요').toBeVisible()
    await expect(rejectBtn, '모달 내 req-modal-reject-btn 없음 — 앱 수정 필요').toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C2. UI 게이팅 — 일반 승인/거절 버튼은 genAdmin/orgAdmin에도 노출돼야 함
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C2. UI 게이팅 — 일반 승인/거절 (genAdmin, orgAdmin 에게 노출)', () => {
  test('genAdmin: 모달 내 일반 승인/거절 버튼 노출 (req-approve-btn 기대)', async ({ page }) => {
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    await createRequest(page, empToken)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/requests`)
    await page.waitForLoadState('networkidle')

    // "모든 직원 요청" 필터 활성화 — employee가 만든 요청 보이게 함
    const filterAllC2 = page.locator('[data-testid="req-filter-all"]')
    if (await filterAllC2.count()) {
      await filterAllC2.click()
      await page.waitForLoadState('networkidle')
    }

    const tabPending = page.locator('[data-testid="req-status-tab-승인필요"]')
    if (await tabPending.count()) {
      await tabPending.click()
      await page.waitForLoadState('networkidle')
    }

    const firstRow = page.locator('table tbody tr[role="button"]').first()
    await expect(firstRow, 'PENDING 행 없음 — genAdmin allEmployees 필터 또는 셋업 문제').toBeVisible({ timeout: 10000 })
    await firstRow.click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    // 모달 내 일반 승인 버튼 (testid 기준)
    const approveBtn = page.locator('[data-testid="req-modal-approve-btn"]')
    await expect(approveBtn, 'genAdmin 모달 내 req-modal-approve-btn 없음 — 앱 수정 필요').toBeVisible()
  })
})
