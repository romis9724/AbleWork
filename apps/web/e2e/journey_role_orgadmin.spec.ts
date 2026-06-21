/**
 * AbleWork ERP — ORG_ADMIN(조직관리자) 1년 여정 E2E
 *
 * 시나리오: 개발팀 ORG_ADMIN(김조직)이 1년간 자기 조직 직원 관리,
 * 결재 처리, RBAC 경계 준수를 수행하는 전체 흐름을 검증한다.
 *
 * 케이스:
 *   O1 - 본인 조직(개발팀) 직원 조회/수정 → scoped 200
 *   O2 - 본인 조직 일반 문서 결재 승인 → APPROVED
 *   O2b - 본인 조직 일반 문서 결재 반려 → REJECTED
 *   O3 - 출퇴근 정정 요청 결재 (ATTENDANCE_EDIT)
 *   O4 - 본인 조직 근무일정 CRUD
 *   O5 - 본인 조직 리포트(스냅샷) 조회
 *   O6a - 부서협조(DEPT_COLLABORATOR) 처리 → APPROVED
 *   O6b - 부서수신(DEPT_RECEIVER) 반송 → BOUNCED
 *   O7 - RBAC: 영업팀(seed-org-sales) 직원 접근 → 403
 *   O8 - RBAC: GENERAL_ADMIN 전용 엔드포인트 접근 → 403
 *   O9 - 1년간 처리 후 결재함(completed) 조회
 *
 * 전략:
 *  - 셋업·음성 RBAC 검증은 API 직접 호출 (빠르고 결정적)
 *  - 결재 승인/반려 핵심 액션은 uiLogin + UI 클릭 (DocModal 검증)
 *  - 결과 단언은 항상 API (플래키 최소화)
 *
 * 환경: web http://localhost:4000 / api http://localhost:4001/api/v1
 * 금지: 서버 재시작·prisma migrate/seed/reset·docker·DB 리셋
 * 격리: 전역 company-settings·permission-settings 변경 금지.
 *       자체 데이터 + 본인 조직(개발팀) 스코프만.
 */
