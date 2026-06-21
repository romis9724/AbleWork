/**
 * AbleWork ERP — 신입사원 1년 여정 E2E
 *
 * 시나리오: 자체 생성된 신입 직원이 1년간 각종 요청(휴가·근무변경·정정·기기변경·외근·기타)과
 * 일반 전자결재 기안을 올리고, 결재가 진행되며, 도중 조직 이동과 직무 변경을 겪는다.
 *
 * 전략:
 * - 직원 생성·휴가잔액 부여·요청 생성은 API 전용 (날짜 picker 플래키 회피)
 * - 일반 기안 상신·결재는 UI로 구동 (J4-6)
 * - 결과 검증은 항상 API로 수행 (플래키 최소화)
 * - 테스트 간 독립: beforeAll에서 신입 직원을 1회 생성, 각 test는 독립적
 *
 * 환경: web http://localhost:4000 / api http://localhost:4001/api/v1
 * 금지: 서버 재시작·prisma migrate/seed/reset
 */

import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  type Tokens,
  API_URL,
  BASE_URL,
  login,
  jwtEmployeeId,
  uiLogin,
  docStatus,
  openDocInBox,
} from './helpers'

// ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 신입 직원 상태 (beforeAll에서 채워짐) */
interface NewbieState {
  employeeId: string
  email: string
  password: string
  accessToken: string
  leaveTypeId: string
  primaryOrgId: string
  /** 이동 전 org (초기) */
  initialOrgId: string
  /** 조직 이동 대상 */
  targetOrgId: string
  /** 직무 변경 대상 */
  targetPositionId: string
}

const newbie: NewbieState = {
  employeeId: '',
  email: '',
  password: 'Newbie1234!',
  accessToken: '',
  leaveTypeId: '',
  primaryOrgId: '',
  initialOrgId: '',
  targetOrgId: '',
  targetPositionId: '',
}

/** 어드민 토큰 (beforeAll에서 채워짐) */
let adminTokens: Tokens
let adminEmployeeId: string

// ── 메인 describe ──────────────────────────────────────────────────────────────

