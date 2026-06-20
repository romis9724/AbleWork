/**
 * AbleWork ERP — 전자결재 결재 처리 UI E2E (Phase 2 G13)
 *
 * 갭(PHASE2_GAP_ANALYSIS.md): BE supertest e2e는 승인 플로우를 커버하나
 * FE에서 실제 승인/반려 버튼을 클릭하는 Playwright E2E가 없었다 — 이를 보강한다.
 *
 * 전략(결정적): 문서 생성·상신은 API로 셋업하고, **승인/반려 클릭만 UI로 구동**한 뒤
 * 결과(문서 상태)는 API로 검증해 UI 텍스트 의존 플래키를 줄인다.
 *
 * UI 주의: DocModal은 확인(Confirm) 다이얼로그 없이 버튼 클릭 즉시 처리한다.
 * 반려/전결 등 의견 필수 액션은 모달 내 의견 textarea를 먼저 채운다.
 *
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
  openDocInBox,
} from './helpers'

const COMMENT_PLACEHOLDER = '결재 의견을 입력하세요 (반려·전결 시 필수)'

test.describe('전자결재 결재 처리 (G13)', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let adminEmployeeId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  test('관리자가 결재함에서 승인 버튼을 클릭하면 문서가 APPROVED 된다', async ({ page }) => {
    const title = `E2E 승인 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)

    await page.getByRole('button', { name: '승인', exact: true }).click()

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  test('관리자가 의견 입력 후 반려하면 문서가 REJECTED 된다', async ({ page }) => {
    const title = `E2E 반려 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)

    // 반려는 의견 필수 — 모달 내 의견 textarea 입력 후 반려 버튼 클릭
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('E2E 반려 사유')
    await page.getByRole('button', { name: '반려', exact: true }).click()

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('REJECTED')
  })
})
