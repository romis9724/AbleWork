/**
 * RBAC 브라우저 테스트 — 조직/직무(organizations / positions) 화면
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-4 (positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * 라우트 가드 (nav-route-guard.spec.ts에서 이미 검증 — 중복 없음):
 *   /admin/organizations = GENERAL_ADMIN 전용 (ORG_ADMIN 접근 시 리다이렉트)
 *   /admin/positions = ORG_ADMIN 이상 접근 가능 (ADMIN_ROUTE_GUARDS 미등록)
 *
 * testid 규약 (§3) — 앱에 부착된 testid 목록:
 *   org-add-btn          조직 추가 버튼 (OrganizationsPanel)
 *   org-submit-btn       OrgDialog 제출 버튼 (추가/수정 공용)
 *   org-tree-node        트리 노드 (복수, 각 조직 이름이 내부 텍스트)
 *   org-expand-toggle    펼침/접기 토글 (루트 헤더 + 하위 노드)
 *   org-edit-btn         노드 수정 버튼 (행 내)
 *   org-delete-btn       노드 삭제 버튼 (행 내)
 *   pos-add-btn          직무 추가 버튼 (PositionsPanel, isGeneralAdmin 게이팅)
 *   pos-card             직무 카드 (복수)
 *   pos-submit-btn       PositionDialog 제출 버튼
 *   pos-edit-btn         카드 내 수정 버튼 (isGeneralAdmin 게이팅)
 *   pos-delete-btn       카드 내 삭제 버튼 (isGeneralAdmin 게이팅)
 *
 * positions 방어심층 게이팅:
 *   isGeneralAdmin=true  → pos-add-btn, pos-edit-btn, pos-delete-btn 노출
 *   isGeneralAdmin=false (ORG_ADMIN) → CUD 버튼 미렌더(toHaveCount 0), 카드 조회는 허용
 */

import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  loginAs,
  login,
  BASE_URL,
  API_URL,
  expectForbidden,
} from '../helpers'

const DUMMY_UUID = '00000000-0000-0000-0000-000000000001'

