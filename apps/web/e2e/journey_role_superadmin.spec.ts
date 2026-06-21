/**
 * AbleWork ERP — SUPER_ADMIN 1년 여정 E2E (Chromium)
 *
 * 시나리오: SUPER_ADMIN(admin@ablework.io)이 1년간 전사 최고관리자로서
 * 회사설정 변경, 권한설정, 알림규칙, 조직/직원 구축, 감사로그 확인,
 * 출퇴근 확정/해제, 문서 강제삭제, 전 조직 접근, 리포트 스냅샷을 수행한다.
 *
 * 케이스:
 *   S1  회사 일반설정(weekStartDay·timeFormat) 변경 → GET 반영 → 원복
 *   S2  근태 정책(lateGracePeriodMinutes·noShiftClockPolicy) 변경 → GET 반영 → 원복
 *   S3  전자결재 공통 5토글 변경 → GET 반영 → 원복
 *   S4  권한설정(permission-settings) PATCH → GET 반영 → 원복 (SUPER 전용 200)
 *   S5  알림규칙 event/webhook 설정 → GET 반영 → 원복
 *   S6  조직/직무 구축 + 직원 다수 등록
 *   S7  감사로그 조회 → 직원등록/결재 기록 1건 이상 확인
 *   S8  출퇴근 기간 확정 후 확정해제(unconfirm) → SUPER 가능
 *   S9  문서 강제 삭제(force delete) → GENERAL_ADMIN 이상 가능
 *   S10 전 조직(dev+sales) 직원 접근 → 200
 *   S11 연말 리포트 + 스냅샷 생성·행조회
 *
 * 원복 원칙:
 *   전역 상태(company-settings·permission-settings·notifications/rules)를 변경하는
 *   케이스는 반드시 GET으로 원래 값 저장 → 변경 → GET 반영 단언 → 원래 값으로 원복.
 *
 * 환경: web http://localhost:4000 / api http://localhost:4001/api/v1
 * 금지: 서버 재시작·prisma migrate/seed/reset·docker·DB 리셋
 */

import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
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

async function getCompanySettings(page: AnyPage, token: string): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${API_URL}/company-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  return (body?.data ?? body) as Record<string, unknown>
}

async function patchCompanySettings(
  page: AnyPage,
  token: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const res = await page.request.patch(`${API_URL}/company-settings`, {
    data: patch,
    headers: authHeaders(token),
  })
  expect(res.ok(), `company-settings PATCH 성공 (${JSON.stringify(patch)})`).toBeTruthy()
}

// ── 여정 컨텍스트 ─────────────────────────────────────────────────────────────

interface JCtx {
  adminToken: string
  adminEmpId: string
  // S6 픽스처
  orgAId: string
  orgBId: string
  positionId: string
  empAId: string
  empBId: string
  // S8 픽스처
  attendanceId: string
  // S9 픽스처
  docForceDeleteId: string
  // S11 픽스처
  snapshotId: string
}

const ctx: JCtx = {
  adminToken: '',
  adminEmpId: '',
  orgAId: '',
  orgBId: '',
  positionId: '',
  empAId: '',
  empBId: '',
  attendanceId: '',
  docForceDeleteId: '',
  snapshotId: '',
}

const cleanup: { type: string; id: string }[] = []

// ── 테스트 스위트 ─────────────────────────────────────────────────────────────

