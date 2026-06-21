/**
 * AbleWork ERP — 기안 생명주기 × 전결/재기안/공용결재선 조합 E2E
 *
 * 커버 케이스:
 *   C1 임시저장: 문서 생성(DRAFT) → PATCH 제목 수정 → 상신(PENDING)
 *   C2 회수→재상신→승인: PENDING → recall(RECALLED) → PATCH 수정 → 재상신(PENDING) → 승인(APPROVED)
 *   C3 반려→재상신: allowReDraft=true 양식 → 반려(REJECTED) → 재상신(PENDING)
 *   C4 전결: allowPreApproval=true 양식 2단계 → 1단계 pre-approve → PRE_APPROVED + 2단계 SKIPPED + APPROVED
 *   C5 전결 미허용: 기본 양식(allowPreApproval=false) pre-approve → DOCUMENT_PRE_APPROVAL_NOT_ALLOWED
 *   C6 공용결재선: POST /shared-approval-lines 생성 → 상신 시 sharedLineId → steps 일치
 *
 * 전략: 모든 케이스는 API 중심으로 결정적으로 처리한다.
 * UI는 C2(기안함에서 재상신 버튼)에서 선택적으로 시도하되 API fallback으로 검증한다.
 */
import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  API_URL,
  type Tokens,
  login,
  jwtEmployeeId,
  createSubmittedDoc,
  docStatus,
  getSteps,
  stepActionApi,
  recallApi,
} from './helpers'

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** API로 document-form을 생성하고 id를 반환 */
async function createForm(
  page: import('@playwright/test').Page,
  token: string,
  name: string,
  opts: { allowPreApproval?: boolean; allowReDraft?: boolean } = {},
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/document-forms`, {
    data: {
      name,
      isActive: true,
      allowPreApproval: opts.allowPreApproval ?? false,
      allowReDraft: opts.allowReDraft ?? false,
    },
    headers: authHeaders(token),
  })
  expect(resp.ok()).toBeTruthy()
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
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  return (body?.data ?? body).id as string
}

test.describe('기안 생명주기 × 전결/재기안/공용결재선 조합', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let orgAdminTokens: Tokens
  let adminEmployeeId: string
  let orgAdminEmployeeId: string
  let baseFormId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    orgAdminTokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    orgAdminEmployeeId = jwtEmployeeId(orgAdminTokens.accessToken)
    // 기본 양식: allowPreApproval=false, allowReDraft=false
    baseFormId = 'seed-form-custom'
    await page.close()
  })

  // ---------------------------------------------------------------------------
  // C1: 임시저장 (DRAFT → PATCH → PENDING)
  // ---------------------------------------------------------------------------
  test('C1 임시저장: 문서 생성(DRAFT) → PATCH 제목 수정 → 상신 시 수정 제목이 반영된 PENDING', async ({
    page,
  }) => {
    const originalTitle = `C1 임시저장 초기 ${Date.now()}`
    const updatedTitle = `C1 임시저장 수정 ${Date.now()}`

    // 문서 생성 → DRAFT
    const created = await page.request.post(`${API_URL}/documents`, {
      data: { formId: baseFormId, title: originalTitle, content: { body: 'E2E C1 임시저장' } },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(created.ok()).toBeTruthy()
    const docId = ((await created.json())?.data ?? (await created.json())).id as string

    const statusAfterCreate = await docStatus(page, empTokens.accessToken, docId)
    expect(statusAfterCreate).toBe('DRAFT')

    // PATCH → 제목 수정
    const patched = await page.request.patch(`${API_URL}/documents/${docId}`, {
      data: { title: updatedTitle },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(patched.ok()).toBeTruthy()
    const patchedBody = await patched.json()
    expect((patchedBody?.data ?? patchedBody).title).toBe(updatedTitle)

    // 상신 → PENDING
    const submitted = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
      data: { steps: [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }] },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(submitted.ok()).toBeTruthy()

    // 상태 및 제목 검증
    const finalStatus = await docStatus(page, empTokens.accessToken, docId)
    expect(finalStatus).toBe('PENDING')

    // 상신 후 제목이 수정된 값으로 유지되는지 확인
    const docResp = await page.request.get(`${API_URL}/documents/${docId}`, {
      headers: authHeaders(empTokens.accessToken),
    })
    const doc = ((await docResp.json())?.data ?? (await docResp.json())) as { title: string }
    expect(doc.title).toBe(updatedTitle)
  })

  // ---------------------------------------------------------------------------
  // C2: 회수 → 재상신 → 승인 (전 구간)
  // ---------------------------------------------------------------------------
  test('C2 회수→재상신→승인: PENDING → RECALLED → PATCH → PENDING → APPROVED 전 구간', async ({
    page,
  }) => {
    const title = `C2 회수재상신 ${Date.now()}`
    const updatedTitle = `C2 회수재상신 수정 ${Date.now()}`

    // 상신 → PENDING
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      baseFormId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('PENDING')

    // 회수 → RECALLED
    const recalled = await recallApi(page, empTokens.accessToken, docId)
    expect(recalled.ok()).toBeTruthy()
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('RECALLED')

    // PATCH 수정
    const patched = await page.request.patch(`${API_URL}/documents/${docId}`, {
      data: { title: updatedTitle },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(patched.ok()).toBeTruthy()

    // 재상신 → PENDING
    const resubmitted = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
      data: { steps: [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }] },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(resubmitted.ok()).toBeTruthy()
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('PENDING')

    // 결재자(admin)가 승인 → APPROVED
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)
    expect(step1).toBeTruthy()

    const approved = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1!.id,
      'approve',
    )
    expect(approved.ok()).toBeTruthy()

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // ---------------------------------------------------------------------------
  // C3: 반려 → 재상신 (allowReDraft=true 게이트 확인)
  // ---------------------------------------------------------------------------
  test('C3 반려→재상신: allowReDraft=true 양식에서 반려 후 재상신하면 PENDING이 된다', async ({
    page,
  }) => {
    // allowReDraft=true 양식 생성
    const reDraftFormId = await createForm(
      page,
      adminTokens.accessToken,
      `C3 재기안양식 ${Date.now()}`,
      { allowReDraft: true },
    )

    const title = `C3 반려재상신 ${Date.now()}`

    // 상신 → PENDING
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      reDraftFormId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('PENDING')

    // 결재자(admin)가 반려 → REJECTED
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)
    expect(step1).toBeTruthy()

    const rejected = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1!.id,
      'reject',
      'C3 E2E 반려 사유',
    )
    expect(rejected.ok()).toBeTruthy()
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('REJECTED')

    // 기안자가 재상신(allowReDraft=true이므로 가능) → PENDING
    const resubmitted = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
      data: { steps: [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }] },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(resubmitted.ok()).toBeTruthy()

    await expect
      .poll(() => docStatus(page, empTokens.accessToken, docId), { timeout: 10000 })
      .toBe('PENDING')
  })

  // ---------------------------------------------------------------------------
  // C4: 전결 (allowPreApproval=true → PRE_APPROVED + SKIPPED + APPROVED)
  // ---------------------------------------------------------------------------
  test('C4 전결: allowPreApproval=true 양식 2단계에서 1단계 전결 시 2단계 SKIPPED, 문서 APPROVED', async ({
    page,
  }) => {
    // allowPreApproval=true 양식 생성
    const preFormId = await createForm(
      page,
      adminTokens.accessToken,
      `C4 전결양식 ${Date.now()}`,
      { allowPreApproval: true },
    )

    const title = `C4 전결 ${Date.now()}`

    // 2단계 문서 상신 (admin 1단계, orgAdmin 2단계)
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
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('PENDING')

    // 1단계 결재자(admin)가 전결 처리
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)
    expect(step1).toBeTruthy()

    const preApproved = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1!.id,
      'pre-approve',
      'C4 E2E 전결 처리',
    )
    expect(preApproved.ok()).toBeTruthy()

    // 검증: step1 PRE_APPROVED, step2 SKIPPED, 문서 APPROVED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')

    const finalSteps = await getSteps(page, adminTokens.accessToken, docId)
    expect(finalSteps.find((s) => s.stepOrder === 1)?.status).toBe('PRE_APPROVED')
    expect(finalSteps.find((s) => s.stepOrder === 2)?.status).toBe('SKIPPED')
  })

  // ---------------------------------------------------------------------------
  // C5: 전결 미허용 (allowPreApproval=false → DOCUMENT_PRE_APPROVAL_NOT_ALLOWED)
  // ---------------------------------------------------------------------------
  test('C5 전결 미허용: allowPreApproval=false 양식에서 pre-approve 시도 시 DOCUMENT_PRE_APPROVAL_NOT_ALLOWED 반환', async ({
    page,
  }) => {
    const title = `C5 전결미허용 ${Date.now()}`

    // seed-form-custom: allowPreApproval=false
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      baseFormId,
      [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }],
      title,
    )

    const steps = await getSteps(page, adminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)
    expect(step1).toBeTruthy()

    // pre-approve API 직접 호출 → BE가 거부
    const resp = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      step1!.id,
      'pre-approve',
      'C5 전결 시도',
    )
    const body = await resp.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('DOCUMENT_PRE_APPROVAL_NOT_ALLOWED')
  })

  // ---------------------------------------------------------------------------
  // C6: 공용결재선 (sharedLineId로 상신 시 steps가 공용결재선과 일치)
  // ---------------------------------------------------------------------------
  test('C6 공용결재선: sharedLineId로 상신하면 생성된 steps가 공용결재선 정의와 일치한다', async ({
    page,
  }) => {
    // 2단계 공용결재선 생성 (admin → orgAdmin)
    const lineName = `C6 공용결재선 ${Date.now()}`
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

    const title = `C6 공용결재선 상신 ${Date.now()}`

    // 문서 생성
    const created = await page.request.post(`${API_URL}/documents`, {
      data: { formId: baseFormId, title, content: { body: 'E2E C6 공용결재선 테스트' } },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(created.ok()).toBeTruthy()
    const docId = ((await created.json())?.data ?? (await created.json())).id as string

    // sharedLineId로 상신 (steps 없이)
    const submitted = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
      data: { sharedLineId },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(submitted.ok()).toBeTruthy()
    expect(await docStatus(page, empTokens.accessToken, docId)).toBe('PENDING')

    // 생성된 steps가 공용결재선과 일치하는지 검증
    const steps = await getSteps(page, adminTokens.accessToken, docId)
    expect(steps).toHaveLength(2)

    const s1 = steps.find((s) => s.stepOrder === 1)
    const s2 = steps.find((s) => s.stepOrder === 2)

    expect(s1?.role).toBe('APPROVER')
    expect(s1?.assignee?.id).toBe(adminEmployeeId)
    expect(s1?.status).toBe('PENDING')

    expect(s2?.role).toBe('APPROVER')
    expect(s2?.assignee?.id).toBe(orgAdminEmployeeId)
    expect(s2?.status).toBe('WAITING')
  })
})