// ─────────────────────────────────────────────────────────────────────────────
// A. positive — 조직 CRUD (genAdmin, /admin/organizations)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. positive — genAdmin /admin/organizations 조직 CRUD', () => {
  test('화면 진입 및 org-tree-node 렌더 확인', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    // testid "org-tree-node" 최소 1개 보여야 함 (시드: 개발팀, 영업팀)
    const treeNodes = page.locator('[data-testid="org-tree-node"]')
    await expect(treeNodes.first(), 'org-tree-node 가 최소 1개 보여야 함 (시드 조직)').toBeVisible()
  })

  test('루트 헤더 org-expand-toggle 펼침/접기 동작', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    const toggles = page.locator('[data-testid="org-expand-toggle"]')
    await expect(toggles.first(), 'org-expand-toggle 가 최소 1개 보여야 함').toBeVisible()

    // 루트 헤더 토글 클릭 → 접힘
    await toggles.first().click()
    await page.waitForTimeout(300)
    // 다시 클릭 → 펼침
    await toggles.first().click()
    await page.waitForTimeout(300)
    // 펼친 후 org-tree-node 여전히 존재
    await expect(
      page.locator('[data-testid="org-tree-node"]').first(),
      '펼친 후 org-tree-node 가 보여야 함',
    ).toBeVisible()
  })

  test('org-add-btn 이 genAdmin에게 보임', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="org-add-btn"]'),
      'org-add-btn 이 genAdmin에게 보여야 함',
    ).toBeVisible()
  })

  test('조직 추가 → OrgDialog → 고유명 입력 → org-submit-btn → 트리 반영', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    const addBtn = page.locator('[data-testid="org-add-btn"]')
    await expect(addBtn, 'org-add-btn 이 보여야 함').toBeVisible()
    await addBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog, 'OrgDialog 가 열려야 함').toBeVisible({ timeout: 8000 })

    const uniqueName = `E2E조직_${Date.now()}`
    const nameField = dialog.getByLabel('조직명')
    await expect(nameField, 'OrgDialog 조직명 필드가 보여야 함').toBeVisible()
    await nameField.fill(uniqueName)

    const submitBtn = dialog.locator('[data-testid="org-submit-btn"]')
    await expect(submitBtn, 'org-submit-btn 이 보여야 함').toBeVisible()
    await submitBtn.click()

    await expect(dialog, 'OrgDialog 가 제출 후 닫혀야 함').not.toBeVisible({ timeout: 10000 })

    // 트리에 반영 확인 — testid로 체크
    await expect(
      page.locator('[data-testid="org-tree-node"]', { hasText: uniqueName }),
      `생성한 조직(${uniqueName})이 org-tree-node 에 보여야 함`,
    ).toBeVisible({ timeout: 8000 })
  })

  test('조직 수정 → org-edit-btn → 이름 변경 → org-submit-btn → 반영', async ({ page }) => {
    await loginAs(page, 'genAdmin')

    // API로 수정 대상 조직 생성
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const targetName = `E2E수정대상_${Date.now()}`
    const createResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: targetName },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(createResp.ok(), `조직 생성 API 성공해야 함 (status: ${createResp.status()})`).toBeTruthy()

    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    // org-tree-node 내 org-edit-btn 클릭
    const targetRow = page.locator('[data-testid="org-tree-node"]', { hasText: targetName })
    await expect(targetRow, `생성한 조직(${targetName})이 트리에 보여야 함`).toBeVisible({ timeout: 8000 })
    const editBtn = targetRow.locator('[data-testid="org-edit-btn"]')
    await expect(editBtn, 'org-edit-btn 이 org-tree-node 내에 있어야 함').toBeVisible()
    await editBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog, '수정 OrgDialog 가 열려야 함').toBeVisible({ timeout: 8000 })

    const nameField = dialog.getByLabel('조직명')
    await nameField.clear()
    const updatedName = `E2E수정후_${Date.now()}`
    await nameField.fill(updatedName)

    const submitBtn = dialog.locator('[data-testid="org-submit-btn"]')
    await expect(submitBtn, 'org-submit-btn 이 수정 다이얼로그에 보여야 함').toBeVisible()
    await submitBtn.click()

    await expect(dialog, '수정 OrgDialog 가 제출 후 닫혀야 함').not.toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('[data-testid="org-tree-node"]', { hasText: updatedName }),
      `수정된 조직명(${updatedName})이 트리에 보여야 함`,
    ).toBeVisible({ timeout: 8000 })
  })

  test('조직 삭제 → org-delete-btn → ConfirmDialog → 제거', async ({ page }) => {
    await loginAs(page, 'genAdmin')

    // API로 빈 리프 조직 생성 (하위 조직/직원 없음)
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const targetName = `E2E삭제대상_${Date.now()}`
    const createResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: targetName },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(createResp.ok(), `삭제 대상 조직 생성 API 성공해야 함 (status: ${createResp.status()})`).toBeTruthy()

    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    // org-tree-node 내 org-delete-btn 클릭
    const targetRow = page.locator('[data-testid="org-tree-node"]', { hasText: targetName })
    await expect(targetRow, `삭제 대상 조직(${targetName})이 트리에 보여야 함`).toBeVisible({ timeout: 8000 })
    const deleteBtn = targetRow.locator('[data-testid="org-delete-btn"]')
    await expect(deleteBtn, 'org-delete-btn 이 org-tree-node 내에 있어야 함').toBeVisible()
    await deleteBtn.click()

    // ConfirmDialog — confirmLabel 기본값 "확인"
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog, '삭제 ConfirmDialog 가 열려야 함').toBeVisible({ timeout: 8000 })
    await confirmDialog.getByRole('button', { name: '확인' }).click()

    await expect(confirmDialog, 'ConfirmDialog 가 삭제 후 닫혀야 함').not.toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('[data-testid="org-tree-node"]', { hasText: targetName }),
      `삭제된 조직(${targetName})이 트리에서 제거돼야 함`,
    ).toHaveCount(0, { timeout: 8000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A2. positive — 직무(positions) CRUD (genAdmin, /admin/positions)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A2. positive — genAdmin /admin/positions 직무 CRUD', () => {
  test('화면 진입 및 pos-add-btn 존재 확인 (genAdmin)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="pos-add-btn"]'),
      'pos-add-btn 이 genAdmin에게 보여야 함',
    ).toBeVisible()
  })

  test('직무 추가 → pos-add-btn → PositionDialog → pos-submit-btn → pos-card 반영', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    const addBtn = page.locator('[data-testid="pos-add-btn"]')
    await expect(addBtn, 'pos-add-btn 이 보여야 함').toBeVisible()
    await addBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog, 'PositionDialog 가 열려야 함').toBeVisible({ timeout: 8000 })

    const uniqueName = `E2E직무_${Date.now()}`
    const nameField = dialog.getByLabel('직무명')
    await expect(nameField, 'PositionDialog 직무명 필드가 보여야 함').toBeVisible()
    await nameField.fill(uniqueName)

    const submitBtn = dialog.locator('[data-testid="pos-submit-btn"]')
    await expect(submitBtn, 'pos-submit-btn 이 보여야 함').toBeVisible()
    await submitBtn.click()

    await expect(dialog, 'PositionDialog 가 제출 후 닫혀야 함').not.toBeVisible({ timeout: 10000 })

    await expect(
      page.locator('[data-testid="pos-card"]', { hasText: uniqueName }),
      `생성한 직무(${uniqueName})가 pos-card 에 보여야 함`,
    ).toBeVisible({ timeout: 8000 })
  })

  test('직무 수정 → pos-card 내 pos-edit-btn → 이름 변경 → pos-submit-btn → 반영', async ({ page }) => {
    await loginAs(page, 'genAdmin')

    // API로 수정 대상 직무 생성
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const targetName = `E2E직무수정대상_${Date.now()}`
    const createResp = await page.request.post(`${API_URL}/positions`, {
      data: { name: targetName },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(createResp.ok(), `직무 생성 API 성공해야 함 (status: ${createResp.status()})`).toBeTruthy()

    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    // pos-card 내 pos-edit-btn 클릭
    const targetCard = page.locator('[data-testid="pos-card"]', { hasText: targetName })
    await expect(targetCard, `생성한 직무(${targetName})가 pos-card 에 보여야 함`).toBeVisible({ timeout: 8000 })
    const editBtn = targetCard.locator('[data-testid="pos-edit-btn"]')
    await expect(editBtn, 'pos-edit-btn 이 pos-card 내에 있어야 함').toBeVisible()
    await editBtn.click()

    const dialog = page.getByRole('dialog')
    await expect(dialog, '수정 PositionDialog 가 열려야 함').toBeVisible({ timeout: 8000 })

    const nameField = dialog.getByLabel('직무명')
    await nameField.clear()
    const updatedName = `E2E직무수정후_${Date.now()}`
    await nameField.fill(updatedName)

    const submitBtn = dialog.locator('[data-testid="pos-submit-btn"]')
    await expect(submitBtn, 'pos-submit-btn 이 수정 다이얼로그에 보여야 함').toBeVisible()
    await submitBtn.click()

    await expect(dialog, '수정 PositionDialog 가 제출 후 닫혀야 함').not.toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('[data-testid="pos-card"]', { hasText: updatedName }),
      `수정된 직무명(${updatedName})이 pos-card 에 보여야 함`,
    ).toBeVisible({ timeout: 8000 })
  })

  test('직무 삭제 → pos-card 내 pos-delete-btn → ConfirmDialog → 제거', async ({ page }) => {
    await loginAs(page, 'genAdmin')

    // API로 삭제 대상 직무 생성
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const targetName = `E2E직무삭제대상_${Date.now()}`
    const createResp = await page.request.post(`${API_URL}/positions`, {
      data: { name: targetName },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(createResp.ok(), `직무 삭제 대상 생성 API 성공해야 함 (status: ${createResp.status()})`).toBeTruthy()

    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    // pos-card 내 pos-delete-btn 클릭
    const targetCard = page.locator('[data-testid="pos-card"]', { hasText: targetName })
    await expect(targetCard, `삭제 대상 직무(${targetName})가 pos-card 에 보여야 함`).toBeVisible({ timeout: 8000 })
    const deleteBtn = targetCard.locator('[data-testid="pos-delete-btn"]')
    await expect(deleteBtn, 'pos-delete-btn 이 pos-card 내에 있어야 함').toBeVisible()
    await deleteBtn.click()

    // ConfirmDialog — confirmLabel 기본값 "확인"
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog, '직무 삭제 ConfirmDialog 가 열려야 함').toBeVisible({ timeout: 8000 })
    await confirmDialog.getByRole('button', { name: '확인' }).click()

    await expect(confirmDialog, 'ConfirmDialog 가 삭제 후 닫혀야 함').not.toBeVisible({ timeout: 10000 })
    await expect(
      page.locator('[data-testid="pos-card"]', { hasText: targetName }),
      `삭제된 직무(${targetName})가 pos-card 에서 제거돼야 함`,
    ).toHaveCount(0, { timeout: 8000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. negative — GEN 전용 조직/직무 API를 비GEN이 호출 → 403
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. negative — ORG_ADMIN: 조직/직무 CUD API 403 차단', () => {
  test('ORG_ADMIN: POST /organizations → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/organizations', {
      name: `FORBIDDEN_ORG_${Date.now()}`,
    })
  })

  test('ORG_ADMIN: PATCH /organizations/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'patch', `/organizations/${DUMMY_UUID}`, {
      name: 'FORBIDDEN',
    })
  })

  test('ORG_ADMIN: DELETE /organizations/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/organizations/${DUMMY_UUID}`)
  })

  test('ORG_ADMIN: PATCH /organizations/:id/doc-managers → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(
      page,
      accessToken,
      'patch',
      `/organizations/${DUMMY_UUID}/doc-managers`,
      { employeeIds: [] },
    )
  })

  test('ORG_ADMIN: POST /positions → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/positions', {
      name: `FORBIDDEN_POS_${Date.now()}`,
    })
  })

  test('ORG_ADMIN: PATCH /positions/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'patch', `/positions/${DUMMY_UUID}`, {
      name: 'FORBIDDEN',
    })
  })

  test('ORG_ADMIN: DELETE /positions/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/positions/${DUMMY_UUID}`)
  })
})

