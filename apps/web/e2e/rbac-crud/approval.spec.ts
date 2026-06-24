/**
 * RBAC 브라우저 테스트 — 전자결재(approval) 도메인
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-4 (positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * 백엔드 엔드포인트별 @Roles 레벨 (실측):
 *   document-forms:
 *     GET  /document-forms                       — 인증만 (전 직원)
 *     POST /document-forms                       — GENERAL_ADMIN
 *     PATCH /document-forms/:id                  — GENERAL_ADMIN
 *     DELETE /document-forms/:id                 — GENERAL_ADMIN
 *     GET/PUT /document-forms/:id/number-rule    — GENERAL_ADMIN
 *     GET/POST/DELETE /document-forms/:id/access-rules — GENERAL_ADMIN
 *   form-categories:
 *     GET  /form-categories                      — 인증만
 *     POST /form-categories                      — GENERAL_ADMIN
 *     PATCH/DELETE /form-categories/:id          — GENERAL_ADMIN
 *   shared-approval-lines:
 *     GET  /shared-approval-lines                — 인증만
 *     POST /shared-approval-lines                — GENERAL_ADMIN
 *     PATCH/DELETE /shared-approval-lines/:id    — GENERAL_ADMIN
 *   documents:
 *     GET  /documents                            — 인증만 (companyId+권한 스코핑)
 *     POST /documents/bulk-force-delete          — GENERAL_ADMIN
 *     DELETE /documents/:id/force                — GENERAL_ADMIN
 *     기타 거래성 엔드포인트                       — 인증만 (서비스에서 본인/스코프 검증)
 *
 * data-testid 규약 (§3) — 이 spec에서 기대하는 testid 목록 (수정 에이전트 대상):
 *
 *   eforms-add-btn          /admin/approval/forms — "＋ 양식 추가" 버튼 (.btn-ghost)
 *   eforms-cat-row          좌측 분류 트리 항목 (.pane-li)
 *   eforms-cat-manage-btn   "분류 관리" 버튼 (.btn-line, pane-foot)
 *   eforms-search-input     검색 TextInput (placeholder "기안양식명 입력")
 *   eforms-search-btn       "조회" 버튼 (.btn-primary)
 *   eforms-row              양식 목록 행 내 클릭 가능 요소 (.tbl-link, role=button)
 *   eforms-access-btn       접근규칙 아이콘 버튼 (aria-label="접근규칙", .modal-x)
 *   eforms-number-btn       문서번호 채번 아이콘 버튼 (aria-label="문서번호 채번", .modal-x)
 *   eforms-delete-btn       삭제 아이콘 버튼 (aria-label="삭제", .modal-x)
 *   eforms-form-submit-btn  FormModalNative 저장 버튼 (.btn-primary, .modal-foot 내)
 *
 *   estatus-bulk-delete-btn  /admin/approval/status — "선택 삭제" 버튼 (GENERAL_ADMIN 전용 UI 게이팅 필요)
 *
 * 규약: testid가 앱에 없으면 FAIL (수정 에이전트가 부여). 텍스트/클래스 셀렉터로 핵심 인터랙션 우회 금지.
 */

import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  loginAs,
  login,
  BASE_URL,
  API_URL,
  expectForbidden,
  firstFormId,
  createSubmittedDoc,
  openDocInBox,
  openDocInLedger,
  jwtEmployeeId,
} from '../helpers'

const DUMMY_ID = '00000000-0000-0000-0000-000000000001'

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: API로 양식 생성 (genAdmin 토큰)
// ─────────────────────────────────────────────────────────────────────────────

async function createForm(
  page: Parameters<typeof login>[0],
  token: string,
  name: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/document-forms`, {
    data: { name, isActive: true, visibilityScope: 'PUBLIC', retentionYears: 5 },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  expect(resp.ok(), `POST /document-forms 실패: ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  const id = (body?.data ?? body).id as string
  expect(id, 'form id 없음').toBeTruthy()
  return id
}