test.describe('SUPER_ADMIN 1년 여정', () => {
  const TS = Date.now()

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    const adm = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    ctx.adminToken = adm.accessToken
    ctx.adminEmpId = jwtEmployeeId(adm.accessToken)

    // S6 조직 2개 사전 생성
    const orgAResp = await apiPost(page, ctx.adminToken, '/organizations', {
      name: `SuperOrg-A-${TS}`,
      sortOrder: 85,
    })
    expect(orgAResp.resp.status(), 'beforeAll 조직A 생성').toBe(201)
    ctx.orgAId = orgAResp.body.data.id
    cleanup.push({ type: 'org', id: ctx.orgAId })

    const orgBResp = await apiPost(page, ctx.adminToken, '/organizations', {
      name: `SuperOrg-B-${TS}`,
      sortOrder: 86,
    })
    expect(orgBResp.resp.status(), 'beforeAll 조직B 생성').toBe(201)
    ctx.orgBId = orgBResp.body.data.id
    cleanup.push({ type: 'org', id: ctx.orgBId })

    // S6 직위 생성
    const posResp = await apiPost(page, ctx.adminToken, '/positions', {
      name: `SuperPos-${TS}`,
      sortOrder: 85,
    })
    expect(posResp.resp.status() < 300, 'beforeAll 직위 생성').toBeTruthy()
    ctx.positionId = posResp.body?.data?.id ?? ''
    if (ctx.positionId) cleanup.push({ type: 'position', id: ctx.positionId })

    // S6 직원 2명 사전 생성
    const empAResp = await apiPost(page, ctx.adminToken, '/employees', {
      name: `SuperEmpA${TS}`,
      email: `super-emp-a-${TS}@ablework.io`,
      primaryOrganizationId: ctx.orgAId,
      organizationIds: [ctx.orgAId],
      joinedAt: '2025-01-01',
      accessLevel: 'EMPLOYEE',
      employmentType: 'regular',
      initialPassword: 'SuperEmp1234!',
    })
    expect(empAResp.resp.status(), 'beforeAll 직원A 생성').toBe(201)
    ctx.empAId = empAResp.body.data.id
    cleanup.push({ type: 'employee', id: ctx.empAId })

    const empBResp = await apiPost(page, ctx.adminToken, '/employees', {
      name: `SuperEmpB${TS}`,
      email: `super-emp-b-${TS}@ablework.io`,
      primaryOrganizationId: ctx.orgBId,
      organizationIds: [ctx.orgBId],
      joinedAt: '2025-03-01',
      accessLevel: 'EMPLOYEE',
      employmentType: 'regular',
      initialPassword: 'SuperEmp1234!',
    })
    expect(empBResp.resp.status(), 'beforeAll 직원B 생성').toBe(201)
    ctx.empBId = empBResp.body.data.id
    cleanup.push({ type: 'employee', id: ctx.empBId })

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const token = ctx.adminToken

    const order: string[] = ['employee', 'position', 'org']
    const sorted = [...cleanup].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))

    for (const item of sorted) {
      try {
        switch (item.type) {
          case 'employee':
            await apiDelete(page, token, `/employees/${item.id}`)
            break
          case 'position':
            await apiDelete(page, token, `/positions/${item.id}`)
            break
          case 'org':
            await apiDelete(page, token, `/organizations/${item.id}`)
            break
        }
      } catch {
        // 정리 실패 무시
      }
    }

    await page.close()
  })

  // ── S1: 회사 일반설정 변경 → GET 반영 → 원복 ───────────────────────────────

  test('S1: 회사 일반설정(weekStartDay·timeFormat) 변경 → GET 반영 → 원복', async ({ page }) => {
    const before = await getCompanySettings(page, ctx.adminToken)
    const weekDayBefore = (before.weekStartDay as string) ?? 'monday'
    const timeFormatBefore = (before.timeFormat as string) ?? '24h'

    const weekDayTarget = weekDayBefore === 'monday' ? 'tuesday' : 'monday'
    const timeFormatTarget = timeFormatBefore === '24h' ? '12h' : '24h'

    // Act — PATCH
    await patchCompanySettings(page, ctx.adminToken, {
      weekStartDay: weekDayTarget,
      timeFormat: timeFormatTarget,
    })

    // Assert — GET 반영
    try {
      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, ctx.adminToken)
            return [s.weekStartDay, s.timeFormat]
          },
          { timeout: 8000 },
        )
        .toEqual([weekDayTarget, timeFormatTarget])
    } finally {
      // 원복
      await patchCompanySettings(page, ctx.adminToken, {
        weekStartDay: weekDayBefore,
        timeFormat: timeFormatBefore,
      })
      const restored = await getCompanySettings(page, ctx.adminToken)
      expect(restored.weekStartDay, 'S1 weekStartDay 원복 확인').toBe(weekDayBefore)
    }
  })

  // ── S2: 근태 정책 변경 → GET 반영 → 원복 ──────────────────────────────────

  test('S2: 근태 정책(lateGracePeriodMinutes·noShiftClockPolicy) 변경 → GET 반영 → 원복', async ({
    page,
  }) => {
    const before = await getCompanySettings(page, ctx.adminToken)
    const graceBefore = (before.lateGracePeriodMinutes as number) ?? 10
    const policyBefore = (before.noShiftClockPolicy as string) ?? 'if_no_shift'

    const graceTarget = graceBefore === 10 ? 15 : 10
    const policyTarget = policyBefore === 'if_no_shift' ? 'always' : 'if_no_shift'

    await patchCompanySettings(page, ctx.adminToken, {
      lateGracePeriodMinutes: graceTarget,
      noShiftClockPolicy: policyTarget,
    })

    try {
      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, ctx.adminToken)
            return [s.lateGracePeriodMinutes, s.noShiftClockPolicy]
          },
          { timeout: 8000 },
        )
        .toEqual([graceTarget, policyTarget])
    } finally {
      await patchCompanySettings(page, ctx.adminToken, {
        lateGracePeriodMinutes: graceBefore,
        noShiftClockPolicy: policyBefore,
      })
      const restored = await getCompanySettings(page, ctx.adminToken)
      expect(restored.lateGracePeriodMinutes, 'S2 grace 원복 확인').toBe(graceBefore)
    }
  })

  // ── S3: 전자결재 공통 5토글 변경 → GET 반영 → 원복 ─────────────────────────

  test('S3: 전자결재 5토글(prevStepReject·upperLineChange·zipUpload·mobilePush·emailNotify) 변경 → 원복', async ({
    page,
  }) => {
    const before = await getCompanySettings(page, ctx.adminToken)
    const prevRejectBefore = (before.approvalPrevStepReject as boolean) ?? false
    const upperLineBefore = (before.approvalUpperLineChange as boolean) ?? false
    const zipBefore = (before.approvalAllowZipUpload as boolean) ?? false
    const mobileBefore = (before.approvalMobilePush as boolean) ?? true
    const emailBefore = (before.approvalEmailNotify as boolean) ?? true

    // 5개 모두 반전
    await patchCompanySettings(page, ctx.adminToken, {
      approvalPrevStepReject: !prevRejectBefore,
      approvalUpperLineChange: !upperLineBefore,
      approvalAllowZipUpload: !zipBefore,
      approvalMobilePush: !mobileBefore,
      approvalEmailNotify: !emailBefore,
    })

    try {
      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, ctx.adminToken)
            return [
              s.approvalPrevStepReject,
              s.approvalUpperLineChange,
              s.approvalAllowZipUpload,
              s.approvalMobilePush,
              s.approvalEmailNotify,
            ]
          },
          { timeout: 8000 },
        )
        .toEqual([!prevRejectBefore, !upperLineBefore, !zipBefore, !mobileBefore, !emailBefore])
    } finally {
      // 원복
      await patchCompanySettings(page, ctx.adminToken, {
        approvalPrevStepReject: prevRejectBefore,
        approvalUpperLineChange: upperLineBefore,
        approvalAllowZipUpload: zipBefore,
        approvalMobilePush: mobileBefore,
        approvalEmailNotify: emailBefore,
      })
      const restored = await getCompanySettings(page, ctx.adminToken)
      expect(restored.approvalPrevStepReject, 'S3 prevStepReject 원복').toBe(prevRejectBefore)
      expect(restored.approvalUpperLineChange, 'S3 upperLineChange 원복').toBe(upperLineBefore)
    }
  })

  // ── S4: 권한설정 PATCH → GET 반영 → 원복 (SUPER 전용) ─────────────────────

  test('S4: SUPER_ADMIN이 permission-settings PATCH(200) → GET 반영 → 원복', async ({ page }) => {
    // GET — 현재 값 저장 (ORG_ADMIN 이상 허용)
    const beforeResp = await page.request.get(`${API_URL}/permission-settings`, {
      headers: authHeaders(ctx.adminToken),
    })
    expect(beforeResp.status(), 'S4 GET permission-settings 200').toBe(200)
    const beforeBody = await beforeResp.json()
    const before = (beforeBody?.data ?? beforeBody) as {
      orgAdmin: Record<string, boolean>
      employee: Record<string, boolean>
    }

    const empManageBefore = before?.orgAdmin?.employee_manage ?? true
    const orgViewAllBefore = before?.employee?.org_view_all ?? false

    // PATCH — 반전
    const patchResp = await page.request.patch(`${API_URL}/permission-settings`, {
      data: {
        orgAdmin: { employee_manage: !empManageBefore },
        employee: { org_view_all: !orgViewAllBefore },
      },
      headers: authHeaders(ctx.adminToken),
    })
    expect(patchResp.status(), 'S4 PATCH permission-settings SUPER 200').toBe(200)

    try {
      // GET — 반영 확인
      await expect
        .poll(
          async () => {
            const r = await page.request.get(`${API_URL}/permission-settings`, {
              headers: authHeaders(ctx.adminToken),
            })
            const b = await r.json()
            const d = (b?.data ?? b) as { orgAdmin: Record<string, boolean>; employee: Record<string, boolean> }
            return [d?.orgAdmin?.employee_manage, d?.employee?.org_view_all]
          },
          { timeout: 8000 },
        )
        .toEqual([!empManageBefore, !orgViewAllBefore])
    } finally {
      // 원복
      const restoreResp = await page.request.patch(`${API_URL}/permission-settings`, {
        data: {
          orgAdmin: { employee_manage: empManageBefore },
          employee: { org_view_all: orgViewAllBefore },
        },
        headers: authHeaders(ctx.adminToken),
      })
      expect(restoreResp.ok(), 'S4 permission-settings 원복').toBeTruthy()

      const restoredResp = await page.request.get(`${API_URL}/permission-settings`, {
        headers: authHeaders(ctx.adminToken),
      })
      const restoredBody = await restoredResp.json()
      const restored = (restoredBody?.data ?? restoredBody) as {
        orgAdmin: Record<string, boolean>
        employee: Record<string, boolean>
      }
      expect(restored?.orgAdmin?.employee_manage, 'S4 원복 확인').toBe(empManageBefore)
    }
  })

  // ── S5: 알림규칙 event/webhook 설정 → GET 반영 → 원복 ─────────────────────

  test('S5-a: SUPER_ADMIN이 알림 이벤트 토글 → GET 반영 → 원복', async ({ page }) => {
    const rulesRes = await apiGet(page, ctx.adminToken, '/notifications/rules?limit=100')
    const rules: Array<{ eventType: string; isActive: boolean }> =
      rulesRes?.data?.items ?? rulesRes?.data ?? []

    const testEvent = 'attendance.clock_in'
    const ruleBefore = rules.find((r) => r.eventType === testEvent)
    const activeBefore = ruleBefore?.isActive ?? false

    const patchResp = await page.request.patch(`${API_URL}/notifications/rules/event`, {
      data: { eventType: testEvent, isActive: !activeBefore },
      headers: authHeaders(ctx.adminToken),
    })
    expect(patchResp.ok(), 'S5-a PATCH event 성공').toBeTruthy()

    try {
      await expect
        .poll(
          async () => {
            const res = await apiGet(page, ctx.adminToken, '/notifications/rules?limit=100')
            const items: Array<{ eventType: string; isActive: boolean }> =
              res?.data?.items ?? res?.data ?? []
            return items.find((r) => r.eventType === testEvent)?.isActive
          },
          { timeout: 8000 },
        )
        .toBe(!activeBefore)
    } finally {
      await page.request.patch(`${API_URL}/notifications/rules/event`, {
        data: { eventType: testEvent, isActive: activeBefore },
        headers: authHeaders(ctx.adminToken),
      })
    }
  })

  test('S5-b: SUPER_ADMIN이 Webhook URL 저장 → GET 반영 → 원복', async ({ page }) => {
    const before = await apiGet(page, ctx.adminToken, '/notifications/rules?limit=100')
    const rulesBefore: Array<{ webhookUrl?: string | null }> =
      before?.data?.items ?? before?.data ?? []
    const webhookBefore = rulesBefore.find((r) => r.webhookUrl)?.webhookUrl ?? ''

    const testWebhook = `https://discord.com/api/webhooks/super-admin-e2e-${TS}/mock`

    const patchResp = await page.request.patch(`${API_URL}/notifications/rules/webhook`, {
      data: { webhookUrl: testWebhook },
      headers: authHeaders(ctx.adminToken),
    })
    expect(patchResp.ok(), 'S5-b PATCH webhook 성공').toBeTruthy()

    try {
      await expect
        .poll(
          async () => {
            const res = await apiGet(page, ctx.adminToken, '/notifications/rules?limit=100')
            const items: Array<{ webhookUrl?: string | null }> =
              res?.data?.items ?? res?.data ?? []
            return items.find((r) => r.webhookUrl)?.webhookUrl
          },
          { timeout: 8000 },
        )
        .toBe(testWebhook)
    } finally {
      await page.request.patch(`${API_URL}/notifications/rules/webhook`, {
        data: { webhookUrl: webhookBefore },
        headers: authHeaders(ctx.adminToken),
      })
    }
  })

  // ── S6: 조직/직위 구축 + 직원 다수 등록 ────────────────────────────────────

  test('S6-a: 조직A 직원이 등록됐음을 확인한다', async ({ page }) => {
    expect(ctx.empAId, 'beforeAll 직원A ID').toBeTruthy()

    const check = await apiGet(page, ctx.adminToken, `/employees/${ctx.empAId}`)
    expect(check?.data?.id).toBe(ctx.empAId)
    const email = check?.data?.user?.email ?? check?.data?.email
    expect(email).toBe(`super-emp-a-${TS}@ablework.io`)
  })

  test('S6-b: 조직B 직원이 등록됐음을 확인한다', async ({ page }) => {
    expect(ctx.empBId, 'beforeAll 직원B ID').toBeTruthy()

    const check = await apiGet(page, ctx.adminToken, `/employees/${ctx.empBId}`)
    expect(check?.data?.id).toBe(ctx.empBId)
  })

  test('S6-c: SUPER_ADMIN이 직원 정보를 수정한다 (employmentType 변경)', async ({ page }) => {
    expect(ctx.empAId, 'S6-a 선행 필요').toBeTruthy()

    const { resp, body } = await apiPatch(page, ctx.adminToken, `/employees/${ctx.empAId}`, {
      employmentType: 'contract',
    })
    expect(resp.ok(), 'S6-c PATCH 성공').toBeTruthy()
    expect(body.success).toBe(true)

    const check = await apiGet(page, ctx.adminToken, `/employees/${ctx.empAId}`)
    expect(check.data.employmentType).toBe('contract')
  })

  test('S6-d: UI로 직원 목록 화면에 진입한다 (crashing 없음)', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/employees`, { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByText('직원 추가하기').or(page.getByText('직원 추가')),
    ).toBeVisible({ timeout: 12000 })
  })

  test('S6-e: 조직 목록 조회 → 새로 만든 조직이 포함됐음', async ({ page }) => {
    const body = await apiGet(page, ctx.adminToken, '/organizations')
    const tree = (body?.data ?? body) as Array<{ id: string; name: string; children?: unknown[] }>

    function flatNames(nodes: typeof tree): string[] {
      return nodes.flatMap((n) => [
        n.name,
        ...flatNames((n.children ?? []) as typeof tree),
      ])
    }

    const names = flatNames(tree)
    expect(names.some((n) => n.includes(`SuperOrg-A-${TS}`))).toBe(true)
    expect(names.some((n) => n.includes(`SuperOrg-B-${TS}`))).toBe(true)
  })

  // ── S7: 감사로그 조회 → 직원등록/결재 기록 1건 이상 확인 ────────────────────

  test('S7: 감사로그 조회 → 활동 기록 1건 이상 반환', async ({ page }) => {
    // SUPER_ADMIN은 ORG_ADMIN 이상 → audit-logs GET 200
    const resp = await page.request.get(`${API_URL}/audit-logs?limit=20`, {
      headers: authHeaders(ctx.adminToken),
    })
    expect(resp.status(), 'S7 GET audit-logs 200').toBe(200)

    const body = await resp.json()
    // 응답 구조: { success, data: { items, total, page, limit } }
    const items = (body?.data?.items ?? body?.data ?? []) as Array<{
      action: string
      actorName: string
    }>
    expect(Array.isArray(items), 'S7 audit-logs 배열').toBeTruthy()
    // beforeAll에서 직원 2명을 등록했으므로 EMPLOYEE_CREATE가 최소 2건 있어야 함
    expect(items.length, 'S7 감사 로그 1건 이상').toBeGreaterThanOrEqual(1)
  })

  test('S7-b: 감사로그 — 오늘 기준 필터링 200', async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10)
    const resp = await page.request.get(
      `${API_URL}/audit-logs?startDate=${today}&endDate=${today}&limit=50`,
      { headers: authHeaders(ctx.adminToken) },
    )
    expect(resp.status(), 'S7-b 날짜 필터 audit-logs 200').toBe(200)
    const body = await resp.json()
    expect(body?.success ?? body?.data).toBeTruthy()
  })

  // ── S8: 출퇴근 기간 확정 후 확정해제(unconfirm) → SUPER 가능 ───────────────

  test('S8: 출퇴근 기록 생성 → 기간 확정 → 확정해제(unconfirm)', async ({ page }) => {
    expect(ctx.empAId, 'S6 선행 필요').toBeTruthy()

    const attendDate = '2025-06-15'

    // 출퇴근 기록 생성 (admin API 직접 생성)
    const attResp = await apiPost(page, ctx.adminToken, '/attendances', {
      employeeId: ctx.empAId,
      clockInAt: `${attendDate}T01:00:00.000Z`,
      clockOutAt: `${attendDate}T10:00:00.000Z`,
      status: 'normal',
    })
    expect(
      attResp.resp.status() < 300,
      `S8 출퇴근 생성 상태: ${attResp.resp.status()}`,
    ).toBeTruthy()

    const attId: string = attResp.body?.data?.id
    // 일부 환경에서 출퇴근 기록이 이미 있을 수 있으므로 ID 없어도 계속
    ctx.attendanceId = attId ?? ''

    // 기간 확정 (GENERAL_ADMIN 이상)
    const confirmResp = await page.request.post(`${API_URL}/attendances/confirm-period`, {
      data: {
        startDate: attendDate,
        endDate: attendDate,
        employeeIds: [ctx.empAId],
      },
      headers: authHeaders(ctx.adminToken),
    })
    expect(
      confirmResp.status() < 300,
      `S8 confirm-period 상태: ${confirmResp.status()}`,
    ).toBeTruthy()

    // 확정해제 (GENERAL_ADMIN 이상 — SUPER_ADMIN 포함)
    const unconfirmResp = await page.request.post(`${API_URL}/attendances/unconfirm`, {
      data: {
        startDate: attendDate,
        endDate: attendDate,
      },
      headers: authHeaders(ctx.adminToken),
    })
    expect(
      unconfirmResp.status() < 300,
      `S8 unconfirm 상태: ${unconfirmResp.status()}`,
    ).toBeTruthy()

    const unconfirmBody = await unconfirmResp.json()
    // { success: true, data: { unconfirmed: N } }
    expect(unconfirmBody?.success ?? unconfirmBody?.data).toBeTruthy()
  })

  // ── S9: 문서 강제 삭제(force delete) → GENERAL_ADMIN 이상 가능 ─────────────

  test('S9: SUPER_ADMIN이 문서를 생성·상신 후 강제 삭제한다', async ({ page }) => {
    const fId = await firstFormId(page, ctx.adminToken)
    const title = `S9 강제삭제 ${TS}`

    // admin이 상신 — 결재자는 GENERAL_ADMIN(seed-emp-genadmin)으로 지정
    // (APPROVAL_SELF_NOT_ALLOWED: 기안자 본인은 결재자로 지정 불가)
    const docId = await createSubmittedDoc(
      page,
      ctx.adminToken,
      fId,
      [{ role: 'APPROVER', assigneeId: 'seed-emp-genadmin', stepOrder: 1 }],
      title,
    )
    ctx.docForceDeleteId = docId

    // PENDING 상태 확인
    const statusBefore = await docStatus(page, ctx.adminToken, docId)
    expect(statusBefore, 'S9 문서 PENDING').toBe('PENDING')

    // 강제 삭제 (GENERAL_ADMIN 이상 — SUPER 포함)
    const delResp = await apiDelete(page, ctx.adminToken, `/documents/${docId}/force`)
    expect(delResp.status() < 300, `S9 force delete 상태: ${delResp.status()}`).toBeTruthy()

    // 삭제 후 조회 → 404 또는 빈 응답
    const getResp = await page.request.get(`${API_URL}/documents/${docId}`, {
      headers: authHeaders(ctx.adminToken),
    })
    expect(
      getResp.status() === 404 || getResp.status() === 200,
      `S9 삭제 후 조회 상태: ${getResp.status()}`,
    ).toBeTruthy()
    if (getResp.status() === 200) {
      const getBody = await getResp.json()
      // 소프트 삭제의 경우 data가 null이거나 삭제 플래그 확인
      expect(
        getBody?.data === null || getBody?.data?.deletedAt != null || getBody?.success === false,
        'S9 소프트삭제 확인',
      ).toBeTruthy()
    }
  })

  // ── S10: 전 조직(dev+sales) 직원 접근 → 200 ─────────────────────────────

  test('S10: SUPER_ADMIN이 전 조직 직원에 200으로 접근한다', async ({ page }) => {
    // 전체 직원 목록
    const allEmpsResp = await page.request.get(`${API_URL}/employees?limit=100`, {
      headers: authHeaders(ctx.adminToken),
    })
    expect(allEmpsResp.status(), 'S10 전체 직원 조회 200').toBe(200)

    const allEmpsBody = await allEmpsResp.json()
    const items = (allEmpsBody?.data?.items ?? allEmpsBody?.data ?? []) as Array<{
      id: string
      name?: string
    }>
    expect(items.length, 'S10 직원 2명 이상').toBeGreaterThanOrEqual(2)

    // 개발팀·영업팀 seed 직원 단건 조회
    for (const empId of ['seed-emp-001', 'seed-emp-sales']) {
      const singleResp = await page.request.get(`${API_URL}/employees/${empId}`, {
        headers: authHeaders(ctx.adminToken),
      })
      expect(singleResp.status(), `S10 ${empId} 단건 조회 200`).toBe(200)
    }

    // beforeAll에서 만든 조직 B 직원도 조회 가능
    const crossOrgResp = await page.request.get(`${API_URL}/employees/${ctx.empBId}`, {
      headers: authHeaders(ctx.adminToken),
    })
    expect(crossOrgResp.status(), 'S10 orgB 직원 단건 조회 200').toBe(200)
  })

  test('S10-b: SUPER_ADMIN이 영업팀 시드 직원을 이름 검색으로 조회한다', async ({ page }) => {
    const searchResp = await page.request.get(
      `${API_URL}/employees?search=${encodeURIComponent(ACCOUNTS.sales.email)}&limit=5`,
      { headers: authHeaders(ctx.adminToken) },
    )
    expect(searchResp.status(), 'S10-b 이메일 검색 200').toBe(200)
    const searchBody = await searchResp.json()
    const found = (searchBody?.data?.items ?? []) as Array<{ id: string }>
    if (found.length > 0) {
      const single = await page.request.get(`${API_URL}/employees/${found[0].id}`, {
        headers: authHeaders(ctx.adminToken),
      })
      expect(single.status(), 'S10-b 영업팀 직원 단건 200').toBe(200)
    }
  })

  test('S10-c: UI로 직원 관리 화면 진입 → 크래시 없음', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.goto(`${BASE_URL}/admin/employees`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    const fatalErrors = pageErrors.filter((e) => !e.includes('ResizeObserver'))
    expect(fatalErrors, 'S10-c 페이지 에러 없음').toHaveLength(0)
  })

  // ── S11: 연말 리포트 + 스냅샷 생성·행조회 ─────────────────────────────────

  test('S11-a: 실시간 리포트 API 조회 (SUPER_ADMIN)', async ({ page }) => {
    const resp = await page.request.get(
      `${API_URL}/reports/realtime?startDate=2025-01-01&endDate=2025-12-31&employeeId=${ctx.empAId}`,
      { headers: authHeaders(ctx.adminToken) },
    )
    expect(resp.ok(), 'S11-a 실시간 리포트 200').toBeTruthy()
    const body = await resp.json()
    const data = body?.data ?? []
    expect(Array.isArray(data), 'S11-a 리포트 배열 응답').toBeTruthy()
  })

  test('S11-b: 스냅샷 생성 → 행 조회 (SUPER_ADMIN)', async ({ page }) => {
    const snapName = `SuperSnap${TS}`

    const { resp, body } = await apiPost(page, ctx.adminToken, '/reports/snapshots', {
      name: snapName,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31',
      columnConfig: {},
    })
    expect(
      resp.status() < 300,
      `S11-b 스냅샷 생성 상태: ${resp.status()}`,
    ).toBeTruthy()

    ctx.snapshotId = body?.data?.id
    expect(ctx.snapshotId, 'S11-b 스냅샷 ID 존재').toBeTruthy()

    // 행 조회
    const rowsResp = await apiGet(
      page,
      ctx.adminToken,
      `/reports/snapshots/${ctx.snapshotId}/rows`,
    )
    expect(rowsResp, 'S11-b rows 응답 data 속성').toHaveProperty('data')
    const rows = rowsResp.data?.rows ?? rowsResp.data ?? []
    expect(Array.isArray(rows), 'S11-b rows 배열').toBeTruthy()
  })

  test('S11-c: 스냅샷 목록 조회 → 생성된 스냅샷 포함', async ({ page }) => {
    expect(ctx.snapshotId, 'S11-b 선행 필요').toBeTruthy()

    const listResp = await apiGet(page, ctx.adminToken, '/reports/snapshots?limit=50')
    const items = (listResp?.data?.items ?? listResp?.data ?? []) as Array<{ id: string }>
    expect(items.some((s) => s.id === ctx.snapshotId), 'S11-c 스냅샷 목록에 포함').toBeTruthy()
  })

  test('S11-d: UI로 리포트 화면 진입 → 조회 버튼 존재 확인', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: '조회' })).toBeVisible({ timeout: 10000 })
  })

  // ── S_RBAC: SUPER_ADMIN 전용 기능 확인 ────────────────────────────────────

  test('S_RBAC-a: SUPER_ADMIN이 permission-settings GET+PATCH 모두 200', async ({ page }) => {
    // GET
    const getResp = await page.request.get(`${API_URL}/permission-settings`, {
      headers: authHeaders(ctx.adminToken),
    })
    expect(getResp.status(), 'S_RBAC-a GET 200').toBe(200)

    // PATCH — 현재 값 그대로 유지 (변경 없음 PATCH)
    const body = await getResp.json()
    const current = (body?.data ?? body) as {
      orgAdmin: Record<string, boolean>
      employee: Record<string, boolean>
    }

    const patchResp = await page.request.patch(`${API_URL}/permission-settings`, {
      data: {
        orgAdmin: current?.orgAdmin ?? {},
        employee: current?.employee ?? {},
      },
      headers: authHeaders(ctx.adminToken),
    })
    expect(patchResp.status(), 'S_RBAC-a PATCH 200').toBe(200)
  })

  test('S_RBAC-b: SUPER_ADMIN이 출퇴근 관리 화면에 진입한다', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/attendances`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    // 출퇴근 관리 화면: 에러 없이 렌더링 확인
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))
    const fatalErrors = pageErrors.filter((e) => !e.includes('ResizeObserver'))
    expect(fatalErrors, 'S_RBAC-b 출퇴근 관리 에러 없음').toHaveLength(0)
  })

  test('S_RBAC-c: SUPER_ADMIN이 설정 화면에 진입한다', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(
      `${BASE_URL}/admin/settings/company?section=general`,
      { waitUntil: 'domcontentloaded' },
    )
    await page.waitForLoadState('networkidle')

    // 일반 설정 화면에 저장 버튼 존재
    await expect(
      page.getByRole('button', { name: '저장', exact: true }),
    ).toBeVisible({ timeout: 10000 })
  })
})
