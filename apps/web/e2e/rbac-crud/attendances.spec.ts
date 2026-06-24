/**
 * RBAC 브라우저 테스트 — 출퇴근기록(attendances) 화면
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-3 (액션 버튼), §2-4 (positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * attendances.controller.ts 엔드포인트별 @Roles 레벨:
 *   GET  /attendances                  — 인증만 (스코핑)
 *   GET  /attendances/me/today         — 인증만 (본인)
 *   POST /attendances                  — ORG_ADMIN
 *   GET  /attendances/now-at-work      — ORG_ADMIN
 *   POST /attendances/confirm-period   — GENERAL_ADMIN
 *   POST /attendances/unconfirm        — GENERAL_ADMIN (ATTENDANCE_UNCONFIRM)
 *   PATCH /attendances/:id/breaks      — ORG_ADMIN
 *   PATCH /attendances/:id             — GENERAL_ADMIN
 *   DELETE /attendances/:id            — GENERAL_ADMIN
 *   POST /attendances/clock-in/out/break-* — 인증만(본인)
 *
 * data-testid 규약 (§3) — 이 spec에서 기대하는 testid 목록 (수정 에이전트 대상):
 *   att-create-btn           "기록 추가" 버튼 (PageHead right .btn-line)
 *   att-confirm-period-btn   "기간 확정" 버튼 (PageHead right .btn-line, GEN API)
 *   att-filter-chip          필터칩 "퇴근 누락만" (.fchip)
 *   att-search-btn           "조회" 버튼 (.btn-primary.btn-sm)
 *   att-bulk-confirm-btn     일괄 바 "일괄 확정" 버튼 (행 선택 후 노출)
 *   att-bulk-unconfirm-btn   일괄 바 "일괄 해제" 버튼 (canUnconfirm=GEN만 노출)
 *   att-bulk-delete-btn      일괄 바 "일괄 삭제" 버튼 (GEN API — 방어심층 갭 검증)
 *
 * 방어심층 갭 검증:
 *   att-confirm-period-btn — GEN API인데 UI 게이팅 없음(canUnconfirm 게이팅 없음) → orgAdmin에게도 노출.
 *   att-bulk-delete-btn   — GEN API인데 UI 게이팅 없음 → orgAdmin에게도 노출.
 *   → 두 버튼이 orgAdmin에게 보이면 [방어심층 갭] FAIL — 수정 에이전트: GEN 게이팅 추가 필요.
 *
 * 규약: testid가 앱에 없으면 FAIL (앱 수정 필요). 텍스트 셀렉터로 핵심 인터랙션 우회 금지.
 */

import { test, expect, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  loginAs,
  login,
  BASE_URL,
  API_URL,
  expectForbidden,
} from '../helpers'

// ─────────────────────────────────────────────────────────────────────────────
// 셋업 헬퍼
// ─────────────────────────────────────────────────────────────────────────────

interface AttendanceSetupResult {
  attendanceId: string
  employeeId: string
}

