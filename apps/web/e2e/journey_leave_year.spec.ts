/**
 * AbleWork ERP — 신입사원 휴가 1년 생명주기 여정 E2E (Chromium)
 *
 * 시나리오: 신입(자체 생성)이 입사 시 연차를 부여받고, 1년간 분기별 휴가를
 * 신청·승인/반려/초과·보상휴가·반차로 사용하며, 1주년에 연차가 재발생한다.
 *
 * 케이스:
 *   J3-1: 입사 시 연차 부여(year/expiresAt) → 잔액 생성 확인
 *   J3-2: 1분기 연차 신청 → 승인 → 잔액 차감
 *   J3-3: 2분기 연차 신청 → 반려 → 잔액 미차감
 *   J3-4: 잔액 초과 신청 → 거부(LEAVE_BALANCE_INSUFFICIENT)
 *   J3-5: 보상휴가 부여 → 신청·승인 → 별도 잔액 차감
 *   J3-6: 반차 부여 → 신청·승인 → 0.5일 차감
 *   J3-7: 1주년 다음 해 연차 재발생 → 신규 연도 잔액 생성
 *   FINAL: 잔액 추이(발생/차감/잔여) 최종 단언
 *
 * 전략:
 *   - 직원 생성·잔액 조회·신청·결재는 모두 API 중심(날짜 분산, 결정적)
 *   - createSubmittedDoc + stepActionApi 는 APPROVER_R1 역할과 맞지 않으므로
 *     요청 기반 플로우(POST /requests + POST /requests/:id/approve|reject)를 사용
 *   - 각 케이스는 완전 독립(AAA 패턴)
 *   - Date.now() suffix로 이메일 유일성 보장
 *
 * 전제: web(:4000)·api(:4001)·DB 가동, 시드 계정 유효.
 */
import { test, expect } from '@playwright/test'
import { ACCOUNTS, API_URL, login, jwtEmployeeId } from './helpers'

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function apiGet(page: Parameters<typeof login>[0], token: string, path: string) {
  const resp = await page.request.get(`${API_URL}${path}`, { headers: authHeaders(token) })
  return resp.json()
}

