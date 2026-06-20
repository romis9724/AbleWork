/**
 * AbleWork ERP — 전자결재 추가 흐름 E2E (Phase 2 T1·T2)
 *
 * T1 회수(recall): 기안자가 진행중 문서를 회수 → RECALLED.
 * T2 참조 확인(view): 참조자가 참조함에서 확인 처리 → 해당 단계 VIEWED.
 *
 * 전략: 문서 셋업은 API, 핵심 액션만 UI, 결과는 API로 검증(플래키 최소화).
 * UI 주의: DocModal은 확인 다이얼로그 없이 버튼 클릭 즉시 처리한다.
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
  docStatus,
  getSteps,
  openDocInBox,
} from './helpers'

test.describe('전자결재 추가 흐름 (T1·T2)', () => {
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

  test('T1 회수: 기안자가 진행중 문서를 회수하면 RECALLED 된다', async ({ page }) => {
    const title = `E2E 회수 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await openDocInBox(page, '/me/documents', '진행중', title)

    await page.getByRole('button', { name: '회수', exact: true }).click()

    await expect
      .poll(() => docStatus(page, empTokens.accessToken, docId), { timeout: 10000 })
      .toBe('RECALLED')
  })

  test('T2 참조 확인: 참조자가 참조함에서 확인 처리하면 해당 단계가 VIEWED 된다', async ({ page }) => {
    // 기안자=employee, 결재=admin, 참조=orgAdmin 인 문서 상신
    const title = `E2E 참조 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'REFERENCE', assigneeId: orgAdminEmployeeId, stepOrder: 2 },
      ],
      title,
    )

    // 참조자(orgAdmin)가 참조함에서 확인 처리
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '참조', title)
    await page.getByRole('button', { name: '확인 처리', exact: true }).click()

    // 참조 단계가 VIEWED 처리되었는지 API로 검증
    await expect
      .poll(async () => {
        const steps = await getSteps(page, adminTokens.accessToken, docId)
        return steps.find((s) => s.role === 'REFERENCE')?.status
      }, { timeout: 10000 })
      .toBe('VIEWED')
  })
})
