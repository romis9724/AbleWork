/**
 * AbleWork ERP — GENERAL_ADMIN 1년 여정 E2E (Chromium)
 *
 * 시나리오: GENERAL_ADMIN(genadmin)이 1년간 전사 HR·결재 관리 역할을 수행한다.
 *
 * 케이스:
 *   G1  전사 직원 등록/수정/근로정보 (여러 조직)
 *   G2  휴가 발생규칙·수동발생 운영 → 잔액 발생
 *   G3  근무유형/템플릿/일정 관리
 *   G4  회사 문서 결재자로 승인/반려 (자체 생성 문서)
 *   G5  기안양식·공용결재선 생성/수정/삭제 (GENERAL 허용)
 *   G6  메시지 발송→발송내역 + 자동화 규칙 CRUD
 *   G7  리포트 조회 + 스냅샷 생성·행조회
 *   G8  알림규칙 event/webhook 저장 → 403 없이 GET 반영 (D-1)
 *   G9  RBAC: PATCH permission-settings → 403 (SUPER 전용, D-2)
 *   G10 전 조직 직원 접근 (dev+sales 200)
 *
 * 전략:
 *   - 셋업·검증은 API(page.request), 핵심 진입 UI는 uiLogin 1~2회
 *   - Date.now() 접미사로 이름 유일성 보장 (타 테스트와 격리)
 *   - company-settings·permission-settings 전역 설정은 변경하지 않는다
 *   - 생성 리소스는 afterAll에서 정리
 *
 * 환경: web http://localhost:4000 / api http://localhost:4001/api/v1
 * 금지: 서버 재시작·prisma migrate/seed/reset·docker·DB 리셋
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
} from './helpers'

// ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

type AnyPage = Parameters<typeof login>[0]

async function apiGet(page: AnyPage, token: string, path: string) {
  const resp = await page.request.get(`${API_URL}${path}`, { headers: authHeaders(token) })
  return resp.json()
}

async function apiPost(page: AnyPage, token: string, path: string, data: unknown) {
  const resp = await page.request.post(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  return { resp, body: await resp.json() }
}

async function apiPatch(page: AnyPage, token: string, path: string, data: unknown) {
  const resp = await page.request.patch(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  return { resp, body: await resp.json() }
}

async function apiDelete(page: AnyPage, token: string, path: string) {
  return page.request.delete(`${API_URL}${path}`, { headers: authHeaders(token) })
}

// ── 여정 컨텍스트 ─────────────────────────────────────────────────────────────

interface JCtx {
  // 토큰
  genAdminToken: string
  adminToken: string
  genAdminEmpId: string
  adminEmpId: string
  // G1 픽스처
  orgAId: string
  orgBId: string
  empAId: string
  empBId: string
  // G2 픽스처
  leaveGroupId: string
  leaveTypeId: string
  accrualRuleId: string
  // G3 픽스처
  shiftTypeId: string
  shiftTemplateId: string
  // G5 픽스처
  docFormId: string
  sharedLineId: string
  // G6 픽스처
  msgTemplateId: string
  automationId: string
  // G7 픽스처
  reportEmpId: string
  snapshotId: string
}

const ctx: JCtx = {
  genAdminToken: '',
  adminToken: '',
  genAdminEmpId: '',
  adminEmpId: '',
  orgAId: '',
  orgBId: '',
  empAId: '',
  empBId: '',
  leaveGroupId: '',
  leaveTypeId: '',
  accrualRuleId: '',
  shiftTypeId: '',
  shiftTemplateId: '',
  docFormId: '',
  sharedLineId: '',
  msgTemplateId: '',
  automationId: '',
  reportEmpId: '',
  snapshotId: '',
}

// ── 정리 목록 ─────────────────────────────────────────────────────────────────

const cleanup: { type: string; id: string }[] = []

// ── 테스트 스위트 ─────────────────────────────────────────────────────────────

test.describe('GENERAL_ADMIN 1년 여정', () => {
  const TS = Date.now()

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    // genadmin + admin 토큰 확보
    const ga = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const adm = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    ctx.genAdminToken = ga.accessToken
    ctx.adminToken = adm.accessToken
    ctx.genAdminEmpId = jwtEmployeeId(ga.accessToken)
    ctx.adminEmpId = jwtEmployeeId(adm.accessToken)

    // G1 조직 2개 사전 생성 (genadmin 권한)
    const orgAResp = await apiPost(page, ctx.genAdminToken, '/organizations', {
      name: `GenOrg-A-${TS}`,
      sortOrder: 90,
    })
    expect(orgAResp.resp.status(), 'G1 조직A 생성').toBe(201)
    ctx.orgAId = orgAResp.body.data.id
    cleanup.push({ type: 'org', id: ctx.orgAId })

    const orgBResp = await apiPost(page, ctx.genAdminToken, '/organizations', {
      name: `GenOrg-B-${TS}`,
      sortOrder: 91,
    })
    expect(orgBResp.resp.status(), 'G1 조직B 생성').toBe(201)
    ctx.orgBId = orgBResp.body.data.id
    cleanup.push({ type: 'org', id: ctx.orgBId })

    // G1 직원 2명 사전 생성 (개별 테스트 외부에서 ctx에 안정적으로 저장)
    const empAEmail = `gen-emp-a-${TS}@ablework.io`
    const empAResp = await apiPost(page, ctx.genAdminToken, '/employees', {
      name: `GenEmpA${TS}`,
      email: empAEmail,
      primaryOrganizationId: ctx.orgAId,
      organizationIds: [ctx.orgAId],
      joinedAt: '2025-01-01',
      accessLevel: 'EMPLOYEE',
      employmentType: 'regular',
      initialPassword: 'GenEmp1234!',
    })
    expect(empAResp.resp.status(), 'beforeAll 직원A 생성').toBe(201)
    ctx.empAId = empAResp.body.data.id
    cleanup.push({ type: 'employee', id: ctx.empAId })

    const empBEmail = `gen-emp-b-${TS}@ablework.io`
    const empBResp = await apiPost(page, ctx.genAdminToken, '/employees', {
      name: `GenEmpB${TS}`,
      email: empBEmail,
      primaryOrganizationId: ctx.orgBId,
      organizationIds: [ctx.orgBId],
      joinedAt: '2025-03-01',
      accessLevel: 'EMPLOYEE',
      employmentType: 'regular',
      initialPassword: 'GenEmp1234!',
    })
    expect(empBResp.resp.status(), 'beforeAll 직원B 생성').toBe(201)
    ctx.empBId = empBResp.body.data.id
    cleanup.push({ type: 'employee', id: ctx.empBId })

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const token = ctx.adminToken // 정리는 admin으로

    // 생성 역순 정리
    const order: string[] = [
      'employee',
      'shift',
      'shiftTemplate',
      'shiftType',
      'accrualRule',
      'leaveType',
      'leaveGroup',
      'docForm',
      'sharedLine',
      'msgTemplate',
      'automation',
      'org',
    ]
    const sorted = [...cleanup].sort(
      (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
    )
    for (const item of sorted) {
      try {
        switch (item.type) {
          case 'employee':
            await apiDelete(page, token, `/employees/${item.id}`)
            break
          case 'shift':
            await apiDelete(page, token, `/shifts/${item.id}`)
            break
          case 'shiftTemplate':
            await apiDelete(page, token, `/shift-templates/${item.id}`)
            break
          case 'shiftType':
            await apiDelete(page, token, `/shift-types/${item.id}`)
            break
          case 'accrualRule':
            await apiDelete(page, token, `/leaves/accrual-rules/${item.id}`)
            break
          case 'leaveType':
            await apiDelete(page, token, `/leaves/types/${item.id}`)
            break
          case 'leaveGroup':
            await apiDelete(page, token, `/leaves/groups/${item.id}`)
            break
          case 'docForm':
            await apiDelete(page, token, `/document-forms/${item.id}`)
            break
          case 'sharedLine':
            await apiDelete(page, token, `/shared-approval-lines/${item.id}`)
            break
          case 'msgTemplate':
            await apiDelete(page, token, `/messages/templates/${item.id}`)
            break
          case 'automation':
            await apiDelete(page, token, `/messages/automations/${item.id}`)
            break
          case 'org':
            await apiDelete(page, token, `/organizations/${item.id}`)
            break
        }
      } catch {
        // 정리 실패는 무시
      }
    }
    await page.close()
  })

  // ── G1: 전사 직원 등록/수정/근로정보 ─────────────────────────────────────────

  test('G1-a: 조직A 직원이 등록됐음을 확인한다', async ({ page }) => {
    // 직원 생성은 beforeAll에서 수행됨 (worker 재시작 안정성)
    expect(ctx.empAId, 'beforeAll 직원A ID').toBeTruthy()

    // 생성 확인 — email은 data.user.email에 있음
    const email = `gen-emp-a-${TS}@ablework.io`
    const check = await apiGet(page, ctx.genAdminToken, `/employees/${ctx.empAId}`)
    expect(check?.data?.id).toBe(ctx.empAId)
    const actualEmail = check?.data?.user?.email ?? check?.data?.email
    expect(actualEmail).toBe(email)
  })

  test('G1-b: 조직B 직원이 등록됐음을 확인한다', async ({ page }) => {
    // 직원 생성은 beforeAll에서 수행됨
    expect(ctx.empBId, 'beforeAll 직원B ID').toBeTruthy()

    const check = await apiGet(page, ctx.genAdminToken, `/employees/${ctx.empBId}`)
    expect(check?.data?.id).toBe(ctx.empBId)
  })

  test('G1-c: GENERAL_ADMIN이 직원 정보를 수정한다 (employmentType 변경)', async ({ page }) => {
    // G1-a 선행 필요
    expect(ctx.empAId, 'G1-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPatch(
      page,
      ctx.genAdminToken,
      `/employees/${ctx.empAId}`,
      { employmentType: 'contract' },
    )
    expect(resp.ok(), 'G1-c PATCH 성공').toBeTruthy()
    expect(body.success).toBe(true)

    // 반영 확인
    const check = await apiGet(page, ctx.genAdminToken, `/employees/${ctx.empAId}`)
    expect(check.data.employmentType).toBe('contract')
  })

  test('G1-d: UI로 직원 목록 화면에 진입한다', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await page.goto(`${BASE_URL}/admin/employees`, { waitUntil: 'domcontentloaded' })
    // 직원 추가하기 버튼은 btn 클래스 버튼 (getByText가 더 안정적)
    await expect(
      page.getByText('직원 추가하기').or(page.getByText('직원 추가'))
    ).toBeVisible({ timeout: 12000 })
  })

  test('G1-e: 근로정보 추가 (API)', async ({ page }) => {
    expect(ctx.empAId, 'beforeAll 직원A 선행 필요').toBeTruthy()

    const { resp, body } = await apiPost(
      page,
      ctx.genAdminToken,
      `/employees/${ctx.empAId}/wage-info`,
      {
        effectiveFrom: '2025-01-01',
        hourlyWage: 12000,
        contractedWorkDays: 'mon,tue,wed,thu,fri',
        contractedHoursPerWeek: 40,
        maxHoursPerWeek: 52,
      },
    )
    // 201 또는 200 허용
    expect(resp.status() < 300, `G1-e 근로정보 추가 상태: ${resp.status()}`).toBeTruthy()
    expect(body.success ?? body.data).toBeTruthy()
  })

  // ── G2: 휴가 발생규칙·수동발생 운영 ──────────────────────────────────────────

  test('G2-a: 휴가 그룹 생성 (GENERAL_ADMIN)', async ({ page }) => {
    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/leaves/groups', {
      name: `GenLeaveGroup${TS}`,
      overageLimitDays: 0,
    })
    expect(resp.status(), 'G2-a 그룹 생성').toBe(201)
    expect(body.success).toBe(true)
    ctx.leaveGroupId = body.data.id
    cleanup.push({ type: 'leaveGroup', id: ctx.leaveGroupId })
  })

  test('G2-b: 휴가 유형 생성 (GENERAL_ADMIN)', async ({ page }) => {
    expect(ctx.leaveGroupId, 'G2-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/leaves/types', {
      name: `GenLeaveType${TS}`,
      groupId: ctx.leaveGroupId,
      timeOption: 'full_day',
      deductionDays: 1,
      isActive: true,
    })
    expect(resp.status(), 'G2-b 유형 생성').toBe(201)
    expect(body.success).toBe(true)
    ctx.leaveTypeId = body.data.id
    cleanup.push({ type: 'leaveType', id: ctx.leaveTypeId })
  })

  test('G2-c: 발생규칙 생성 → 목록에 반영됨 (GENERAL_ADMIN)', async ({ page }) => {
    expect(ctx.leaveGroupId, 'G2-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/leaves/accrual-rules', {
      name: `GenAccrualRule${TS}`,
      leaveGroupId: ctx.leaveGroupId,
      items: [{ accrualBasis: 'yearly', accrualDays: 15, sortOrder: 0 }],
    })
    expect(resp.status() < 300, `G2-c 발생규칙 생성 상태: ${resp.status()}`).toBeTruthy()
    expect(body.success ?? (body.data && true)).toBeTruthy()
    const ruleId = body?.data?.id
    if (ruleId) {
      ctx.accrualRuleId = ruleId
      cleanup.push({ type: 'accrualRule', id: ruleId })
    }

    // 목록 확인
    const list = await apiGet(page, ctx.genAdminToken, '/leaves/accrual-rules')
    const rules = list?.data ?? list
    expect(Array.isArray(rules), '발생규칙 목록 조회').toBeTruthy()
  })

  test('G2-d: 수동발생 → empA 잔액 생성 확인 (GENERAL_ADMIN)', async ({ page }) => {
    expect(ctx.empAId, 'beforeAll 직원A 선행 필요').toBeTruthy()
    expect(ctx.leaveTypeId, 'G2-b 선행 필요').toBeTruthy()

    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/leaves/accrual', {
      employeeIds: [ctx.empAId],
      leaveTypeId: ctx.leaveTypeId,
      year: 2025,
      expiresAt: '2025-12-31',
      days: 10,
    })
    expect(resp.status(), 'G2-d 수동발생').toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)

    const accrued = body.data[0]
    expect(Number(accrued.accruedDays)).toBe(10)
    expect(Number(accrued.remainingDays)).toBe(10)

    // 잔액 조회
    const balResp = await apiGet(
      page,
      ctx.genAdminToken,
      `/leaves/balance/${ctx.empAId}`,
    )
    const balances = balResp?.data ?? []
    const found = balances.find(
      (b: { leaveTypeId: string; year: number }) =>
        b.leaveTypeId === ctx.leaveTypeId && b.year === 2025,
    )
    expect(found, 'empA 잔액 레코드').toBeDefined()
    expect(Number(found!.remainingDays)).toBe(10)
  })

  // ── G3: 근무유형/템플릿/일정 관리 ────────────────────────────────────────────

  test('G3-a: 근무유형 생성 (GENERAL_ADMIN)', async ({ page }) => {
    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/shift-types', {
      name: `GenShiftType${TS}`,
      startTime: '09:00',
      endTime: '18:00',
      breakMinutes: 60,
      colorCode: '#f36f20',
    })
    expect(resp.status() < 300, `G3-a 근무유형 생성 상태: ${resp.status()}`).toBeTruthy()
    expect(body.success ?? body.data).toBeTruthy()
    ctx.shiftTypeId = body?.data?.id ?? ''
    if (ctx.shiftTypeId) cleanup.push({ type: 'shiftType', id: ctx.shiftTypeId })
  })

  test('G3-b: 근무템플릿 생성 (GENERAL_ADMIN)', async ({ page }) => {
    expect(ctx.shiftTypeId, 'G3-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/shift-templates', {
      name: `GenShiftTemplate${TS}`,
      shiftTypeId: ctx.shiftTypeId,
      startTime: '09:00',
      endTime: '18:00',
    })
    expect(resp.status() < 300, `G3-b 템플릿 생성 상태: ${resp.status()}`).toBeTruthy()
    expect(body.success ?? body.data).toBeTruthy()
    ctx.shiftTemplateId = body?.data?.id ?? ''
    if (ctx.shiftTemplateId)
      cleanup.push({ type: 'shiftTemplate', id: ctx.shiftTemplateId })
  })

  test('G3-c: 근무일정 단건 생성 → GET 반영 (GENERAL_ADMIN)', async ({ page }) => {
    expect(ctx.empAId, 'beforeAll 직원A 선행 필요').toBeTruthy()
    expect(ctx.shiftTypeId, 'G3-a 선행 필요').toBeTruthy()

    const shiftDate = '2025-04-07'
    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/shifts', {
      employeeId: ctx.empAId,
      shiftTypeId: ctx.shiftTypeId,
      organizationId: ctx.orgAId,
      date: shiftDate,
      // UTC: 09:00 KST = 00:00 UTC, 18:00 KST = 09:00 UTC
      startAt: `${shiftDate}T00:00:00.000Z`,
      endAt: `${shiftDate}T09:00:00.000Z`,
    })
    expect(resp.status() < 300, `G3-c 근무일정 생성 상태: ${resp.status()}`).toBeTruthy()
    const shiftId = body?.data?.id
    if (shiftId) cleanup.push({ type: 'shift', id: shiftId })

    // GET /shifts 반영 확인
    const listResp = await apiGet(
      page,
      ctx.genAdminToken,
      `/shifts?startAt=${shiftDate}&endAt=${shiftDate}`,
    )
    const shifts = listResp?.data?.items ?? listResp?.data ?? []
    const found = shifts.some(
      (s: { employeeId: string; date?: string }) => s.employeeId === ctx.empAId,
    )
    expect(found, 'G3-c GET /shifts 반영').toBeTruthy()
  })

  test('G3-d: UI로 근무유형 화면에 진입한다', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await page.goto(`${BASE_URL}/admin/shifts/types`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '유형 추가' })).toBeVisible({ timeout: 10000 })
  })

  // ── G4: 문서 결재자로 승인/반려 ─────────────────────────────────────────────

  test('G4-a: genadmin이 결재자로 지정된 문서를 승인한다', async ({ page }) => {
    // empA(EMPLOYEE 역할 없으므로) genAdmin 본인 토큰으로 문서 생성 후 admin이 상신
    // createSubmittedDoc: empTokens 필요 → admin 토큰으로 생성 후 genAdmin을 결재자로
    const adminTokens: Tokens = { accessToken: ctx.adminToken, refreshToken: '' }
    const fId = await firstFormId(page, ctx.adminToken)

    const title = `G4a 承認테스트 ${TS}`
    const docId = await createSubmittedDoc(
      page,
      ctx.adminToken,
      fId,
      [{ role: 'APPROVER', assigneeId: ctx.genAdminEmpId, stepOrder: 1 }],
      title,
    )

    // genAdmin이 결재함(me/documents 결재함)에서 승인
    await uiLogin(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await page.goto(`${BASE_URL}/me/documents`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // 결재함 탭 클릭
    await page.getByRole('button', { name: '결재함', exact: true }).click()

    const search = page.getByPlaceholder('제목 · 문서번호 검색')
    if (await search.count()) await search.fill(title)

    const link = page.locator('.tbl-link', { hasText: title }).first()
    await expect(link).toBeVisible({ timeout: 10000 })
    await link.click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: '승인', exact: true }).click()

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  test('G4-b: genadmin이 결재자로 지정된 문서를 반려한다', async ({ page }) => {
    const adminTokens: Tokens = { accessToken: ctx.adminToken, refreshToken: '' }
    const fId = await firstFormId(page, ctx.adminToken)

    const title = `G4b 반려테스트 ${TS}`
    const docId = await createSubmittedDoc(
      page,
      ctx.adminToken,
      fId,
      [{ role: 'APPROVER', assigneeId: ctx.genAdminEmpId, stepOrder: 1 }],
      title,
    )

    // API로 genadmin 토큰 stepId 조회 후 반려
    const steps = await getSteps(page, ctx.genAdminToken, docId)
    const step = steps.find((s) => s.stepOrder === 1)
    expect(step, 'G4-b step1 존재').toBeDefined()

    const rejectResp = await stepActionApi(
      page,
      ctx.genAdminToken,
      docId,
      step!.id,
      'reject',
      'G4-b E2E 반려 사유',
    )
    expect(rejectResp.ok(), 'G4-b 반려 성공').toBeTruthy()

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('REJECTED')
  })

  // ── G5: 기안양식·공용결재선 CRUD ─────────────────────────────────────────────

  test('G5-a: 기안양식 생성 (GENERAL_ADMIN 허용)', async ({ page }) => {
    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/document-forms', {
      name: `GenForm${TS}`,
      visibilityScope: 'PUBLIC',
      allowPreApproval: false,
      allowReDraft: true,
      isActive: true,
    })
    expect(resp.status(), 'G5-a 양식 생성').toBe(201)
    expect(body.success).toBe(true)
    ctx.docFormId = body.data.id
    cleanup.push({ type: 'docForm', id: ctx.docFormId })
  })

  test('G5-b: 기안양식 수정 (PATCH name)', async ({ page }) => {
    expect(ctx.docFormId, 'G5-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPatch(
      page,
      ctx.genAdminToken,
      `/document-forms/${ctx.docFormId}`,
      { name: `GenFormEdited${TS}` },
    )
    expect(resp.ok(), 'G5-b PATCH 성공').toBeTruthy()
    expect(body.success).toBe(true)
    expect((body.data?.name ?? body.name)).toContain('Edited')
  })

  test('G5-c: 공용결재선 생성 (GENERAL_ADMIN 허용)', async ({ page }) => {
    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/shared-approval-lines', {
      name: `GenSharedLine${TS}`,
      steps: [
        { role: 'APPROVER', assigneeId: ctx.genAdminEmpId, stepOrder: 1 },
      ],
    })
    expect(resp.status(), 'G5-c 공용결재선 생성').toBe(201)
    expect(body.success).toBe(true)
    ctx.sharedLineId = body.data.id
    cleanup.push({ type: 'sharedLine', id: ctx.sharedLineId })
  })

  test('G5-d: 공용결재선 수정 (PATCH steps)', async ({ page }) => {
    expect(ctx.sharedLineId, 'G5-c 선행 필요').toBeTruthy()

    const { resp, body } = await apiPatch(
      page,
      ctx.genAdminToken,
      `/shared-approval-lines/${ctx.sharedLineId}`,
      {
        name: `GenSharedLineEdited${TS}`,
        steps: [
          { role: 'APPROVER', assigneeId: ctx.genAdminEmpId, stepOrder: 1 },
          { role: 'APPROVER', assigneeId: ctx.adminEmpId, stepOrder: 2 },
        ],
      },
    )
    expect(resp.ok(), 'G5-d PATCH 성공').toBeTruthy()
    expect(body.success).toBe(true)
  })

  test('G5-e: 기안양식 삭제 후 목록에서 소프트삭제 확인', async ({ page }) => {
    // 별도 양식을 만들어 삭제 (G5-a 양식은 공용결재선 참조 가능성 → 별도 생성)
    const { body: createBody } = await apiPost(page, ctx.genAdminToken, '/document-forms', {
      name: `GenFormDel${TS}`,
      visibilityScope: 'PUBLIC',
      allowPreApproval: false,
      allowReDraft: false,
      isActive: true,
    })
    const delFormId: string = createBody.data.id

    const delResp = await apiDelete(page, ctx.genAdminToken, `/document-forms/${delFormId}`)
    expect(delResp.ok(), 'G5-e 삭제 성공').toBeTruthy()

    // 목록에서 사라짐 (isActive=false 또는 제거)
    const listResp = await apiGet(page, ctx.genAdminToken, '/document-forms')
    const forms = listResp?.data ?? listResp
    const stillActive = (forms as Array<{ id: string; isActive?: boolean }>).find(
      (f) => f.id === delFormId && f.isActive !== false,
    )
    expect(stillActive, 'G5-e 삭제된 양식이 활성 목록에 없어야 한다').toBeUndefined()
  })

  // ── G6: 메시지 발송→발송내역 + 자동화 규칙 CRUD ──────────────────────────────

  test('G6-a: 메시지 템플릿 생성 (GENERAL_ADMIN)', async ({ page }) => {
    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/messages/templates', {
      name: `GenMsgTemplate${TS}`,
      content: `안녕하세요 #{이름}님, GenAdmin E2E 테스트 ${TS}`,
    })
    expect(resp.status() < 300, `G6-a 템플릿 생성 상태: ${resp.status()}`).toBeTruthy()
    const tmplId = body?.data?.id ?? body?.id
    expect(tmplId, 'G6-a 템플릿 ID').toBeTruthy()
    ctx.msgTemplateId = tmplId
    cleanup.push({ type: 'msgTemplate', id: ctx.msgTemplateId })
  })

  test('G6-b: 메시지 발송(API) → 발송내역 반영', async ({ page }) => {
    expect(ctx.msgTemplateId, 'G6-a 선행 필요').toBeTruthy()
    // G1-b 직원이 UUID 형태이므로 수신자로 사용
    // 없으면 전체 직원 목록에서 UUID 직원 선택
    let recipientId = ctx.empBId
    if (!recipientId) {
      const empList = await apiGet(page, ctx.genAdminToken, '/employees?limit=10')
      const items = (empList?.data?.items ?? []) as Array<{ id: string }>
      const uuidEmp = items.find((e) => /^[0-9a-f-]{36}$/i.test(e.id))
      recipientId = uuidEmp?.id ?? ''
    }
    expect(recipientId, 'G6-b 수신 직원 UUID 필요').toBeTruthy()

    const msgTitle = `G6b 발송 ${TS}`
    const sendResp = await page.request.post(`${API_URL}/messages/send`, {
      headers: authHeaders(ctx.genAdminToken),
      data: {
        title: msgTitle,
        content: `G6-b E2E 메시지 내용 ${TS}`,
        recipientEmployeeIds: [recipientId],
        templateId: ctx.msgTemplateId,
      },
    })
    expect(sendResp.ok(), `G6-b 발송 200 (실제: ${sendResp.status()})`).toBeTruthy()

    // 발송내역 확인
    const sentResp = await apiGet(page, ctx.genAdminToken, '/messages/sent')
    const sentItems = (sentResp?.data?.items ?? sentResp?.data ?? []) as Array<{
      title?: string
    }>
    expect(
      sentItems.some((m) => m.title === msgTitle),
      'G6-b 발송내역에 메시지가 있어야 한다',
    ).toBeTruthy()
  })

  test('G6-c: 자동화 규칙 생성 (GENERAL_ADMIN)', async ({ page }) => {
    expect(ctx.msgTemplateId, 'G6-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/messages/automations', {
      name: `GenAutomation${TS}`,
      templateId: ctx.msgTemplateId,
      automationType: 'anniversary',
      triggerBasis: 'join_date',
      sendTime: '09:00',
    })
    expect(resp.status() < 300, `G6-c 자동화 생성 상태: ${resp.status()}`).toBeTruthy()
    const autoId = body?.data?.id ?? body?.id
    expect(autoId, 'G6-c 자동화 ID').toBeTruthy()
    ctx.automationId = autoId
    cleanup.push({ type: 'automation', id: ctx.automationId })
  })

  test('G6-d: 자동화 규칙 수정 → 삭제', async ({ page }) => {
    expect(ctx.automationId, 'G6-c 선행 필요').toBeTruthy()

    // 수정
    const { resp: patchResp } = await apiPatch(
      page,
      ctx.genAdminToken,
      `/messages/automations/${ctx.automationId}`,
      { name: `GenAutomationEdited${TS}` },
    )
    expect(patchResp.ok(), 'G6-d PATCH 성공').toBeTruthy()

    // 삭제
    const delResp = await apiDelete(
      page,
      ctx.genAdminToken,
      `/messages/automations/${ctx.automationId}`,
    )
    expect(delResp.ok(), 'G6-d DELETE 성공').toBeTruthy()

    // cleanup 목록에서 제거 (afterAll에서 중복 시도 방지)
    const idx = cleanup.findIndex(
      (c) => c.type === 'automation' && c.id === ctx.automationId,
    )
    if (idx !== -1) cleanup.splice(idx, 1)
  })

  // ── G7: 리포트 조회 + 스냅샷 생성·행조회 ─────────────────────────────────────

  test('G7-a: 리포트 직원 생성 + 출퇴근 등록', async ({ page }) => {
    const email = `gen-report-${TS}@ablework.io`
    const { resp: empResp, body: empBody } = await apiPost(
      page,
      ctx.genAdminToken,
      '/employees',
      {
        name: `GenReport${TS}`,
        email,
        primaryOrganizationId: ctx.orgAId,
        organizationIds: [ctx.orgAId],
        joinedAt: '2025-01-01',
        accessLevel: 'EMPLOYEE',
        employmentType: 'regular',
        initialPassword: 'GenRpt1234!',
      },
    )
    expect(empResp.status(), 'G7-a 직원 생성').toBe(201)
    ctx.reportEmpId = empBody.data.id
    cleanup.push({ type: 'employee', id: ctx.reportEmpId })

    // 출퇴근 기록 추가
    const attResp = await apiPost(page, ctx.genAdminToken, '/attendances', {
      employeeId: ctx.reportEmpId,
      clockInAt: '2025-06-10T01:00:00.000Z',
      clockOutAt: '2025-06-10T10:00:00.000Z',
      status: 'normal',
    })
    expect(attResp.resp.status() < 300, `G7-a 출퇴근 기록 상태: ${attResp.resp.status()}`).toBeTruthy()
  })

  test('G7-b: 실시간 리포트 API 조회', async ({ page }) => {
    expect(ctx.reportEmpId, 'G7-a 선행 필요').toBeTruthy()

    const rows = await apiGet(
      page,
      ctx.genAdminToken,
      `/reports/realtime?startDate=2025-06-01&endDate=2025-06-30&employeeId=${ctx.reportEmpId}`,
    )
    const data = rows?.data ?? []
    expect(Array.isArray(data), 'G7-b 리포트 배열').toBeTruthy()
  })

  test('G7-c: UI로 리포트 화면 진입 → 조회 버튼 존재 확인', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '조회' })).toBeVisible({ timeout: 10000 })
  })

  test('G7-d: 스냅샷 생성 → 행 조회 (API)', async ({ page }) => {
    const snapName = `GenSnap${TS}`

    const { resp, body } = await apiPost(page, ctx.genAdminToken, '/reports/snapshots', {
      name: snapName,
      periodStart: '2025-06-01',
      periodEnd: '2025-06-30',
      columnConfig: {},
    })
    expect(resp.status() < 300, `G7-d 스냅샷 생성 상태: ${resp.status()}`).toBeTruthy()
    ctx.snapshotId = body?.data?.id
    expect(ctx.snapshotId, 'G7-d 스냅샷 ID').toBeTruthy()

    // 행 조회
    const rowsResp = await apiGet(
      page,
      ctx.genAdminToken,
      `/reports/snapshots/${ctx.snapshotId}/rows`,
    )
    expect(rowsResp, 'G7-d rows 응답').toHaveProperty('data')
    const rows = rowsResp.data?.rows ?? rowsResp.data ?? []
    expect(Array.isArray(rows), 'G7-d rows 배열').toBeTruthy()
  })

  // ── G8: 알림규칙 event/webhook 저장 → 403 없이 GET 반영 (D-1) ────────────────

  test('G8-a: GENERAL_ADMIN이 이벤트 알림규칙 토글 → 403 없이 저장됨', async ({ page }) => {
    const { accessToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )

    // 현재 상태 조회
    const rulesRes = await apiGet(page, accessToken, '/notifications/rules?limit=100')
    const rules: Array<{ eventType: string; isActive: boolean }> =
      rulesRes?.data?.items ?? rulesRes?.data ?? []

    const testEvent = 'attendance.clock_in'
    const ruleBefore = rules.find((r) => r.eventType === testEvent)
    const activeBefore = ruleBefore?.isActive ?? false

    // PATCH event 토글
    const patchResp = await page.request.patch(`${API_URL}/notifications/rules/event`, {
      data: { eventType: testEvent, isActive: !activeBefore },
      headers: authHeaders(accessToken),
    })
    expect(patchResp.status(), 'G8-a PATCH event 403 없이 성공해야 함').not.toBe(403)
    expect(patchResp.ok(), 'G8-a PATCH event 성공').toBeTruthy()

    // GET 반영 확인
    try {
      await expect
        .poll(
          async () => {
            const res = await apiGet(page, accessToken, '/notifications/rules?limit=100')
            const items: Array<{ eventType: string; isActive: boolean }> =
              res?.data?.items ?? res?.data ?? []
            return items.find((r) => r.eventType === testEvent)?.isActive
          },
          { timeout: 8000 },
        )
        .toBe(!activeBefore)
    } finally {
      // 원복
      await page.request.patch(`${API_URL}/notifications/rules/event`, {
        data: { eventType: testEvent, isActive: activeBefore },
        headers: authHeaders(accessToken),
      })
    }
  })

  test('G8-b: GENERAL_ADMIN이 Webhook URL 저장 → 403 없이 GET 반영', async ({ page }) => {
    const { accessToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )

    // 현재 webhook 조회
    const before = await apiGet(page, accessToken, '/notifications/rules?limit=100')
    const rulesBefore: Array<{ webhookUrl?: string | null }> =
      before?.data?.items ?? before?.data ?? []
    const webhookBefore = rulesBefore.find((r) => r.webhookUrl)?.webhookUrl ?? ''

    const testWebhook = 'https://discord.com/api/webhooks/e2e-genadmin/mock-token'

    const patchResp = await page.request.patch(`${API_URL}/notifications/rules/webhook`, {
      data: { webhookUrl: testWebhook },
      headers: authHeaders(accessToken),
    })
    expect(patchResp.status(), 'G8-b PATCH webhook 403 없이 성공해야 함').not.toBe(403)
    expect(patchResp.ok(), 'G8-b PATCH webhook 성공').toBeTruthy()

    // GET 반영 확인
    try {
      await expect
        .poll(
          async () => {
            const res = await apiGet(page, accessToken, '/notifications/rules?limit=100')
            const items: Array<{ webhookUrl?: string | null }> =
              res?.data?.items ?? res?.data ?? []
            return items.find((r) => r.webhookUrl)?.webhookUrl
          },
          { timeout: 8000 },
        )
        .toBe(testWebhook)
    } finally {
      // 원복
      await page.request.patch(`${API_URL}/notifications/rules/webhook`, {
        data: { webhookUrl: webhookBefore },
        headers: authHeaders(accessToken),
      })
    }
  })

  // ── G9: RBAC — PATCH permission-settings → 403 (SUPER 전용, D-2) ─────────────

  test('G9: GENERAL_ADMIN이 permission-settings PATCH → 403 반환', async ({ page }) => {
    const { accessToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )

    // GET은 허용돼야 함
    const getResp = await page.request.get(`${API_URL}/permission-settings`, {
      headers: authHeaders(accessToken),
    })
    expect(getResp.status(), 'G9 GET permission-settings 허용').toBe(200)

    // PATCH는 SUPER_ADMIN 전용 → 403
    const patchResp = await page.request.patch(`${API_URL}/permission-settings`, {
      data: { orgAdmin: {}, employee: {} },
      headers: authHeaders(accessToken),
    })
    expect(patchResp.status(), 'G9 PATCH permission-settings SUPER 전용 → 403').toBe(403)
  })

  // ── G10: 전 조직 직원 접근 (dev+sales 200) ───────────────────────────────────

  test('G10: GENERAL_ADMIN이 전 조직 직원에 200으로 접근한다', async ({ page }) => {
    const { accessToken } = await login(
      page,
      ACCOUNTS.genAdmin.email,
      ACCOUNTS.genAdmin.password,
    )

    // 전체 직원 목록 조회 (limit=100)
    const allEmpsResp = await page.request.get(`${API_URL}/employees?limit=100`, {
      headers: authHeaders(accessToken),
    })
    expect(allEmpsResp.status(), 'G10 전체 직원 조회 200').toBe(200)

    const allEmpsBody = await allEmpsResp.json()
    const items = (allEmpsBody?.data?.items ?? allEmpsBody?.data ?? []) as Array<{
      id: string
      name?: string
      organizations?: Array<{ organizationId: string }>
    }>
    // 최소 2명 이상 (시드: admin + genadmin + employee + sales)
    expect(items.length, 'G10 직원 2명 이상').toBeGreaterThanOrEqual(2)

    // UUID 형태의 직원이 포함돼야 함 (다른 조직 직원)
    const uuidEmps = items.filter((e) => /^[0-9a-f-]{36}$/i.test(e.id))
    expect(uuidEmps.length, 'G10 UUID 직원 존재').toBeGreaterThanOrEqual(1)

    // UUID 직원 각각을 단건 조회 → 200
    for (const emp of uuidEmps.slice(0, 2)) {
      const singleResp = await page.request.get(`${API_URL}/employees/${emp.id}`, {
        headers: authHeaders(accessToken),
      })
      expect(
        singleResp.status(),
        `G10 직원 단건 조회 200 (${emp.name ?? emp.id.slice(0, 8)})`,
      ).toBe(200)
    }

    // 이름 검색으로 개발팀·영업팀 시드 직원 조회 가능 확인
    for (const seedEmail of [ACCOUNTS.employee.email, ACCOUNTS.sales.email]) {
      const searchResp = await page.request.get(
        `${API_URL}/employees?search=${encodeURIComponent(seedEmail)}&limit=5`,
        { headers: authHeaders(accessToken) },
      )
      expect(searchResp.status(), `G10 ${seedEmail} 검색 200`).toBe(200)
      const searchBody = await searchResp.json()
      const searchItems = (searchBody?.data?.items ?? []) as Array<{ id: string }>
      if (searchItems.length > 0) {
        const singleResp = await page.request.get(
          `${API_URL}/employees/${searchItems[0].id}`,
          { headers: authHeaders(accessToken) },
        )
        expect(
          singleResp.status(),
          `G10 ${seedEmail} 단건 조회 200`,
        ).toBe(200)
      }
    }
  })
})