test.describe('B. negative — EMPLOYEE: 조직/직무 CUD API 403 차단', () => {
  test('EMPLOYEE: POST /organizations → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/organizations', {
      name: `EMP_FORBIDDEN_ORG_${Date.now()}`,
    })
  })

  test('EMPLOYEE: PATCH /organizations/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'patch', `/organizations/${DUMMY_UUID}`, {
      name: 'FORBIDDEN',
    })
  })

  test('EMPLOYEE: DELETE /organizations/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'delete', `/organizations/${DUMMY_UUID}`)
  })

  test('EMPLOYEE: PATCH /organizations/:id/doc-managers → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(
      page,
      accessToken,
      'patch',
      `/organizations/${DUMMY_UUID}/doc-managers`,
      { employeeIds: [] },
    )
  })

  test('EMPLOYEE: POST /positions → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/positions', {
      name: `EMP_FORBIDDEN_POS_${Date.now()}`,
    })
  })

  test('EMPLOYEE: PATCH /positions/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'patch', `/positions/${DUMMY_UUID}`, {
      name: 'FORBIDDEN',
    })
  })

  test('EMPLOYEE: DELETE /positions/:id → 403 (더미 UUID)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'delete', `/positions/${DUMMY_UUID}`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B2. negative — 멀티테넌시
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B2. negative — 멀티테넌시: GET /organizations 본인 회사 스코핑', () => {
  test('EMPLOYEE: GET /organizations → 200, 본인 회사(seed-company-001) 조직만 반환', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    const resp = await page.request.get(`${API_URL}/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.status(), 'EMPLOYEE GET /organizations 는 200이어야 함 (인증만 필요)').toBe(200)

    const body = await resp.json()
    const orgs = (body?.data ?? body) as Array<{ id: string; companyId?: string; name: string }>

    if (orgs.length > 0 && 'companyId' in orgs[0]) {
      for (const org of orgs) {
        expect(
          org.companyId,
          `조직(${org.name})의 companyId가 seed-company-001이어야 함`,
        ).toBe('seed-company-001')
      }
    } else {
      expect(orgs.length, 'GET /organizations 응답이 비어있지 않아야 함').toBeGreaterThan(0)
    }
  })

  test('ORG_ADMIN: GET /organizations → 200, 본인 회사 조직만 반환', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    const resp = await page.request.get(`${API_URL}/organizations`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.status(), 'ORG_ADMIN GET /organizations 는 200이어야 함').toBe(200)

    const body = await resp.json()
    const orgs = (body?.data ?? body) as Array<{ id: string; companyId?: string; name: string }>
    expect(orgs.length, 'ORG_ADMIN GET /organizations 응답이 비어있지 않아야 함').toBeGreaterThan(0)

    if (orgs.length > 0 && 'companyId' in orgs[0]) {
      for (const org of orgs) {
        expect(
          org.companyId,
          `ORG_ADMIN 조직(${org.name})의 companyId가 seed-company-001이어야 함`,
        ).toBe('seed-company-001')
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C-1. UI 게이팅 — ORG_ADMIN 이 /admin/organizations 진입 시 라우트 가드 리다이렉트
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C-1. UI 게이팅 — ORG_ADMIN /admin/organizations 접근 불가', () => {
  test('[관찰] ORG_ADMIN: /admin/organizations 직접 접근 → 리다이렉트', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/organizations`)
    await page.waitForLoadState('networkidle')

    const url = new URL(page.url())
    // ADMIN_ROUTE_GUARDS에 의해 /admin/organizations는 GENERAL_ADMIN 전용
    expect(
      url.pathname,
      '[라우트 가드] ORG_ADMIN이 /admin/organizations 에 머무르면 가드 미작동',
    ).not.toBe('/admin/organizations')
    expect(
      url.pathname,
      'ORG_ADMIN 리다이렉트 후 /login 으로 떨어지면 안 됨 (인증 상태 유지)',
    ).not.toBe('/login')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C-2. positions 방어심층 게이팅
//   /admin/positions 는 ADMIN_ROUTE_GUARDS 미등록 → ORG_ADMIN 진입 허용.
//   그러나 PositionsPanel.tsx 는 isGeneralAdmin 으로 CUD 버튼을 조건부 렌더.
//   - genAdmin: pos-add-btn 노출, 카드 있으면 pos-edit-btn/pos-delete-btn 노출.
//   - orgAdmin: 페이지 진입+조회는 되지만 pos-add-btn/pos-edit-btn/pos-delete-btn 미렌더.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C-2. positions 방어심층 게이팅', () => {
  test('genAdmin: /admin/positions pos-add-btn 노출 확인', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="pos-add-btn"]'),
      'genAdmin 에게 pos-add-btn 이 보여야 함',
    ).toBeVisible()
  })

  test('genAdmin: 카드가 있으면 pos-edit-btn/pos-delete-btn 노출', async ({ page }) => {
    await loginAs(page, 'genAdmin')

    // API로 직무 생성해 카드 존재 보장
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const posName = `E2E방어심층GEN_${Date.now()}`
    const createResp = await page.request.post(`${API_URL}/positions`, {
      data: { name: posName },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(createResp.ok(), `직무 생성 API 성공해야 함 (status: ${createResp.status()})`).toBeTruthy()

    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    const targetCard = page.locator('[data-testid="pos-card"]', { hasText: posName })
    await expect(targetCard, `생성한 직무(${posName}) pos-card 가 보여야 함`).toBeVisible({ timeout: 8000 })

    await expect(
      targetCard.locator('[data-testid="pos-edit-btn"]'),
      'genAdmin 에게 pos-edit-btn 이 pos-card 내에 보여야 함',
    ).toBeVisible()
    await expect(
      targetCard.locator('[data-testid="pos-delete-btn"]'),
      'genAdmin 에게 pos-delete-btn 이 pos-card 내에 보여야 함',
    ).toBeVisible()
  })

  test('orgAdmin: /admin/positions 진입 가능 + pos-add-btn 미렌더 (방어심층)', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    // 진입 확인 — 리다이렉트 없이 /admin/positions 에 머물러야 함
    expect(
      new URL(page.url()).pathname,
      'orgAdmin 은 /admin/positions 에 진입해야 함 (라우트 가드 미등록)',
    ).toBe('/admin/positions')

    // pos-add-btn 미렌더 (방어심층 게이팅)
    await expect(
      page.locator('[data-testid="pos-add-btn"]'),
      'orgAdmin 에게 pos-add-btn 이 렌더되면 방어심층 게이팅 누락',
    ).toHaveCount(0)
  })

  test('orgAdmin: 카드가 있어도 pos-edit-btn/pos-delete-btn 미렌더 (방어심층)', async ({ page }) => {
    // genAdmin으로 직무 생성해 카드 존재 보장
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const posName = `E2E방어심층ORG_${Date.now()}`
    const createResp = await page.request.post(`${API_URL}/positions`, {
      data: { name: posName },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(createResp.ok(), `직무 생성 API 성공해야 함 (status: ${createResp.status()})`).toBeTruthy()

    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/positions`)
    await page.waitForLoadState('networkidle')

    const targetCard = page.locator('[data-testid="pos-card"]', { hasText: posName })
    await expect(targetCard, `카드(${posName})가 orgAdmin에게 보여야 함 (조회는 허용)`).toBeVisible({ timeout: 8000 })

    // CUD 버튼 미렌더
    await expect(
      targetCard.locator('[data-testid="pos-edit-btn"]'),
      'orgAdmin 에게 pos-edit-btn 이 렌더되면 방어심층 게이팅 누락',
    ).toHaveCount(0)
    await expect(
      targetCard.locator('[data-testid="pos-delete-btn"]'),
      'orgAdmin 에게 pos-delete-btn 이 렌더되면 방어심층 게이팅 누락',
    ).toHaveCount(0)
  })
})