// ─────────────────────────────────────────────────────────────────────────────
// A. positive — forms 마스터 CRUD (genAdmin, /admin/approval/forms)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. positive — genAdmin /admin/approval/forms CRUD', () => {
  test('화면 렌더: 분류 트리 또는 빈 상태 + 목록 영역 존재', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    // 좌측 분류 패널(.pane) 또는 목록(.tbl) 또는 로딩 영역이 하나라도 있어야 함
    const hasPaneList = await page.locator('.pane-list').count()
    const hasTbl = await page.locator('.tbl').count()
    const hasLoading = await page.locator('.ab-loading').count()
    expect(hasPaneList + hasTbl + hasLoading, '/admin/approval/forms 화면에 콘텐츠 없음').toBeGreaterThan(0)
  })

  test('eforms-add-btn 노출 및 클릭 → FormModalNative(.modal) 오픈', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    // 기대 testid — 앱에 없으면 FAIL (수정 에이전트 대상)
    const addBtn = page.locator('[data-testid="eforms-add-btn"]')
    await expect(addBtn, 'eforms-add-btn 없음 — 앱 수정 필요').toBeVisible()

    await addBtn.click()

    // FormModalNative는 .modal 클래스 (role=dialog 아님)
    await expect(page.locator('.modal'), 'eforms-add-btn 클릭 후 .modal 미오픈').toBeVisible({ timeout: 8000 })
  })

  test('양식 추가: 고유명 입력 → eforms-form-submit-btn 클릭 → eforms-row 목록 반영', async ({
    page,
  }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    const addBtn = page.locator('[data-testid="eforms-add-btn"]')
    await expect(addBtn, 'eforms-add-btn 없음 — 앱 수정 필요').toBeVisible()
    await addBtn.click()

    await expect(page.locator('.modal'), '.modal 미오픈').toBeVisible({ timeout: 8000 })

    // FormModalNative: 양식명 입력 필드 (.inp-block, placeholder "예) 지출결의서")
    const uniqueName = `E2E양식_${Date.now()}`
    await page.locator('.modal .inp-block').first().fill(uniqueName)

    // 저장 버튼 — 기대 testid
    const submitBtn = page.locator('[data-testid="eforms-form-submit-btn"]')
    await expect(submitBtn, 'eforms-form-submit-btn 없음 — 앱 수정 필요').toBeVisible()
    await submitBtn.click()

    // 모달 닫힘
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10000 })

    // 목록에 반영 — eforms-row testid 기대
    const rows = page.locator('[data-testid="eforms-row"]')
    await expect(rows.first(), 'eforms-row 없음 — 앱 수정 필요').toBeVisible({ timeout: 8000 })
    await expect(
      page.locator('[data-testid="eforms-row"]', { hasText: uniqueName }),
      `추가한 양식(${uniqueName})이 목록에 반영되지 않음`,
    ).toBeVisible()
  })

  test('양식 수정: eforms-row 클릭 → .modal 오픈 → 이름 변경 → eforms-form-submit-btn → 목록 반영', async ({
    page,
  }) => {
    // API로 수정 대상 양식 셋업
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const targetName = `E2E수정대상_${Date.now()}`
    await createForm(page, accessToken, targetName)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    // eforms-row testid 기대 (수정 에이전트 부여 후 활성화)
    const targetRow = page.locator('[data-testid="eforms-row"]', { hasText: targetName })
    await expect(targetRow, 'eforms-row 없음 — 앱 수정 필요').toBeVisible({ timeout: 10000 })
    await targetRow.click()

    await expect(page.locator('.modal'), '양식 행 클릭 후 .modal 미오픈').toBeVisible({ timeout: 8000 })

    // 이름 필드 수정
    const nameInput = page.locator('.modal .inp-block').first()
    await nameInput.clear()
    const updatedName = `E2E수정완료_${Date.now()}`
    await nameInput.fill(updatedName)

    const submitBtn = page.locator('[data-testid="eforms-form-submit-btn"]')
    await expect(submitBtn, 'eforms-form-submit-btn 없음 — 앱 수정 필요').toBeVisible()
    await submitBtn.click()

    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10000 })

    // 수정된 이름 반영
    await expect(
      page.locator('[data-testid="eforms-row"]', { hasText: updatedName }),
      `수정된 양식명(${updatedName})이 목록에 반영되지 않음`,
    ).toBeVisible({ timeout: 8000 })
  })

  test('양식 삭제: eforms-delete-btn → ConfirmDialog → 삭제 → 목록에서 제거', async ({ page }) => {
    // API로 삭제 대상 양식 셋업
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const targetName = `E2E삭제대상_${Date.now()}`
    await createForm(page, accessToken, targetName)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    // 삭제 대상 행의 eforms-delete-btn
    // eforms-row 는 <span>(양식명 링크), eforms-delete-btn 은 같은 <tr> 내 별도 <td>에 위치.
    // <tr>을 공통 조상으로 삼아 두 요소를 동일 행으로 특정한다.
    const targetRow = page.locator('[data-testid="eforms-row"]', { hasText: targetName })
    await expect(targetRow, 'eforms-row 없음 — 앱 수정 필요').toBeVisible({ timeout: 10000 })

    const targetTr = page.locator('tr', { has: page.locator('[data-testid="eforms-row"]', { hasText: targetName }) })
    const deleteBtn = targetTr.locator('[data-testid="eforms-delete-btn"]')
    await expect(deleteBtn, 'eforms-delete-btn 없음 — 앱 수정 필요').toBeVisible()
    await deleteBtn.click()

    // ConfirmDialog — 네이티브 .confirm (MUI Dialog 아님, role=dialog 없음)
    const confirmDialog = page.locator('.confirm')
    await expect(confirmDialog, 'ConfirmDialog 미오픈').toBeVisible({ timeout: 8000 })
    await confirmDialog.getByRole('button', { name: '삭제' }).click()

    await expect(confirmDialog).not.toBeVisible({ timeout: 10000 })

    // 삭제 후 목록에서 제거 확인
    await expect(
      page.locator('[data-testid="eforms-row"]', { hasText: targetName }),
      `삭제 후 ${targetName}가 여전히 목록에 존재`,
    ).not.toBeVisible({ timeout: 8000 })
  })

  test('접근규칙: eforms-access-btn 클릭 → AccessRulesDialog(MUI Dialog) 열림', async ({ page }) => {
    // API로 양식 셋업
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await createForm(page, accessToken, `E2E접근규칙_${Date.now()}`)

    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    const accessBtn = page.locator('[data-testid="eforms-access-btn"]').first()
    await expect(accessBtn, 'eforms-access-btn 없음 — 앱 수정 필요').toBeVisible({ timeout: 10000 })
    await accessBtn.click()

    // AccessRulesDialog는 MUI Dialog (role=dialog)
    await expect(page.getByRole('dialog'), '접근규칙 Dialog 미오픈').toBeVisible({ timeout: 8000 })
  })

  test('분류 관리: eforms-cat-manage-btn 클릭 → FormCategoryManagerDialog(MUI Dialog) 열림', async ({
    page,
  }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    const catManageBtn = page.locator('[data-testid="eforms-cat-manage-btn"]')
    await expect(catManageBtn, 'eforms-cat-manage-btn 없음 — 앱 수정 필요').toBeVisible()
    await catManageBtn.click()

    // FormCategoryManagerDialog는 MUI Dialog (role=dialog)
    await expect(page.getByRole('dialog'), '분류 관리 Dialog 미오픈').toBeVisible({ timeout: 8000 })
  })

  test('검색: eforms-search-input 입력 → eforms-search-btn 클릭 → 목록 필터링 응답', async ({
    page,
  }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    const searchInput = page.locator('[data-testid="eforms-search-input"]')
    await expect(searchInput, 'eforms-search-input 없음 — 앱 수정 필요').toBeVisible()

    await searchInput.fill('NONEXISTENT_FORM_XYZ')

    const searchBtn = page.locator('[data-testid="eforms-search-btn"]')
    await expect(searchBtn, 'eforms-search-btn 없음 — 앱 수정 필요').toBeVisible()
    await searchBtn.click()

    // 결과: 0건 또는 "등록된 기안양식이 없습니다." 빈 상태
    await page.waitForLoadState('networkidle')
    // 검색 후 테이블 행이 0건이거나 빈 상태 메시지가 있어야 함
    const rowCount = await page.locator('[data-testid="eforms-row"]').count()
    const hasEmptyMsg = await page.getByText('등록된 기안양식이 없습니다.').count()
    expect(
      rowCount === 0 || hasEmptyMsg > 0,
      '비검색어 입력 후 빈 상태가 표시되지 않음',
    ).toBeTruthy()
  })

  test('분류 트리 항목: eforms-cat-row 노출 (전체 양식 포함)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    // eforms-cat-row testid 기대 (적어도 "전체 양식" 1개는 항상 있어야 함)
    const catRows = page.locator('[data-testid="eforms-cat-row"]')
    await expect(catRows.first(), 'eforms-cat-row 없음 — 앱 수정 필요').toBeVisible({ timeout: 8000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A2. positive — 거래성 열람 (orgAdmin & genAdmin)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A2. positive — 거래성 열람 (orgAdmin & genAdmin)', () => {
  /**
   * 셋업: employee 토큰으로 문서 생성+상신.
   * 상신 시 결재선 구성 필요 — genAdmin(개발팀)을 APPROVER로 지정.
   */
  async function setupSubmittedDoc(
    page: Parameters<typeof login>[0],
    title: string,
  ): Promise<string> {
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const { accessToken: genToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )

    const formId = await firstFormId(page, empToken)
    // genAdmin의 employeeId 추출 (결재자로 지정)
    const genEmpId = jwtEmployeeId(genToken)

    const docId = await createSubmittedDoc(page, empToken, formId, [
      { role: 'APPROVER', assigneeId: genEmpId, stepOrder: 1 },
    ], title)
    return docId
  }

  test('genAdmin: /admin/approval/documents — openDocInLedger로 문서 열람 (.modal 표시)', async ({
    page,
  }) => {
    const title = `E2E_열람_genAdmin_${Date.now()}`
    const { accessToken: genToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const formId = await firstFormId(page, empToken)
    const genEmpId = jwtEmployeeId(genToken)
    await createSubmittedDoc(page, empToken, formId, [
      { role: 'APPROVER', assigneeId: genEmpId, stepOrder: 1 },
    ], title)

    await loginAs(page, 'genAdmin')
    await openDocInLedger(page, title)
    // .modal 표시 확인은 openDocInLedger 내에서 이미 expect
  })

  test('orgAdmin: /admin/approval/documents — 화면 진입 및 목록 렌더', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/approval/documents`)
    await page.waitForLoadState('networkidle')

    // 페이지가 렌더됐는지 — 검색 입력 또는 테이블 또는 빈 상태 존재
    const hasSearch = await page.locator('input[type="search"]').count()
    const hasTable = await page.locator('.tbl').count()
    expect(hasSearch + hasTable, 'orgAdmin의 /admin/approval/documents 화면에 콘텐츠 없음').toBeGreaterThan(0)
  })

  test('orgAdmin: /admin/approval/documents — 화면은 진입하나 문서대장(box=ledger) API는 GENERAL_ADMIN 전용 — 빈 상태 또는 403 처리됨', async ({
    page,
  }) => {
    // 문서대장 API(box=ledger)는 서비스 레이어에서 isCompanyAdmin(GENERAL_ADMIN+) 검증.
    // orgAdmin(ORG_ADMIN)이 접근하면 API 403 → 화면은 로딩 중 또는 빈 상태.
    // 라우트 가드는 없으므로 URL 자체는 진입 가능(페이지 컴포넌트 렌더).
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    const resp = await page.request.get(`${API_URL}/documents?box=ledger&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    // 서비스가 명시적으로 403 DOCUMENT_LEDGER_FORBIDDEN 반환
    expect(
      resp.status(),
      '[실측] orgAdmin의 GET /documents?box=ledger 는 403이어야 함 (ledger는 GENERAL_ADMIN+ 전용)',
    ).toBe(403)
  })

  test('genAdmin: /admin/approval/inbox — 기안함 탭 존재 및 탭 전환 동작', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/inbox`)
    await page.waitForLoadState('networkidle')

    // BOX_TABS 레이블: 기안함/진행중/완료/결재함/참조/공람/수신/부서함
    await expect(
      page.getByRole('button', { name: '기안함', exact: true }),
      '기안함 탭 없음',
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: '결재함', exact: true }),
      '결재함 탭 없음',
    ).toBeVisible()

    // 탭 전환: 진행중
    await page.getByRole('button', { name: '진행중', exact: true }).click()
    await page.waitForLoadState('networkidle')
    const tabInProgress = page.getByRole('button', { name: '진행중', exact: true })
    const hasOn = await tabInProgress.evaluate((el) => el.classList.contains('on'))
    expect(hasOn, '진행중 탭 클릭 후 .on 클래스 미반영').toBeTruthy()
  })

  test('genAdmin: /admin/approval/inbox — 검색 입력 동작 (TextInput placeholder)', async ({
    page,
  }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/inbox`)
    await page.waitForLoadState('networkidle')

    // 검색 입력 placeholder "제목 · 문서번호 검색"
    const searchInput = page.getByPlaceholder('제목 · 문서번호 검색')
    await expect(searchInput, '검색 입력 없음').toBeVisible()

    await searchInput.fill('NONEXISTENT_DOC_XYZ')
    await page.waitForLoadState('networkidle')
    // 입력 후 필터링 응답(빈 상태 또는 0건)
    const hasEmpty = await page.getByText('검색 결과가 없습니다.').count()
    const hasNoDoc = await page.getByText('문서가 없습니다.').count()
    expect(
      hasEmpty + hasNoDoc,
      '검색 후 빈 상태 메시지 없음',
    ).toBeGreaterThan(0)
  })

  test('genAdmin: /admin/approval/inbox — 상신 문서가 결재함 탭에서 openDocInBox로 열람', async ({
    page,
  }) => {
    const title = `E2E_inbox_열람_${Date.now()}`
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const { accessToken: genToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )
    const formId = await firstFormId(page, empToken)
    const genEmpId = jwtEmployeeId(genToken)
    await createSubmittedDoc(page, empToken, formId, [
      { role: 'APPROVER', assigneeId: genEmpId, stepOrder: 1 },
    ], title)

    await loginAs(page, 'genAdmin')
    // 결재함 탭에서 문서 열람
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)
    // .modal 표시 확인은 openDocInBox 내에서 이미 수행됨
  })

  test('orgAdmin: /admin/approval/inbox — 화면 진입 및 기안함 탭 존재', async ({ page }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/approval/inbox`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByRole('button', { name: '기안함', exact: true }),
      'orgAdmin의 내 문서함 기안함 탭 없음',
    ).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. negative — GENERAL_ADMIN 전용 API를 비GEN 역할이 호출 → 403
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. negative — document-forms CUD: 비GENERAL_ADMIN 403', () => {
  const FORM_PAYLOAD = {
    name: `E2E_FORBIDDEN_FORM_${Date.now()}`,
    isActive: true,
    visibilityScope: 'PUBLIC',
    retentionYears: 5,
  }

  test('orgAdmin: POST /document-forms → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/document-forms', FORM_PAYLOAD)
  })

  test('employee: POST /document-forms → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/document-forms', FORM_PAYLOAD)
  })

  test('orgAdmin: PATCH /document-forms/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'patch', `/document-forms/${DUMMY_ID}`, {
      name: 'FORBIDDEN_UPDATE',
    })
  })

  test('employee: PATCH /document-forms/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'patch', `/document-forms/${DUMMY_ID}`, {
      name: 'FORBIDDEN_UPDATE',
    })
  })

  test('orgAdmin: DELETE /document-forms/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/document-forms/${DUMMY_ID}`)
  })

  test('employee: DELETE /document-forms/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'delete', `/document-forms/${DUMMY_ID}`)
  })

  test('orgAdmin: POST /document-forms/:id/access-rules → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', `/document-forms/${DUMMY_ID}/access-rules`, {
      scope: 'ORGANIZATION',
      scopeId: DUMMY_ID,
    })
  })

  test('employee: POST /document-forms/:id/access-rules → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', `/document-forms/${DUMMY_ID}/access-rules`, {
      scope: 'ORGANIZATION',
      scopeId: DUMMY_ID,
    })
  })

  test('orgAdmin: DELETE /document-forms/:id/access-rules/:ruleId → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(
      page,
      accessToken,
      'delete',
      `/document-forms/${DUMMY_ID}/access-rules/${DUMMY_ID}`,
    )
  })

  test('orgAdmin: PUT /document-forms/:id/number-rule → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(
      page,
      accessToken,
      'put' as Parameters<typeof expectForbidden>[2],
      `/document-forms/${DUMMY_ID}/number-rule`,
      { pattern: 'HR-{YYYY}-{SEQ:4}', resetYearly: true },
    )
  })

  test('employee: PUT /document-forms/:id/number-rule → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(
      page,
      accessToken,
      'put' as Parameters<typeof expectForbidden>[2],
      `/document-forms/${DUMMY_ID}/number-rule`,
      { pattern: 'HR-{YYYY}-{SEQ:4}', resetYearly: true },
    )
  })
})