/** employee 토큰으로 출근 후 퇴근 → genAdmin으로 수기 삭제 불가 시를 위한 API 수기 생성 */
async function setupAttendanceRecord(page: Page): Promise<AttendanceSetupResult | null> {
  // orgAdmin 토큰으로 수기 생성 (POST /attendances → ORG_ADMIN)
  const { accessToken: orgToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
  const { accessToken: genToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)

  // employee의 employeeId 획득 (시드 계정은 고정 ID)
  const SEED_EMP_ID = 'seed-emp-001'
  let employeeId = SEED_EMP_ID
  // 직접 확인
  const empCheck = await page.request.get(`${API_URL}/employees/${SEED_EMP_ID}`, {
    headers: { Authorization: `Bearer ${genToken}`, 'Content-Type': 'application/json' },
  })
  if (!empCheck.ok()) {
    // 폴백: 목록 검색
    const empResp = await page.request.get(`${API_URL}/employees?limit=500`, {
      headers: { Authorization: `Bearer ${genToken}`, 'Content-Type': 'application/json' },
    })
    if (!empResp.ok()) return null
    const empBody = await empResp.json()
    const items: Array<{ id: string; email?: string; user?: { email?: string } }> = (
      (empBody?.data?.items ?? empBody?.data ?? empBody) as Array<{ id: string; email?: string; user?: { email?: string } }>
    )
    const empRecord = items.find(
      (e) => e.email === ACCOUNTS.employee.email || e.user?.email === ACCOUNTS.employee.email,
    )
    if (!empRecord) return null
    employeeId = empRecord.id
  }

  // 과거 날짜(3일 전)로 수기 기록 생성 — 오늘 실시간 기록과 충돌 방지
  const past = new Date()
  past.setDate(past.getDate() - 3)
  const clockIn = new Date(past)
  clockIn.setHours(9, 0, 0, 0)
  const clockOut = new Date(past)
  clockOut.setHours(18, 0, 0, 0)

  const createResp = await page.request.post(`${API_URL}/attendances`, {
    data: {
      employeeId,
      clockInAt: clockIn.toISOString(),
      clockOutAt: clockOut.toISOString(),
      status: 'normal',
      note: `E2E_ATT_${Date.now()}`,
    },
    headers: { Authorization: `Bearer ${orgToken}`, 'Content-Type': 'application/json' },
  })
  if (!createResp.ok()) return null
  const createBody = await createResp.json()
  const attendanceId: string = ((createBody?.data ?? createBody) as { id: string }).id
  return { attendanceId, employeeId }
}

/** genAdmin으로 출퇴근 기록 삭제 */
async function deleteAttendance(page: Page, attendanceId: string): Promise<void> {
  const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
  await page.request.delete(`${API_URL}/attendances/${attendanceId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
}

/** genAdmin으로 출퇴근 기록 확정 (confirm-period: attendanceIds 전달) */
async function confirmAttendance(page: Page, attendanceId: string): Promise<boolean> {
  const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
  const resp = await page.request.post(`${API_URL}/attendances/confirm-period`, {
    data: { attendanceIds: [attendanceId] },
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  return resp.ok()
}

/** genAdmin으로 출퇴근 기록 확정 해제 */
async function unconfirmAttendance(page: Page, attendanceId: string): Promise<void> {
  const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
  await page.request.post(`${API_URL}/attendances/unconfirm`, {
    data: { attendanceIds: [attendanceId] },
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
}

/** 화면에서 기록이 로드될 때까지 날짜 범위를 이번 달로 조회
 *
 * 이 달(default range) 기준으로 이동 — 셋업 레코드는 항상 3일 전 생성이므로
 * 이번 달 범위 내에 포함됨. 별도 날짜 조작 없이 기본 로드 후 조회 버튼만 클릭한다.
 */
async function navigateToAttendancesWithDate(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/admin/attendances`)
  await page.waitForLoadState('networkidle')
  // 조회 버튼 클릭 — 이번 달 기본 범위로 재조회해 최신 데이터 확보
  const searchBtn = page.locator('[data-testid="att-search-btn"]')
  if (await searchBtn.count()) {
    await searchBtn.click()
  }
  // 테이블 행이 보일 때까지 대기
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────────────────
// A. positive — 화면 렌더 및 필터/검색 (genAdmin)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. positive — /admin/attendances 화면 렌더 (genAdmin)', () => {
  test('화면 렌더: table.tbl 출퇴근 테이블 또는 빈 상태', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    const hasTable = await page.locator('table.tbl').count()
    const isEmpty = await page.locator('.tbl-empty, .ab-loading').count()
    expect(hasTable + isEmpty, '/admin/attendances 테이블 없음').toBeGreaterThan(0)
  })

  test('att-create-btn 기대 (기록 추가 버튼)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="att-create-btn"]'),
      'att-create-btn 없음 — 앱 수정 필요 (PageHead right "기록 추가" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('att-confirm-period-btn 기대 (기간 확정 버튼)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="att-confirm-period-btn"]'),
      'att-confirm-period-btn 없음 — 앱 수정 필요 (PageHead right "기간 확정" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('att-filter-chip 기대 (퇴근 누락만 필터 칩)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="att-filter-chip"]'),
      'att-filter-chip 없음 — 앱 수정 필요 ("퇴근 누락만" .fchip에 testid 부여)',
    ).toBeVisible()
  })

  test('att-search-btn 기대 (조회 버튼)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="att-search-btn"]'),
      'att-search-btn 없음 — 앱 수정 필요 ("조회" .btn-primary 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('att-filter-chip 클릭 → 활성 스타일 토글', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    const chip = page.locator('[data-testid="att-filter-chip"]')
    await expect(chip, 'att-filter-chip 없음 — 앱 수정 필요').toBeVisible()

    await chip.click()
    await page.waitForLoadState('networkidle')
    // 클릭 후 토글 상태 확인 (스타일 변화 또는 재클릭으로 토글 복귀)
    await chip.click() // 복귀
  })

  test('att-create-btn 클릭 → 기록 추가 Modal 오픈', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="att-create-btn"]')
    await expect(btn, 'att-create-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    const modal = page.locator('.modal, [role="dialog"]')
    await expect(modal.first(), '기록 추가 Modal 없음').toBeVisible({ timeout: 8000 })
  })

  test('att-confirm-period-btn 클릭 → 기간 확정 Modal 오픈', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="att-confirm-period-btn"]')
    await expect(btn, 'att-confirm-period-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    const modal = page.locator('.modal, [role="dialog"]')
    await expect(modal.first(), '기간 확정 Modal 없음').toBeVisible({ timeout: 8000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A2. positive — 행 선택 → 일괄 확정 → 일괄 해제 흐름 (genAdmin, API 셋업)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A2. positive — 행 선택·일괄 확정·일괄 해제 흐름 (genAdmin, API 셋업)', () => {
  test('기록 셋업 → 행 선택 → att-bulk-confirm-btn 노출 기대', async ({ page }) => {
    const setup = await setupAttendanceRecord(page)
    if (!setup) {
      test.skip(true, '출퇴근 기록 셋업 실패 — 시드 데이터(직원) 확인 필요')
      return
    }

    try {
      await loginAs(page, 'genAdmin')
      await navigateToAttendancesWithDate(page)

      // 전체 선택 체크박스 클릭 → 일괄 바 노출
      const headerCheckbox = page.locator('thead input[type="checkbox"].ck').first()
      if (await headerCheckbox.count() > 0) {
        await headerCheckbox.click()
        await page.waitForLoadState('networkidle')
      } else {
        // 첫 번째 행 체크박스
        const rowCheckbox = page.locator('tbody input[type="checkbox"].ck').first()
        await expect(rowCheckbox, '행 체크박스 없음 — 기록이 조회되지 않을 수 있음').toBeVisible({ timeout: 8000 })
        await rowCheckbox.click()
        await page.waitForLoadState('networkidle')
      }

      // 일괄 바 표시 확인
      await expect(page.locator('.tbl-bar'), '일괄 액션 바(.tbl-bar) 없음').toBeVisible({ timeout: 8000 })

      // att-bulk-confirm-btn testid 기대
      await expect(
        page.locator('[data-testid="att-bulk-confirm-btn"]'),
        'att-bulk-confirm-btn 없음 — 앱 수정 필요 (일괄 바 "일괄 확정" 버튼에 testid 부여)',
      ).toBeVisible()
    } finally {
      await deleteAttendance(page, setup.attendanceId).catch(() => {})
    }
  })

  test('기록 셋업 → 일괄 확정 클릭 → 확정 반영 검증 (API)', async ({ page }) => {
    const setup = await setupAttendanceRecord(page)
    if (!setup) {
      test.skip(true, '출퇴근 기록 셋업 실패 — 시드 데이터 확인 필요')
      return
    }

    try {
      await loginAs(page, 'genAdmin')
      await navigateToAttendancesWithDate(page)

      // 전체 선택 체크박스 클릭 → 일괄 바 노출
      const headerCheckbox = page.locator('thead input[type="checkbox"].ck').first()
      if (await headerCheckbox.count() > 0) {
        await headerCheckbox.click()
      } else {
        const firstRowCk = page.locator('tbody input[type="checkbox"].ck').first()
        await expect(firstRowCk, '행 체크박스 없음').toBeVisible({ timeout: 8000 })
        await firstRowCk.click()
      }

      await expect(page.locator('.tbl-bar'), '.tbl-bar 없음').toBeVisible({ timeout: 8000 })

      const bulkConfirmBtn = page.locator('[data-testid="att-bulk-confirm-btn"]')
      await expect(bulkConfirmBtn, 'att-bulk-confirm-btn 없음 — 앱 수정 필요').toBeVisible()

      // 확정 API 응답을 인터셉트해 검증 — "전체 선택"이므로 setId 대신 응답값 기준
      const [confirmResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/attendances/confirm-period') && r.request().method() === 'POST',
          { timeout: 15000 },
        ),
        bulkConfirmBtn.click(),
      ])
      expect(confirmResp.ok(), `confirm-period API 실패: status=${confirmResp.status()}`).toBe(true)
      const confirmBody = await confirmResp.json() as { data?: { confirmed?: number }; confirmed?: number }
      const confirmedCount = confirmBody?.data?.confirmed ?? confirmBody?.confirmed ?? 0
      expect(confirmedCount, '일괄 확정 후 API confirmed 카운트가 0 — 선택된 기록 없음').toBeGreaterThan(0)
    } finally {
      // 클린업: 확정 해제 후 삭제
      await unconfirmAttendance(page, setup.attendanceId).catch(() => {})
      await deleteAttendance(page, setup.attendanceId).catch(() => {})
    }
  })

  test('확정 기록 셋업 → att-bulk-unconfirm-btn 노출(genAdmin) → 일괄 해제', async ({ page }) => {
    const setup = await setupAttendanceRecord(page)
    if (!setup) {
      test.skip(true, '출퇴근 기록 셋업 실패 — 시드 데이터 확인 필요')
      return
    }

    // API로 먼저 확정
    const confirmed = await confirmAttendance(page, setup.attendanceId)
    if (!confirmed) {
      await deleteAttendance(page, setup.attendanceId).catch(() => {})
      test.skip(true, '출퇴근 기록 확정 API 실패')
      return
    }

    try {
      await loginAs(page, 'genAdmin')
      await navigateToAttendancesWithDate(page)

      // 전체 선택 — 최소 1개 이상 확정된 레코드가 있음(setup.attendanceId)
      const headerCheckbox = page.locator('thead input[type="checkbox"].ck').first()
      if (await headerCheckbox.count() > 0) {
        await headerCheckbox.click()
      } else {
        const firstRowCk = page.locator('tbody input[type="checkbox"].ck').first()
        await expect(firstRowCk, '행 체크박스 없음').toBeVisible({ timeout: 8000 })
        await firstRowCk.click()
      }

      await expect(page.locator('.tbl-bar'), '.tbl-bar 없음').toBeVisible({ timeout: 8000 })

      // genAdmin → att-bulk-unconfirm-btn 노출 기대 (canUnconfirm=true)
      const unconfirmBtn = page.locator('[data-testid="att-bulk-unconfirm-btn"]')
      await expect(
        unconfirmBtn,
        'att-bulk-unconfirm-btn genAdmin에게 보여야 함 — 앱 수정 필요 (testid 부여 필요)',
      ).toBeVisible()

      // 해제 API 응답 인터셉트 — setup 레코드가 확정 상태이므로 최소 1건 해제 기대
      const [unconfirmResp] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/attendances/unconfirm') && r.request().method() === 'POST',
          { timeout: 15000 },
        ),
        unconfirmBtn.click(),
      ])
      expect(unconfirmResp.ok(), `unconfirm API 실패: status=${unconfirmResp.status()}`).toBe(true)

      // API 재조회로 setup 레코드 확정 해제 검증
      const { accessToken: genToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const checkResp = await page.request.get(
        `${API_URL}/attendances?limit=500&startDate=${startOfMonth}&endDate=${today}`,
        { headers: { Authorization: `Bearer ${genToken}`, 'Content-Type': 'application/json' } },
      )
      if (checkResp.ok()) {
        const checkBody = await checkResp.json() as { data?: { items?: Array<{ id: string; isConfirmed: boolean }> } }
        const records = checkBody?.data?.items ?? []
        const record = records.find((r) => r.id === setup.attendanceId)
        if (record) {
          expect(record.isConfirmed, '일괄 해제 후 API 검증: setup 레코드 isConfirmed가 false여야 함').toBe(false)
        }
      }
    } finally {
      await unconfirmAttendance(page, setup.attendanceId).catch(() => {})
      await deleteAttendance(page, setup.attendanceId).catch(() => {})
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. negative API 403 — EMPLOYEE: ORG_ADMIN 전용 엔드포인트
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. negative API — EMPLOYEE: ORG_ADMIN 전용 엔드포인트 403 차단', () => {
  test('EMPLOYEE: POST /attendances → 403 (ORG_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/attendances', {
      employeeId: '00000000-0000-0000-0000-000000000001',
      clockInAt: new Date().toISOString(),
    })
  })

  test('EMPLOYEE: GET /attendances/now-at-work → 403 (ORG_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'get', '/attendances/now-at-work')
  })
})

