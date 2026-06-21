/**
 * AbleWork ERP — 전자결재 관리자 환경설정·양식·공용결재선·대리결재 + 권한/예외 경계 E2E
 *
 * 케이스:
 *   D1 기안양식 CRUD (생성→수정→삭제 소프트) + 사용 중 양식 삭제 차단(FORM_IN_USE)
 *   D2 문서번호 채번 규칙 PUT→GET pattern 저장·조회
 *   D3 양식 접근규칙: seed-org-dev 허용 → 개발팀 직원 통과, 영업팀 직원 차단(FORM_ACCESS_DENIED)
 *   D4 공용결재선 생성→steps 수정(version↑)→삭제 + 이름 중복(SHARED_LINE_DUPLICATE_NAME) + 최종결재자=협조자(FINAL_APPROVER_IS_COLLABORATOR)
 *   D5 대리결재 생성→수정→삭제(본인) + 본인 지정 차단(PROXY_SELF_NOT_ALLOWED)
 *   D6 결재 차례 아닌 사람 approve → 403 APPROVAL_STEP_NOT_CURRENT
 *   D7 기안자 본인을 APPROVER로 상신 → APPROVAL_SELF_NOT_ALLOWED
 *   D8 타인 회수 → 403(DOCUMENT_NOT_DRAFTER) / 이미 승인 문서 재승인 → 거부(DOCUMENT_NOT_PENDING) / EMPLOYEE ledger box → 403(DOCUMENT_LEDGER_FORBIDDEN)
 *
 * 전략: 모든 검증은 API 직접 호출로 결정적으로 수행. UI 진입은 없음(순수 API E2E).
 * 데이터는 테스트 내부에서 생성하고 충분히 격리된 타임스탬프 이름을 사용한다.
 */
import { test, expect } from '@playwright/test'
import { API_URL, ACCOUNTS, type Tokens, login, jwtEmployeeId } from './helpers'

// ── 내부 유틸리티 ──────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** document-form 생성 → id 반환 */
async function createForm(
  page: import('@playwright/test').Page,
  token: string,
  name: string,
  opts: {
    visibilityScope?: string
    allowPreApproval?: boolean
    allowReDraft?: boolean
  } = {},
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/document-forms`, {
    data: {
      name,
      visibilityScope: opts.visibilityScope ?? 'PUBLIC',
      allowPreApproval: opts.allowPreApproval ?? false,
      allowReDraft: opts.allowReDraft ?? false,
    },
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return (body?.data ?? body).id as string
}

/** document 생성 (DRAFT 상태) → id 반환 */
async function createDoc(
  page: import('@playwright/test').Page,
  token: string,
  formId: string,
  title: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/documents`, {
    data: { formId, title, content: { body: 'E2E' } },
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return (body?.data ?? body).id as string
}

/** document 상신 (steps 포함) */
async function submitDoc(
  page: import('@playwright/test').Page,
  token: string,
  docId: string,
  steps: Array<{ role: string; assigneeId: string; stepOrder: number }>,
): Promise<void> {
  const resp = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
    data: { steps },
    headers: authHeaders(token),
  })
  expect(resp.ok()).toBeTruthy()
}

/** 문서 approvalLines에서 steps를 stepOrder 오름차순으로 평탄화 */
async function fetchSteps(
  page: import('@playwright/test').Page,
  token: string,
  docId: string,
): Promise<Array<{ id: string; stepOrder: number; status: string; role: string }>> {
  const resp = await page.request.get(`${API_URL}/documents/${docId}`, {
    headers: authHeaders(token),
  })
  const doc = (await resp.json())?.data ?? {}
  const steps = ((doc.approvalLines ?? []) as Array<{ steps: unknown[] }>).flatMap(
    (l) => l.steps as Array<{ id: string; stepOrder: number; status: string; role: string }>,
  )
  return steps.sort((a, b) => a.stepOrder - b.stepOrder)
}

// ── 공통 setup ─────────────────────────────────────────────────────────────────

