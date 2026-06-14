/**
 * AbleWork ERP — 전자결재 결재 처리 UI E2E (Phase 2 G13)
 *
 * 갭(PHASE2_GAP_ANALYSIS.md): BE supertest e2e는 승인 플로우를 커버하나
 * FE에서 실제 승인/반려 버튼을 클릭하는 Playwright E2E가 없었다 — 이를 보강한다.
 *
 * 전략(결정적): 문서 생성·상신은 API로 셋업하고, **승인/반려 클릭만 UI로 구동**한 뒤
 * 결과(문서 상태)는 API로 검증해 UI 텍스트 의존 플래키를 줄인다.
 *
 * 전제: web(3000)/api(3001)/DB 기동 + 시드(admin@ablework.io, employee@ablework.io).
 */
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'
const API_URL = 'http://localhost:3001/api/v1'

const EMPLOYEE = { email: 'employee@ablework.io', password: 'employee1234!' }
const ADMIN = { email: 'admin@ablework.io', password: 'admin1234!' }

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
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

/** JWT payload에서 employeeId 추출 (별도 me 엔드포인트가 없어 토큰을 디코드) */
function jwtEmployeeId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'))
  return payload.employeeId as string
}

/**
 * UI 로그인 — 쿠키 주입만으로는 Zustand authStore(skipHydration)가 채워지지 않아
 * 결재 액션 노출 조건(myPendingStep = user.employeeId 매칭)이 성립하지 않는다.
 * 실제 로그인 폼을 거쳐 store를 정상 하이드레이트한다.
 */
async function uiLogin(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(/\/(admin|me)\//, { timeout: 20000 })
}

async function firstFormId(page: Page, token: string): Promise<string> {
  const resp = await page.request.get(`${API_URL}/document-forms`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await resp.json()
  const forms = (body?.data ?? body) as Array<{ id: string; isActive?: boolean }>
  const active = forms.find((f) => f.isActive !== false) ?? forms[0]
  return active.id
}

/** 직원이 관리자(approver)를 결재자로 지정한 독립 문서를 생성·상신하고 documentId 반환 */
async function createSubmittedDoc(
  page: Page,
  empToken: string,
  formId: string,
  approverEmployeeId: string,
  title: string,
): Promise<string> {
  const createResp = await page.request.post(`${API_URL}/documents`, {
    data: { formId, title, content: { body: 'E2E 결재 처리 테스트 문서' } },
    headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
  })
  const created = await createResp.json()
  const documentId = (created?.data ?? created).id as string

  const submitResp = await page.request.post(`${API_URL}/documents/${documentId}/submit`, {
    data: { steps: [{ role: 'APPROVER', assigneeId: approverEmployeeId, stepOrder: 1 }] },
    headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
  })
  expect(submitResp.ok()).toBeTruthy()
  return documentId
}

async function getDocStatus(page: Page, token: string, documentId: string): Promise<string> {
  const resp = await page.request.get(`${API_URL}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await resp.json()
  return (body?.data ?? body).status as string
}

/** 관리자 결재함에서 제목으로 문서를 찾아 상세 다이얼로그를 연다 */
async function openDocInInbox(page: Page, title: string) {
  await page.goto(`${BASE_URL}/admin/approval/inbox`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: '결재함' }).click()
  // 디바운스 검색으로 대상 문서만 필터링 (목록 안정화)
  await page.getByPlaceholder('제목 · 문서번호 검색').fill(title)
  const card = page.getByText(title, { exact: false }).first()
  await expect(card).toBeVisible({ timeout: 10000 })
  await card.click()
  // 상세 다이얼로그
  await expect(page.getByRole('dialog')).toBeVisible()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('전자결재 결재 처리 (G13)', () => {
  let adminTokens: { accessToken: string; refreshToken: string }
  let empTokens: { accessToken: string; refreshToken: string }
  let adminEmployeeId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ADMIN.email, ADMIN.password)
    empTokens = await login(page, EMPLOYEE.email, EMPLOYEE.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  test('관리자가 결재함에서 승인 버튼을 클릭하면 문서가 APPROVED 된다', async ({ page }) => {
    const title = `E2E 승인 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page, empTokens.accessToken, formId, adminEmployeeId, title,
    )

    await uiLogin(page, ADMIN.email, ADMIN.password)
    await openDocInInbox(page, title)

    await page.getByRole('button', { name: '승인', exact: true }).click()

    // 결과는 API로 검증 (UI 텍스트 비의존). 처리 반영까지 폴링.
    await expect
      .poll(() => getDocStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  test('관리자가 반려 후 확인 다이얼로그를 승인하면 문서가 REJECTED 된다', async ({ page }) => {
    const title = `E2E 반려 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page, empTokens.accessToken, formId, adminEmployeeId, title,
    )

    await uiLogin(page, ADMIN.email, ADMIN.password)
    await openDocInInbox(page, title)

    // 상세의 반려 버튼 → 확인 다이얼로그(ConfirmDialog)의 반려 버튼
    await page.getByRole('button', { name: '반려', exact: true }).click()
    const confirm = page.getByRole('dialog').filter({ hasText: '반려 처리하시겠습니까' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: '반려', exact: true }).click()

    await expect
      .poll(() => getDocStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('REJECTED')
  })
})
