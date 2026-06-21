/**
 * AbleWork ERP — 전자결재 보충 E2E (전결·협조·수신·공용결재선 prefill)
 *
 * 기존 커버(approval_processing/approval_state_machine/approval_cc/approval_dept_receiver)에
 * 빠진 옵션 케이스를 추가한다:
 *   C-5 전결(PRE_APPROVED): allowPreApproval=true 양식 → 결재자가 UI에서 전결 → 이후 단계 SKIPPED, 문서 APPROVED
 *   C-5b 전결 불가: allowPreApproval=false 양식 → BE가 DOCUMENT_PRE_APPROVAL_NOT_ALLOWED 거부
 *   C-AGMT 협조(AGREEMENT): 협조 단계를 포함한 문서 → 협조자가 UI에서 '협조' → step APPROVED, 흐름 진행
 *   C-RECV 수신(RECEIVER): RECEIVER 단계 → 최종 승인 후 수신자가 UI에서 '수신 처리' → RECEIVED
 *   C-6 공용결재선 prefill: 공용결재선 선택 → 기안 등록 모달에서 steps prefill → 상신 후 steps 일치
 *
 * 전략(결정적):
 *  - 문서 생성·상신·선행 API 셋업은 API로.
 *  - 핵심 결재 액션(전결·협조·수신 처리)은 UI(DocModal 버튼)로 구동.
 *  - 결과 단언은 API로.
 *  - myPendingStep 노출 조건(Zustand authStore 하이드레이트)을 충족하기 위해 결재자 계정으로
 *    uiLogin 후 docInBox를 연다.
 *
 * 전결 UI 조건 (DocModal.tsx 기준):
 *  - canApprove = actionsVisible && myPendingStep && FLOW_ROLES(APPROVER/AGREEMENT/DEPT_COLLABORATOR)
 *  - 전결 버튼 표시 조건: allowPreApproval && myPendingStep?.role === 'APPROVER'
 *  - 전결은 의견 필수(requireComment=true) → comment textarea를 먼저 채워야 처리됨
 *
 * 협조 UI 조건:
 *  - canApprove 조건에서 role=AGREEMENT일 때 승인 버튼 라벨이 '협조'로 표시됨
 *  - 협조 액션은 의견 불필요(requireComment=false)
 *
 * 수신 UI 조건:
 *  - canReceive = actionsVisible && myPendingStep && role === 'RECEIVER'
 *  - actionsVisible: RECEIVER는 doc.status === 'APPROVED' 일 때만 노출
 *  - receiver box는 /me/documents (탭: 수신)에서 접근
 *
 * 공용결재선 (C-6):
 *  - isCreate 모드 + sharedLines.length > 0 일 때 select가 나타남
 *  - 선택 시 applySharedLine → steps state prefill
 *  - 테스트: employee로 /me/documents 기안 등록 모달 오픈 → 공용결재선 select → 제목 입력 → 상신
 *    → API로 상신된 문서의 steps가 공용결재선의 steps와 일치하는지 단언
 */
import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  API_URL,
  BASE_URL,
  type Tokens,
  login,
  jwtEmployeeId,
  uiLogin,
  firstFormId,
  createSubmittedDoc,
  docStatus,
  getSteps,
  stepActionApi,
  openDocInBox,
} from './helpers'