test.describe('D: 전자결재 관리자 설정·양식·결재선·대리결재 + 권한/예외 경계', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let salesTokens: Tokens
  let orgAdminTokens: Tokens
  let adminEmpId: string
  let empEmpId: string
  let salesEmpId: string
  let orgAdminEmpId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    salesTokens = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
    orgAdminTokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    adminEmpId = jwtEmployeeId(adminTokens.accessToken)
    empEmpId = jwtEmployeeId(empTokens.accessToken)
    salesEmpId = jwtEmployeeId(salesTokens.accessToken)
    orgAdminEmpId = jwtEmployeeId(orgAdminTokens.accessToken)
    await page.close()
  })

  // ── D1: 기안양식 CRUD + 사용중 삭제 차단 ────────────────────────────────────

  test('D1 기안양식 생성→수정→삭제(소프트) + 사용중 양식 삭제 → FORM_IN_USE', async ({ page }) => {
    const ts = Date.now()

    // 생성
    const createResp = await page.request.post(`${API_URL}/document-forms`, {
      data: {
        name: `D1 기안양식 ${ts}`,
        visibilityScope: 'PUBLIC',
        allowPreApproval: true,
        allowReDraft: true,
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(createResp.status())
    const formId = (await createResp.json()).data.id as string

    // 수정
    const patchResp = await page.request.patch(`${API_URL}/document-forms/${formId}`, {
      data: { name: `D1 수정양식 ${ts}` },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(patchResp.status())
    const patched = (await patchResp.json()).data
    expect(patched.name).toBe(`D1 수정양식 ${ts}`)

    // 소프트 삭제 (문서 없을 때 → 성공)
    const delResp = await page.request.delete(`${API_URL}/document-forms/${formId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201, 204]).toContain(delResp.status())

    // 소프트 삭제 검증: GET 목록에서 isActive=false
    const listResp = await page.request.get(`${API_URL}/document-forms?includeInactive=true`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    const allForms = ((await listResp.json())?.data ?? []) as Array<{
      id: string
      isActive: boolean
    }>
    const deletedForm = allForms.find((f) => f.id === formId)
    // 소프트 삭제이므로 레코드는 남아 있어야 하지만 isActive=false이거나 목록에서 제거됨
    // BE 구현에 따라 목록에 없을 수도 있으므로 둘 다 허용
    if (deletedForm) {
      expect(deletedForm.isActive).toBe(false)
    }

    // 사용 중 양식 삭제 차단: 새 양식 생성 → DRAFT 문서 연결 → 삭제 시도 → FORM_IN_USE
    const inUseFormId = await createForm(page, adminTokens.accessToken, `D1 사용중양식 ${ts}`)
    await createDoc(page, empTokens.accessToken, inUseFormId, `D1 DRAFT 문서 ${ts}`)

    const delInUseResp = await page.request.delete(`${API_URL}/document-forms/${inUseFormId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(delInUseResp.status()).toBe(403)
    const delInUseBody = await delInUseResp.json()
    expect(delInUseBody.error?.code).toBe('FORM_IN_USE')
  })

  // ── D2: 문서번호 채번 규칙 PUT→GET ──────────────────────────────────────────

  test('D2 문서번호 채번 규칙 PUT→GET pattern 저장·조회', async ({ page }) => {
    const ts = Date.now()
    const formId = await createForm(page, adminTokens.accessToken, `D2 채번양식 ${ts}`)

    const putResp = await page.request.put(`${API_URL}/document-forms/${formId}/number-rule`, {
      data: { pattern: '{YYYY}-{SEQ:4}', resetYearly: true },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(putResp.status())
    const putBody = (await putResp.json()).data
    expect(putBody.pattern).toBe('{YYYY}-{SEQ:4}')
    expect(putBody.resetYearly).toBe(true)

    const getResp = await page.request.get(`${API_URL}/document-forms/${formId}/number-rule`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(getResp.status()).toBe(200)
    const getBody = (await getResp.json()).data
    expect(getBody.pattern).toBe('{YYYY}-{SEQ:4}')
    expect(getBody.resetYearly).toBe(true)
    expect(getBody.formId).toBe(formId)
  })

  // ── D3: 양식 접근규칙 — 허용 조직 통과, 비허용 조직 차단 ────────────────────

  test('D3 양식 접근규칙: seed-org-dev 허용 → 개발팀 직원 통과, 영업팀 직원 FORM_ACCESS_DENIED', async ({
    page,
  }) => {
    const ts = Date.now()

    // DEPARTMENT 가시성 양식 생성 (규칙 없으면 DEPARTMENT는 전체 차단)
    const formId = await createForm(page, adminTokens.accessToken, `D3 접근규칙양식 ${ts}`, {
      visibilityScope: 'DEPARTMENT',
    })

    // seed-org-dev 조직에 접근 규칙 추가
    const ruleResp = await page.request.post(`${API_URL}/document-forms/${formId}/access-rules`, {
      data: { scopeType: 'ORGANIZATION', scopeId: 'seed-org-dev' },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(ruleResp.status())
    const ruleId = (await ruleResp.json()).data.id as string

    // GET 접근규칙 목록 확인
    const getRulesResp = await page.request.get(
      `${API_URL}/document-forms/${formId}/access-rules`,
      { headers: authHeaders(adminTokens.accessToken) },
    )
    expect(getRulesResp.status()).toBe(200)
    const rulesData = (await getRulesResp.json()).data as Array<{ id: string }>
    expect(rulesData.some((r) => r.id === ruleId)).toBe(true)

    // 개발팀 직원(seed-emp-001, seed-org-dev 소속) → 기안 성공
    const devDocResp = await page.request.post(`${API_URL}/documents`, {
      data: { formId, title: `D3 개발팀 기안 ${ts}`, content: {} },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(devDocResp.ok()).toBeTruthy()
    const devDocBody = await devDocResp.json()
    expect(devDocBody.success).toBe(true)

    // 영업팀 직원(seed-emp-sales, seed-org-sales 소속) → 기안 차단
    const salesDocResp = await page.request.post(`${API_URL}/documents`, {
      data: { formId, title: `D3 영업팀 기안 ${ts}`, content: {} },
      headers: authHeaders(salesTokens.accessToken),
    })
    expect(salesDocResp.ok()).toBe(false)
    const salesDocBody = await salesDocResp.json()
    expect(salesDocBody.success).toBe(false)
    expect(salesDocBody.error?.code).toBe('FORM_ACCESS_DENIED')

    // 접근규칙 삭제
    const delRuleResp = await page.request.delete(
      `${API_URL}/document-forms/${formId}/access-rules/${ruleId}`,
      { headers: authHeaders(adminTokens.accessToken) },
    )
    expect([200, 201, 204]).toContain(delRuleResp.status())
  })

  // ── D4: 공용결재선 CRUD + 이름 중복 + 최종결재자=협조자 차단 ────────────────

  test('D4 공용결재선 생성→steps 수정(version↑)→삭제 + 이름중복 + 최종결재자=협조자 오류', async ({
    page,
  }) => {
    const ts = Date.now()
    const lineName = `D4 결재선 ${ts}`

    // 생성
    const createResp = await page.request.post(`${API_URL}/shared-approval-lines`, {
      data: {
        name: lineName,
        steps: [{ role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 }],
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(createResp.status())
    const lineData = (await createResp.json()).data
    const lineId = lineData.id as string
    const v1 = lineData.version as number

    // steps 수정 → version 증가 확인
    const patchResp = await page.request.patch(`${API_URL}/shared-approval-lines/${lineId}`, {
      data: {
        steps: [
          { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 },
          { role: 'APPROVER', assigneeId: salesEmpId, stepOrder: 2 },
        ],
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(patchResp.status())
    const patchData = (await patchResp.json()).data
    expect(patchData.version).toBeGreaterThan(v1)

    // 삭제
    const delResp = await page.request.delete(`${API_URL}/shared-approval-lines/${lineId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201, 204]).toContain(delResp.status())

    // 이름 중복 검증
    const dupName = `D4 중복결재선 ${ts}`
    const first = await page.request.post(`${API_URL}/shared-approval-lines`, {
      data: { name: dupName, steps: [{ role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 }] },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect([200, 201]).toContain(first.status())

    const dup = await page.request.post(`${API_URL}/shared-approval-lines`, {
      data: { name: dupName, steps: [{ role: 'APPROVER', assigneeId: salesEmpId, stepOrder: 1 }] },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(dup.status()).toBe(400)
    expect((await dup.json()).error?.code).toBe('SHARED_LINE_DUPLICATE_NAME')

    // 최종 결재자 = 협조자 충돌 검증
    const conflictResp = await page.request.post(`${API_URL}/shared-approval-lines`, {
      data: {
        name: `D4 충돌결재선 ${ts}`,
        steps: [
          { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 },
          { role: 'AGREEMENT', assigneeId: orgAdminEmpId, stepOrder: 2 },
        ],
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(conflictResp.status()).toBe(400)
    expect((await conflictResp.json()).error?.code).toBe('FINAL_APPROVER_IS_COLLABORATOR')
  })

  // ── D5: 대리결재 생성→수정→삭제 + 본인 지정 차단 ────────────────────────────

  test('D5 대리결재 생성→수정→삭제(본인) + 본인 지정 → PROXY_SELF_NOT_ALLOWED', async ({
    page,
  }) => {
    // 생성: employee(홍길동)가 orgAdmin을 대리결재자로 지정
    const createResp = await page.request.post(`${API_URL}/proxy-settings`, {
      data: { proxyId: orgAdminEmpId, startDate: '2026-07-01', endDate: '2026-07-31', reason: 'D5 E2E 테스트' },
      headers: authHeaders(empTokens.accessToken),
    })
    expect([200, 201]).toContain(createResp.status())
    const proxyData = (await createResp.json()).data
    const proxyId = proxyData.id as string
    expect(proxyData.principalId).toBe(empEmpId)
    expect(proxyData.proxyId).toBe(orgAdminEmpId)

    // 조회
    const listResp = await page.request.get(`${API_URL}/proxy-settings`, {
      headers: authHeaders(empTokens.accessToken),
    })
    expect(listResp.status()).toBe(200)
    const listData = (await listResp.json()).data
    const items = Array.isArray(listData) ? listData : (listData?.items ?? [])
    expect(items.some((p: { id: string }) => p.id === proxyId)).toBe(true)

    // 수정
    const patchResp = await page.request.patch(`${API_URL}/proxy-settings/${proxyId}`, {
      data: { isActive: false },
      headers: authHeaders(empTokens.accessToken),
    })
    expect([200, 201]).toContain(patchResp.status())
    expect((await patchResp.json()).data.isActive).toBe(false)

    // 삭제
    const delResp = await page.request.delete(`${API_URL}/proxy-settings/${proxyId}`, {
      headers: authHeaders(empTokens.accessToken),
    })
    expect([200, 201, 204]).toContain(delResp.status())

    // 본인 지정 차단
    const selfResp = await page.request.post(`${API_URL}/proxy-settings`, {
      data: { proxyId: empEmpId, startDate: '2026-08-01', endDate: '2026-08-31' },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(selfResp.status()).toBe(400)
    expect((await selfResp.json()).error?.code).toBe('PROXY_SELF_NOT_ALLOWED')
  })

  // ── D6: 결재 차례 아닌 사람 approve → APPROVAL_STEP_NOT_CURRENT ──────────────

  test('D6 결재 차례 아닌 사람(step2 결재자가 step1 PENDING일 때) approve → APPROVAL_STEP_NOT_CURRENT', async ({
    page,
  }) => {
    const ts = Date.now()
    const formId = await createForm(page, adminTokens.accessToken, `D6 순서오류양식 ${ts}`)
    const docId = await createDoc(page, empTokens.accessToken, formId, `D6 순서오류문서 ${ts}`)

    // step1=admin, step2=orgAdmin
    await submitDoc(page, empTokens.accessToken, docId, [
      { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
      { role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 2 },
    ])

    const steps = await fetchSteps(page, adminTokens.accessToken, docId)
    expect(steps[0].status).toBe('PENDING')
    expect(steps[1].status).toBe('WAITING')

    // orgAdmin이 step2를 승인 시도 (step1이 아직 PENDING)
    const approveResp = await page.request.post(
      `${API_URL}/documents/${docId}/steps/${steps[1].id}/approve`,
      { data: {}, headers: authHeaders(orgAdminTokens.accessToken) },
    )
    // 403 이거나 400 — 서버 구현에 따라 허용
    expect(approveResp.status()).toBeGreaterThanOrEqual(400)
    const body = await approveResp.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('APPROVAL_STEP_NOT_CURRENT')
  })

  // ── D7: 기안자 본인 APPROVER 지정 → APPROVAL_SELF_NOT_ALLOWED ────────────────

  test('D7 기안자 본인을 APPROVER로 상신 → APPROVAL_SELF_NOT_ALLOWED', async ({ page }) => {
    const ts = Date.now()
    const formId = await createForm(page, adminTokens.accessToken, `D7 자기결재양식 ${ts}`)
    const docId = await createDoc(page, empTokens.accessToken, formId, `D7 자기결재문서 ${ts}`)

    // 기안자(empEmpId)를 APPROVER로 지정하여 상신
    const submitResp = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
      data: {
        steps: [{ role: 'APPROVER', assigneeId: empEmpId, stepOrder: 1 }],
      },
      headers: authHeaders(empTokens.accessToken),
    })
    expect(submitResp.ok()).toBe(false)
    const body = await submitResp.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('APPROVAL_SELF_NOT_ALLOWED')
  })

  // ── D8: 타인 회수 / 재승인 / EMPLOYEE ledger box 403 ─────────────────────────

  test('D8-a 타인(admin)이 employee 기안 문서 회수 시도 → 403 DOCUMENT_NOT_DRAFTER', async ({
    page,
  }) => {
    const ts = Date.now()
    const formId = await createForm(page, adminTokens.accessToken, `D8a 회수양식 ${ts}`)
    const docId = await createDoc(page, empTokens.accessToken, formId, `D8a 회수문서 ${ts}`)
    await submitDoc(page, empTokens.accessToken, docId, [
      { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
    ])

    // admin이 employee 기안 문서 회수 시도
    const recallResp = await page.request.post(`${API_URL}/documents/${docId}/recall`, {
      data: {},
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(recallResp.ok()).toBe(false)
    const body = await recallResp.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('DOCUMENT_NOT_DRAFTER')
  })

  test('D8-b 이미 승인 완료된 문서를 재승인 시도 → 거부(DOCUMENT_NOT_PENDING) + 상태 불변', async ({
    page,
  }) => {
    const ts = Date.now()
    const formId = await createForm(page, adminTokens.accessToken, `D8b 재승인양식 ${ts}`)
    const docId = await createDoc(page, empTokens.accessToken, formId, `D8b 재승인문서 ${ts}`)
    await submitDoc(page, empTokens.accessToken, docId, [
      { role: 'APPROVER', assigneeId: adminEmpId, stepOrder: 1 },
    ])

    const steps = await fetchSteps(page, adminTokens.accessToken, docId)
    const step1 = steps[0]

    // 1차 승인
    const firstApprove = await page.request.post(
      `${API_URL}/documents/${docId}/steps/${step1.id}/approve`,
      { data: {}, headers: authHeaders(adminTokens.accessToken) },
    )
    expect(firstApprove.ok()).toBeTruthy()

    // 문서 APPROVED 상태 확인
    const statusResp = await page.request.get(`${API_URL}/documents/${docId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    const docData = (await statusResp.json()).data
    expect(docData.status).toBe('APPROVED')

    // 재승인 시도
    const reApprove = await page.request.post(
      `${API_URL}/documents/${docId}/steps/${step1.id}/approve`,
      { data: {}, headers: authHeaders(adminTokens.accessToken) },
    )
    expect(reApprove.ok()).toBe(false)
    const reApproveBody = await reApprove.json()
    expect(reApproveBody.success).toBe(false)
    expect(reApproveBody.error?.code).toBe('DOCUMENT_NOT_PENDING')

    // 상태 불변 확인
    const afterResp = await page.request.get(`${API_URL}/documents/${docId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    expect((await afterResp.json()).data.status).toBe('APPROVED')
  })

  test('D8-c EMPLOYEE가 문서대장(box=ledger) 접근 → 403 DOCUMENT_LEDGER_FORBIDDEN', async ({
    page,
  }) => {
    const ledgerResp = await page.request.get(`${API_URL}/documents?box=ledger&limit=5`, {
      headers: authHeaders(empTokens.accessToken),
    })
    expect(ledgerResp.status()).toBe(403)
    const body = await ledgerResp.json()
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe('DOCUMENT_LEDGER_FORBIDDEN')
  })
})