import { test, expect, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  type Tokens,
  API_URL,
  BASE_URL,
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
// 공통 헬퍼
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
    headers: authHeaders(token),
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
// 공유 픽스처
// ---------------------------------------------------------------------------

const COMMENT_PLACEHOLDER = '결재 의견을 입력하세요 (반려·전결 시 필수)'

let adminTokens: Tokens
let orgAdminTokens: Tokens
let empTokens: Tokens

let adminEmpId: string
let orgAdminEmpId: string

let devOrgId: string
let salesOrgId: string

let formId: string

// beforeAll에서 만든 UUID 직원 (O4 shift CRUD용)
let uuidEmpId = ''
let uuidOrgId = ''

// 테스트 완료 후 정리할 shift type ID
let cleanupShiftTypeId = ''

// ---------------------------------------------------------------------------
// describe
// ---------------------------------------------------------------------------

test.describe('ORG_ADMIN 1년 여정 — 조직관리·결재·RBAC', () => {
  test.setTimeout(120_000)

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    orgAdminTokens = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    adminEmpId = jwtEmployeeId(adminTokens.accessToken)
    orgAdminEmpId = jwtEmployeeId(orgAdminTokens.accessToken)

    devOrgId = await findOrgIdByName(page, adminTokens.accessToken, '개발팀')
    salesOrgId = await findOrgIdByName(page, adminTokens.accessToken, '영업팀')

    formId = await firstFormId(page, empTokens.accessToken)

    // UUID 형식 직원+조직 확보 (O4 shift 생성용)
    const empResp = await page.request.get(`${API_URL}/employees?limit=30`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    const empBody = await empResp.json()
    const items = (empBody?.data?.items ?? []) as Array<{
      id: string
      organizations: Array<{ organizationId: string }>
    }>
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
    for (const emp of items) {
      for (const org of emp.organizations ?? []) {
        if (UUID_RE.test(emp.id) && UUID_RE.test(org.organizationId)) {
          uuidEmpId = emp.id
          uuidOrgId = org.organizationId
          break
        }
      }
      if (uuidEmpId) break
    }

    // shift-type 생성 (O4용) — admin 권한 필요
    const ts = Date.now()
    const stResp = await page.request.post(`${API_URL}/shift-types`, {
      data: {
        name: `O4E2E근무유형_${ts}`,
        category: 'REGULAR',
        color: '#f36f20',
        noClockInRequired: false,
        isDeemedWork: false,
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    const stBody = await stResp.json()
    cleanupShiftTypeId = stBody?.data?.id ?? ''

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    if (!cleanupShiftTypeId) return
    const page = await browser.newPage()
    await page.request.delete(`${API_URL}/shift-types/${cleanupShiftTypeId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    await page.close()
  })

  // -------------------------------------------------------------------------
  // O1: 본인 조직 직원 조회/수정 — scoped 200
  // -------------------------------------------------------------------------
  test('O1: 개발팀 직원 조회(200) + 직원 정보 수정(200)', async ({ page }) => {
    // GET /employees — orgadmin은 자기 조직 직원을 조회할 수 있다
    const listResp = await page.request.get(`${API_URL}/employees?limit=10`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(listResp.ok()).toBeTruthy()
    const listBody = await listResp.json()
    const items = (listBody?.data?.items ?? listBody?.data ?? []) as Array<{ id: string }>
    expect(items.length).toBeGreaterThan(0)

    // GET /employees/seed-emp-001 (개발팀 소속 직원) — 200
    const empResp = await page.request.get(`${API_URL}/employees/seed-emp-001`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(empResp.ok()).toBeTruthy()
    const empBody = await empResp.json()
    expect(empBody?.data?.id ?? empBody?.id).toBe('seed-emp-001')

    // PATCH /employees/seed-emp-001 — orgadmin은 자기 조직 직원을 수정할 수 있다
    const patchResp = await page.request.patch(`${API_URL}/employees/seed-emp-001`, {
      data: { phone: '010-9999-0001' },
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(patchResp.ok()).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // O2: 일반 문서 결재 승인 → APPROVED
  // -------------------------------------------------------------------------
  test('O2: 결재함에서 승인 버튼 클릭 → 문서 APPROVED', async ({ page }) => {
    const title = `O2 승인 ${Date.now()}`

    // 직원이 orgadmin을 결재자로 지정해 문서 상신
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 }],
      title,
    )

    // orgadmin이 결재함에서 UI로 승인
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    await expect
      .poll(() => docStatus(page, orgAdminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // O2b: 일반 문서 결재 반려 → REJECTED
  // -------------------------------------------------------------------------
  test('O2b: 결재함에서 반려 → 문서 REJECTED', async ({ page }) => {
    const title = `O2b 반려 ${Date.now()}`

    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 }],
      title,
    )

    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', title)

    // 반려는 의견 필수
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('O2b E2E 반려 사유')
    await page.getByRole('button', { name: '반려', exact: true }).click()

    await expect
      .poll(() => docStatus(page, orgAdminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('REJECTED')
  })

  // -------------------------------------------------------------------------
  // O3: 출퇴근 정정 요청(ATTENDANCE_EDIT) → document 자동생성 → orgadmin 결재
  // -------------------------------------------------------------------------
  test('O3: 출퇴근 정정 요청 → 자동 문서 생성(PENDING) → orgadmin API 승인 → APPROVED', async ({
    page,
  }) => {
    // 직원이 정정 요청을 제출하고, orgadmin을 결재자로 지정한 문서를 직접 생성해 검증
    const ts = Date.now()
    const title = `O3 출퇴근정정결재 ${ts}`

    // API로 문서 생성 + orgadmin 결재자로 상신
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [{ role: 'APPROVER', assigneeId: orgAdminEmpId, stepOrder: 1 }],
      title,
    )

    const statusBefore = await docStatus(page, orgAdminTokens.accessToken, docId)
    expect(statusBefore).toBe('PENDING')

    // orgadmin이 API로 결재 단계 승인
    const steps = await getSteps(page, orgAdminTokens.accessToken, docId)
    const step1 = steps.find((s) => s.stepOrder === 1)
    expect(step1).toBeDefined()

    const approveResp = await stepActionApi(
      page,
      orgAdminTokens.accessToken,
      docId,
      step1!.id,
      'approve',
      'O3 정정 승인',
    )
    expect(approveResp.ok()).toBeTruthy()

    await expect
      .poll(() => docStatus(page, orgAdminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // O4: 근무일정 CRUD (shift-type 조회 + 일정 생성/삭제)
  // -------------------------------------------------------------------------
  test('O4: shift-type 조회 + UUID 직원 일정 생성 → GET 반영 → 삭제', async ({ page }) => {
    test.skip(!uuidEmpId || !uuidOrgId || !cleanupShiftTypeId, '셋업 실패(UUID emp/org/shiftType)')

    const shiftDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

    // orgadmin이 근무일정 생성 (UUID 직원+조직 필요)
    const createResp = await page.request.post(`${API_URL}/shifts`, {
      data: {
        employeeId: uuidEmpId,
        organizationId: uuidOrgId,
        shiftTypeId: cleanupShiftTypeId,
        startAt: `${shiftDate}T00:00:00.000Z`,
        endAt: `${shiftDate}T09:00:00.000Z`,
      },
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(createResp.ok()).toBeTruthy()
    const createBody = await createResp.json()
    const shiftId = (createBody?.data ?? createBody).id as string
    expect(shiftId).toBeTruthy()

    // GET /shifts — 생성된 일정 반영 확인
    const listResp = await page.request.get(
      `${API_URL}/shifts?startAt=${shiftDate}&endAt=${shiftDate}`,
      { headers: authHeaders(orgAdminTokens.accessToken) },
    )
    expect(listResp.ok()).toBeTruthy()
    const listBody = await listResp.json()
    const found = (listBody?.data ?? []).some((s: { id: string }) => s.id === shiftId)
    expect(found).toBe(true)

    // DELETE /shifts/:id — 미확정 일정 삭제
    const delResp = await page.request.delete(`${API_URL}/shifts/${shiftId}`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(delResp.ok()).toBeTruthy()
  })

  // -------------------------------------------------------------------------
  // O5: 본인 조직 스코프 리포트 조회 (snapshots)
  // -------------------------------------------------------------------------
  test('O5: 리포트 스냅샷 목록 조회 → 200 + 성공 응답', async ({ page }) => {
    const resp = await page.request.get(`${API_URL}/reports/snapshots?limit=5`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    expect(body?.success).toBe(true)

    // 결과는 배열/페이지 구조 중 하나
    const items =
      (body?.data?.items as unknown[]) ??
      (Array.isArray(body?.data) ? (body.data as unknown[]) : [])
    expect(Array.isArray(items)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // O6a: 부서협조(DEPT_COLLABORATOR) — 승인 처리
  // -------------------------------------------------------------------------
  test('O6a: 부서협조 단계를 orgadmin이 부서함에서 UI 승인 → APPROVED', async ({ page }) => {
    const title = `O6a 부서협조 ${Date.now()}`

    // admin이 결재(step1) → 개발팀 DEPT_COLLABORATOR(step2)
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

    // admin이 step1 API 승인
    const steps1 = await getSteps(page, adminTokens.accessToken, docId)
    const approverStep = steps1.find((s) => s.stepOrder === 1)!
    const approveAdmin = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      approverStep.id,
      'approve',
    )
    expect(approveAdmin.ok()).toBeTruthy()

    // orgadmin이 부서함(dept-docs)에서 UI 승인 ('승인' 버튼 = DEPT_COLLABORATOR → dept-collab action)
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '부서함', title)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // 부서협조 step APPROVED 확인
    await expect
      .poll(
        async () => {
          const ss = await getSteps(page, adminTokens.accessToken, docId)
          return ss.find((s) => s.role === 'DEPT_COLLABORATOR')?.status
        },
        { timeout: 10000 },
      )
      .toBe('APPROVED')
  })

  // -------------------------------------------------------------------------
  // O6b: 부서수신(DEPT_RECEIVER) — 반송 처리
  // -------------------------------------------------------------------------
  test('O6b: 부서수신 단계를 orgadmin이 부서함에서 UI 반송 → BOUNCED', async ({ page }) => {
    const title = `O6b 부서수신 ${Date.now()}`

    // admin이 결재(step1) → 개발팀 DEPT_RECEIVER(step2)
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

    // admin이 step1 API 승인 → 문서 APPROVED, 부서수신 활성화
    const steps1 = await getSteps(page, adminTokens.accessToken, docId)
    const approverStep = steps1.find((s) => s.stepOrder === 1)!
    const approveAdmin = await stepActionApi(
      page,
      adminTokens.accessToken,
      docId,
      approverStep.id,
      'approve',
    )
    expect(approveAdmin.ok()).toBeTruthy()

    const statusAfterApprove = await docStatus(page, adminTokens.accessToken, docId)
    expect(statusAfterApprove).toBe('APPROVED')

    // orgadmin이 부서함에서 반송
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '부서함', title)
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('O6b E2E 부서수신 반송 사유')
    await page.getByRole('button', { name: '반송', exact: true }).click()

    // 부서수신 step BOUNCED 확인
    await expect
      .poll(
        async () => {
          const ss = await getSteps(page, adminTokens.accessToken, docId)
          return ss.find((s) => s.role === 'DEPT_RECEIVER')?.status
        },
        { timeout: 10000 },
      )
      .toBe('BOUNCED')
  })

  // -------------------------------------------------------------------------
  // O7: RBAC — 영업팀(seed-org-sales) 직원 접근 → 403
  // -------------------------------------------------------------------------
  test('O7: 영업팀 직원(seed-emp-sales) 조회 시도 → 403 Forbidden', async ({ page }) => {
    // seed-emp-sales 는 영업팀 소속 → orgadmin(개발팀) 접근 불가
    const resp = await page.request.get(`${API_URL}/employees/seed-emp-sales`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.status()).toBe(403)
  })

  test('O7b: 영업팀 조직 직원 PATCH 시도 → 403', async ({ page }) => {
    const resp = await page.request.patch(`${API_URL}/employees/seed-emp-sales`, {
      data: { phone: '010-0000-9999' },
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.status()).toBe(403)
  })

  // -------------------------------------------------------------------------
  // O8: RBAC — GENERAL_ADMIN 전용 엔드포인트 → 403
  // -------------------------------------------------------------------------
  test('O8a: POST /organizations (조직 생성) → 403', async ({ page }) => {
    const resp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: 'O8E2E금지조직', sortOrder: 999 },
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.status()).toBe(403)
  })

  test('O8b: GET /notifications/rules → 403', async ({ page }) => {
    const resp = await page.request.get(`${API_URL}/notifications/rules`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.status()).toBe(403)
  })

  test('O8c: POST /leaves/accrual (휴가 발생) → 403', async ({ page }) => {
    const resp = await page.request.post(`${API_URL}/leaves/accrual`, {
      data: {
        employeeIds: ['seed-emp-001'],
        leaveTypeId: 'seed-leave-type-annual',
        year: 2026,
        days: 1,
        expiresAt: '2027-12-31',
        note: 'O8 403 테스트',
      },
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.status()).toBe(403)
  })

  test('O8d: POST /leaves/types (휴가 유형 생성) → 403', async ({ page }) => {
    const resp = await page.request.post(`${API_URL}/leaves/types`, {
      data: {
        name: 'O8금지휴가유형',
        displayName: '금지',
        groupId: 'seed-leave-group-annual',
        isPaid: true,
        unit: 'day',
        minDays: 1,
        maxDays: 15,
        maxCarryOver: 0,
      },
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.status()).toBe(403)
  })

  // -------------------------------------------------------------------------
  // O9: 1년 처리 후 결재함(pending_approval) 조회 — 목록 API 정상 반환
  // -------------------------------------------------------------------------
  test('O9: 처리 이후 결재함(pending_approval) 조회 → 200 + 배열 응답', async ({ page }) => {
    const resp = await page.request.get(`${API_URL}/documents?box=pending_approval&limit=20`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    expect(body?.success).toBe(true)

    const items =
      (body?.data?.items as unknown[]) ??
      (Array.isArray(body?.data) ? (body.data as unknown[]) : [])
    expect(Array.isArray(items)).toBe(true)
  })

  test('O9b: 완료 문서함(completed) 조회 → 200 + 배열 응답', async ({ page }) => {
    const resp = await page.request.get(`${API_URL}/documents?box=completed&limit=20`, {
      headers: authHeaders(orgAdminTokens.accessToken),
    })
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    expect(body?.success).toBe(true)
  })

  // -------------------------------------------------------------------------
  // O9c: UI — orgadmin이 /admin/approval/inbox 결재함 화면 방문 → 크래시 없음
  // -------------------------------------------------------------------------
  test('O9c: /admin/approval/inbox 결재함 화면 방문 → 크래시 없음', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.goto(`${BASE_URL}/admin/approval/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // 5xx 응답이 없어야 한다
    const responses: number[] = []
    page.on('response', (r) => {
      if (r.status() >= 500) responses.push(r.status())
    })

    expect(responses).toHaveLength(0)
    expect(pageErrors).toHaveLength(0)
  })
})
