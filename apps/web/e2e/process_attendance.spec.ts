/**
 * AbleWork ERP — 출퇴근 프로세스 통합 E2E
 *
 * 검증 대상:
 *   A-1  출근/퇴근 흐름  (UI 상태 + API 기록 검증)
 *   A-2  휴게 rest vs meal breakType 구분
 *   A-3  장소(timeclock-areas) CRUD
 *   A-4  now-at-work 조직 필터 서버 적용 확인
 *   A-5  출퇴근 정정 요청 → ATTENDANCE_EDIT 문서 자동생성
 *
 * 전략:
 *   - 셋업·검증은 API, 핵심 상태 전환만 UI 클릭
 *   - sales(박영업·영업팀 EMPLOYEE) 계정 전용 사용 — 다른 병렬 테스트와 충돌 방지
 *   - me/home 출근 버튼은 navigator.geolocation 의존:
 *       오늘 이미 퇴근 완료 상태이면 "오늘 근무가 마감됐습니다" UI 단언으로 대체
 *       실제 clock-in UI 흐름은 page.context setGeolocation + grant permissions 로 별도 검증
 */
import { test, expect, type Page } from '@playwright/test'
import { BASE_URL, API_URL, ACCOUNTS, login, uiLogin, jwtEmployeeId } from './helpers'

// ── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 오늘 날짜 KST 기준 ISO date string (YYYY-MM-DD) */
function todayKst(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10)
}

interface TodayAttendance {
  attendance: {
    id: string
    clockInAt: string
    clockOutAt: string | null
    status: string
    breaks: { id: string; breakType: string; startAt: string; endAt: string | null }[]
  } | null
  openBreak: { id: string; breakType: string } | null
}

async function getTodayAttendance(page: Page, token: string): Promise<TodayAttendance> {
  const res = await page.request.get(`${API_URL}/attendances/me/today`, {
    headers: authHeaders(token),
  })
  const body = await res.json()
  return body.data as TodayAttendance
}

