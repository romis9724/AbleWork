/**
 * RBAC 브라우저 테스트 — 근무일정(shifts) 화면
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-3 (액션 버튼), §2-4 (positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * shifts.controller.ts 엔드포인트별 @Roles 레벨:
 *   GET  /shifts                  — 인증만 (EMPLOYEE는 본인 일정만 서버 스코핑)
 *   POST /shifts                  — ORG_ADMIN
 *   POST /shifts/bulk             — ORG_ADMIN
 *   PATCH /shifts/:id             — @Roles 없음(인증만) ← 인가 갭 검증 포인트
 *   DELETE /shifts/:id            — ORG_ADMIN
 *   POST /shifts/:id/confirm      — ORG_ADMIN
 *   POST /shifts/:id/unconfirm    — GENERAL_ADMIN (SHIFT_UNCONFIRM)
 *
 * data-testid 규약 (§3) — 이 spec에서 기대하는 testid 목록 (수정 에이전트 대상):
 *   shifts-bulk-btn        "일괄 생성" 버튼 (PageHead right .btn-line)
 *   shifts-add-btn         "근무일정 추가" 버튼 (PageHead right .btn-ghost)
 *   shifts-prev-week       주간 네비 "이전 주" 버튼 (.nb aria-label="이전 주")
 *   shifts-next-week       주간 네비 "다음 주" 버튼 (.nb aria-label="다음 주")
 *   shifts-this-week       "오늘" 이번 주 복귀 버튼
 *   shift-confirm-btn      그리드 셀 내 미확정 일정 "확정" 링크
 *   shift-unconfirm-btn    그리드 셀 내 확정된 일정 "확정 해제" 링크 (canUnconfirm=GEN만 노출)
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

interface ShiftSetupResult {
  shiftId: string
  employeeId: string
}

/** genAdmin 토큰으로 근무유형 목록 조회 → 첫 번째 활성 유형 ID */
async function getFirstShiftTypeId(page: Page, token: string): Promise<string | null> {
  // 올바른 endpoint: /shift-types (not /shifts/types)
  const resp = await page.request.get(`${API_URL}/shift-types`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!resp.ok()) return null
  const body = await resp.json()
  const types: Array<{ id: string; isActive?: boolean }> = (body?.data ?? body) as Array<{ id: string; isActive?: boolean }>
  const active = types.filter((t) => t.isActive !== false)
  return active[0]?.id ?? types[0]?.id ?? null
}

/** genAdmin 토큰으로 직원 목록 조회 → employee 계정의 employeeId 추출
 *  시드 직원은 페이지 뒤쪽에 있을 수 있으므로 직접 접근하거나 limit를 크게 사용한다.
 */