test.describe('신입사원 1년 여정 — 전자결재·요청·조직/직무 변경', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    // 어드민 로그인
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)

    // ── 1. UUID 형식 조직 생성 (초기 소속) ──────────────────────────────────────
    const ts = Date.now()
    newbie.email = `newbie-ap-${ts}@ablework.io`

    const initialOrgResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: `E2EJourney초기팀${ts}`, sortOrder: 98 },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(initialOrgResp.status()).toBe(201)
    const initialOrg = (await initialOrgResp.json()).data
    newbie.initialOrgId = initialOrg.id
    newbie.primaryOrgId = initialOrg.id

    // ── 2. 신입 직원 생성 ─────────────────────────────────────────────────────
    const empResp = await page.request.post(`${API_URL}/employees`, {
      data: {
        name: '신입E2E여정',
        email: newbie.email,
        organizationIds: [newbie.initialOrgId],
        primaryOrganizationId: newbie.initialOrgId,
        accessLevel: 'EMPLOYEE',
        joinedAt: '2025-01-01',
        employmentType: 'regular',
        initialPassword: newbie.password,
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(empResp.status()).toBe(201)
    newbie.employeeId = (await empResp.json()).data.id

    // ── 3. 신입 로그인 → 토큰 확보 ──────────────────────────────────────────────
    const loginResp = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: newbie.email, password: newbie.password },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(loginResp.ok()).toBeTruthy()
    newbie.accessToken = (await loginResp.json()).data.accessToken

    // ── 4. UUID 형식 휴가 유형 확보 (기존 활성 유형 재사용) ─────────────────────
    const typesResp = await page.request.get(`${API_URL}/leaves/types`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    const leaveTypes = (await typesResp.json()).data as Array<{
      id: string
      isActive: boolean
    }>
    const uuidLeaveType = leaveTypes.find(
      (t) => t.isActive && t.id.length === 36 && t.id.includes('-'),
    )
    expect(uuidLeaveType).toBeDefined()
    newbie.leaveTypeId = uuidLeaveType!.id

    // ── 5. 신입에게 휴가 잔액 부여 ──────────────────────────────────────────────
    const accrualResp = await page.request.post(`${API_URL}/leaves/accrual`, {
      data: {
        employeeIds: [newbie.employeeId],
        leaveTypeId: newbie.leaveTypeId,
        year: 2026,
        days: 15,
        expiresAt: '2027-12-31',
        note: 'E2E 여정 테스트용 수동 발생',
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(accrualResp.status()).toBe(201)

    // ── 6. 이동 대상 조직 생성 ──────────────────────────────────────────────────
    const targetOrgResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: `E2EJourney이동팀${ts}`, sortOrder: 99 },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(targetOrgResp.status()).toBe(201)
    newbie.targetOrgId = (await targetOrgResp.json()).data.id

    // ── 7. 이동 대상 직무 생성 ──────────────────────────────────────────────────
    const posResp = await page.request.post(`${API_URL}/positions`, {
      data: { name: `E2EJourney직무${ts}` },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(posResp.status()).toBe(201)
    newbie.targetPositionId = (await posResp.json()).data.id

    await page.close()
  })

  // ── J4-1: 휴가 요청 → 문서 자동생성 → 결재(승인) → APPROVED ────────────────────

  test('J4-1: LEAVE_CREATE — 신입이 휴가 신청 → document 자동생성(PENDING) → 어드민 승인 → APPROVED', async ({ page }) => {
    const futureDate = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
    const ts = Date.now()

    // Act: 신입이 휴가 요청
    const resp = await page.request.post(`${API_URL}/requests`, {
      data: {
        type: 'LEAVE_CREATE',
        payload: {
          leaveTypeId: newbie.leaveTypeId,
          startDate: futureDate,
          endDate: futureDate,
          reason: `J4-1 E2E 연차 신청 ${ts}`,
        },
      },
      headers: authHeaders(newbie.accessToken),
    })

    // Assert: 요청 생성
    expect(resp.status()).toBe(201)
    const req = (await resp.json()).data
    expect(req.type).toBe('LEAVE_CREATE')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()
    const requestId = req.id as string

    // Assert: 문서 자동생성 + PENDING
    const docResp = await page.request.get(`${API_URL}/documents/${req.documentId}`, {
      headers: authHeaders(newbie.accessToken),
    })
    const doc = (await docResp.json()).data ?? (await docResp.json())
    expect(doc.status).toBe('PENDING')
    const steps = ((doc.approvalLines ?? []) as Array<{ steps: Array<{ id: string; status: string }> }>)
      .flatMap((l) => l.steps)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps[0].status).toBe('PENDING')

    // Act: 어드민이 결재 승인 — HR 요청 연결 문서는 POST /requests/:id/approve 경로 사용
    // (POST /documents/:id/steps/:stepId/approve는 APPROVER_R1 role 불일치로 거부됨)
    const approveResp = await page.request.post(`${API_URL}/requests/${requestId}/approve`, {
      data: { comment: 'J4-1 승인' },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(approveResp.ok()).toBeTruthy()

    // Assert: 요청·문서 모두 → APPROVED
    const updatedReq = (await approveResp.json()).data
    expect(updatedReq.status).toBe('APPROVED')

    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, req.documentId), { timeout: 10000 })
      .toBe('APPROVED')
  })

  // ── J4-2: 근무일정 변경 요청 → 문서 자동생성 ────────────────────────────────────

  test('J4-2: SHIFT_CREATE — 신입이 근무일정 변경 요청 → document 자동생성(PENDING)', async ({ page }) => {
    const futureDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
    const ts = Date.now()

    const resp = await page.request.post(`${API_URL}/requests`, {
      data: {
        type: 'SHIFT_CREATE',
        payload: {
          date: futureDate,
          startTime: '09:00',
          endTime: '18:00',
          reason: `J4-2 E2E SHIFT_CREATE ${ts}`,
        },
      },
      headers: authHeaders(newbie.accessToken),
    })

    expect(resp.status()).toBe(201)
    const req = (await resp.json()).data
    expect(req.type).toBe('SHIFT_CREATE')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const docResp = await page.request.get(`${API_URL}/documents/${req.documentId}`, {
      headers: authHeaders(newbie.accessToken),
    })
    const doc = (await docResp.json()).data ?? (await docResp.json())
    expect(doc.status).toBe('PENDING')
    const steps = ((doc.approvalLines ?? []) as Array<{ steps: Array<{ status: string }> }>)
      .flatMap((l) => l.steps)
    expect(steps.length).toBeGreaterThan(0)
    expect(steps[0].status).toBe('PENDING')
  })

  // ── J4-3: 출퇴근 정정 요청 → 문서 자동생성 ─────────────────────────────────────

  test('J4-3: ATTENDANCE_EDIT — 신입이 출퇴근 정정 요청 → document 자동생성(PENDING)', async ({ page }) => {
    const pastDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const ts = Date.now()

    const resp = await page.request.post(`${API_URL}/requests`, {
      data: {
        type: 'ATTENDANCE_EDIT',
        payload: {
          date: pastDate,
          clockInAt: '08:50',
          clockOutAt: '18:10',
          reason: `J4-3 E2E 정정 ${ts}`,
        },
      },
      headers: authHeaders(newbie.accessToken),
    })

    expect(resp.status()).toBe(201)
    const req = (await resp.json()).data
    expect(req.type).toBe('ATTENDANCE_EDIT')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const docResp = await page.request.get(`${API_URL}/documents/${req.documentId}`, {
      headers: authHeaders(newbie.accessToken),
    })
    const doc = (await docResp.json()).data ?? (await docResp.json())
    expect(doc.status).toBe('PENDING')
    const lines = (doc.approvalLines ?? []) as Array<{ steps: Array<{ status: string }> }>
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].status).toBe('PENDING')
  })

  // ── J4-4: 기기변경 요청 → 문서 자동생성 ────────────────────────────────────────

  test('J4-4: DEVICE_CHANGE — 신입이 기기변경 요청 → document 자동생성(PENDING)', async ({ page }) => {
    const ts = Date.now()

    const resp = await page.request.post(`${API_URL}/requests`, {
      data: {
        type: 'DEVICE_CHANGE',
        payload: {
          reason: `J4-4 E2E 기기 교체 ${ts}`,
        },
      },
      headers: authHeaders(newbie.accessToken),
    })

    expect(resp.status()).toBe(201)
    const req = (await resp.json()).data
    expect(req.type).toBe('DEVICE_CHANGE')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const docResp = await page.request.get(`${API_URL}/documents/${req.documentId}`, {
      headers: authHeaders(newbie.accessToken),
    })
    const doc = (await docResp.json()).data ?? (await docResp.json())
    expect(doc.status).toBe('PENDING')
    const lines = (doc.approvalLines ?? []) as Array<{ steps: Array<{ status: string }> }>
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].status).toBe('PENDING')
  })

  // ── J4-5a: 외근/출장 요청 → 201·문서 생성 ──────────────────────────────────────

  test('J4-5a: OFFSITE_WORK — 신입이 외근/출장 신청 → 201 + document 자동생성(PENDING)', async ({ page }) => {
    const futureDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
    const ts = Date.now()

    const resp = await page.request.post(`${API_URL}/requests`, {
      data: {
        type: 'OFFSITE_WORK',
        payload: {
          date: futureDate,
          destination: `E2E 고객사방문 ${ts}`,
          reason: `J4-5a E2E 외근 신청 ${ts}`,
        },
      },
      headers: authHeaders(newbie.accessToken),
    })

    expect(resp.status()).toBe(201)
    const req = (await resp.json()).data
    expect(req.type).toBe('OFFSITE_WORK')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const docResp = await page.request.get(`${API_URL}/documents/${req.documentId}`, {
      headers: authHeaders(newbie.accessToken),
    })
    const doc = (await docResp.json()).data ?? (await docResp.json())
    expect(doc.status).toBe('PENDING')
  })

  // ── J4-5b: 기타 요청 → 201·문서 생성 ──────────────────────────────────────────

  test('J4-5b: CUSTOM — 신입이 기타 요청 신청 → 201 + document 자동생성(PENDING)', async ({ page }) => {
    const ts = Date.now()

    const resp = await page.request.post(`${API_URL}/requests`, {
      data: {
        type: 'CUSTOM',
        payload: {
          title: `J4-5b E2E 기타요청 ${ts}`,
          content: `E2E 기타 요청 내용 ${ts}`,
        },
      },
      headers: authHeaders(newbie.accessToken),
    })

    expect(resp.status()).toBe(201)
    const req = (await resp.json()).data
    expect(req.type).toBe('CUSTOM')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const docResp = await page.request.get(`${API_URL}/documents/${req.documentId}`, {
      headers: authHeaders(newbie.accessToken),
    })
    const doc = (await docResp.json()).data ?? (await docResp.json())
    expect(doc.status).toBe('PENDING')
  })

  // ── J4-6: 일반 전자결재 기안 작성→상신→결재(승인) → APPROVED, 기안함/완료함 반영 ─

  test('J4-6: 일반 기안 — 신입이 UI로 상신·결재(승인) → APPROVED, 기안함→완료함 반영', async ({ page }) => {
    const ts = Date.now()
    const docTitle = `J4-6 신입여정 일반기안 ${ts}`

    // ── 셋업: API로 폼 조회 + 문서 생성 + 상신 (UI는 결재 클릭만) ────────────────
    // 신입 토큰으로 폼 조회
    const formsResp = await page.request.get(`${API_URL}/document-forms`, {
      headers: authHeaders(newbie.accessToken),
    })
    const forms = (await formsResp.json()).data as Array<{ id: string; isActive?: boolean }>
    const activeForm = forms.find((f) => f.isActive !== false)
    expect(activeForm).toBeDefined()
    const formId = activeForm!.id

    // API로 문서 생성
    const createResp = await page.request.post(`${API_URL}/documents`, {
      data: { formId, title: docTitle, content: { body: 'J4-6 E2E 일반 기안 내용' } },
      headers: authHeaders(newbie.accessToken),
    })
    expect(createResp.ok()).toBeTruthy()
    const docId = (await createResp.json()).data.id as string

    // API로 상신 (결재자: admin)
    const submitResp = await page.request.post(`${API_URL}/documents/${docId}/submit`, {
      data: { steps: [{ role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 }] },
      headers: authHeaders(newbie.accessToken),
    })
    expect(submitResp.ok()).toBeTruthy()

    // Assert: 상신 후 PENDING 상태
    const pendingStatus = await docStatus(page, newbie.accessToken, docId)
    expect(pendingStatus).toBe('PENDING')

    // ── 기안함 확인: 신입의 me/documents 진행중 탭 ────────────────────────────
    await uiLogin(page, newbie.email, newbie.password)
    await openDocInBox(page, '/me/documents', '진행중', docTitle)
    // 모달이 열렸으면 문서 제목 확인
    await expect(page.locator('.modal')).toBeVisible({ timeout: 10000 })
    await page.keyboard.press('Escape')

    // ── UI: 어드민이 결재함에서 승인 ──────────────────────────────────────────
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await openDocInBox(page, '/admin/approval/inbox', '결재함', docTitle)
    await page.getByRole('button', { name: '승인', exact: true }).click()

    // Assert: APPROVED
    await expect
      .poll(() => docStatus(page, adminTokens.accessToken, docId), { timeout: 10000 })
      .toBe('APPROVED')

    // ── 완료함 확인: 신입의 me/documents 완료 탭 ─────────────────────────────
    await uiLogin(page, newbie.email, newbie.password)
    await openDocInBox(page, '/me/documents', '완료', docTitle)
    await expect(page.locator('.modal')).toBeVisible({ timeout: 10000 })
  })

  // ── J4-7: 조직 이동 ────────────────────────────────────────────────────────────

  test('J4-7: 조직 이동 — 신입의 primaryOrganizationId가 대상 조직으로 변경된다', async ({ page }) => {
    // Act: PATCH /employees/:id
    const patchResp = await page.request.patch(`${API_URL}/employees/${newbie.employeeId}`, {
      data: {
        organizationIds: [newbie.targetOrgId],
        primaryOrganizationId: newbie.targetOrgId,
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(patchResp.ok()).toBeTruthy()

    // Assert: 직원 조회로 조직 변경 확인
    const empResp = await page.request.get(`${API_URL}/employees/${newbie.employeeId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    const emp = (await empResp.json()).data
    const orgIds: string[] = (emp.organizations ?? []).map(
      (o: { organizationId: string }) => o.organizationId,
    )
    expect(orgIds).toContain(newbie.targetOrgId)
    expect(orgIds).not.toContain(newbie.initialOrgId)
  })

  // ── J4-8: 직무 변경 ────────────────────────────────────────────────────────────

  test('J4-8: 직무 변경 — 신입의 positionIds에 대상 직무가 추가된다', async ({ page }) => {
    // Act: PATCH /employees/:id with positionIds
    const patchResp = await page.request.patch(`${API_URL}/employees/${newbie.employeeId}`, {
      data: {
        positionIds: [newbie.targetPositionId],
      },
      headers: authHeaders(adminTokens.accessToken),
    })
    expect(patchResp.ok()).toBeTruthy()

    // Assert: 직원 조회로 직무 확인
    const empResp = await page.request.get(`${API_URL}/employees/${newbie.employeeId}`, {
      headers: authHeaders(adminTokens.accessToken),
    })
    const emp = (await empResp.json()).data
    const posIds: string[] = (emp.positions ?? []).map(
      (p: { positionId: string }) => p.positionId,
    )
    expect(posIds).toContain(newbie.targetPositionId)
  })
})