/** 출근 상태를 클린 슬레이트로 만든다: 휴게 중이면 종료 → 출근 중이면 퇴근 */
async function ensureClockedOut(page: Page, token: string): Promise<void> {
  const today = await getTodayAttendance(page, token)
  if (today.openBreak) {
    await page.request.post(`${API_URL}/attendances/break-end`, {
      data: {},
      headers: authHeaders(token),
    })
  }
  if (today.attendance && !today.attendance.clockOutAt) {
    await page.request.post(`${API_URL}/attendances/clock-out`, {
      data: { lat: 37.5665, lng: 126.978, method: 'gps' },
      headers: authHeaders(token),
    })
  }
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

test.describe('출퇴근 프로세스 통합', () => {
  // ── A-1 출근/퇴근 흐름 ──────────────────────────────────────────────────

  test.describe('A-1 출근/퇴근 흐름', () => {
    test('API: clock-in → clock-out 기록 생성 및 반영', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, accessToken)

      // Act — 출근
      const clockInRes = await page.request.post(`${API_URL}/attendances/clock-in`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })
      expect(clockInRes.ok()).toBeTruthy()
      const clockInBody = await clockInRes.json()
      const attendanceId: string = clockInBody.data.id
      expect(attendanceId).toBeTruthy()
      expect(clockInBody.data.clockInAt).toBeTruthy()
      expect(clockInBody.data.clockOutAt).toBeNull()

      // Assert — 오늘 상태 조회에서 출근 반영
      const midState = await getTodayAttendance(page, accessToken)
      expect(midState.attendance?.id).toBe(attendanceId)
      expect(midState.attendance?.clockOutAt).toBeNull()

      // Act — 퇴근
      const clockOutRes = await page.request.post(`${API_URL}/attendances/clock-out`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })
      expect(clockOutRes.ok()).toBeTruthy()
      const clockOutBody = await clockOutRes.json()
      // clock-out 응답에서 직접 clockOutAt 검증 (me/today는 open 레코드만 반환)
      expect(clockOutBody.data.clockOutAt).toBeTruthy()
      expect(clockOutBody.data.id).toBe(attendanceId)

      // Assert — 관리자 목록 조회로 해당 레코드 퇴근 반영 확인
      const { accessToken: adminToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const listRes = await page.request.get(
        `${API_URL}/attendances?employeeId=seed-emp-sales&startDate=${todayKst()}&endDate=${todayKst()}`,
        { headers: authHeaders(adminToken) },
      )
      const listBody = await listRes.json()
      const items: { id: string; clockOutAt: string | null }[] =
        listBody.data?.items ?? listBody.data ?? []
      const record = items.find((a) => a.id === attendanceId)
      expect(record).toBeDefined()
      expect(record!.clockOutAt).toBeTruthy()
    })

    test('UI: 출근 완료 상태에서 me/home 버튼 표시 검증', async ({ page }) => {
      // Arrange — 출근 상태로 세팅
      const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, accessToken)
      await page.request.post(`${API_URL}/attendances/clock-in`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })

      // Act — UI 진입
      await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await page.goto(`${BASE_URL}/me/home`)
      await page.waitForLoadState('networkidle')

      // Assert — 출근 중이면 퇴근하기 버튼 노출
      const clockOutBtn = page.getByRole('button', { name: '퇴근하기' })
      await expect(clockOutBtn).toBeVisible({ timeout: 10000 })

      // Cleanup
      await ensureClockedOut(page, accessToken)
    })

    test('UI: 퇴근 완료 상태에서 me/home 마감 메시지 표시', async ({ page }) => {
      // Arrange — 퇴근 완료 상태 보장
      const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, accessToken)
      // 퇴근 완료 레코드가 있어야 "마감됐습니다" 노출 — 없으면 clock-in→out
      const today = await getTodayAttendance(page, accessToken)
      if (!today.attendance) {
        await page.request.post(`${API_URL}/attendances/clock-in`, {
          data: { lat: 37.5665, lng: 126.978, method: 'gps' },
          headers: authHeaders(accessToken),
        })
        await page.request.post(`${API_URL}/attendances/clock-out`, {
          data: { lat: 37.5665, lng: 126.978, method: 'gps' },
          headers: authHeaders(accessToken),
        })
      }

      // Act
      await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await page.goto(`${BASE_URL}/me/home`)
      await page.waitForLoadState('networkidle')

      // Assert — 퇴근 완료 텍스트 or 출근 전 버튼 (날짜 경계 상황 허용)
      const doneMsg = page.locator('.me-clock-done')
      const clockInBtn = page.getByRole('button', { name: '출근하기' })
      const eitherVisible = await Promise.race([
        doneMsg.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'done'),
        clockInBtn.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'clockin'),
      ]).catch(() => null)
      expect(eitherVisible).not.toBeNull()
    })
  })

  // ── A-2 휴게 rest vs meal breakType ────────────────────────────────────

  test.describe('A-2 휴게 rest vs meal breakType 구분', () => {
    test('API: rest 휴게 → breakType=rest 기록, meal 휴게 → breakType=meal 기록', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, accessToken)

      // 출근
      await page.request.post(`${API_URL}/attendances/clock-in`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })

      // Act — rest 휴게 시작
      const restRes = await page.request.post(`${API_URL}/attendances/break-start`, {
        data: { breakType: 'rest' },
        headers: authHeaders(accessToken),
      })
      expect(restRes.ok()).toBeTruthy()
      const restBreak = (await restRes.json()).data
      expect(restBreak.breakType).toBe('rest')
      expect(restBreak.endAt).toBeNull()

      // Act — rest 휴게 종료
      const restEndRes = await page.request.post(`${API_URL}/attendances/break-end`, {
        data: {},
        headers: authHeaders(accessToken),
      })
      expect(restEndRes.ok()).toBeTruthy()
      const restEndBreak = (await restEndRes.json()).data
      expect(restEndBreak.endAt).toBeTruthy()

      // Act — meal 휴게 시작
      const mealRes = await page.request.post(`${API_URL}/attendances/break-start`, {
        data: { breakType: 'meal' },
        headers: authHeaders(accessToken),
      })
      expect(mealRes.ok()).toBeTruthy()
      const mealBreak = (await mealRes.json()).data
      expect(mealBreak.breakType).toBe('meal')
      expect(mealBreak.endAt).toBeNull()

      // Act — meal 휴게 종료
      await page.request.post(`${API_URL}/attendances/break-end`, {
        data: {},
        headers: authHeaders(accessToken),
      })

      // Assert — 오늘 기록에 rest + meal 양쪽 모두 반영
      const finalState = await getTodayAttendance(page, accessToken)
      const breaks = finalState.attendance?.breaks ?? []
      const restRecord = breaks.find((b) => b.breakType === 'rest')
      const mealRecord = breaks.find((b) => b.breakType === 'meal')
      expect(restRecord).toBeDefined()
      expect(mealRecord).toBeDefined()
      expect(restRecord?.endAt).toBeTruthy()
      expect(mealRecord?.endAt).toBeTruthy()

      // Cleanup
      await ensureClockedOut(page, accessToken)
    })
  })

  // ── A-3 장소(timeclock-areas) CRUD ──────────────────────────────────────

  test.describe('A-3 장소(timeclock-areas) CRUD', () => {
    let areaId: string
    let orgId: string

    test.beforeAll(async ({ browser }) => {
      // 테스트용 조직 생성 (timeclock area는 uuid 조직 필요)
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const orgRes = await page.request.post(`${API_URL}/organizations`, {
        data: { name: `E2E출퇴근장소조직${Date.now()}`, sortOrder: 99 },
        headers: authHeaders(accessToken),
      })
      orgId = (await orgRes.json()).data.id
      await ctx.close()
    })

    test('API: 장소 생성 → 수정 → 삭제', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const uniqueName = `E2E장소${Date.now()}`

      // Act — 생성
      const createRes = await page.request.post(`${API_URL}/timeclock-areas`, {
        data: { name: uniqueName, organizationId: orgId, authMethod: 'none' },
        headers: authHeaders(accessToken),
      })
      expect(createRes.ok()).toBeTruthy()
      const created = (await createRes.json()).data
      areaId = created.id
      expect(created.name).toBe(uniqueName)
      expect(created.authMethod).toBe('none')

      // Assert — 목록 조회에서 확인
      const listRes = await page.request.get(`${API_URL}/timeclock-areas`, {
        headers: authHeaders(accessToken),
      })
      const list: { id: string; name: string }[] = (await listRes.json()).data
      const found = list.find((a) => a.id === areaId)
      expect(found).toBeDefined()

      // Act — 수정
      const updatedName = `${uniqueName}수정`
      const updateRes = await page.request.patch(`${API_URL}/timeclock-areas/${areaId}`, {
        data: { name: updatedName },
        headers: authHeaders(accessToken),
      })
      expect(updateRes.ok()).toBeTruthy()
      const updated = (await updateRes.json()).data
      expect(updated.name).toBe(updatedName)

      // Act — 삭제
      const deleteRes = await page.request.delete(`${API_URL}/timeclock-areas/${areaId}`, {
        headers: authHeaders(accessToken),
      })
      expect(deleteRes.ok()).toBeTruthy()

      // Assert — 목록에서 사라짐
      const afterListRes = await page.request.get(`${API_URL}/timeclock-areas`, {
        headers: authHeaders(accessToken),
      })
      const afterList: { id: string; isActive?: boolean }[] = (await afterListRes.json()).data
      const afterFound = afterList.find((a) => a.id === areaId && a.isActive !== false)
      expect(afterFound).toBeUndefined()
    })

    test('UI: 장소 추가 다이얼로그가 화면에 열림', async ({ page }) => {
      // Arrange
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/timeclock-areas`)
      await page.waitForLoadState('networkidle')

      // Act — 장소 추가 버튼 클릭 (헤더의 contained 버튼을 first()로 선택)
      const addBtn = page.getByRole('button', { name: '장소 추가' }).first()
      await expect(addBtn).toBeVisible({ timeout: 10000 })
      await addBtn.click()

      // Assert — 다이얼로그 열림
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })
      await expect(page.getByLabel('장소명')).toBeVisible()
    })
  })

  // ── A-4 now-at-work 조직 필터 서버 적용 ────────────────────────────────

  test.describe('A-4 now-at-work 조직 필터 서버 적용', () => {
    test('API: organizationId 필터가 서버에서 조직 기준으로 동작', async ({ page }) => {
      // Arrange — sales 출근
      const { accessToken: salesToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, salesToken)
      await page.request.post(`${API_URL}/attendances/clock-in`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(salesToken),
      })

      const { accessToken: adminToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)

      // Act & Assert — 영업팀 조직 필터: sales 직원 포함
      const salesOrgRes = await page.request.get(
        `${API_URL}/attendances/now-at-work?organizationId=seed-org-sales`,
        { headers: authHeaders(adminToken) },
      )
      expect(salesOrgRes.ok()).toBeTruthy()
      const salesOrgData = (await salesOrgRes.json()).data
      const salesItems: { employeeId: string }[] = salesOrgData.items ?? []
      const salesFound = salesItems.find((e) => e.employeeId === 'seed-emp-sales')
      expect(salesFound).toBeDefined()

      // Act & Assert — 개발팀 조직 필터: sales 직원 미포함
      const devOrgRes = await page.request.get(
        `${API_URL}/attendances/now-at-work?organizationId=seed-org-dev`,
        { headers: authHeaders(adminToken) },
      )
      expect(devOrgRes.ok()).toBeTruthy()
      const devOrgData = (await devOrgRes.json()).data
      const devItems: { employeeId: string }[] = devOrgData.items ?? []
      const devFound = devItems.find((e) => e.employeeId === 'seed-emp-sales')
      expect(devFound).toBeUndefined()

      // Act & Assert — 필터 없음: sales 직원 포함
      const allRes = await page.request.get(`${API_URL}/attendances/now-at-work`, {
        headers: authHeaders(adminToken),
      })
      const allData = (await allRes.json()).data
      const allItems: { employeeId: string }[] = allData.items ?? []
      expect(allItems.find((e) => e.employeeId === 'seed-emp-sales')).toBeDefined()

      // Cleanup
      await ensureClockedOut(page, salesToken)
    })

    test('UI: 현재 근무 현황 화면 조직 필터 Autocomplete 노출', async ({ page }) => {
      // Arrange
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/attendances/now`)
      await page.waitForLoadState('networkidle')

      // Assert — 조직 필터 입력 존재
      const orgFilter = page.getByLabel('조직 필터 (전체)')
      await expect(orgFilter).toBeVisible({ timeout: 10000 })

      // 새로고침 버튼 클릭 동작 확인
      const refreshBtn = page.getByRole('button', { name: '새로고침' })
      await expect(refreshBtn).toBeVisible()
      await refreshBtn.click()
      // 새로고침 후에도 화면 유지 (오류 없음)
      await page.waitForLoadState('networkidle')
      await expect(orgFilter).toBeVisible()
    })
  })

  // ── A-5 출퇴근 정정 요청 → ATTENDANCE_EDIT 문서 자동생성 ───────────────

  test.describe('A-5 출퇴근 정정 요청 → ATTENDANCE_EDIT 문서 자동생성', () => {
    test('API: ATTENDANCE_EDIT 요청 제출 → documentId 자동생성 + 상태 PENDING', async ({ page }) => {
      // Arrange — 오늘 출퇴근 기록이 있어야 정정 대상 attendanceId 확보
      const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, accessToken)
      const clockInRes = await page.request.post(`${API_URL}/attendances/clock-in`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })
      const attendanceId: string = (await clockInRes.json()).data.id
      await page.request.post(`${API_URL}/attendances/clock-out`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })

      // Act — ATTENDANCE_EDIT 요청
      const requestRes = await page.request.post(`${API_URL}/requests`, {
        data: {
          type: 'ATTENDANCE_EDIT',
          payload: {
            attendanceId,
            reason: `E2E 정정 요청 ${Date.now()}`,
            targetDate: todayKst(),
            requestedClockInAt: `${todayKst()}T09:00:00.000Z`,
            requestedClockOutAt: `${todayKst()}T18:00:00.000Z`,
          },
        },
        headers: authHeaders(accessToken),
      })
      expect(requestRes.ok()).toBeTruthy()
      const requestBody = (await requestRes.json()).data

      // Assert — 요청 기본 속성
      expect(requestBody.type).toBe('ATTENDANCE_EDIT')
      expect(requestBody.status).toBe('PENDING')

      // Assert — documentId 자동 생성 (HR → 전자결재 연동 핵심)
      expect(requestBody.documentId).toBeTruthy()

      // Assert — 해당 문서가 실제 존재하고 PENDING 상태
      const docRes = await page.request.get(`${API_URL}/documents/${requestBody.documentId}`, {
        headers: authHeaders(accessToken),
      })
      expect(docRes.ok()).toBeTruthy()
      const doc = (await docRes.json()).data
      expect(doc.status).toBe('PENDING')
    })

    test('UI: me/home에서 ATTENDANCE_EDIT 요청 제출 후 최근 요청 목록에 반영', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await ensureClockedOut(page, accessToken)
      const clockInRes = await page.request.post(`${API_URL}/attendances/clock-in`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })
      const attendanceId: string = (await clockInRes.json()).data.id
      await page.request.post(`${API_URL}/attendances/clock-out`, {
        data: { lat: 37.5665, lng: 126.978, method: 'gps' },
        headers: authHeaders(accessToken),
      })

      // 정정 요청 API 제출
      await page.request.post(`${API_URL}/requests`, {
        data: {
          type: 'ATTENDANCE_EDIT',
          payload: {
            attendanceId,
            reason: `E2E UI 정정 요청 ${Date.now()}`,
            targetDate: todayKst(),
            requestedClockInAt: `${todayKst()}T08:30:00.000Z`,
            requestedClockOutAt: `${todayKst()}T17:30:00.000Z`,
          },
        },
        headers: authHeaders(accessToken),
      })

      // Act — me/home 로드
      await uiLogin(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
      await page.goto(`${BASE_URL}/me/home`)
      await page.waitForLoadState('networkidle')

      // Assert — "출퇴근 정정" 항목이 최근 요청 카드에 표시
      const homeContent = page.locator('.mini')
      await expect(homeContent.first()).toBeVisible({ timeout: 10000 })
      await expect(homeContent.getByText('출퇴근 정정').first()).toBeVisible({ timeout: 8000 })
    })
  })
})