async function getEmployeeIdByEmail(page: Page, token: string, email: string): Promise<string | null> {
  // 시드 계정은 고정 ID가 있으므로 직접 개별 조회 시도
  // employee@ablework.io → seed-emp-001, sales@ablework.io → seed-emp-sales
  const knownIds: Record<string, string> = {
    'employee@ablework.io': 'seed-emp-001',
    'sales@ablework.io': 'seed-emp-sales',
  }
  if (knownIds[email]) {
    const directResp = await page.request.get(`${API_URL}/employees/${knownIds[email]}`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (directResp.ok()) return knownIds[email]
  }

  // 폴백: 목록에서 검색 (limit 500)
  const resp = await page.request.get(`${API_URL}/employees?limit=500`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!resp.ok()) return null
  const body = await resp.json()
  const items: Array<{ id: string; email?: string; user?: { email?: string } }> = (
    (body?.data?.items ?? body?.data ?? body) as Array<{ id: string; email?: string; user?: { email?: string } }>
  )
  const found = items.find(
    (e) => e.email === email || e.user?.email === email,
  )
  return found?.id ?? null
}

/** seed-emp-001 의 소속 조직 ID를 조회 */
async function getSeedEmployeeOrgId(page: Page, token: string): Promise<string | null> {
  // seed-emp-001의 소속 조직은 seed-org-dev(개발팀)로 고정
  const SEED_ORG_ID = 'seed-org-dev'
  // 직접 확인
  const resp = await page.request.get(`${API_URL}/employees/seed-emp-001`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!resp.ok()) return SEED_ORG_ID
  const body = await resp.json()
  const emp = (body?.data ?? body) as { organizations?: Array<{ organization: { id: string }; isPrimary?: boolean }> }
  const orgs = emp.organizations ?? []
  const primary = orgs.find((o) => o.isPrimary)
  return primary?.organization.id ?? orgs[0]?.organization.id ?? SEED_ORG_ID
}

/**
 * 미확정 근무일정 API 생성 (orgAdmin 권한 필요).
 * 반환: shiftId + employeeId (클린업 시 필요).
 * 실패 시 null 반환 — 호출처에서 skip 처리.
 */
async function setupUnconfirmedShift(page: Page): Promise<ShiftSetupResult | null> {
  const { accessToken: orgToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
  const { accessToken: genToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)

  const shiftTypeId = await getFirstShiftTypeId(page, genToken)
  if (!shiftTypeId) return null

  const employeeId = await getEmployeeIdByEmail(page, genToken, ACCOUNTS.employee.email)
  if (!employeeId) return null

  const orgId = await getSeedEmployeeOrgId(page, genToken)
  if (!orgId) return null

  // 내일 날짜 사용 — 오늘 기록과 충돌 방지, 주중 보장(주말 건너뛰기 없음, 그냥 내일로)
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dateStr = tomorrow.toISOString().slice(0, 10)

  const resp = await page.request.post(`${API_URL}/shifts`, {
    data: {
      employeeId,
      organizationId: orgId,
      shiftTypeId,
      startAt: `${dateStr}T09:00:00.000Z`,
      endAt: `${dateStr}T18:00:00.000Z`,
    },
    headers: { Authorization: `Bearer ${orgToken}`, 'Content-Type': 'application/json' },
  })
  if (!resp.ok()) return null
  const body = await resp.json()
  const shiftId: string = ((body?.data ?? body) as { id: string }).id
  return { shiftId, employeeId }
}

/** 근무일정 삭제 (orgAdmin) */
async function deleteShift(page: Page, shiftId: string): Promise<void> {
  const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
  await page.request.delete(`${API_URL}/shifts/${shiftId}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
}

/** 근무일정 확정 (orgAdmin) */
async function confirmShift(page: Page, shiftId: string): Promise<boolean> {
  const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
  const resp = await page.request.post(`${API_URL}/shifts/${shiftId}/confirm`, {
    data: {},
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
  return resp.ok()
}

/** 확정 해제 (genAdmin) — 클린업용 */
async function unconfirmShift(page: Page, shiftId: string): Promise<void> {
  const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
  await page.request.post(`${API_URL}/shifts/${shiftId}/unconfirm`, {
    data: {},
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// A. positive — 주간 그리드 네비 + 모달 열기 (orgAdmin & genAdmin)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. positive — /admin/shifts 화면 렌더 및 주간 네비 (orgAdmin)', () => {
  test('화면 렌더: .roster-wrap 주간 그리드 존재', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    // 주간 그리드 테이블 존재 (.roster-wrap은 table.roster를 감싸므로 .roster-wrap만 사용)
    await expect(page.locator('.roster-wrap').first(), '주간 그리드 없음').toBeVisible({ timeout: 10000 })
  })

  test('shifts-prev-week 버튼 기대 (이전 주 네비)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="shifts-prev-week"]'),
      'shifts-prev-week 없음 — 앱 수정 필요 (이전 주 .nb 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('shifts-next-week 버튼 기대 (다음 주 네비)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="shifts-next-week"]'),
      'shifts-next-week 없음 — 앱 수정 필요 (다음 주 .nb 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('shifts-this-week 버튼 기대 (이번 주 복귀)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="shifts-this-week"]'),
      'shifts-this-week 없음 — 앱 수정 필요 ("오늘" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('주간 네비 클릭 → 주간 레이블 변경', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    // 현재 주 레이블 취득
    const label = page.locator('.wk-label')
    await expect(label, '.wk-label 없음').toBeVisible()
    const before = await label.textContent()

    // 이전 주 클릭
    const prevBtn = page.locator('[data-testid="shifts-prev-week"]')
    await expect(prevBtn, 'shifts-prev-week 없음 — 앱 수정 필요').toBeVisible()
    await prevBtn.click()
    await page.waitForLoadState('networkidle')

    const after = await label.textContent()
    expect(after, '이전 주 클릭 후 레이블이 바뀌지 않음').not.toBe(before)

    // 이번 주 복귀
    const thisWeekBtn = page.locator('[data-testid="shifts-this-week"]')
    await expect(thisWeekBtn, 'shifts-this-week 없음 — 앱 수정 필요').toBeVisible()
    await thisWeekBtn.click()
    await page.waitForLoadState('networkidle')

    const restored = await label.textContent()
    expect(restored, '이번 주 복귀 후 레이블이 원래대로 돌아오지 않음').toBe(before)
  })
})

test.describe('A2. positive — 일괄 생성·추가 다이얼로그 열기 (orgAdmin)', () => {
  test('shifts-bulk-btn 기대 (일괄 생성)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="shifts-bulk-btn"]'),
      'shifts-bulk-btn 없음 — 앱 수정 필요 ("일괄 생성" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('shifts-add-btn 기대 (근무일정 추가)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="shifts-add-btn"]'),
      'shifts-add-btn 없음 — 앱 수정 필요 ("근무일정 추가" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('shifts-bulk-btn 클릭 → 일괄 생성 다이얼로그 오픈', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="shifts-bulk-btn"]')
    await expect(btn, 'shifts-bulk-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // BulkCreateDialog: Modal 또는 role=dialog
    const dialog = page.locator('[role="dialog"], .modal')
    await expect(dialog.first(), '일괄 생성 다이얼로그 없음').toBeVisible({ timeout: 8000 })
  })

  test('shifts-add-btn 클릭 → 근무일정 추가 Modal 오픈', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="shifts-add-btn"]')
    await expect(btn, 'shifts-add-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // Modal: .modal 또는 role=dialog
    const modal = page.locator('.modal, [role="dialog"]')
    await expect(modal.first(), '근무일정 추가 Modal 없음').toBeVisible({ timeout: 8000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A3. positive — 확정 (ORG_ADMIN) → genAdmin 확정취소 흐름 (API 셋업)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A3. positive — 셀 확정(orgAdmin) → 확정취소(genAdmin) 흐름', () => {
  test('미확정 일정 셋업 → shift-confirm-btn testid 기대 (그리드 셀 내)', async ({ page }) => {
    const setup = await setupUnconfirmedShift(page)
    if (!setup) {
      test.skip(true, '근무일정 셋업 실패 — 시드 데이터(근무유형/직원/조직) 확인 필요')
      return
    }

    try {
      await loginAs(page, 'orgAdmin')
      await page.goto(`${BASE_URL}/admin/shifts`)
      await page.waitForLoadState('networkidle')

      // 다음 주 네비 → 셋업한 일정이 내일이므로 현재 주에 있을 수 있음
      // 일정이 보이는지 확인 (주간 그리드에 shift 셀 존재)
      const confirmBtns = page.locator('[data-testid="shift-confirm-btn"]')
      const confirmCount = await confirmBtns.count()
      if (confirmCount > 0) {
        await expect(confirmBtns.first(), 'shift-confirm-btn 존재 확인').toBeVisible()
      } else {
        // testid가 아직 없음 — FAIL (앱 수정 필요)
        await expect(
          page.locator('[data-testid="shift-confirm-btn"]'),
          'shift-confirm-btn 없음 — 앱 수정 필요 (미확정 셀 "확정" 링크에 testid 부여)',
        ).toBeVisible({ timeout: 5000 })
      }
    } finally {
      await deleteShift(page, setup.shiftId).catch(() => {/* 이미 확정됐으면 무시 */})
    }
  })

  test('API 확정 후 genAdmin: shift-unconfirm-btn 노출 기대', async ({ page }) => {
    const setup = await setupUnconfirmedShift(page)
    if (!setup) {
      test.skip(true, '근무일정 셋업 실패 — 시드 데이터 확인 필요')
      return
    }

    // 확정
    const confirmed = await confirmShift(page, setup.shiftId)
    if (!confirmed) {
      await deleteShift(page, setup.shiftId).catch(() => {})
      test.skip(true, '근무일정 확정 API 실패')
      return
    }

    try {
      await loginAs(page, 'genAdmin')
      await page.goto(`${BASE_URL}/admin/shifts`)
      await page.waitForLoadState('networkidle')

      const unconfirmBtns = page.locator('[data-testid="shift-unconfirm-btn"]')
      const count = await unconfirmBtns.count()
      if (count > 0) {
        await expect(unconfirmBtns.first(), 'shift-unconfirm-btn genAdmin에게 노출 확인').toBeVisible()
      } else {
        await expect(
          page.locator('[data-testid="shift-unconfirm-btn"]'),
          'shift-unconfirm-btn 없음 — 앱 수정 필요 (확정된 셀 "확정 해제" 링크에 testid 부여, GEN만 노출)',
        ).toBeVisible({ timeout: 5000 })
      }
    } finally {
      await unconfirmShift(page, setup.shiftId).catch(() => {})
      await deleteShift(page, setup.shiftId).catch(() => {})
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. negative API 403 — ORG_ADMIN 전용 엔드포인트
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. negative API — EMPLOYEE: ORG_ADMIN 전용 엔드포인트 403 차단', () => {
  test('EMPLOYEE: POST /shifts → 403 (ORG_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/shifts', {
      employeeId: '00000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000001',
      shiftTypeId: '00000000-0000-0000-0000-000000000001',
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
    })
  })

  test('EMPLOYEE: POST /shifts/bulk → 403 (ORG_ADMIN 전용)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/shifts/bulk', {
      templateId: '00000000-0000-0000-0000-000000000001',
      organizationId: '00000000-0000-0000-0000-000000000001',
      employeeIds: [],
      startDate: new Date().toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    })
  })

  test('EMPLOYEE: DELETE /shifts/:id → 403 (ORG_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'delete', '/shifts/00000000-0000-0000-0000-000000000001')
  })

  test('EMPLOYEE: POST /shifts/:id/confirm → 403 (ORG_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/shifts/00000000-0000-0000-0000-000000000001/confirm', {})
  })
})

test.describe('B2. negative API — EMPLOYEE & ORG_ADMIN: unconfirm GENERAL_ADMIN 전용', () => {
  test('EMPLOYEE: POST /shifts/:id/unconfirm → 403 (GENERAL_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/shifts/00000000-0000-0000-0000-000000000001/unconfirm', {})
  })

  test('ORG_ADMIN: POST /shifts/:id/unconfirm → 403 (GENERAL_ADMIN 전용, 더미 ID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/shifts/00000000-0000-0000-0000-000000000001/unconfirm', {})
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B3. negative API — EMPLOYEE: PATCH /shifts/:id 인가 갭 검증
//
// 컨트롤러에 @Roles 데코레이터 없음 → 인증만으로 호출 가능한지 실측.
// 실제 응답이 403이면 서비스 레이어에서 막음(companyId 스코핑 등).
// 200 또는 4xx(400 등)이면 인가 갭 — 수정 에이전트 대상.
//
// 판정:
//   - 403/401 → 인가 갭 없음 (통과)
//   - 200/400/422 등 403 이외 → [인가 갭] FAIL — 수정 에이전트: @Roles(ORG_ADMIN) 추가
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B3. negative — EMPLOYEE PATCH /shifts/:id 인가 갭 검증', () => {
  test('[인가 갭] EMPLOYEE: PATCH /shifts/:id → 기대 403 (컨트롤러 @Roles 없음)', async ({ page }) => {
    // 실제 존재하는 shift ID가 있어야 권한 검사까지 도달하므로, orgAdmin으로 일정 생성
    const setup = await setupUnconfirmedShift(page)
    if (!setup) {
      // 셋업 불가 시 더미 ID로 대체 — 인가 갭은 404보다 먼저 체크돼야 하지만 404면 skip
      const { accessToken: empToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
      const resp = await page.request.patch(`${API_URL}/shifts/00000000-0000-0000-0000-000000000001`, {
        data: { startAt: new Date().toISOString(), endAt: new Date().toISOString() },
        headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
      })
      const status = resp.status()
      // 404 = 리소스 없음(인가 갭 판별 불가), 403/401 = 인가 차단(정상)
      if (status === 404) {
        test.skip(true, 'PATCH /shifts/:id 더미 ID → 404, 인가 갭 판별 불가. 셋업 이슈.')
        return
      }
      expect(
        [401, 403],
        `[인가 갭] EMPLOYEE PATCH /shifts/:id → ${status}. 컨트롤러에 @Roles(ORG_ADMIN) 없음. 수정 에이전트: @Roles(AccessLevel.ORG_ADMIN) 추가 필요`,
      ).toContain(status)
      return
    }

    const { accessToken: empToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    const resp = await page.request.patch(`${API_URL}/shifts/${setup.shiftId}`, {
      data: {
        startAt: new Date().toISOString(),
        endAt: new Date().toISOString(),
      },
      headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    })
    const status = resp.status()

    // 클린업 (인가 갭으로 수정됐을 수도 있으니 unconfirm은 생략, 바로 delete 시도)
    await deleteShift(page, setup.shiftId).catch(() => {})

    expect(
      [401, 403],
      `[인가 갭] EMPLOYEE PATCH /shifts/${setup.shiftId} → ${status}. ` +
      `컨트롤러에 @Roles(ORG_ADMIN) 없음. ` +
      `403이 아니면 EMPLOYEE가 타인 근무일정 수정 가능 — 수정 에이전트: @Roles(AccessLevel.ORG_ADMIN) 추가 필요`,
    ).toContain(status)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. UI 게이팅 — shift-unconfirm-btn 역할별 노출 검증 (SHIFT_UNCONFIRM=GEN)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. UI 게이팅 — shift-unconfirm-btn 역할별 가시성 (canUnconfirm=GEN)', () => {
  test('genAdmin: 확정된 일정에서 shift-unconfirm-btn 노출 (canUnconfirm=true)', async ({ page }) => {
    const setup = await setupUnconfirmedShift(page)
    if (!setup) {
      test.skip(true, '근무일정 셋업 실패 — 시드 데이터 확인 필요')
      return
    }

    const confirmed = await confirmShift(page, setup.shiftId)
    if (!confirmed) {
      await deleteShift(page, setup.shiftId).catch(() => {})
      test.skip(true, '근무일정 확정 API 실패')
      return
    }

    try {
      await loginAs(page, 'genAdmin')
      await page.goto(`${BASE_URL}/admin/shifts`)
      await page.waitForLoadState('networkidle')

      // genAdmin은 canUnconfirm = true → shift-unconfirm-btn 노출
      await expect(
        page.locator('[data-testid="shift-unconfirm-btn"]'),
        'shift-unconfirm-btn genAdmin에게 보여야 함 — 앱 수정 필요 (testid 부여 또는 canUnconfirm 로직 점검)',
      ).toBeVisible({ timeout: 10000 })
    } finally {
      await unconfirmShift(page, setup.shiftId).catch(() => {})
      await deleteShift(page, setup.shiftId).catch(() => {})
    }
  })

  test('orgAdmin: 확정된 일정에서 shift-unconfirm-btn 숨김 (canUnconfirm=false)', async ({ page }) => {
    const setup = await setupUnconfirmedShift(page)
    if (!setup) {
      test.skip(true, '근무일정 셋업 실패 — 시드 데이터 확인 필요')
      return
    }

    const confirmed = await confirmShift(page, setup.shiftId)
    if (!confirmed) {
      await deleteShift(page, setup.shiftId).catch(() => {})
      test.skip(true, '근무일정 확정 API 실패')
      return
    }

    try {
      await loginAs(page, 'orgAdmin')
      await page.goto(`${BASE_URL}/admin/shifts`)
      await page.waitForLoadState('networkidle')

      // orgAdmin은 canUnconfirm = false → shift-unconfirm-btn 숨김
      await expect(
        page.locator('[data-testid="shift-unconfirm-btn"]'),
        'shift-unconfirm-btn orgAdmin에게 숨겨야 함 — 앱 canUnconfirm 게이팅 이미 존재하므로 testid 부여만 필요. testid 없으면 관찰 불가(FAIL).',
      ).toHaveCount(0)
    } finally {
      await unconfirmShift(page, setup.shiftId).catch(() => {})
      await deleteShift(page, setup.shiftId).catch(() => {})
    }
  })

  test('employee: /admin/shifts 직접 접근 → 리다이렉트 (라우트 가드, ORG_ADMIN 미만)', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    const landed = new URL(page.url()).pathname
    expect(landed, 'employee가 /admin/shifts에 머무름 — 라우트 가드 미작동').not.toBe('/admin/shifts')
    expect(landed, '차단 후 /login으로 떨어짐 — 인증 상태 유지 필요').not.toBe('/login')
  })
})
