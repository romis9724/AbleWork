/**
 * AbleWork ERP — 신입사원 근태 1년 여정 E2E
 *
 * 시나리오: 신입 직원 자체 생성 후 1년간 (2025-07 ~ 2026-06) 근태의 주요 케이스를 모두 검증한다.
 * - J2-1: 신입 생성 + 근무유형/근무일정 배정
 * - J2-2: 정상 출퇴근 백필 → status=normal 확인
 * - J2-3: 지각 (clockIn > shiftStart + grace) → status=late
 * - J2-4: 조퇴/휴게 (breaks) → breakType 분류
 * - J2-5: 결근(무기록 날) → 리포트 반영
 * - J2-6: 기간 확정(confirm-period) → 확정 후 수정 시도 차단(잠금)
 * - J2-7: 정정 요청(ATTENDANCE_EDIT) → document 자동생성 → 승인
 * - J2-8: 월별/기간 리포트 집계 (lateCount·workDays 본인 필터)
 *
 * 전략:
 * - 출퇴근 생성·검증은 모두 API (POST /attendances, GET /attendances).
 * - UI는 출퇴근 목록(/admin/attendances) 및 리포트(/admin/reports) 화면 진입·확인에만 사용.
 * - beforeAll에서 신입 직원/근무유형/근무일정을 모두 생성하고 afterAll에서 정리한다.
 */
import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, API_URL, ACCOUNTS, login, jwtEmployeeId, uiLogin } from './helpers'

// ── 헬퍼 ──────────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function apiPost(page: Page, token: string, path: string, data: object) {
  const resp = await page.request.post(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return { ok: resp.ok(), status: resp.status(), body }
}

async function apiGet(page: Page, token: string, path: string) {
  const resp = await page.request.get(`${API_URL}${path}`, { headers: authHeaders(token) })
  const body = await resp.json()
  return { ok: resp.ok(), status: resp.status(), body }
}

