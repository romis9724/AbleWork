/**
 * AbleWork ERP — 전자결재 협조·공람·참조·수신·부서 역할 + 복합 문서 조합 E2E
 *
 * 기존 단일 happy-path 케이스(approval_supplement/approval_cc/approval_dept_receiver/document_flows)와
 * 중복하지 않고, 역할 조합과 복합 문서에 집중한다.
 *
 * 케이스:
 *   B1 AGREEMENT → APPROVER 순차 승인: 협조 APPROVED 후 결재 APPROVED 전체 완주
 *   B2 VIEWER 비차단: VIEWER가 view 처리해도 결재 흐름(APPROVER PENDING)은 독립 유지
 *   B3 REFERENCE 확인: REFERENCE 공람자가 확인 처리 → VIEWED
 *   B4 RECEIVER: 최종 승인 후 수신자 receive → RECEIVED, 문서 APPROVED 유지
 *   B5 DEPT_COLLABORATOR: 결재 승인 후 부서협조 단계 부서함에서 처리 → APPROVED, 문서 APPROVED
 *   B6 DEPT_RECEIVER: 결재 승인 후 부서수신 bounce → BOUNCED, 문서 상태 불변
 *   B7 복합(핵심): AGREEMENT+APPROVER+VIEWER+REFERENCE+RECEIVER 한 문서에서 전체 완주,
 *       각 역할 최종 status 단언
 *   B8 사후 cc: 진행중 문서에 VIEWER+REFERENCE 동시 추가 → step 생성 확인
 *
 * 전략: 문서 생성·상신·선행 API 셋업, 핵심 액션은 stepActionApi(API) 또는 UI 클릭,
 *       결과 단언은 getSteps/docStatus(API). UI를 사용하는 경우 명시.
 *
 * DocModal 버튼 라벨 메모 (DocModal.tsx 기준):
 *   - AGREEMENT → '협조' (canApprove 섹션, role===AGREEMENT 분기)
 *   - APPROVER  → '승인'
 *   - DEPT_COLLABORATOR → '승인' (canApprove 섹션, role===DEPT_COLLABORATOR 분기 → dept-collab action)
 *   - REFERENCE/VIEWER  → '확인 처리' (canConfirmView)
 *   - RECEIVER  → '수신 처리' (canReceive)
 *   - DEPT_RECEIVER bounce → '반송' (canReceive + role===DEPT_RECEIVER)
 *
 * 박스/탭:
 *   - AGREEMENT/APPROVER/DEPT_COLLABORATOR: 결재함('결재함') — /admin/approval/inbox 또는 /me/documents
 *   - REFERENCE: 참조('참조')
 *   - VIEWER: 공람('공람')
 *   - RECEIVER: 수신('수신')
 *   - DEPT_COLLABORATOR/DEPT_RECEIVER: 부서함('부서함')
 *
 * 전제: web:4000 / api:4001 기동 + 시드 계정. 포트는 helpers.ts(env 오버라이드).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  API_URL,
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

// ---------------------------------------------------------------------------
// 유틸
// ---------------------------------------------------------------------------

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

interface OrgNode {
  id: string
  name: string
  children?: OrgNode[]
}

async function findOrgIdByName(page: Page, token: string, name: string): Promise<string> {
  const resp = await page.request.get(`${API_URL}/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await resp.json()
  const tree = (body?.data ?? body) as OrgNode[]
  const flat: OrgNode[] = []
  const walk = (nodes: OrgNode[]) =>
    nodes.forEach((n) => {
      flat.push(n)
      if (n.children?.length) walk(n.children)
    })
  walk(Array.isArray(tree) ? tree : [])
  const found = flat.find((o) => o.name === name)
  if (!found) throw new Error(`조직 '${name}'을 찾을 수 없습니다`)
  return found.id
}

// ---------------------------------------------------------------------------
// beforeAll 공유 픽스처
// ---------------------------------------------------------------------------

test.describe('전자결재 협조·공람·참조·수신·부서역할 조합 (B1~B8)', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let orgAdminTokens: Tokens
  let salesTokens: Tokens

  let adminEmpId: string
  let empEmpId: string
  let orgAdminEmpId: string
  let salesEmpId: string
  let devOrgId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    orgAdminTokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    salesTokens = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)

    adminEmpId = jwtEmployeeId(adminTokens.accessToken)
    empEmpId = jwtEmployeeId(empTokens.accessToken)
    orgAdminEmpId = jwtEmployeeId(orgAdminTokens.accessToken)
    salesEmpId = jwtEmployeeId(salesTokens.accessToken)

    devOrgId = await findOrgIdByName(page, adminTokens.accessToken, '개발팀')
    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  // -------------------------------------------------------------------------
  // B1: AGREEMENT → APPROVER 순차 승인
  // -------------------------------------------------------------------------
  test('B1 AGREEMENT→APPROVER 순차: 협조 동의 후 결재 승인 → 협조 APPROVED·문서 APPROVED', async ({
    page,
  }) => {
    const title = `B1 협조+결재 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'AGREEMENT', assigneeId: orgAdminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 2 },
      ],
      title,
    )

    // 초기 상태 확인
    const stepsBefore = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsBefore.find((s) => s.stepOrder === 1)?.status).toBe('PENDING')
    expect(stepsBefore.find((s) => s.stepOrder === 2)?.status).toBe('WAITING')

    // orgAdmin이 결재함에서 협조 버튼(=AGREEMENT 역할의 '협조') UI 클릭
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)
    await page.getByRole('button', { name: '협조', exact: true }).click()

    // step1(AGREEMENT) APPROVED, step2(APPROVER) PENDING으로 전진
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.stepOrder === 1)?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('APPROVED')

    const stepsAfterAgree = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsAfterAgree.find((s) => s.stepOrder === 2)?.status).toBe('PENDING')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')

    // admin이 결재함에서 승인 버튼 UI 클릭
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // 문서 최종 APPROVED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')

    const stepsAfterApprove = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsAfterApprove.find((s) => s.stepOrder === 1)?.status).toBe('APPROVED')
    expect(stepsAfterApprove.find((s) => s.stepOrder === 2)?.status).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // B2: VIEWER 비차단
  // -------------------------------------------------------------------------
  test('B2 VIEWER 비차단: VIEWER가 view 처리해도 APPROVER 흐름은 독립 유지된다', async ({
    page,
  }) => {
    const title = `B2 VIEWER비차단 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'VIEWER', assigneeId: salesEmpId, stepOrder: 2 },
      ],
      title,
    )

    // 상신 직후: APPROVER PENDING, VIEWER PENDING(비차단이므로 바로 접근 가능)
    const stepsBefore = await getSteps(page, adminTokens.accessToken, docId)
    const viewerStep = stepsBefore.find((s) => s.role === 'VIEWER')!
    expect(viewerStep.status).toBe('PENDING')

    // sales가 공람함에서 '확인 처리' UI 클릭
    await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
    await openDocInBox(page, '/me/documents', '공람', title)
    await page.getByRole('button', { name: '확인 처리', exact: true }).click()

    // VIEWER step VIEWED
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.role === 'VIEWER')?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('VIEWED')

    // APPROVER 단계는 여전히 PENDING — 흐름 독립 확인
    const stepsAfter = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsAfter.find((s) => s.role === 'APPROVER')?.status).toBe('PENDING')
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')
  })

  // -------------------------------------------------------------------------
  // B3: REFERENCE 확인 처리
  // -------------------------------------------------------------------------
  test('B3 REFERENCE 확인: 참조자가 확인 처리하면 해당 step이 VIEWED 된다', async ({ page }) => {
    const title = `B3 REFERENCE확인 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'REFERENCE', assigneeId: orgAdminEmpId, stepOrder: 2 },
      ],
      title,
    )

    // orgAdmin이 참조함에서 '확인 처리' UI 클릭
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '참조', title)
    await page.getByRole('button', { name: '확인 처리', exact: true }).click()

    // REFERENCE step VIEWED
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.role === 'REFERENCE')?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('VIEWED')

    // 결재 흐름(APPROVER)은 독립 유지
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    expect(steps.find((s) => s.role === 'APPROVER')?.status).toBe('PENDING')
  })

  // -------------------------------------------------------------------------
  // B4: RECEIVER — 최종 승인 후 수신 처리
  // -------------------------------------------------------------------------
  test('B4 RECEIVER: 최종 승인 후 수신자 receive → RECEIVED, 문서 APPROVED 유지', async ({
    page,
  }) => {
    const title = `B4 RECEIVER처리 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'RECEIVER', assigneeId: orgAdminEmpId, stepOrder: 2 },
      ],
      title,
    )

    // admin이 API로 결재 승인 → 문서 APPROVED, RECEIVER 활성화
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

    // orgAdmin이 수신함에서 '수신 처리' UI 클릭
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '수신', title)
    await page.getByRole('button', { name: '수신 처리', exact: true }).click()

    // RECEIVER step RECEIVED
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.role === 'RECEIVER')?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('RECEIVED')

    // 문서 자체는 APPROVED 유지 (RECEIVER는 상태 전환 없음)
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // B5: DEPT_COLLABORATOR — 부서함에서 처리
  // -------------------------------------------------------------------------
  test('B5 DEPT_COLLABORATOR: 결재 승인 후 부서협조 처리 → step APPROVED, 문서 APPROVED', async ({
    page,
  }) => {
    const title = `B5 부서협조 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'DEPT_COLLABORATOR', organizationId: devOrgId, stepOrder: 2 },
      ],
      title,
    )

    // admin이 API로 결재 승인 → DEPT_COLLABORATOR 단계 활성화(PENDING)
    const stepsBeforeApprove = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = stepsBeforeApprove.find((s) => s.stepOrder === 1)!
    const approveResp = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1.id,
      'approve',
    )
    expect(approveResp.ok()).toBeTruthy()

    const stepsAfterApprove = await getSteps(page, adminTokens.accessToken, docId)
    expect(stepsAfterApprove.find((s) => s.role === 'DEPT_COLLABORATOR')?.status).toBe('PENDING')

    // orgAdmin이 부서함('부서함')에서 문서를 열어 '승인' 버튼 클릭
    // (DEPT_COLLABORATOR는 canApprove 블록 = '승인' 라벨, 내부 action=dept-collab)
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '부서함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // DEPT_COLLABORATOR step APPROVED, 문서 APPROVED
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.role === 'DEPT_COLLABORATOR')?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('APPROVED')

    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // B6: DEPT_RECEIVER bounce
  // -------------------------------------------------------------------------
  test('B6 DEPT_RECEIVER bounce: 결재 승인 후 부서수신 반송 → BOUNCED, 문서 상태 불변', async ({
    page,
  }) => {
    const title = `B6 부서수신반송 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
        { role: 'DEPT_RECEIVER', organizationId: devOrgId, stepOrder: 2 },
      ],
      title,
    )

    // admin이 API로 결재 승인 → 문서 APPROVED, DEPT_RECEIVER 활성화
    const stepsBeforeApprove = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = stepsBeforeApprove.find((s) => s.stepOrder === 1)!
    const approveResp = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1.id,
      'approve',
    )
    expect(approveResp.ok()).toBeTruthy()
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')

    // orgAdmin이 부서함에서 의견 입력 후 '반송' 버튼 클릭
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '부서함', title)
    await page
      .getByPlaceholder('결재 의견을 입력하세요 (반려·전결 시 필수)')
      .fill('B6 부서수신 반송 사유')
    await page.getByRole('button', { name: '반송', exact: true }).click()

    // DEPT_RECEIVER step BOUNCED
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.role === 'DEPT_RECEIVER')?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('BOUNCED')

    // 문서 자체는 APPROVED 유지 (BOUNCED는 상태 전환 없음)
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // B7: 복합 — AGREEMENT+APPROVER+VIEWER+REFERENCE+RECEIVER 전체 완주
  // -------------------------------------------------------------------------
  test('B7 복합 전체 완주: AGREEMENT·APPROVER·VIEWER·REFERENCE·RECEIVER 5역할 순차 처리, 각 status 단언', async ({
    page,
  }) => {
    const title = `B7 복합5역할 ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'AGREEMENT', assigneeId: orgAdminEmpId, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 2 },
        { role: 'VIEWER', assigneeId: salesEmpId, stepOrder: 3 },
        { role: 'REFERENCE', assigneeId: orgAdminEmpId, stepOrder: 4 },
        { role: 'RECEIVER', assigneeId: salesEmpId, stepOrder: 5 },
      ],
      title,
    )

    // 상신 직후 초기 상태 검증
    const initialSteps = await getSteps(page, adminTokens.accessToken, docId)
    expect(initialSteps.find((s) => s.stepOrder === 1)?.status).toBe('PENDING')  // AGREEMENT active
    expect(initialSteps.find((s) => s.stepOrder === 2)?.status).toBe('WAITING')  // APPROVER waiting
    expect(initialSteps.find((s) => s.stepOrder === 3)?.status).toBe('PENDING')  // VIEWER non-blocking
    expect(initialSteps.find((s) => s.stepOrder === 4)?.status).toBe('PENDING')  // REFERENCE non-blocking
    expect(initialSteps.find((s) => s.stepOrder === 5)?.status).toBe('WAITING')  // RECEIVER waiting

    // 1. orgAdmin이 협조 동의(API) - 비차단 검증에 집중하므로 API로 처리
    const agreeStep = initialSteps.find((s) => s.stepOrder === 1)!
    const agreeResp = await stepActionApi(
      page,
      orgAdminTokens.accessToken,
      docId,
      agreeStep.id,
      'agree',
    )
    expect(agreeResp.ok()).toBeTruthy()

    // AGREEMENT APPROVED, APPROVER PENDING으로 전진
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.stepOrder === 2)?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('PENDING')

    // 2. admin이 결재 승인(API)
    const refreshedSteps = await getSteps(page, adminTokens.accessToken, docId)
    const approverStep = refreshedSteps.find((s) => s.stepOrder === 2)!
    const approveResp = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      approverStep.id,
      'approve',
    )
    expect(approveResp.ok()).toBeTruthy()
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')

    // 3. sales가 VIEWER 확인(API) - 비차단이므로 이미 PENDING 상태
    const afterApproveSteps = await getSteps(page, adminTokens.accessToken, docId)
    const viewerStep = afterApproveSteps.find((s) => s.stepOrder === 3)!
    const viewResp = await stepActionApi(
      page,
      salesTokens.accessToken,
      docId,
      viewerStep.id,
      'view',
    )
    expect(viewResp.ok()).toBeTruthy()

    // 4. orgAdmin이 REFERENCE 확인(API) - 비차단이므로 이미 PENDING 상태
    const referenceStep = afterApproveSteps.find((s) => s.stepOrder === 4)!
    const refResp = await stepActionApi(
      page,
      orgAdminTokens.accessToken,
      docId,
      referenceStep.id,
      'view',
    )
    expect(refResp.ok()).toBeTruthy()

    // 5. sales가 RECEIVER 수신 처리 — UI로 수신함에서 처리
    await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
    await openDocInBox(page, '/me/documents', '수신', title)
    await page.getByRole('button', { name: '수신 처리', exact: true }).click()

    // 모든 step 최종 상태 단언
    await expect
      .poll(
        () =>
          getSteps(page, adminTokens.accessToken, docId).then(
            (ss) => ss.find((s) => s.stepOrder === 5)?.status,
          ),
        { timeout: 10000 },
      )
      .toBe('RECEIVED')

    const finalSteps = await getSteps(page, adminTokens.accessToken, docId)
    expect(finalSteps.find((s) => s.stepOrder === 1)?.status).toBe('APPROVED')   // AGREEMENT
    expect(finalSteps.find((s) => s.stepOrder === 2)?.status).toBe('APPROVED')   // APPROVER
    expect(finalSteps.find((s) => s.stepOrder === 3)?.status).toBe('VIEWED')     // VIEWER
    expect(finalSteps.find((s) => s.stepOrder === 4)?.status).toBe('VIEWED')     // REFERENCE
    expect(finalSteps.find((s) => s.stepOrder === 5)?.status).toBe('RECEIVED')   // RECEIVER

    // 문서 APPROVED 유지 (RECEIVER는 상태 전환 없음)
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // B8: 사후 cc 추가 (VIEWER + REFERENCE 동시)
  // -------------------------------------------------------------------------
  test('B8 사후 cc 추가: 진행중 문서에 VIEWER+REFERENCE 동시 추가 → 두 step 생성 확인', async ({
    page,
  }) => {
    const title = `B8 사후CC ${Date.now()}`
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 }],
      title,
    )

    // 상신 직후: VIEWER/REFERENCE step 없음
    const before = await getSteps(page, empTokens.accessToken, docId)
    expect(before.filter((s) => s.role === 'VIEWER' || s.role === 'REFERENCE')).toHaveLength(0)

    // 기안자(employee)가 POST /documents/:id/cc API로 VIEWER(sales)+REFERENCE(orgAdmin) 동시 추가
    const ccResp = await page.request.post(`${API_URL}/documents/${docId}/cc`, {
      data: {
        steps: [
          { role: 'VIEWER', assigneeId: salesEmpId },
          { role: 'REFERENCE', assigneeId: orgAdminEmpId },
        ],
      },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(ccResp.ok()).toBeTruthy()
    const ccBody = await ccResp.json()
    expect(ccBody.success).toBe(true)

    // 두 step 생성 확인 (API 검증)
    const after = await getSteps(page, adminTokens.accessToken, docId)
    const viewerSteps = after.filter((s) => s.role === 'VIEWER')
    const referenceSteps = after.filter((s) => s.role === 'REFERENCE')
    expect(viewerSteps).toHaveLength(1)
    expect(referenceSteps).toHaveLength(1)
    expect(viewerSteps[0].assignee?.id).toBe(salesEmpId)
    expect(referenceSteps[0].assignee?.id).toBe(orgAdminEmpId)

    // 진행 중 문서 APPROVER 단계는 여전히 PENDING
    expect(after.find((s) => s.role === 'APPROVER')?.status).toBe('PENDING')
  })
})