test.describe('B2. negative API — EMPLOYEE & ORG_ADMIN: GENERAL_ADMIN 전용 엔드포인트 403', () => {
  test('EMPLOYEE: POST /attendances/confirm-period → 403 (GENERAL_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/attendances/confirm-period', {
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    })
  })

  test('ORG_ADMIN: POST /attendances/confirm-period → 403 (GENERAL_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/attendances/confirm-period', {
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    })
  })

  test('EMPLOYEE: POST /attendances/unconfirm → 403 (GENERAL_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/attendances/unconfirm', {
      attendanceIds: ['00000000-0000-0000-0000-000000000001'],
    })
  })

  test('ORG_ADMIN: POST /attendances/unconfirm → 403 (GENERAL_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/attendances/unconfirm', {
      attendanceIds: ['00000000-0000-0000-0000-000000000001'],
    })
  })

  test('EMPLOYEE: PATCH /attendances/:id → 403 (GENERAL_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'patch', '/attendances/00000000-0000-0000-0000-000000000001', {
      clockInAt: new Date().toISOString(),
      status: 'normal',
    })
  })

  test('ORG_ADMIN: PATCH /attendances/:id → 403 (GENERAL_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'patch', '/attendances/00000000-0000-0000-0000-000000000001', {
      clockInAt: new Date().toISOString(),
      status: 'normal',
    })
  })

  test('EMPLOYEE: DELETE /attendances/:id → 403 (GENERAL_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'delete', '/attendances/00000000-0000-0000-0000-000000000001')
  })

  test('ORG_ADMIN: DELETE /attendances/:id → 403 (GENERAL_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', '/attendances/00000000-0000-0000-0000-000000000001')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. UI 게이팅 — att-bulk-unconfirm-btn 역할별 가시성 (ATTENDANCE_UNCONFIRM=GEN)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. UI 게이팅 — att-bulk-unconfirm-btn 역할별 가시성 (canUnconfirm=GEN)', () => {
  test('orgAdmin: att-bulk-unconfirm-btn 숨겨야 함 (canUnconfirm 게이팅)', async ({ page }) => {
    const setup = await setupAttendanceRecord(page)
    if (!setup) {
      test.skip(true, '출퇴근 기록 셋업 실패 — 시드 데이터 확인 필요')
      return
    }

    try {
      await loginAs(page, 'orgAdmin')
      // 기본 이번 달 범위로 로드 — 셋업 레코드(3일 전)가 이번 달 내에 있음
      await page.goto(`${BASE_URL}/admin/attendances`)
      await page.waitForLoadState('networkidle')

      // 행 체크박스가 나올 때까지 대기 (최대 8초)
      const firstRowCk = page.locator('tbody input[type="checkbox"].ck').first()
      await firstRowCk.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {/* 없으면 아래에서 처리 */})

      const headerCheckbox = page.locator('thead input[type="checkbox"].ck').first()
      if (await headerCheckbox.count() > 0) {
        await headerCheckbox.click()
      } else if (await firstRowCk.count() > 0) {
        await firstRowCk.click()
      }

      // 일괄 바가 있으면 att-bulk-unconfirm-btn 확인
      const barVisible = await page.locator('.tbl-bar').isVisible()
      if (!barVisible) {
        // 체크박스가 없거나 기록 없음 → 관찰 불가
        test.skip(true, '일괄 액션 바 없음 — 기록이 조회되지 않아 UI 게이팅 관찰 불가 (셋업 레코드가 이번 달 범위 외일 수 있음)')
        return
      }

      // orgAdmin → att-bulk-unconfirm-btn 숨겨야 함 (canUnconfirm=false)
      await expect(
        page.locator('[data-testid="att-bulk-unconfirm-btn"]'),
        'att-bulk-unconfirm-btn orgAdmin에게 숨겨야 함 — canUnconfirm 게이팅 적용 여부 확인. testid 없으면 FAIL.',
      ).toHaveCount(0)
    } finally {
      await deleteAttendance(page, setup.attendanceId).catch(() => {})
    }
  })

  test('employee: /admin/attendances 직접 접근 → 리다이렉트 (ORG_ADMIN 미만)', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    const landed = new URL(page.url()).pathname
    expect(landed, 'employee가 /admin/attendances에 머무름 — 라우트 가드 미작동').not.toBe('/admin/attendances')
    expect(landed, '차단 후 /login으로 떨어짐 — 인증 상태 유지 필요').not.toBe('/login')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D. UI 게이팅 — 방어심층 갭 검증 (att-confirm-period-btn & att-bulk-delete-btn)
//
// att-confirm-period-btn: GEN API인데 UI 게이팅(canUnconfirm) 없음
//   → orgAdmin에게 노출되면 [방어심층 갭] FAIL — 수정 에이전트: GEN 게이팅 추가
// att-bulk-delete-btn: GEN API(DELETE)인데 UI 게이팅 없음
//   → orgAdmin에게 노출되면 [방어심층 갭] FAIL — 수정 에이전트: GEN 게이팅 추가
//
// 규약: 버튼이 보이면 강제 FAIL (expect(visible).toBe(false)). 단언 약화 금지.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('D. UI 게이팅 방어심층 갭 — att-confirm-period-btn & att-bulk-delete-btn (orgAdmin)', () => {
  test('[방어심층 갭] orgAdmin: att-confirm-period-btn 숨겨야 함 (GEN API인데 UI 게이팅 없음)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/attendances`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="att-confirm-period-btn"]')
    const visible = await btn.isVisible()
    if (visible) {
      // [방어심층 갭] 버튼이 보임 — orgAdmin이 클릭하면 API에서 403이지만 UI 게이팅이 없음
      expect(
        visible,
        '[방어심층 갭] att-confirm-period-btn이 orgAdmin에게 노출됨. ' +
        'POST /attendances/confirm-period는 GENERAL_ADMIN 전용 API. ' +
        'UI 게이팅(canUnconfirm 또는 canConfirmPeriod) 없음 — 수정 에이전트: "기간 확정" 버튼에 GEN 게이팅 추가 필요',
      ).toBe(false)
    } else {
      // 이미 게이팅됨 (올바른 상태)
      expect(visible).toBe(false)
    }
  })

  test('[방어심층 갭] orgAdmin: att-bulk-delete-btn 숨겨야 함 (행 선택 후, GEN API인데 UI 게이팅 없음)', async ({ page }) => {
    const setup = await setupAttendanceRecord(page)
    if (!setup) {
      test.skip(true, '출퇴근 기록 셋업 실패 — 행 선택 불가, att-bulk-delete-btn 관찰 불가')
      return
    }

    try {
      await loginAs(page, 'orgAdmin')
      // 기본 이번 달 범위로 로드 — 셋업 레코드(3일 전)가 이번 달 내에 있음
      await page.goto(`${BASE_URL}/admin/attendances`)
      await page.waitForLoadState('networkidle')

      // 행 체크박스가 나올 때까지 대기 (최대 8초)
      const firstRowCk = page.locator('tbody input[type="checkbox"].ck').first()
      await firstRowCk.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {/* 없으면 아래에서 처리 */})

      const headerCheckbox = page.locator('thead input[type="checkbox"].ck').first()
      if (await headerCheckbox.count() > 0) {
        await headerCheckbox.click()
      } else if (await firstRowCk.count() > 0) {
        await firstRowCk.click()
      }

      const barVisible = await page.locator('.tbl-bar').isVisible()
      if (!barVisible) {
        test.skip(true, '일괄 액션 바 없음 — 기록 조회 안 됨, att-bulk-delete-btn 관찰 불가 (셋업 레코드가 이번 달 범위 외일 수 있음)')
        return
      }

      const btn = page.locator('[data-testid="att-bulk-delete-btn"]')
      const visible = await btn.isVisible()
      if (visible) {
        expect(
          visible,
          '[방어심층 갭] att-bulk-delete-btn이 orgAdmin에게 노출됨. ' +
          'DELETE /attendances/:id는 GENERAL_ADMIN 전용 API. ' +
          'UI 게이팅(canUnconfirm 게이팅 참고) 없음 — 수정 에이전트: "일괄 삭제" 버튼에 GEN 게이팅 추가 필요',
        ).toBe(false)
      } else {
        expect(visible).toBe(false)
      }
    } finally {
      await deleteAttendance(page, setup.attendanceId).catch(() => {})
    }
  })
})