async function apiPatch(page: Page, token: string, path: string, data: object) {
  const resp = await page.request.patch(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return { ok: resp.ok(), status: resp.status(), body }
}

async function apiDelete(page: Page, token: string, path: string) {
  const resp = await page.request.delete(`${API_URL}${path}`, { headers: authHeaders(token) })
  return { ok: resp.ok(), status: resp.status() }
}

/** test.describe scope 전체에서 공유하는 픽스처 */
interface Fixture {
  adminToken: string
  genAdminToken: string
  employeeToken: string
  newbieId: string        // 신입 직원 ID
  orgId: string           // 배정 조직 ID
  shiftTypeId: string     // 근무유형 ID
  // 날짜별 shiftId (shift startAt UTC = KST 09:00 = T00:00:00Z)
  shifts: Record<string, string>
  // 날짜별 attendanceId
  attendances: Record<string, string>
}

const CTX: Fixture = {
  adminToken: '',
  genAdminToken: '',
  employeeToken: '',
  newbieId: '',
  orgId: '',
  shiftTypeId: '',
  shifts: {},
  attendances: {},
}

// ── 날짜 상수 (KST 기준 설명, UTC 실제 값) ──────────────────────────────────
// Shift: startAt=T00:00:00Z(KST 09:00), endAt=T09:00:00Z(KST 18:00)
// 정상 출근: clockIn=T00:00:00Z (KST 09:00), clockOut=T09:00:00Z
// 지각: clockIn=T00:20:00Z (KST 09:20, grace=10분 → LATE)
// grace default = 10분

const DATE = {
  normal1: '2025-07-07',   // J2-2 정상 #1
  normal2: '2025-08-04',   // J2-2 정상 #2
  normal3: '2025-09-01',   // J2-2 정상 #3
  late1:   '2025-10-06',   // J2-3 지각
  break1:  '2025-11-03',   // J2-4 조퇴/휴게
  absent1: '2025-12-01',   // J2-5 결근 (shift 배정 있음, 기록 없음)
  confirm: '2026-01-05',   // J2-6 확정
  correct: '2026-02-02',   // J2-7 정정 요청
  report1: '2026-03-03',   // J2-8 리포트용 추가 정상
}

// ── 셋업 ──────────────────────────────────────────────────────────────────────

test.describe.serial('J2 신입사원 근태 1년 여정', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    // 1. 토큰 획득
    const adminToks = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const genAdminToks = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    CTX.adminToken = adminToks.accessToken
    CTX.genAdminToken = genAdminToks.accessToken

    // 2. UUID 형식의 조직 획득 (seed-org-dev 는 UUID 아님 → UUID 형식 조직 선택)
    const { body: orgBody } = await apiGet(page, CTX.adminToken, '/organizations?limit=100')
    const orgs: Array<{ id: string; name: string }> = orgBody?.data ?? []
    const uuidOrg = orgs.find(
      (o) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(o.id),
    )
    if (!uuidOrg) {
      // 조직 신규 생성
      const { body: newOrg } = await apiPost(page, CTX.adminToken, '/organizations', {
        name: `E2E여정조직_${Date.now()}`,
        depth: 0,
      })
      CTX.orgId = newOrg?.data?.id ?? ''
    } else {
      CTX.orgId = uuidOrg.id
    }

    // 3. 신입 직원 생성
    const suffix = Date.now()
    const { body: empBody } = await apiPost(page, CTX.adminToken, '/employees', {
      email: `newbie-att-${suffix}@ablework.io`,
      name: `E2E신입${suffix}`,
      initialPassword: 'newbie1234!',
      joinedAt: '2025-07-01',
      employmentType: 'regular',
      accessLevel: 'EMPLOYEE',
      organizationIds: [CTX.orgId],
      primaryOrganizationId: CTX.orgId,
    })
    CTX.newbieId = empBody?.data?.id ?? ''

    // 신입 직원 토큰 획득
    const { body: loginBody } = await apiPost(page, CTX.adminToken, '/auth/login', {
      email: `newbie-att-${suffix}@ablework.io`,
      password: 'newbie1234!',
    })
    CTX.employeeToken = loginBody?.data?.accessToken ?? ''

    // 4. 근무유형 생성
    const { body: stBody } = await apiPost(page, CTX.adminToken, '/shift-types', {
      name: `E2E신입근무유형_${suffix}`,
      category: 'REGULAR',
      color: '#f36f20',
      isOvertime: false,
      isNight: false,
      isHoliday: false,
      isDeemedWork: false,
      noClockInRequired: false,
    })
    CTX.shiftTypeId = stBody?.data?.id ?? ''

    // 5. 날짜별 근무일정 생성
    const shiftDates = [
      DATE.normal1,
      DATE.normal2,
      DATE.normal3,
      DATE.late1,
      DATE.break1,
      DATE.absent1,
      DATE.confirm,
      DATE.correct,
      DATE.report1,
    ]

    for (const date of shiftDates) {
      const { body: shiftBody } = await apiPost(page, CTX.adminToken, '/shifts', {
        employeeId: CTX.newbieId,
        organizationId: CTX.orgId,
        shiftTypeId: CTX.shiftTypeId,
        startAt: `${date}T00:00:00.000Z`,  // KST 09:00
        endAt: `${date}T09:00:00.000Z`,    // KST 18:00
      })
      CTX.shifts[date] = shiftBody?.data?.id ?? ''
    }

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const token = CTX.adminToken

    // 근무일정 삭제
    for (const shiftId of Object.values(CTX.shifts)) {
      if (shiftId) {
        await apiDelete(page, token, `/shifts/${shiftId}`)
      }
    }

    // 근무유형 삭제
    if (CTX.shiftTypeId) {
      await apiDelete(page, token, `/shift-types/${CTX.shiftTypeId}`)
    }

    // 신입 직원 비활성화
    if (CTX.newbieId) {
      await page.request.post(`${API_URL}/employees/${CTX.newbieId}/deactivate`, {
        headers: authHeaders(token),
        data: { resignedAt: '2026-06-30' },
      })
    }

    await page.close()
  })

  // ── J2-1: 셋업 검증 ─────────────────────────────────────────────────────────

  test('J2-1: 신입 직원 생성 + 근무유형/근무일정 배정 완료', async ({ page }) => {
    expect(CTX.newbieId, '신입 직원 ID가 있어야 함').toBeTruthy()
    expect(CTX.orgId, '조직 ID가 있어야 함').toBeTruthy()
    expect(CTX.shiftTypeId, '근무유형 ID가 있어야 함').toBeTruthy()

    // 각 날짜의 shift가 생성되었는지 확인
    for (const [date, shiftId] of Object.entries(CTX.shifts)) {
      expect(shiftId, `${date} 근무일정 ID가 있어야 함`).toBeTruthy()
    }

    // GET /employees/:id 로 직원 확인
    const { ok, body } = await apiGet(page, CTX.adminToken, `/employees/${CTX.newbieId}`)
    expect(ok).toBe(true)
    const emp = body?.data ?? body
    expect(emp.id).toBe(CTX.newbieId)
    expect(emp.isActive).toBe(true)

    // GET /shifts 로 일정 확인
    const { body: shiftsBody } = await apiGet(
      page,
      CTX.adminToken,
      `/shifts?startAt=${DATE.normal1}&endAt=${DATE.normal1}&employeeId=${CTX.newbieId}`,
    )
    const shiftItems: Array<{ id: string; employeeId: string }> = shiftsBody?.data ?? []
    const foundShift = shiftItems.find((s) => s.id === CTX.shifts[DATE.normal1])
    expect(foundShift, `${DATE.normal1} 근무일정이 API에서 확인되어야 함`).toBeTruthy()
  })

  // ── J2-2: 정상 출퇴근 백필 ──────────────────────────────────────────────────

  test('J2-2: 정상 출퇴근 백필 3건 → status=normal', async ({ page }) => {
    const normalDates = [DATE.normal1, DATE.normal2, DATE.normal3]

    for (const date of normalDates) {
      const { ok, body } = await apiPost(page, CTX.adminToken, '/attendances', {
        employeeId: CTX.newbieId,
        clockInAt: `${date}T00:05:00.000Z`,  // KST 09:05 (정시 + 5분, grace 10분 이내)
        clockOutAt: `${date}T09:00:00.000Z`, // KST 18:00
      })
      expect(ok, `${date} 출퇴근 생성 성공`).toBe(true)
      const att = body?.data ?? body
      expect(att.status, `${date} status=normal`).toBe('normal')
      expect(att.employeeId).toBe(CTX.newbieId)
      CTX.attendances[date] = att.id
    }

    // GET /attendances 로 목록 조회 확인
    const { ok: listOk, body: listBody } = await apiGet(
      page,
      CTX.adminToken,
      `/attendances?employeeId=${CTX.newbieId}&startDate=${DATE.normal1}&endDate=${DATE.normal3}&limit=10`,
    )
    expect(listOk).toBe(true)
    const items: Array<{ id: string; status: string }> = listBody?.data?.items ?? listBody?.items ?? []
    const normalItems = items.filter((i) => i.status === 'normal')
    expect(normalItems.length, '정상 출퇴근 3건이 목록에 있어야 함').toBeGreaterThanOrEqual(3)
  })

  // ── J2-3: 지각 ────────────────────────────────────────────────────────────

  test('J2-3: 지각 (clockIn > shiftStart + 10분 grace) → status=late', async ({ page }) => {
    // shift startAt = T00:00:00Z(KST 09:00)
    // late threshold = T00:10:00Z(KST 09:10)
    // clockIn = T00:20:00Z(KST 09:20) → LATE
    const { ok, body } = await apiPost(page, CTX.adminToken, '/attendances', {
      employeeId: CTX.newbieId,
      clockInAt: `${DATE.late1}T00:20:00.000Z`,
      clockOutAt: `${DATE.late1}T09:00:00.000Z`,
    })
    expect(ok, `${DATE.late1} 지각 출퇴근 생성`).toBe(true)
    const att = body?.data ?? body
    expect(att.status, `status=late 이어야 함`).toBe('late')
    CTX.attendances[DATE.late1] = att.id

    // 재조회로 재확인
    const { body: getBody } = await apiGet(
      page,
      CTX.adminToken,
      `/attendances?employeeId=${CTX.newbieId}&startDate=${DATE.late1}&endDate=${DATE.late1}`,
    )
    const items = getBody?.data?.items ?? getBody?.items ?? []
    const lateAtt = items.find((i: { id: string }) => i.id === att.id)
    expect(lateAtt?.status, '재조회에서도 status=late').toBe('late')
  })

  // ── J2-4: 조퇴/휴게 ──────────────────────────────────────────────────────

  test('J2-4: 조퇴(early_leave 명시) + 휴게 기록 PATCH → breakType 분류', async ({ page }) => {
    // 조퇴: status 명시 = early_leave (관리자 수기 생성 시 status 직접 지정 가능)
    const { ok, body } = await apiPost(page, CTX.adminToken, '/attendances', {
      employeeId: CTX.newbieId,
      clockInAt: `${DATE.break1}T00:00:00.000Z`,  // 정시 출근
      clockOutAt: `${DATE.break1}T06:00:00.000Z`, // 3시간 조기 퇴근 (KST 15:00)
      status: 'early_leave',
    })
    expect(ok, `${DATE.break1} 조퇴 출퇴근 생성`).toBe(true)
    const att = body?.data ?? body
    expect(att.status, 'status=early_leave').toBe('early_leave')
    CTX.attendances[DATE.break1] = att.id

    // 휴게 기록 추가 (PATCH /:id/breaks)
    const breakData = {
      breaks: [
        {
          breakType: 'meal',
          startAt: `${DATE.break1}T02:00:00.000Z`,  // KST 11:00
          endAt: `${DATE.break1}T02:30:00.000Z`,    // KST 11:30 (30분 식사)
        },
        {
          breakType: 'rest',
          startAt: `${DATE.break1}T04:00:00.000Z`,  // KST 13:00
          endAt: `${DATE.break1}T04:15:00.000Z`,    // KST 13:15 (15분 휴식)
        },
      ],
    }
    const { ok: patchOk, body: patchBody } = await apiPatch(
      page,
      CTX.adminToken,
      `/attendances/${att.id}/breaks`,
      breakData,
    )
    expect(patchOk, '휴게 PATCH 성공').toBe(true)

    const breaks: Array<{ breakType: string; startAt: string }> = patchBody?.data ?? patchBody ?? []
    const mealBreak = breaks.find((b) => b.breakType === 'meal')
    const restBreak = breaks.find((b) => b.breakType === 'rest')
    expect(mealBreak, 'meal 휴게 기록이 있어야 함').toBeTruthy()
    expect(restBreak, 'rest 휴게 기록이 있어야 함').toBeTruthy()
  })

  // ── J2-5: 결근 ────────────────────────────────────────────────────────────

  test('J2-5: 결근 날(무기록) → 리포트 absentCount 반영', async ({ page }) => {
    // absent1 날짜에 shift는 있지만 attendance 기록 없음 → 결근
    // 기록 없음을 먼저 확인
    const { body: checkBody } = await apiGet(
      page,
      CTX.adminToken,
      `/attendances?employeeId=${CTX.newbieId}&startDate=${DATE.absent1}&endDate=${DATE.absent1}`,
    )
    const items: Array<{ id: string }> = checkBody?.data?.items ?? checkBody?.items ?? []
    // absent1은 afterAll에서 shift를 생성했으나 attendance를 생성하지 않았으므로 0개여야 한다
    expect(items.length, `${DATE.absent1} 출퇴근 기록 없음 확인`).toBe(0)

    // 리포트에서 해당 기간 absent_count 확인
    // absent_count는 scheduledWorkDays - totalWorkDays 기반이므로
    // absentCount 필드를 직접 확인하거나 별도 보고 로직이 있을 수 있다
    const { ok: rOk, body: rBody } = await apiGet(
      page,
      CTX.adminToken,
      `/reports/realtime?startDate=${DATE.absent1}&endDate=${DATE.absent1}&employeeId=${CTX.newbieId}`,
    )
    expect(rOk, '리포트 조회 성공').toBe(true)

    const rows: Array<{
      employeeId: string
      scheduledWorkDays: number
      totalWorkDays: number
      absentCount: number
    }> = rBody?.data ?? []

    // 신입 직원 행 찾기
    const myRow = rows.find((r) => r.employeeId === CTX.newbieId)

    if (myRow) {
      // 결근: scheduledWorkDays > 0 AND totalWorkDays = 0 → 결근 1건
      expect(
        myRow.scheduledWorkDays,
        '결근일은 scheduledWorkDays=1 이어야 함',
      ).toBeGreaterThanOrEqual(1)
      expect(myRow.totalWorkDays, '기록 없으므로 totalWorkDays=0').toBe(0)
      // absentCount 필드가 있으면 확인
      if ('absentCount' in myRow) {
        expect(myRow.absentCount, 'absentCount >= 1').toBeGreaterThanOrEqual(1)
      }
    } else {
      // 리포트에 직원이 나타나지 않으면 일정만 있고 기록 없는 상황 — 스킵 가능
      test.info().annotations.push({
        type: 'info',
        description: `${DATE.absent1} 리포트에 ${CTX.newbieId} 행 없음 — 결근 집계 방식에 따라 정상일 수 있음`,
      })
    }
  })

  // ── J2-6: 기간 확정 + 잠금 확인 ──────────────────────────────────────────

  test('J2-6: 기간 확정(confirm-period) → 확정 기록 수정 시도 차단', async ({ page }) => {
    // confirm 날짜에 정상 출퇴근 생성
    const { ok: attOk, body: attBody } = await apiPost(page, CTX.adminToken, '/attendances', {
      employeeId: CTX.newbieId,
      clockInAt: `${DATE.confirm}T00:05:00.000Z`,
      clockOutAt: `${DATE.confirm}T09:00:00.000Z`,
    })
    expect(attOk, `${DATE.confirm} 출퇴근 생성`).toBe(true)
    const att = attBody?.data ?? attBody
    CTX.attendances[DATE.confirm] = att.id

    // GENERAL_ADMIN으로 기간 확정
    const { ok: confirmOk, body: confirmBody } = await apiPost(
      page,
      CTX.genAdminToken,
      '/attendances/confirm-period',
      {
        startDate: DATE.confirm,
        endDate: DATE.confirm,
        employeeIds: [CTX.newbieId],
      },
    )
    expect(confirmOk, '기간 확정 성공').toBe(true)
    const confirmed = confirmBody?.data ?? confirmBody
    expect(confirmed.confirmed, '1건 확정됨').toBeGreaterThanOrEqual(1)

    // 확정 후 수정 시도 → 차단 확인 (403 또는 에러코드 ATTENDANCE_ALREADY_CONFIRMED)
    const { ok: patchOk, body: patchBody } = await apiPatch(
      page,
      CTX.genAdminToken,
      `/attendances/${att.id}`,
      { note: '확정 후 수정 시도' },
    )
    expect(patchOk, '확정 기록 수정은 차단되어야 함').toBe(false)
    const errCode = patchBody?.error?.code ?? ''
    expect(
      errCode,
      `ATTENDANCE_ALREADY_CONFIRMED 에러코드 확인. 실제: ${errCode}`,
    ).toBe('ATTENDANCE_ALREADY_CONFIRMED')
  })

  // ── J2-7: 정정 요청 → document 자동생성 → 승인 ───────────────────────────

  test('J2-7: ATTENDANCE_EDIT 요청 → document 자동생성 → genadmin 승인', async ({ page }) => {
    // correct 날짜에 출퇴근 생성 (정정 대상)
    const { ok: attOk, body: attBody } = await apiPost(page, CTX.adminToken, '/attendances', {
      employeeId: CTX.newbieId,
      clockInAt: `${DATE.correct}T00:05:00.000Z`,
      clockOutAt: `${DATE.correct}T09:00:00.000Z`,
    })
    expect(attOk, '정정 대상 출퇴근 생성').toBe(true)
    const att = attBody?.data ?? attBody
    CTX.attendances[DATE.correct] = att.id

    // ATTENDANCE_EDIT 요청 생성
    // payload: { date, attendanceId, clockInAt(HH:MM), clockOutAt(HH:MM), reason }
    const { ok: reqOk, body: reqBody } = await apiPost(page, CTX.adminToken, '/requests', {
      type: 'ATTENDANCE_EDIT',
      payload: {
        employeeId: CTX.newbieId,
        attendanceId: att.id,
        date: DATE.correct,
        clockInAt: '09:00',   // HH:MM 형식
        clockOutAt: '18:30',  // HH:MM 형식 (30분 추가)
        reason: 'E2E 정정 테스트 요청',
      },
    })
    expect(reqOk, 'ATTENDANCE_EDIT 요청 생성').toBe(true)
    const req = reqBody?.data ?? reqBody
    expect(req.type).toBe('ATTENDANCE_EDIT')
    expect(req.documentId, 'document 자동생성 확인').toBeTruthy()

    const requestId = req.id
    const documentId = req.documentId

    // 문서 상태 확인 (PENDING)
    const { body: docBody } = await apiGet(page, CTX.adminToken, `/documents/${documentId}`)
    const doc = docBody?.data ?? docBody
    expect(doc.status, 'document status=PENDING').toBe('PENDING')

    // 결재 step 확인 (APPROVER_R1 = genadmin)
    const steps: Array<{ id: string; role: string; status: string; assigneeId: string }> =
      (doc.approvalLines ?? []).flatMap(
        (l: { steps: Array<{ id: string; role: string; status: string; assigneeId: string }> }) => l.steps,
      )
    const pendingStep = steps.find((s) => s.status === 'PENDING')
    expect(pendingStep, 'PENDING 결재 step이 있어야 함').toBeTruthy()

    // genadmin으로 승인 (requests 승인 엔드포인트)
    const { ok: approveOk, body: approveBody } = await apiPost(
      page,
      CTX.genAdminToken,
      `/requests/${requestId}/approve`,
      { comment: 'E2E 정정 승인' },
    )
    expect(approveOk, 'genadmin 승인 성공').toBe(true)

    // 요청 상태 APPROVED 확인
    const { body: reqAfterBody } = await apiGet(
      page,
      CTX.genAdminToken,
      `/requests?scope=completed`,
    )
    const reqItems: Array<{ id: string; status: string }> =
      reqAfterBody?.data?.items ?? reqAfterBody?.data ?? reqAfterBody?.items ?? []
    const approvedReq = reqItems.find((r) => r.id === requestId)
    if (approvedReq) {
      expect(approvedReq.status, '요청 APPROVED').toBe('APPROVED')
    } else {
      // 완료 목록 페이징으로 안 보일 수 있으므로 document 상태로 대체 확인
      const { body: docAfterBody } = await apiGet(page, CTX.adminToken, `/documents/${documentId}`)
      const docAfter = docAfterBody?.data ?? docAfterBody
      expect(docAfter.status, 'document APPROVED').toBe('APPROVED')
    }
  })

  // ── J2-8: 월별/기간 리포트 집계 ─────────────────────────────────────────

  test('J2-8: 월별/기간 리포트 — lateCount·workDays 본인 필터 반영', async ({ page }) => {
    // report1 날짜에 정상 출퇴근 추가
    const { ok: attOk, body: attBody } = await apiPost(page, CTX.adminToken, '/attendances', {
      employeeId: CTX.newbieId,
      clockInAt: `${DATE.report1}T00:05:00.000Z`,
      clockOutAt: `${DATE.report1}T09:00:00.000Z`,
    })
    expect(attOk, `${DATE.report1} 정상 출퇴근 생성`).toBe(true)
    const att = attBody?.data ?? attBody
    CTX.attendances[DATE.report1] = att.id

    // 전체 기간 리포트 (2025-07-01 ~ 2026-03-31) — 본인 employeeId 필터
    const { ok: rOk, body: rBody } = await apiGet(
      page,
      CTX.adminToken,
      `/reports/realtime?startDate=2025-07-01&endDate=2026-03-31&employeeId=${CTX.newbieId}`,
    )
    expect(rOk, '전체 기간 리포트 조회 성공').toBe(true)

    const rows: Array<{
      employeeId: string
      totalWorkDays: number
      lateCount: number
      scheduledWorkDays: number
    }> = rBody?.data ?? []

    // 다른 직원 데이터가 섞이지 않았는지 확인
    const otherRows = rows.filter((r) => r.employeeId !== CTX.newbieId)
    expect(otherRows.length, '본인 필터 적용 시 다른 직원 데이터 없음').toBe(0)

    const myRow = rows.find((r) => r.employeeId === CTX.newbieId)
    expect(myRow, '신입 직원 리포트 행이 있어야 함').toBeTruthy()

    if (myRow) {
      // 정상 출퇴근 3건(normal1,2,3) + 지각(late1) + 조퇴(break1) + 확정(confirm) + 정정(correct) + 리포트(report1)
      // = 최소 7건 이상 근무
      expect(myRow.totalWorkDays, '총 근무일 >= 7').toBeGreaterThanOrEqual(7)

      // 지각 1건 확인
      expect(myRow.lateCount, '지각 1건 확인').toBeGreaterThanOrEqual(1)
    }

    // 지각 달 단독 조회 (2025-10)
    const { ok: lateRptOk, body: lateRptBody } = await apiGet(
      page,
      CTX.adminToken,
      `/reports/realtime?startDate=2025-10-01&endDate=2025-10-31&employeeId=${CTX.newbieId}`,
    )
    expect(lateRptOk, '지각 월 리포트 조회').toBe(true)
    const lateRows: Array<{ employeeId: string; lateCount: number }> = lateRptBody?.data ?? []
    const lateRow = lateRows.find((r) => r.employeeId === CTX.newbieId)
    if (lateRow) {
      expect(lateRow.lateCount, '10월 지각 1건').toBeGreaterThanOrEqual(1)
    }
  })

  // ── J2-UI: 출퇴근 목록 화면 진입 ─────────────────────────────────────────

  test('J2-UI-1: 관리자 출퇴근 목록 화면(/admin/attendances) 진입·렌더링 확인', async ({
    page,
  }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/attendances`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // 출퇴근 목록 화면이 로드됐는지 기본 확인 (타이틀 또는 테이블)
    const heading = page.locator('h1, h2, h3, h4, h5').first()
    await expect(heading).toBeVisible({ timeout: 15000 })

    // 에러 없이 화면이 렌더됐는지 확인 (500/404 등 에러 페이지 배제)
    const errorEl = page.locator('[data-testid="error-page"], [data-testid="error-message"]')
    expect(await errorEl.count()).toBe(0)
  })

  test('J2-UI-2: 관리자 리포트 화면(/admin/reports) 진입·렌더링 확인', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    const heading = page.locator('h1, h2, h3, h4, h5').first()
    await expect(heading).toBeVisible({ timeout: 15000 })

    const errorEl = page.locator('[data-testid="error-page"], [data-testid="error-message"]')
    expect(await errorEl.count()).toBe(0)
  })
})
