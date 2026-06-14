/**
 * AbleWork ERP — 전자결재 추가 흐름 E2E (Phase 2 T1·T2)
 *
 * T1 회수(recall): 기안자가 상신 문서를 회수 → RECALLED.
 * T2 부서협조(dept-collab): 부서 문서담당자가 부서함에서 부서협조 완료 → APPROVED.
 *
 * 전략: 문서 셋업은 API, 핵심 액션만 UI, 결과는 API로 검증(플래키 최소화).
 * 전제: web(3000)/api(3001)/DB 기동 + 시드 계정.
 */
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'
const API_URL = 'http://localhost:3001/api/v1'
const EMPLOYEE = { email: 'employee@ablework.io', password: 'employee1234!' }
const ADMIN = { email: 'admin@ablework.io', password: 'admin1234!' }
const ORG_ADMIN = { email: 'orgadmin@ablework.io', password: 'orgadmin1234!' }

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

function jwtEmployeeId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'))
  return payload.employeeId as string
}

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
  return (forms.find((f) => f.isActive !== false) ?? forms[0]).id
}

async function createDoc(
  page: Page,
  empToken: string,
  formId: string,
  steps: unknown[],
  title: string,
): Promise<string> {
  const created = await (
    await page.request.post(`${API_URL}/documents`, {
      data: { formId, title, content: { body: 'E2E 문서 흐름 테스트' } },
      headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    })
  ).json()
  const documentId = (created?.data ?? created).id as string
  const submit = await page.request.post(`${API_URL}/documents/${documentId}/submit`, {
    data: { steps },
    headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
  })
  expect(submit.ok()).toBeTruthy()
  return documentId
}

async function docStatus(page: Page, token: string, documentId: string): Promise<string> {
  const body = await (
    await page.request.get(`${API_URL}/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
  return (body?.data ?? body).status as string
}

/** 문서함 화면에서 탭 전환 + 검색으로 문서를 찾아 상세 다이얼로그를 연다 */
async function openDocInBox(page: Page, boxPath: string, tabName: string, title: string) {
  await page.goto(`${BASE_URL}${boxPath}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('tab', { name: tabName }).click()
  await page.getByPlaceholder('제목 · 문서번호 검색').fill(title)
  const card = page.getByText(title, { exact: false }).first()
  await expect(card).toBeVisible({ timeout: 10000 })
  await card.click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('전자결재 추가 흐름 (T1·T2)', () => {
  let adminTokens: { accessToken: string; refreshToken: string }
  let empTokens: { accessToken: string; refreshToken: string }
  let adminEmployeeId: string
  let orgAdminEmployeeId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ADMIN.email, ADMIN.password)
    empTokens = await login(page, EMPLOYEE.email, EMPLOYEE.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    orgAdminEmployeeId = jwtEmployeeId((await login(page, ORG_ADMIN.email, ORG_ADMIN.password)).accessToken)
    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  test('T1 회수: 기안자가 진행중 문서를 회수하면 RECALLED 된다', async ({ page }) => {
    const title = `E2E 회수 ${Date.now()}`
    const docId = await createDoc(
      page, empTokens.accessToken, formId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    await uiLogin(page, EMPLOYEE.email, EMPLOYEE.password)
    await openDocInBox(page, '/me/documents', '진행중', title)

    await page.getByRole('button', { name: '회수', exact: true }).click()
    // 회수 확인 다이얼로그
    const confirm = page.getByRole('dialog').filter({ hasText: '회수하시겠습니까' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: '회수', exact: true }).click()

    await expect
      .poll(() => docStatus(page, empTokens.accessToken, docId), { timeout: 10000 })
      .toBe('RECALLED')
  })

  test('T2 참조 확인: 참조자가 참조함에서 확인하면 해당 단계가 VIEWED 된다', async ({ page }) => {
    // 기안자=employee, 결재=admin, 참조=orgAdmin 인 문서 상신
    const title = `E2E 참조 ${Date.now()}`
    const docId = await createDoc(
      page, empTokens.accessToken, formId,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'REFERENCE', assigneeId: orgAdminEmployeeId, stepOrder: 2 },
      ],
      title,
    )

    // 참조자(orgAdmin)가 참조함에서 확인
    await uiLogin(page, ORG_ADMIN.email, ORG_ADMIN.password)
    await openDocInBox(page, '/me/documents', '참조', title)
    await page.getByRole('button', { name: '확인', exact: true }).click()

    // 참조 단계가 VIEWED 처리되었는지 API로 검증
    await expect
      .poll(async () => {
        const body = await (
          await page.request.get(`${API_URL}/documents/${docId}`, {
            headers: { Authorization: `Bearer ${adminTokens.accessToken}` },
          })
        ).json()
        const doc = body?.data ?? body
        const steps = (doc.approvalLines ?? []).flatMap((l: { steps: unknown[] }) => l.steps)
        const ref = steps.find((s: { role: string }) => s.role === 'REFERENCE') as
          | { status: string }
          | undefined
        return ref?.status
      }, { timeout: 10000 })
      .toBe('VIEWED')
  })
})
