/**
 * AbleWork ERP — 결재라인 구성 × 결과 조합 E2E
 *
 * 결재라인을 다양하게 구성하고 핵심 액션(승인·반려·전단계반려·결재취소)의
 * 결과를 검증한다. 핵심 처리 액션은 가능하면 uiLogin 후 DocModal UI 클릭으로,
 * 검증은 getSteps/docStatus API로 수행한다.
 *
 * 케이스:
 *   A1 단일 APPROVER(admin) 승인 → 문서 APPROVED
 *   A2 2단계 순차(admin→orgadmin) 상신 직후 step 상태 검증 + 전원 승인 → APPROVED
 *   A3 3단계 순차, 2단계에서 반려 → REJECTED, 3단계 CANCELLED
 *   A4 3단계, 3단계 결재자가 전단계 반려 → 2단계 PENDING 복원
 *   A5 2단계 승인 후 1단계 결재자가 결재취소 → 1단계 PENDING 복원, 2단계 WAITING
 *   A6 3단계 혼합 라인(orgadmin→sales→admin) 전원 순차 승인 → APPROVED
 *
 * 전략:
 *  - 문서 생성·상신·선행 단계 API 셋업은 헬퍼 API로.
 *  - 핵심 결재 액션(승인/반려/전단계반려/결재취소)은 UI(DocModal 버튼)로 구동.
 *  - 결과 단언은 getSteps/docStatus API로.
 *  - UI가 노출 조건(Zustand authStore myPendingStep)을 충족해야 하므로 결재자 계정으로
 *    uiLogin 후 결재함/문서대장에서 DocModal을 연다.
 *
 * UI 진입 경로(DocModal 버튼 노출 조건 기준):
 *  - 결재 대기(PENDING step): /me/documents 결재함 — PENDING + 내 단계 PENDING
 *  - 결재취소(승인 후 되돌리기): /admin/approval/documents 문서대장
 *  - 반려는 /me/documents 결재함 또는 /admin/approval/inbox 결재함
 *
 * 전제: web(4000)/api(4001)/DB 기동 + 시드 계정.
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
  openDocInBox,
  openDocInLedger,
} from './helpers'

const COMMENT_PLACEHOLDER = '결재 의견을 입력하세요 (반려·전결 시 필수)'

test.describe('결재라인 구성 × 결과 조합 (A1–A6)', () => {
  let adminTokens: Tokens
  let genAdminTokens: Tokens
  let orgAdminTokens: Tokens
  let empTokens: Tokens
  let salesTokens: Tokens

  let adminEmpId: string
  let orgAdminEmpId: string
  let salesEmpId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    genAdminTokens = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    orgAdminTokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    salesTokens = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)

    adminEmpId = jwtEmployeeId(adminTokens.accessToken)
    orgAdminEmpId = jwtEmployeeId(orgAdminTokens.accessToken)
    salesEmpId = jwtEmployeeId(salesTokens.accessToken)

    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  // ──────────────────────────────────────────────────────────────────────
  // A1: 단일 APPROVER(admin) 승인 → 문서 APPROVED
  // ──────────────────────────────────────────────────────────────────────
  test('A1 단일 APPROVER 승인 → 문서 APPROVED', async ({ page }) => {
    const title = `A1 단일승인 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 }],
      title,
    )

    // admin이 결재함(me/documents 결재함)에서 승인 클릭
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // ──────────────────────────────────────────────────────────────────────
  // A2: 2단계 순차(admin→orgadmin) — 상신 직후 상태 + 전원 승인 → APPROVED
  // ──────────────────────────────────────────────────────────────────────
  test('A2 2단계 순차 상신 후 상태 + 전원 승인 → APPROVED', async ({ page }) => {
    const title = `A2 2단계순차 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 2 },
      ],
      title,
    )

    // 상신 직후 상태 검증: step1=PENDING, step2=WAITING
    const stepsAfterSubmit = await getSteps(page, adminTokens.accessToken, docId)
    const s1 = stepsAfterSubmit.find((s) => s.stepOrder === 1)
    const s2 = stepsAfterSubmit.find((s) => s.stepOrder === 2)
    expect(s1?.status).toBe('PENDING')
    expect(s2?.status).toBe('WAITING')

    // 1단계 결재자(admin) UI로 승인
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // 1단계 승인 후: step1=APPROVED, step2=PENDING
    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 1), { timeout: 10000 })
      .toBe('APPROVED')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 2)).toBe('PENDING')

    // 2단계 결재자(orgAdmin) UI로 승인
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // 최종 APPROVED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // ──────────────────────────────────────────────────────────────────────
  // A3: 3단계 순차, 2단계에서 반려 → 문서 REJECTED, 3단계 CANCELLED
  // ──────────────────────────────────────────────────────────────────────
  test('A3 3단계 중 2단계 반려 → REJECTED, 3단계 CANCELLED', async ({ page }) => {
    const title = `A3 3단계반려 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 2 },
        { role: 'APPROVER', assigneeId: salesEmpId, stepOrder: 3 },
      ],
      title,
    )

    // 1단계(admin) API로 승인 (셋업)
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)!
    const approve1 = await stepActionApi(page, adminTokens.accessToken, docId, step1.id, 'approve')
    expect(approve1.ok()).toBeTruthy()

    // 2단계(orgAdmin) UI로 반려
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('A3 E2E 반려 사유')
    await page.getByRole('button', { name: '반려', exact: true }).click()

    // 문서 REJECTED, 3단계 CANCELLED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('REJECTED')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 3)).toBe('CANCELLED')
  })

  // ──────────────────────────────────────────────────────────────────────
  // A4: 3단계, 3단계 결재자가 전단계 반려 → 2단계 PENDING 복원
  // ──────────────────────────────────────────────────────────────────────
  test('A4 3단계에서 전단계 반려 → 2단계 PENDING 복원', async ({ page }) => {
    const title = `A4 전단계반려 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 2 },
        { role: 'APPROVER', assigneeId: salesEmpId, stepOrder: 3 },
      ],
      title,
    )

    // 1단계(admin) + 2단계(orgAdmin) API로 승인 (셋업)
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)!
    const step2 = steps.find((s) => s.stepOrder === 2)!

    const r1 = await stepActionApi(page, adminTokens.accessToken, docId, step1.id, 'approve')
    expect(r1.ok()).toBeTruthy()
    const r2 = await stepActionApi(page, orgAdminTokens.accessToken, docId, step2.id, 'approve')
    expect(r2.ok()).toBeTruthy()

    // 3단계(sales) UI로 전단계 반려
    await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('A4 E2E 전단계 반려 사유')
    await page.getByRole('button', { name: '전단계 반려', exact: true }).click()

    // 2단계 PENDING 복원, 3단계 RETURNED, 문서 PENDING 유지
    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 2), { timeout: 10000 })
      .toBe('PENDING')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 3)).toBe('RETURNED')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')
  })

  // ──────────────────────────────────────────────────────────────────────
  // A5: 2단계 승인 후 1단계 결재자가 결재취소 → 1단계 PENDING 복원, 2단계 WAITING
  // ──────────────────────────────────────────────────────────────────────
  test('A5 2단계 승인 후 1단계 결재자 결재취소 → 1단계 PENDING 복원', async ({ page }) => {
    const title = `A5 결재취소 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 2 },
      ],
      title,
    )

    // 1단계(admin) API 승인, 2단계(orgAdmin) API 승인 (셋업: 1단계 결재자 상태가 APPROVED인 상태)
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)!
    const step2 = steps.find((s) => s.stepOrder === 2)!

    const r1 = await stepActionApi(page, adminTokens.accessToken, docId, step1.id, 'approve')
    expect(r1.ok()).toBeTruthy()

    // 2단계가 PENDING 상태가 될 때까지 대기
    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 2), { timeout: 8000 })
      .toBe('PENDING')

    // 1단계(admin)가 문서대장에서 결재취소 UI 클릭
    // 결재취소는 내 단계가 APPROVED 상태 + 문서가 PENDING + 다음 단계 미처리 조건
    // admin은 step1이 APPROVED, doc은 PENDING → canCancelApproval=true
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInLedger(page, title)
    await page.getByRole('button', { name: '결재 취소', exact: true }).click()

    // 1단계 PENDING 복원, 2단계 WAITING, 문서 PENDING 유지
    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 1), { timeout: 10000 })
      .toBe('PENDING')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 2)).toBe('WAITING')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')

    // 사용하지 않는 변수 lint 방지
    void step2
  })

  // ──────────────────────────────────────────────────────────────────────
  // A6: 혼합 3단계 라인(orgadmin→sales→admin) 전원 순차 승인 → APPROVED
  // ──────────────────────────────────────────────────────────────────────
  test('A6 혼합 3단계 라인 전원 승인 → APPROVED', async ({ page }) => {
    const title = `A6 혼합3단계 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: salesEmpId, stepOrder: 2 },
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 3 },
      ],
      title,
    )

    // 상신 직후 step1=PENDING, step2=WAITING, step3=WAITING
    const stepsAfterSubmit = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsAfterSubmit.find((s) => s.stepOrder === 1)?.status).toBe('PENDING')
    expect(stepsAfterSubmit.find((s) => s.stepOrder === 2)?.status).toBe('WAITING')
    expect(stepsAfterSubmit.find((s) => s.stepOrder === 3)?.status).toBe('WAITING')

    // 1단계(orgAdmin) UI 승인
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 1), { timeout: 10000 })
      .toBe('APPROVED')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 2)).toBe('PENDING')

    // 2단계(sales) UI 승인
    await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    await expect
      .poll(() => stepStatusAt(page, adminTokens.accessToken, docId, 2), { timeout: 10000 })
      .toBe('APPROVED')
    expect(await stepStatusAt(page, adminTokens.accessToken, docId, 3)).toBe('PENDING')

    // 3단계(admin) UI 승인
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/me/documents', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // 최종 APPROVED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // genAdminTokens 참조를 유지해 미사용 경고 방지
  test.afterAll(() => {
    void genAdminTokens
  })
})