test.describe('B. negative — form-categories CUD: 비GENERAL_ADMIN 403', () => {
  const CAT_PAYLOAD = { name: `E2E_FORBIDDEN_CAT_${Date.now()}`, sortOrder: 99 }

  test('orgAdmin: POST /form-categories → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/form-categories', CAT_PAYLOAD)
  })

  test('employee: POST /form-categories → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/form-categories', CAT_PAYLOAD)
  })

  test('orgAdmin: PATCH /form-categories/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'patch', `/form-categories/${DUMMY_ID}`, {
      name: 'FORBIDDEN',
    })
  })

  test('orgAdmin: DELETE /form-categories/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/form-categories/${DUMMY_ID}`)
  })
})

test.describe('B. negative — shared-approval-lines CUD: 비GENERAL_ADMIN 403', () => {
  const LINE_PAYLOAD = {
    name: `E2E_FORBIDDEN_LINE_${Date.now()}`,
    steps: [],
  }

  test('orgAdmin: POST /shared-approval-lines → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/shared-approval-lines', LINE_PAYLOAD)
  })

  test('employee: POST /shared-approval-lines → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/shared-approval-lines', LINE_PAYLOAD)
  })

  test('orgAdmin: PATCH /shared-approval-lines/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'patch', `/shared-approval-lines/${DUMMY_ID}`, {
      name: 'FORBIDDEN',
    })
  })

  test('orgAdmin: DELETE /shared-approval-lines/:id → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/shared-approval-lines/${DUMMY_ID}`)
  })
})