async function apiPost(
  page: Parameters<typeof login>[0],
  token: string,
  path: string,
  data: unknown,
) {
  const resp = await page.request.post(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  return { resp, body: await resp.json() }
}

async function apiDelete(page: Parameters<typeof login>[0], token: string, path: string) {
  return page.request.delete(`${API_URL}${path}`, { headers: authHeaders(token) })
}

/** 잔액 배열에서 특정 leaveTypeId 잔액 레코드 반환 */
interface BalanceRecord {
  id: string
  leaveTypeId: string
  year: number
  accruedDays: string
  usedDays: string
  remainingDays: string
  expiresAt: string | null
}

async function getBalance(
  page: Parameters<typeof login>[0],
  adminToken: string,
  empId: string,
): Promise<BalanceRecord[]> {
  const body = await apiGet(page, adminToken, `/leaves/balance/${empId}`)
  return (body?.data ?? []) as BalanceRecord[]
}

async function findBalance(
  page: Parameters<typeof login>[0],
  adminToken: string,
  empId: string,
  leaveTypeId: string,
  year?: number,
): Promise<BalanceRecord | undefined> {
  const balances = await getBalance(page, adminToken, empId)
  return balances.find(
    (b) => b.leaveTypeId === leaveTypeId && (year === undefined || b.year === year),
  )
}

// ── 여정 컨텍스트 (beforeAll로 공유) ─────────────────────────────────────────

interface JourneyCtx {
  adminToken: string
  empToken: string
  empId: string
  uuidOrgId: string
  annualTypeId: string
  compTypeId: string
  halfDayTypeId: string
  groupId: string
}

// ── 테스트 스위트 ─────────────────────────────────────────────────────────────

test.describe('신입사원 휴가 1년 생명주기 여정', () => {
  let ctx: JourneyCtx

  // 공유 픽스처 정리 목록
  const cleanup: { type: 'type' | 'group' | 'employee'; id: string }[] = []

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    const ts = Date.now()

    // ── 1. 관리자 토큰 확보 ─────────────────────────────────────────────────
    const { accessToken: adminToken } = await login(
      page,
      ACCOUNTS.admin.email,
      ACCOUNTS.admin.password,
    )

    // ── 2. UUID 조직 조회 (seed-org-dev는 UUID 아니라 accrual 거부됨) ──────
    const orgsBody = await apiGet(page, adminToken, '/organizations?limit=50')
    const allOrgs: Array<{ id: string; name: string }> = orgsBody?.data ?? []
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const uuidOrg = allOrgs.find((o) => uuidRe.test(o.id))
    expect(uuidOrg, 'UUID 조직이 최소 하나 존재해야 합니다').toBeDefined()
    const uuidOrgId = uuidOrg!.id

    // ── 3. 여정 전용 휴가 그룹 + 유형 생성 ───────────────────────────────
    const groupName = `Journey연차그룹${ts}`
    const { body: groupBody } = await apiPost(page, adminToken, '/leaves/groups', {
      name: groupName,
      overageLimitDays: 0,
    })
    expect(groupBody?.success, '그룹 생성 실패').toBe(true)
    const groupId: string = groupBody.data.id
    cleanup.push({ type: 'group', id: groupId })

    // 연차 유형
    const { body: annualBody } = await apiPost(page, adminToken, '/leaves/types', {
      name: `Journey연차${ts}`,
      groupId,
      timeOption: 'full_day',
      deductionDays: 1,
      isActive: true,
    })
    expect(annualBody?.success, '연차 유형 생성 실패').toBe(true)
    const annualTypeId: string = annualBody.data.id
    cleanup.push({ type: 'type', id: annualTypeId })

    // 보상휴가 유형
    const { body: compBody } = await apiPost(page, adminToken, '/leaves/types', {
      name: `Journey보상휴가${ts}`,
      groupId,
      timeOption: 'full_day',
      deductionDays: 1,
      isActive: true,
    })
    expect(compBody?.success, '보상휴가 유형 생성 실패').toBe(true)
    const compTypeId: string = compBody.data.id
    cleanup.push({ type: 'type', id: compTypeId })

    // 반차 유형 (deductionDays 0.5)
    const { body: halfBody } = await apiPost(page, adminToken, '/leaves/types', {
      name: `Journey반차${ts}`,
      groupId,
      timeOption: 'half_day',
      deductionDays: 0.5,
      isActive: true,
    })
    expect(halfBody?.success, '반차 유형 생성 실패').toBe(true)
    const halfDayTypeId: string = halfBody.data.id
    cleanup.push({ type: 'type', id: halfDayTypeId })

    // ── 4. 신입 직원 생성 (initialPassword 포함 → 즉시 로그인 가능) ─────
    const newbieEmail = `newbie-leave-${ts}@ablework.io`
    const { body: empBody } = await apiPost(page, adminToken, '/employees', {
      name: `신입${ts}`,
      email: newbieEmail,
      primaryOrganizationId: uuidOrgId,
      organizationIds: [uuidOrgId],
      joinedAt: '2025-01-15',
      accessLevel: 'EMPLOYEE',
      employmentType: 'regular',
      initialPassword: 'newbie1234!',
    })
    expect(empBody?.success, '직원 생성 실패').toBe(true)
    const empId: string = empBody.data.id
    cleanup.push({ type: 'employee', id: empId })

    // ── 5. 신입 직원 토큰 확보 ────────────────────────────────────────────
    const { accessToken: empToken } = await login(page, newbieEmail, 'newbie1234!')
    const tokenEmpId = jwtEmployeeId(empToken)
    expect(tokenEmpId, 'JWT empId 불일치').toBe(empId)

    ctx = {
      adminToken,
      empToken,
      empId,
      uuidOrgId,
      annualTypeId,
      compTypeId,
      halfDayTypeId,
      groupId,
    }

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    // 생성한 데이터 정리: 유형 → 그룹 순서 (잔액은 유형 삭제 시 cascade)
    const page = await browser.newPage()
    const { adminToken } = ctx

    // 유형 먼저 삭제
    for (const item of cleanup.filter((c) => c.type === 'type')) {
      await apiDelete(page, adminToken, `/leaves/types/${item.id}`)
    }
    // 그룹 삭제
    for (const item of cleanup.filter((c) => c.type === 'group')) {
      await apiDelete(page, adminToken, `/leaves/groups/${item.id}`)
    }
    // 직원 삭제 (소프트 삭제)
    for (const item of cleanup.filter((c) => c.type === 'employee')) {
      await apiDelete(page, adminToken, `/employees/${item.id}`)
    }

    await page.close()
  })

  // ── J3-1: 입사 시 연차 부여 → 잔액 생성 확인 ─────────────────────────────

  test('J3-1: 입사 시 연차 부여 → 잔액(15일) 생성 확인', async ({ page }) => {
    const { adminToken, empId, annualTypeId } = ctx

    // Act — 입사 연도(2025) 연차 15일 수동 부여
    const { resp, body } = await apiPost(page, adminToken, '/leaves/accrual', {
      employeeIds: [empId],
      leaveTypeId: annualTypeId,
      year: 2025,
      expiresAt: '2025-12-31',
      days: 15,
    })

    // Assert — 발생 성공
    expect(resp.status()).toBe(201)
    expect(body?.success).toBe(true)
    expect(body?.data).toHaveLength(1)

    const created = body.data[0]
    expect(created.employeeId).toBe(empId)
    expect(created.leaveTypeId).toBe(annualTypeId)
    expect(created.year).toBe(2025)
    expect(Number(created.accruedDays)).toBe(15)
    expect(Number(created.usedDays)).toBe(0)
    expect(Number(created.remainingDays)).toBe(15)
    expect(created.expiresAt).toContain('2025-12-31')

    // 잔액 조회로 이중 확인
    const balance = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    expect(balance, '잔액 레코드가 존재해야 합니다').toBeDefined()
    expect(Number(balance!.accruedDays)).toBe(15)
    expect(Number(balance!.remainingDays)).toBe(15)
  })

  // ── J3-2: 1분기 연차 신청 → 승인 → 잔액 차감 ────────────────────────────

  test('J3-2: 1분기 연차 1일 신청 → 승인 → remainingDays 14 확인', async ({ page }) => {
    const { adminToken, empToken, empId, annualTypeId } = ctx

    // Arrange — 잔액 확인
    const before = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    expect(before, 'J3-1 선행 필요: 잔액이 없습니다').toBeDefined()
    const beforeRemaining = Number(before!.remainingDays)

    // Act — 1분기 1일 휴가 신청 (2025-03-10)
    const { resp, body } = await apiPost(page, empToken, '/requests', {
      type: 'LEAVE_CREATE',
      payload: {
        leaveTypeId: annualTypeId,
        startDate: '2025-03-10',
        endDate: '2025-03-10',
        reason: 'J3-2 1분기 연차',
      },
    })
    expect(resp.status()).toBe(201)
    expect(body?.success).toBe(true)

    const requestId: string = body.data.id
    expect(requestId).toBeTruthy()
    expect(body.data.status).toBe('PENDING')
    expect(body.data.documentId).toBeTruthy()

    // Act — 관리자 승인
    const { resp: approveResp, body: approveBody } = await apiPost(
      page,
      adminToken,
      `/requests/${requestId}/approve`,
      { comment: 'J3-2 승인' },
    )
    expect(approveResp.status()).toBe(200)
    expect(approveBody?.success).toBe(true)
    expect(approveBody.data.status).toBe('APPROVED')

    // Assert — 잔액 차감 확인 (usedDays +1, remainingDays -1)
    await expect
      .poll(
        async () => {
          const bal = await findBalance(page, adminToken, empId, annualTypeId, 2025)
          return Number(bal?.usedDays ?? 0)
        },
        { timeout: 10000, message: '승인 후 usedDays 증가를 기다립니다' },
      )
      .toBeGreaterThan(0)

    const after = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    expect(after).toBeDefined()
    expect(Number(after!.usedDays)).toBe(1)
    expect(Number(after!.remainingDays)).toBe(beforeRemaining - 1)
  })

  // ── J3-3: 2분기 연차 신청 → 반려 → 잔액 미차감 ───────────────────────────

  test('J3-3: 2분기 연차 1일 신청 → 반려 → remainingDays 불변 확인', async ({ page }) => {
    const { adminToken, empToken, empId, annualTypeId } = ctx

    // Arrange — 반려 전 잔액 스냅샷
    const before = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    expect(before, 'J3-1/J3-2 선행 필요').toBeDefined()
    const beforeRemaining = Number(before!.remainingDays)
    const beforeUsed = Number(before!.usedDays)

    // Act — 2분기 신청 (2025-05-12)
    const { resp, body } = await apiPost(page, empToken, '/requests', {
      type: 'LEAVE_CREATE',
      payload: {
        leaveTypeId: annualTypeId,
        startDate: '2025-05-12',
        endDate: '2025-05-12',
        reason: 'J3-3 2분기 연차',
      },
    })
    expect(resp.status()).toBe(201)
    expect(body?.success).toBe(true)

    const requestId: string = body.data.id
    expect(requestId).toBeTruthy()

    // Act — 관리자 반려
    const { resp: rejectResp, body: rejectBody } = await apiPost(
      page,
      adminToken,
      `/requests/${requestId}/reject`,
      { comment: 'J3-3 반려 사유' },
    )
    expect(rejectResp.status()).toBe(200)
    expect(rejectBody?.success).toBe(true)
    expect(rejectBody.data.status).toBe('REJECTED')

    // Assert — 잔액 미차감: usedDays·remainingDays 불변
    const after = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    expect(after).toBeDefined()
    expect(Number(after!.usedDays)).toBe(beforeUsed)
    expect(Number(after!.remainingDays)).toBe(beforeRemaining)
  })

  // ── J3-4: 잔액 초과 신청 → 거부 ─────────────────────────────────────────

  test('J3-4: 잔액 초과(30일) 신청 → 400 LEAVE_BALANCE_INSUFFICIENT', async ({ page }) => {
    const { empToken, annualTypeId } = ctx

    // Act — 30일 신청 (실제 잔여 14일이므로 초과)
    const { resp, body } = await apiPost(page, empToken, '/requests', {
      type: 'LEAVE_CREATE',
      payload: {
        leaveTypeId: annualTypeId,
        startDate: '2025-08-01',
        endDate: '2025-08-30',
        reason: 'J3-4 초과 신청',
      },
    })

    // Assert — 잔액 부족 에러
    expect(resp.status()).toBe(400)
    expect(body?.success).toBe(false)
    expect(body?.error?.code).toBe('LEAVE_BALANCE_INSUFFICIENT')
    // 에러 메시지에 잔여일과 신청일이 포함되어야 함
    expect(body?.error?.message).toMatch(/잔여/)
  })

  // ── J3-5: 보상휴가 부여 → 신청·승인 → 별도 잔액 차감 ────────────────────

  test('J3-5: 보상휴가 부여(5일) → 1일 신청·승인 → compBalance.usedDays=1', async ({ page }) => {
    const { adminToken, empToken, empId, compTypeId, annualTypeId } = ctx

    // Arrange — 보상휴가 잔액 부여
    const { resp: accrualResp, body: accrualBody } = await apiPost(
      page,
      adminToken,
      '/leaves/accrual',
      {
        employeeIds: [empId],
        leaveTypeId: compTypeId,
        year: 2025,
        expiresAt: '2025-12-31',
        days: 5,
      },
    )
    expect(accrualResp.status()).toBe(201)
    expect(accrualBody?.success).toBe(true)

    const compBefore = await findBalance(page, adminToken, empId, compTypeId, 2025)
    expect(compBefore, '보상휴가 잔액이 생성되어야 합니다').toBeDefined()
    expect(Number(compBefore!.accruedDays)).toBe(5)
    expect(Number(compBefore!.remainingDays)).toBe(5)

    // 연차 잔액 스냅샷 (보상휴가 사용 후 연차 잔액은 불변이어야 함)
    const annualBefore = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    const annualBeforeRemaining = Number(annualBefore?.remainingDays ?? 0)

    // Act — 보상휴가 1일 신청 (2025-07-21)
    const { resp, body } = await apiPost(page, empToken, '/requests', {
      type: 'LEAVE_CREATE',
      payload: {
        leaveTypeId: compTypeId,
        startDate: '2025-07-21',
        endDate: '2025-07-21',
        reason: 'J3-5 보상휴가 사용',
      },
    })
    expect(resp.status()).toBe(201)
    expect(body?.success).toBe(true)

    const requestId: string = body.data.id

    // Act — 승인
    const { resp: approveResp, body: approveBody } = await apiPost(
      page,
      adminToken,
      `/requests/${requestId}/approve`,
      { comment: 'J3-5 보상휴가 승인' },
    )
    expect(approveResp.status()).toBe(200)
    expect(approveBody?.success).toBe(true)
    expect(approveBody.data.status).toBe('APPROVED')

    // Assert — 보상휴가 차감 확인
    await expect
      .poll(
        async () => {
          const b = await findBalance(page, adminToken, empId, compTypeId, 2025)
          return Number(b?.usedDays ?? 0)
        },
        { timeout: 10000 },
      )
      .toBe(1)

    const compAfter = await findBalance(page, adminToken, empId, compTypeId, 2025)
    expect(Number(compAfter!.usedDays)).toBe(1)
    expect(Number(compAfter!.remainingDays)).toBe(4)

    // 연차 잔액은 불변
    const annualAfter = await findBalance(page, adminToken, empId, annualTypeId, 2025)
    expect(Number(annualAfter?.remainingDays)).toBe(annualBeforeRemaining)
  })

  // ── J3-6: 반차 부여 → 신청·승인 → 0.5일 차감 ────────────────────────────

  test('J3-6: 반차 부여(5일) → 반차 1회 신청·승인 → halfBalance.usedDays=0.5', async ({
    page,
  }) => {
    const { adminToken, empToken, empId, halfDayTypeId } = ctx

    // Arrange — 반차 잔액 부여
    const { resp: accrualResp, body: accrualBody } = await apiPost(
      page,
      adminToken,
      '/leaves/accrual',
      {
        employeeIds: [empId],
        leaveTypeId: halfDayTypeId,
        year: 2025,
        expiresAt: '2025-12-31',
        days: 5,
      },
    )
    expect(accrualResp.status()).toBe(201)
    expect(accrualBody?.success).toBe(true)

    const halfBefore = await findBalance(page, adminToken, empId, halfDayTypeId, 2025)
    expect(halfBefore, '반차 잔액이 생성되어야 합니다').toBeDefined()
    expect(Number(halfBefore!.accruedDays)).toBe(5)

    // Act — 반차 신청 (2025-09-08)
    const { resp, body } = await apiPost(page, empToken, '/requests', {
      type: 'LEAVE_CREATE',
      payload: {
        leaveTypeId: halfDayTypeId,
        startDate: '2025-09-08',
        endDate: '2025-09-08',
        reason: 'J3-6 반차 신청',
      },
    })
    expect(resp.status()).toBe(201)
    expect(body?.success).toBe(true)

    const requestId: string = body.data.id

    // Act — 승인
    const { resp: approveResp, body: approveBody } = await apiPost(
      page,
      adminToken,
      `/requests/${requestId}/approve`,
      { comment: 'J3-6 반차 승인' },
    )
    expect(approveResp.status()).toBe(200)
    expect(approveBody?.success).toBe(true)
    expect(approveBody.data.status).toBe('APPROVED')

    // Assert — 반차 deductionDays(0.5) 차감 확인
    await expect
      .poll(
        async () => {
          const b = await findBalance(page, adminToken, empId, halfDayTypeId, 2025)
          return Number(b?.usedDays ?? 0)
        },
        { timeout: 10000 },
      )
      .toBeGreaterThan(0)

    const halfAfter = await findBalance(page, adminToken, empId, halfDayTypeId, 2025)
    expect(Number(halfAfter!.usedDays)).toBe(0.5)
    expect(Number(halfAfter!.remainingDays)).toBe(4.5)
  })

  // ── J3-7: 1주년 다음 해 연차 재발생 → 신규 연도 잔액 생성 ────────────────

  test('J3-7: 1주년 시점(2026) 연차 15일 재발생 → year=2026 잔액 생성 확인', async ({
    page,
  }) => {
    const { adminToken, empId, annualTypeId } = ctx

    // Act — 다음 해(2026) 연차 재발생 (만료일 2026-12-31)
    const { resp, body } = await apiPost(page, adminToken, '/leaves/accrual', {
      employeeIds: [empId],
      leaveTypeId: annualTypeId,
      year: 2026,
      expiresAt: '2026-12-31',
      days: 15,
    })

    // Assert — 발생 성공
    expect(resp.status()).toBe(201)
    expect(body?.success).toBe(true)
    expect(body?.data).toHaveLength(1)

    const created = body.data[0]
    expect(created.year).toBe(2026)
    expect(Number(created.accruedDays)).toBe(15)
    expect(Number(created.usedDays)).toBe(0)
    expect(Number(created.remainingDays)).toBe(15)
    expect(created.expiresAt).toContain('2026-12-31')

    // 2025년 잔액과 2026년 잔액이 별개로 존재하는지 확인
    const allBalances = await getBalance(page, adminToken, empId)
    const annual2025 = allBalances.find((b) => b.leaveTypeId === annualTypeId && b.year === 2025)
    const annual2026 = allBalances.find((b) => b.leaveTypeId === annualTypeId && b.year === 2026)

    expect(annual2025, '2025년 연차 잔액이 존재해야 합니다').toBeDefined()
    expect(annual2026, '2026년 연차 잔액이 존재해야 합니다').toBeDefined()
    // 두 연도는 독립 레코드
    expect(annual2025!.id).not.toBe(annual2026!.id)
    expect(annual2026!.year).toBe(2026)
    expect(Number(annual2026!.remainingDays)).toBe(15)
  })

  // ── FINAL: 잔액 추이 최종 단언 ───────────────────────────────────────────

  test('FINAL: 1년 여정 최종 잔액 추이 검증', async ({ page }) => {
    const { adminToken, empId, annualTypeId, compTypeId, halfDayTypeId } = ctx

    const allBalances = await getBalance(page, adminToken, empId)

    // 2025 연차: 15일 부여, 1일(J3-2) 사용, 14일 잔여
    const annual2025 = allBalances.find((b) => b.leaveTypeId === annualTypeId && b.year === 2025)
    expect(annual2025, '2025 연차 잔액').toBeDefined()
    expect(Number(annual2025!.accruedDays)).toBe(15)
    expect(Number(annual2025!.usedDays)).toBe(1)
    expect(Number(annual2025!.remainingDays)).toBe(14)

    // 2026 연차: 15일 부여, 0일 사용, 15일 잔여
    const annual2026 = allBalances.find((b) => b.leaveTypeId === annualTypeId && b.year === 2026)
    expect(annual2026, '2026 연차 잔액').toBeDefined()
    expect(Number(annual2026!.accruedDays)).toBe(15)
    expect(Number(annual2026!.usedDays)).toBe(0)
    expect(Number(annual2026!.remainingDays)).toBe(15)

    // 보상휴가(2025): 5일 부여, 1일 사용, 4일 잔여
    const comp2025 = allBalances.find((b) => b.leaveTypeId === compTypeId && b.year === 2025)
    expect(comp2025, '보상휴가 2025 잔액').toBeDefined()
    expect(Number(comp2025!.accruedDays)).toBe(5)
    expect(Number(comp2025!.usedDays)).toBe(1)
    expect(Number(comp2025!.remainingDays)).toBe(4)

    // 반차(2025): 5일 부여, 0.5일 사용, 4.5일 잔여
    const half2025 = allBalances.find((b) => b.leaveTypeId === halfDayTypeId && b.year === 2025)
    expect(half2025, '반차 2025 잔액').toBeDefined()
    expect(Number(half2025!.accruedDays)).toBe(5)
    expect(Number(half2025!.usedDays)).toBe(0.5)
    expect(Number(half2025!.remainingDays)).toBe(4.5)

    // 전체 요약 출력 (디버그 편의)
    const summary = [annual2025, annual2026, comp2025, half2025].map((b) => ({
      typeId: b!.leaveTypeId.slice(0, 8) + '…',
      year: b!.year,
      accrued: Number(b!.accruedDays),
      used: Number(b!.usedDays),
      remaining: Number(b!.remainingDays),
    }))
    // 잔액 요약이 4개 레코드(2025연차, 2026연차, 보상, 반차)
    expect(summary).toHaveLength(4)
  })
})
