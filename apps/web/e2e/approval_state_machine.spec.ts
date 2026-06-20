/**
 * AbleWork ERP — 전자결재 상태머신 핵심 흐름 E2E (역할별 갭 C-1·C-2·C-3)
 *
 * role-feature-audit.md에서 "동작=E2E #19 대기"로 남아 있던 다단계 결재 전이를 자동화한다.
 *   C-1 전단계 반려(return-prev): 2단계 결재에서 후행 결재자가 직전 결재자에게 결재권을 반환.
 *   C-2 결재취소(cancel-approval): 승인한 결재자가 다음 결재자 처리 전 자기 승인을 취소.
 *   C-3 재상신(resubmit): 회수(RECALLED) 문서를 수정→재상신하여 다시 PENDING.
 *
 * 전략(결정적): 문서 생성/상신/선행 승인은 API로 셋업하고, **반려·취소·재상신 클릭만 UI로
 * 구동**한 뒤 결과(단계·문서 상태)는 API로 검증한다. DocModal은 확인 다이얼로그 없이
 * 버튼 즉시 처리하며, 의견 필수 액션(전단계 반려)은 모달 내 의견 textarea를 먼저 채운다.
 *
 * 진입 경로(박스 필터 실측 기준):
 *   - 결재함(pending_approval)은 "문서 PENDING + 내 단계 PENDING"만 노출 → C-1은 결재함.
 *   - 승인 후 내 단계는 APPROVED가 되어 결재함에서 사라짐 → C-2는 문서대장(ledger)에서 연다.
 *   - RECALLED는 EDITABLE_STATUSES라 기안함(draft)에서 노출 → C-3은 기안함.
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
  getSteps,
  stepStatusAt,
  stepActionApi,
  recallApi,
  openDocInBox,
  openDocInLedger,
} from './helpers'

const COMMENT_PLACEHOLDER = '결재 의견을 입력하세요 (반려·전결 시 필수)'

test.describe('전자결재 상태머신 핵심 흐름 (C-1·C-2·C-3)', () => {
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

  /** 2단계 결재(admin → orgAdmin) 문서를 상신하고, admin이 1단계를 API로 승인까지 진행 */
  async function setupTwoStepApprovedFirst(page: import('@playwright/test').Page, title: string) {
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmployeeId, stepOrder: 2 },
      ],
      title,
    )
    const step1 = (await getSteps(page, adminTokens.accessToken, docId)).find(
      (s) => s.stepOrder === 1,
    )!
    const approve = await stepActionApi(page, adminTokens.accessToken, docId, step1.id, 'approve')
    expect(approve.ok()).toBeTruthy()
    return docId
  }

  test('C-1 전단계 반려: 후행 결재자가 전단계 반려하면 직전 단계가 PENDING으로 복원된다', async ({
    page,
  }) => {
    const title = `E2E 전단계반려 ${Date.now()}`
    const docId = await setupTwoStepApprovedFirst(page, title)

    // 후행 결재자(orgAdmin)가 결재함에서 의견 입력 후 전단계 반려
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('E2E 전단계 반려 사유')
    await page.getByRole('button', { name: '전단계 반려', exact: true }).click()

    // 직전 단계(order1) PENDING 복원, 현재 단계(order2) RETURNED, 문서는 PENDING 유지
    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 1), { timeout: 10000 })
      .toBe('PENDING')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 2)).toBe('RETURNED')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')
  })

  test('C-2 결재취소: 승인한 결재자가 결재취소하면 본인 단계가 PENDING으로 복원된다', async ({
    page,
  }) => {
    const title = `E2E 결재취소 ${Date.now()}`
    const docId = await setupTwoStepApprovedFirst(page, title)

    // admin이 문서대장에서 자기가 승인한 문서를 열어 결재취소(의견 불필요)
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInLedger(page, title)
    await page.getByRole('button', { name: '결재 취소', exact: true }).click()

    // 본인 단계(order1) PENDING 복원, 다음 단계(order2) WAITING, 문서 PENDING 유지
    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 1), { timeout: 10000 })
      .toBe('PENDING')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 2)).toBe('WAITING')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')
  })

  test('C-3 재상신: 회수한 문서를 수정→재상신하면 다시 PENDING 된다', async ({ page }) => {
    const title = `E2E 재상신 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )
    // 기안자가 API로 회수 → RECALLED
    const recall = await recallApi(page, empTokens.accessToken, docId)
    expect(recall.ok()).toBeTruthy()
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('RECALLED')

    // 기안자가 기안함에서 문서 열기 → 수정 모드 → 재상신
    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    await openDocInBox(page, '/me/documents', '기안함', title)
    await page.getByRole('button', { name: '수정', exact: true }).click()
    await page.getByRole('button', { name: '재상신', exact: true }).click()

    await expect
      .poll(() => docStatus(page, empTokens.accessToken, docId), { timeout: 10000 })
      .toBe('PENDING')
  })
})