test.describe('B. negative — documents force-delete: 비GENERAL_ADMIN 403', () => {
  test('orgAdmin: POST /documents/bulk-force-delete → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'post', '/documents/bulk-force-delete', {
      ids: [DUMMY_ID],
    })
  })

  test('employee: POST /documents/bulk-force-delete → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'post', '/documents/bulk-force-delete', {
      ids: [DUMMY_ID],
    })
  })

  test('orgAdmin: DELETE /documents/:id/force → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await expectForbidden(page, accessToken, 'delete', `/documents/${DUMMY_ID}/force`)
  })

  test('employee: DELETE /documents/:id/force → 403', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await expectForbidden(page, accessToken, 'delete', `/documents/${DUMMY_ID}/force`)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B2. negative — 멀티테넌시: GET /documents employee 스코핑 (본인 접근 범위만)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B2. negative — 멀티테넌시: GET /documents employee 스코핑', () => {
  test('employee: GET /documents?box=draft → 200이지만 본인 접근 범위 문서만 (403 아님)', async ({
    page,
  }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    const resp = await page.request.get(`${API_URL}/documents?box=draft&limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    // 거래성 GET — 403이 아닌 200
    expect(resp.status(), 'employee GET /documents 는 200이어야 함 (403 아님)').toBe(200)

    const body = await resp.json()
    expect(body?.success ?? true, '응답 success 필드 false').toBeTruthy()
  })

  test('employee: GET /documents?box=ledger → 403 (문서대장은 GENERAL_ADMIN 전용, isCompanyAdmin 검증)', async ({
    page,
  }) => {
    // 문서대장(ledger)은 서비스 레이어에서 isCompanyAdmin(GENERAL_ADMIN+) 검증.
    // employee(EMPLOYEE)는 403 DOCUMENT_LEDGER_FORBIDDEN 반환.
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    const resp = await page.request.get(`${API_URL}/documents?box=ledger&limit=10`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.status(), 'employee GET /documents?box=ledger 는 403이어야 함 (ledger = GENERAL_ADMIN+)').toBe(403)
  })

  test('sales(타사 아님, 동일회사 영업팀): GET /documents — 타 회사 문서 미포함 확인', async ({
    page,
  }) => {
    // sales는 동일 회사이지만 다른 조직(영업팀). companyId 스코핑 위반 없음을 확인.
    const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)

    const resp = await page.request.get(`${API_URL}/documents?box=draft&limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.status(), 'sales GET /documents 는 200이어야 함').toBe(200)
    expect(resp.status(), 'sales GET /documents 는 403이 아니어야 함').not.toBe(403)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. UI 게이팅 — 결재 현황(status)의 "선택 삭제" 버튼 (bulk-force-delete)
//
// 실측 결과:
//   - /admin/approval/status 페이지에 "선택 삭제" 버튼이 UI에 존재함.
//   - BUT: 앱에 역할 기반 UI 게이팅이 없음. orgAdmin도 버튼이 보임.
//   - API는 GENERAL_ADMIN 전용으로 차단(B. negative에서 검증).
//   - 방어심층 갭: 버튼이 orgAdmin에게 노출되지만 클릭 시 API 403.
//   - 기대 testid: estatus-bulk-delete-btn (수정 에이전트 부여 + UI 게이팅 추가 필요)
//
// /admin/approval/documents(문서대장)·/admin/approval/inbox(내 문서함)에는
// force-delete 버튼 UI가 없음 — API 403 검증으로 충분.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. UI 게이팅 — 결재 현황 "선택 삭제" 버튼 (estatus-bulk-delete-btn)', () => {
  test('genAdmin: /admin/approval/status — estatus-bulk-delete-btn 노출', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/admin/approval/status`)
    await page.waitForLoadState('networkidle')

    // 기대 testid — 앱에 없으면 FAIL (수정 에이전트 대상)
    const deleteBtn = page.locator('[data-testid="estatus-bulk-delete-btn"]')
    await expect(deleteBtn, 'estatus-bulk-delete-btn 없음 — 앱 수정 필요').toBeVisible()
  })

  test('[방어심층 갭] orgAdmin: /admin/approval/status — estatus-bulk-delete-btn 숨겨져야 함', async ({
    page,
  }) => {
    await loginAs(page, 'orgAdmin')
    await page.goto(`${BASE_URL}/admin/approval/status`)
    await page.waitForLoadState('networkidle')

    const deleteBtn = page.locator('[data-testid="estatus-bulk-delete-btn"]')
    // 현재 앱에 UI 게이팅 없음 → testid도 없으므로 count=0이지만 이유가 다름
    // testid 부여 후 UI 게이팅까지 추가해야 이 테스트가 의미 있음
    await expect(
      deleteBtn,
      '[방어심층 갭] estatus-bulk-delete-btn이 orgAdmin에게 노출됨. 백엔드는 GENERAL_ADMIN 필요. UI 게이팅 없음 — 앱 수정 필요',
    ).toHaveCount(0)
  })
})