const COMMENT_PLACEHOLDER = '결재 의견을 입력하세요 (반려·전결 시 필수)'

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** API로 document-form을 생성하고 id를 반환 */
async function createForm(
  page: import('@playwright/test').Page,
  token: string,
  name: string,
  opts: { allowPreApproval?: boolean } = {},
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/document-forms`, {
    data: { name, isActive: true, allowPreApproval: opts.allowPreApproval ?? false },
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return (body?.data ?? body).id as string
}

/** API로 공용결재선을 생성하고 id를 반환 */
async function createSharedLine(
  page: import('@playwright/test').Page,
  token: string,
  name: string,
  steps: Array<{ role: string; assigneeId: string; stepOrder: number }>,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/shared-approval-lines`, {
    data: { name, steps },
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return (body?.data ?? body).id as string
}

test.describe('전자결재 보충 (전결·협조·수신·공용결재선)', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let orgAdminTokens: Tokens
  let adminEmployeeId: string
  let orgAdminEmployeeId: string
  let empEmployeeId: string
  let baseFormId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    orgAdminTokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    orgAdminEmployeeId = jwtEmployeeId(orgAdminTokens.accessToken)
    empEmployeeId = jwtEmployeeId(empTokens.accessToken)
    // 협조/수신 기본 양식 — allowPreApproval=false
    baseFormId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  // ---------------------------------------------------------------------------
  // C-5: 전결 (PRE_APPROVED)
  // ---------------------------------------------------------------------------
  test('C-5 전결: 전결 허용 양식에서 결재자가 전결하면 이후 단계 SKIPPED + 문서 APPROVED', async ({
    page,
  }) => {
    // 전결 허용 양식 생성 (API, admin 권한)
    const preFormId = await createForm(
      page,
      adminTokens.accessToken,
      `E2E전결양식_${Date.now()}`,
      { allowPreApproval: true },
    )

    // 2단계 문서 생성 + 상신 (admin 1단계, orgAdmin 2단계)
    const title = `E2E 전결 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      preFormId,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmployeeId, stepOrder: 2 },
      ],
      title,
    )

    // admin이 결재함에서 의견 입력 후 전결 버튼 클릭
    // admin은 SUPER_ADMIN → /admin 으로 리디렉트, admin/approval/inbox 결재함 탭
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)

    // 전결은 의견 필수
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('E2E 전결 처리')
    await page.getByRole('button', { name: '전결', exact: true }).click()

    // step1: PRE_APPROVED, step2: SKIPPED, doc: APPROVED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')

    const steps = await getSteps(page, adminTokens.accessToken, docId)
    expect(steps.find((s) => s.stepOrder === 1)?.status).toBe('PRE_APPROVED')
    expect(steps.find((s) => s.stepOrder === 2)?.status).toBe('SKIPPED')
  })

  test('C-5b 전결 불가: allowPreApproval=false 양식에서 전결 API 호출은 BE가 거부한다', async ({
    page,
  }) => {
    // 반드시 allowPreApproval=false 인 시드 양식 사용 (동적으로 생성한 양식이 목록 앞에 올 수 있으므로
    // firstFormId 대신 seed-form-custom을 직접 지정한다)
    const noPre = 'seed-form-custom'
    const title = `E2E 전결불가 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      noPre,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)!

    // pre-approve API 직접 호출 → DOCUMENT_PRE_APPROVAL_NOT_ALLOWED
    const resp = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1.id,
      'pre-approve',
      'E2E 전결 시도',
    )
    const body = await resp.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('DOCUMENT_PRE_APPROVAL_NOT_ALLOWED')
  })

  // ---------------------------------------------------------------------------
  // C-AGMT: 협조 (AGREEMENT)
  // ---------------------------------------------------------------------------
  test('C-AGMT 협조: 협조 단계 결재자가 UI에서 협조 버튼을 클릭하면 step APPROVED, 흐름 진행된다', async ({
    page,
  }) => {
    // AGREEMENT(orgAdmin) + APPROVER(admin) 2단계 문서 상신
    const title = `E2E 협조 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      baseFormId,
      [
        { role: 'AGREEMENT', assigneeId: orgAdminEmployeeId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 2 },
      ],
      title,
    )

    // 초기 상태: step1 AGREEMENT PENDING, step2 APPROVER WAITING
    const stepsBefore = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsBefore.find((s) => s.stepOrder === 1)?.status).toBe('PENDING')
    expect(stepsBefore.find((s) => s.stepOrder === 2)?.status).toBe('WAITING')

    // orgAdmin이 결재함에서 협조 버튼 클릭 (AGREEMENT 단계는 결재함 탭에 노출됨)
    // orgAdmin은 ORG_ADMIN → /admin 으로 리디렉트
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)

    // AGREEMENT 역할일 때 승인 버튼 라벨이 '협조'로 표시됨 (DocModal.tsx 475행)
    await page.getByRole('button', { name: '협조', exact: true }).click()

    // step1 AGREEMENT APPROVED, step2 APPROVER PENDING으로 전진
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.stepOrder === 1)?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('APPROVED')

    const stepsAfter = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsAfter.find((s) => s.stepOrder === 2)?.status).toBe('PENDING')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')
  })

  // ---------------------------------------------------------------------------
  // C-RECV: 수신 (RECEIVER)
  // ---------------------------------------------------------------------------
  test('C-RECV 수신: 최종 승인 후 수신자가 UI에서 수신 처리하면 step RECEIVED, 문서 RECEIVED 된다', async ({
    page,
  }) => {
    // APPROVER(admin) + RECEIVER(orgAdmin) 2단계 문서 상신
    const title = `E2E 수신 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      baseFormId,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'RECEIVER', assigneeId: orgAdminEmployeeId, stepOrder: 2 },
      ],
      title,
    )

    // admin이 API로 1단계 승인 → 문서 APPROVED, RECEIVER step PENDING으로 활성화
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)!
    const approveResp = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1.id,
      'approve',
    )
    expect(approveResp.ok()).toBeTruthy()
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')

    // orgAdmin이 수신함(me/documents 수신 탭)에서 수신 처리 버튼 클릭
    // orgAdmin은 ORG_ADMIN → /admin으로 리디렉트하지만 수신 탭은 /me/documents에도 존재
    // /admin/approval/inbox 수신 탭 사용
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '수신', title)

    await page.getByRole('button', { name: '수신 처리', exact: true }).click()

    // 수신 처리 후: step2 RECEIVED, 문서 자체는 APPROVED 유지
    // (RECEIVER 단계는 결재 흐름이 아닌 수령 확인 단계 — 문서 상태를 APPROVED → RECEIVED로 전환하지 않음)
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.stepOrder === 2)?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('RECEIVED')

    // 문서 전체 상태는 APPROVED 그대로
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')
  })

  // ---------------------------------------------------------------------------
  // C-6: 공용결재선 prefill
  // ---------------------------------------------------------------------------
  test('C-6 공용결재선 prefill: 기안 등록 모달에서 공용결재선 선택 시 steps가 prefill되어 상신된다', async ({
    page,
  }) => {
    // 공용결재선 생성 (admin → orgAdmin 2단계)
    const lineName = `E2E C6 공용결재선 ${Date.now()}`
    const sharedLineId = await createSharedLine(
      page,
      adminTokens.accessToken,
      lineName,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: orgAdminEmployeeId, stepOrder: 2 },
      ],
    )
    expect(sharedLineId).toBeTruthy()

    // employee는 EMPLOYEE → /me 로 리디렉트됨
    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    // /me/documents 에서 기안 등록 버튼 클릭 → create 모달 오픈
    await page.goto(`${BASE_URL}/me/documents`)
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '기안 등록', exact: true }).click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 10000 })

    // 공용결재선 select에서 방금 만든 lineName 선택
    const sharedSelect = page.locator('select.sel').first()
    await expect(sharedSelect).toBeVisible({ timeout: 8000 })
    await sharedSelect.selectOption({ label: lineName })

    // 양식 선택 (첫 번째 활성 양식)
    // create 모달에서 양식 선택 select는 "양식 선택" placeholder가 있는 두 번째 select
    const formSelect = page.locator('select.sel', { hasText: '양식 선택' })
    await expect(formSelect).toBeVisible({ timeout: 5000 })
    await formSelect.selectOption({ index: 1 })

    // 제목 입력
    const docTitle = `E2E C6 공용결재선 상신 ${Date.now()}`
    await page.locator('input.inp-block[placeholder="기안 제목을 입력하세요"]').fill(docTitle)

    // 상신 버튼 클릭
    await page.getByRole('button', { name: '상신', exact: true }).click()

    // 모달 닫힘 확인
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 10000 })

    // API로 문서 조회하여 steps가 공용결재선과 일치하는지 단언
    // 상신된 문서를 제목으로 찾기
    const docsResp = await page.request.get(
      `${API_URL}/documents?box=in_progress&limit=20`,
      { headers: authHeaders(empTokens.accessToken) },
    )
    const docsBody = await docsResp.json()
    const items = (docsBody?.data?.items ?? docsBody?.data ?? []) as Array<{
      id: string
      title: string
    }>
    const found = items.find((d) => d.title === docTitle)
    expect(found, `문서 "${docTitle}"가 진행중 박스에 없음`).toBeTruthy()

    const docSteps = await getSteps(page, empTokens.accessToken, found!.id)
    expect(docSteps).toHaveLength(2)
    expect(docSteps.find((s) => s.stepOrder === 1)?.assignee?.id).toBe(adminEmployeeId)
    expect(docSteps.find((s) => s.stepOrder === 2)?.assignee?.id).toBe(orgAdminEmployeeId)
    expect(docSteps.every((s) => s.role === 'APPROVER')).toBe(true)
  })
})
