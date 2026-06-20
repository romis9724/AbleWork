/**
 * AbleWork ERP — 전자결재 공람/참조 사후 추가 E2E (역할별 갭 C-8)
 *
 * C-8: 기안자가 진행중 문서를 열어 타 직원을 공람(VIEWER)으로 사후 추가 → cc step 생성.
 * (기존 공람/참조 추가는 본인만 가능했던 갭을 직원 picker로 해소한 것을 검증)
 *
 * 전략: 문서 셋업은 API, 공람 추가 클릭만 UI, 결과(VIEWER step 생성)는 API로 검증.
 * 전제: web/api/DB 기동 + 시드 계정. 포트는 helpers.ts(env 오버라이드).
 */
import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  type Tokens,
  login,
  jwtEmployeeId,
  uiLogin,
  firstFormId,
  createSubmittedDoc,
  getSteps,
  openDocInBox,
} from './helpers'

test.describe('전자결재 공람 사후 추가 (C-8)', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let adminEmployeeId: string
  let orgAdminEmployeeId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    orgAdminEmployeeId = jwtEmployeeId(
      (await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)).accessToken,
    )
    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  test('기안자가 진행중 문서에 타 직원을 공람으로 추가하면 VIEWER 단계가 생성된다', async ({
    page,
  }) => {
    const title = `E2E 공람추가 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    // 상신 직후엔 공람(VIEWER) 단계가 없다
    const before = await getSteps(page, empTokens.accessToken, docId)
    expect(before.filter((s) => s.role === 'VIEWER')).toHaveLength(0)

    // 기안자가 진행중함에서 문서를 열어 orgAdmin을 공람으로 추가
    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await openDocInBox(page, '/me/documents', '진행중', title)

    const ccSection = page.locator('.doc-field', { hasText: '참조 · 공람' })
    await ccSection.locator('select.sel').first().selectOption(orgAdminEmployeeId)
    await ccSection.locator('select.sel').nth(1).selectOption('VIEWER')
    await ccSection.getByRole('button', { name: '추가', exact: true }).click()

    // VIEWER 단계가 생성됐는지 API로 검증
    await expect
      .poll(
        async () => {
          const steps = await getSteps(page, empTokens.accessToken, docId)
          return steps.filter((s) => s.role === 'VIEWER').length
        },
        { timeout: 10000 },
      )
      .toBeGreaterThan(0)
  })
})
