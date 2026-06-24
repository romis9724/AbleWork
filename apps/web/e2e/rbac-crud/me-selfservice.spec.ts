/**
 * RBAC 브라우저 테스트 — me 셀프서비스 도메인
 *
 * 규격: docs/testing/RBAC_BROWSER_LOOP.md §2-4 (positive), §2-5 (negative)
 * 기대값 SSOT: packages/shared-constants/src/permissions.ts
 *
 * /me/* 는 EMPLOYEE 레벨 이상이면 전원 접근 가능(라우트 가드 상세는 nav-route-guard.spec.ts).
 * 이 spec은 셀프서비스 핵심 흐름(출퇴근·휴가신청·요청 생성/취소·전자결재)과
 * 본인 스코핑/멀티테넌시를 검증한다.
 *
 * API 엔드포인트 실측:
 *   GET  /attendances/me/today       — 인증만 (본인 오늘 출퇴근, employee 가능)
 *   POST /attendances/clock-in       — 인증만
 *   POST /attendances/clock-out      — 인증만
 *   POST /attendances/break-start    — 인증만
 *   POST /attendances/break-end      — 인증만
 *   GET  /leaves/balance/:employeeId — 인증만 (서비스에서 본인 or 관리자 스코핑)
 *   GET  /leaves/types               — 인증만
 *   GET  /requests?scope=mine        — 인증만 (EMPLOYEE는 본인만)
 *   POST /requests                   — 인증만
 *   POST /requests/:id/cancel        — 인증만 (본인 PENDING만)
 *   GET  /documents                  — 인증만 (box 파라미터로 스코핑)
 *
 * data-testid 규약 (§3) — 이 spec에서 기대하는 testid 목록 (수정 에이전트 대상):
 *   me-clock-in-btn          /me/home — 출근하기 버튼 (.btn-primary.btn-lg, !clockedIn && !clockedOut)
 *   me-clock-out-btn         /me/home — 퇴근하기 버튼 (.btn-primary.btn-lg, clockedIn && !onBreak)
 *   me-break-rest-btn        /me/home — 휴게 시작 버튼 (.btn-line.btn-lg, clockedIn && !onBreak)
 *   me-break-meal-btn        /me/home — 식사 시작 버튼 (.btn-line.btn-lg, clockedIn && !onBreak)
 *   me-break-end-btn         /me/home — 휴게 종료 버튼 (.btn-primary.btn-lg, clockedIn && onBreak)
 *   me-leave-request-btn     /me/leaves — "휴가 신청" 버튼 (PageHead right)
 *   me-leave-submit-btn      /me/leaves — 휴가신청 모달 "신청" 제출 버튼
 *   req-new-btn              /me/requests — "새 요청" 버튼 (PageHead right)
 *   req-type-OFFSITE_WORK    /me/requests — 유형 메뉴 항목 (OFFSITE_WORK)
 *   req-type-LEAVE_CREATE    /me/requests — 유형 메뉴 항목 (LEAVE_CREATE)
 *   req-type-CUSTOM          /me/requests — 유형 메뉴 항목 (CUSTOM)
 *   req-submit-btn           /me/requests — 유형별 다이얼로그 제출 버튼
 *   req-cancel-btn           /me/requests — PENDING 요청 취소 버튼 (테이블 행 내)
 *   me-doc-create-btn        /me/documents — "기안 등록" 버튼 (PageHead right)
 *
 * 규약: testid가 앱에 없으면 FAIL (수정 에이전트가 부여). 텍스트/클래스 셀렉터로 핵심 인터랙션 우회 금지.
 */

import { test, expect, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  loginAs,
  login,
  BASE_URL,
  API_URL,
  jwtEmployeeId,
} from '../helpers'

// ─────────────────────────────────────────────────────────────────────────────
// 헬퍼: 오늘 출퇴근 상태 조회
// ─────────────────────────────────────────────────────────────────────────────

interface TodayAttendance {
  attendance: {
    id: string
    clockInAt: string
    clockOutAt?: string | null
    isConfirmed?: boolean
  } | null
  openBreak: { id: string } | null
}

async function getTodayAttendance(
  page: Page,
  token: string,
): Promise<TodayAttendance> {
  const resp = await page.request.get(`${API_URL}/attendances/me/today`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!resp.ok()) return { attendance: null, openBreak: null }
  const body = await resp.json()
  const data = body?.data ?? body
  return {
    attendance: data?.attendance ?? null,
    openBreak: data?.openBreak ?? null,
  }
}

/**
 * 정리 헬퍼: employee의 오늘 출퇴근 기록을 전부 삭제해 미출근 클린 상태로 복원.
 *
 * 구현:
 * 1. employee 토큰으로 GET /attendances/me/today → attendance.id 취득
 * 2. 오픈 휴게가 있으면 employee 토큰으로 break-end 처리
 * 3. 기록이 확정(isConfirmed)된 경우 genAdmin 토큰으로 POST /attendances/unconfirm 먼저 호출
 * 4. genAdmin 토큰으로 DELETE /attendances/:id
 * 5. 기록이 없을 때까지 반복 (당일 복수 기록 대응)
 *
 * 격리 강화 이유:
 * - attendances.spec의 "일괄 확정" 테스트가 같은 직원의 오늘 기록을 전체 선택 후 확정할 수 있음.
 * - 확정 기록은 DELETE가 ATTENDANCE_ALREADY_CONFIRMED(400)으로 거부되므로
 *   unconfirm 선행 없이는 삭제 불가. 기존 코드는 삭제 실패 시 루프 탈출(break)했으나
 *   이제는 확정 해제 → 재삭제 패턴으로 반드시 클린 상태를 보장한다.
 *
 * me/today는 가장 최근 1건만 반환하므로, 루프로 모두 삭제한다.
 */
async function cleanupTodayAttendance(page: Page): Promise<void> {
  const empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
  const adminTokens = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)

  // 최대 10회 루프 (당일 중복 기록 모두 제거)
  for (let i = 0; i < 10; i++) {
    const today = await getTodayAttendance(page, empTokens.accessToken)
    if (!today.attendance) break

    // 오픈 휴게가 있으면 먼저 종료 (퇴근을 막는 open break 해소)
    if (today.openBreak) {
      await page.request.post(`${API_URL}/attendances/break-end`, {
        data: {},
        headers: {
          Authorization: `Bearer ${empTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      })
    }

    // 확정된 기록은 DELETE 전에 unconfirm 필수
    // (ATTENDANCE_ALREADY_CONFIRMED 가드: 확정 기록은 수정/삭제 불가)
    const body = today.attendance as { id: string; clockInAt: string; clockOutAt?: string | null; isConfirmed?: boolean }
    if (body.isConfirmed) {
      await page.request.post(`${API_URL}/attendances/unconfirm`, {
        data: { attendanceIds: [today.attendance.id] },
        headers: {
          Authorization: `Bearer ${adminTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      })
    }

    const delResp = await page.request.delete(
      `${API_URL}/attendances/${today.attendance.id}`,
      {
        headers: {
          Authorization: `Bearer ${adminTokens.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    )
    // 삭제 실패 시에도 루프 계속 진행 — 다음 순회에서 me/today로 상태 재확인
    // (무한 루프 방지: 최대 10회)
    if (!delResp.ok()) {
      // 삭제가 계속 실패하면 루프 탈출 (예: 권한 부족 등 다른 문제)
      const delBody = await delResp.json().catch(() => ({})) as { error?: { code?: string } }
      if (delBody?.error?.code !== 'ATTENDANCE_ALREADY_CONFIRMED') break
    }
  }
}

// API로 출근 처리 (clock-in) — employee 토큰으로 실시간 출근
// ⚠️ 근무일정 정책(allow_unscheduled=if_no_shift)·조기출근 타임윈도우에 민감.
// A-clock serial 테스트에서는 이 함수 대신 clockInViaAdmin 을 사용한다.
async function clockInApi(
  page: Page,
  token: string,
): Promise<boolean> {
  const resp = await page.request.post(`${API_URL}/attendances/clock-in`, {
    data: { method: 'manual' },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  return resp.ok()
}

// API로 퇴근 처리 (clock-out) — employee 토큰으로 실시간 퇴근
async function clockOutApi(
  page: Page,
  token: string,
): Promise<boolean> {
  const resp = await page.request.post(`${API_URL}/attendances/clock-out`, {
    data: { method: 'manual' },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  return resp.ok()
}

/**
 * orgAdmin POST /attendances로 employee의 오늘 "출근 중" 기록을 직접 생성.
 *
 * employee POST /clock-in 은 다음 두 이유로 테스트 격리에 부적합하다:
 * 1. 근무일정 정책(allow_unscheduled=if_no_shift): 일정이 존재하면
 *    조기출근(earlyThreshold 이전) 시도가 ATTENDANCE_UNSCHEDULED_NOT_ALLOWED로 거부됨.
 *    KST 업무시간(09시~)은 UTC로는 자정(00시~)이므로, 일정 시작(09:00 UTC=18:00 KST)보다
 *    훨씬 일찍 UTC에서 실행되면 earlyThreshold(shift-30min) 안에 들어 조기출근으로 판정된다.
 * 2. 이미 출근 기록이 남아있을 경우 ATTENDANCE_ALREADY_CLOCKED_IN으로 거부됨.
 *
 * orgAdmin POST /attendances는 이 정책 검사를 우회하며,
 * "직원이 출근 중인 상태"를 결정적으로 셋업한다.
 *
 * 반환값: 생성된 attendanceId (cleanup용)
 */
async function clockInViaAdmin(page: Page): Promise<string> {
  const { accessToken: orgToken } = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
  const nowUtc = new Date().toISOString()
  const resp = await page.request.post(`${API_URL}/attendances`, {
    data: {
      employeeId: 'seed-emp-001',
      clockInAt: nowUtc,
      status: 'normal',
      note: `E2E_CLOCKIN_${Date.now()}`,
    },
    headers: { Authorization: `Bearer ${orgToken}`, 'Content-Type': 'application/json' },
  })
  expect(resp.ok(), `orgAdmin POST /attendances 실패: ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  return ((body?.data ?? body) as { id: string }).id
}

// API로 OFFSITE_WORK 요청 생성
async function createOffsiteRequest(
  page: Page,
  token: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/requests`, {
    data: {
      type: 'OFFSITE_WORK',
      payload: {
        reason: `E2E_${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        destination: 'E2E 테스트 목적지',
      },
    },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  expect(resp.ok(), `POST /requests 실패: ${resp.status()}`).toBeTruthy()
  const body = await resp.json()
  return (body?.data ?? body).id as string
}

// ─────────────────────────────────────────────────────────────────────────────
// A. positive — 출퇴근 흐름 (employee, /me/home)
//
// serial 모드: 3단계 상태 전이(미출근→근무중→퇴근완료)를 순서대로 검증.
// 각 테스트 시작 전 cleanupTodayAttendance로 클린 상태를 보장 — 이전 실행/테스트 격리.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A. positive — employee /me/home 출퇴근 흐름', () => {
  test('화면 렌더: me-clock 영역과 KPI 카드 존재', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')

    // 출퇴근 카드 영역 존재
    await expect(page.locator('.me-clock'), '.me-clock 영역 없음').toBeVisible()
    // KPI 그리드 존재
    await expect(page.locator('.kpi-grid, [class*="kpi"]').first(), 'KPI 영역 없음').toBeVisible({ timeout: 8000 })
  })

  test('최근 요청 카드·문서 카드 링크 렌더', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')

    // 최근 요청 카드 박스 (CardBox component)
    const cards = page.locator('.card-box, .card')
    await expect(cards.first(), '홈 카드 박스 없음').toBeVisible({ timeout: 8000 })
  })
})

/**
 * 출퇴근 상태 전이 흐름 — serial 격리 블록
 *
 * beforeEach에서 cleanupTodayAttendance를 실행해 각 테스트가 미출근 클린 상태에서 시작.
 * 테스트 순서: ①미출근 → ②근무중 → ③퇴근완료(.me-clock-done 핵심 검증)
 *
 * 퇴근 후 .me-clock-done이 새로고침에도 유지되는지가 getMyToday 버그 수정 검증의 핵심이다.
 */
test.describe.serial('A-clock. 출퇴근 상태 전이 흐름 (격리·결정적)', () => {
  test.beforeEach(async ({ page }) => {
    // 이전 테스트/실행의 오늘 출퇴근 기록을 전부 삭제해 미출근 클린 상태로 초기화
    await cleanupTodayAttendance(page)
  })

  test('① 미출근 클린 상태: me-clock-in-btn 노출', async ({ page }) => {
    // beforeEach에서 정리 완료 — 미출근 상태 보장
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')

    // 미출근 상태 → "출근하기" 버튼만 노출
    await expect(
      page.locator('[data-testid="me-clock-in-btn"]'),
      'me-clock-in-btn 없음 — 앱 수정 필요 (출근하기 버튼에 testid 부여)',
    ).toBeVisible({ timeout: 10000 })
  })

  test('② 근무 중 상태: API 출근 후 퇴근/휴게 버튼 testid 기대', async ({ page }) => {
    // beforeEach에서 정리 완료 — 미출근 상태 보장.
    // orgAdmin POST /attendances로 출근 기록 직접 생성 (clock-in 정책·타임윈도우 우회).
    const attId = await clockInViaAdmin(page)

    try {
      await loginAs(page, 'employee')
      await page.goto(`${BASE_URL}/me/home`)
      await page.waitForLoadState('networkidle')

      // 근무 중 상태 — 퇴근하기 버튼 testid 기대
      await expect(
        page.locator('[data-testid="me-clock-out-btn"]'),
        'me-clock-out-btn 없음 — 앱 수정 필요 (근무 중 퇴근하기 버튼에 testid 부여)',
      ).toBeVisible({ timeout: 10000 })

      // 휴게 시작 버튼 testid 기대
      await expect(
        page.locator('[data-testid="me-break-rest-btn"]'),
        'me-break-rest-btn 없음 — 앱 수정 필요 (휴게 시작 버튼에 testid 부여)',
      ).toBeVisible()

      // 식사 시작 버튼 testid 기대
      await expect(
        page.locator('[data-testid="me-break-meal-btn"]'),
        'me-break-meal-btn 없음 — 앱 수정 필요 (식사 시작 버튼에 testid 부여)',
      ).toBeVisible()
    } finally {
      // 테스트 종료 시 항상 정리 — serial 다음 테스트의 beforeEach(cleanupTodayAttendance)와
      // 이중 보호 역할을 한다. beforeEach도 남은 기록을 삭제하지만, 여기서 미리 삭제해두면
      // beforeEach 비용을 최소화한다.
      const { accessToken: genToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
      await page.request.delete(`${API_URL}/attendances/${attId}`, {
        headers: { Authorization: `Bearer ${genToken}`, 'Content-Type': 'application/json' },
      })
    }
  })

  test('③ 퇴근 완료 상태: .me-clock-done 새로고침 후에도 유지 (getMyToday 버그 수정 검증)', async ({ page }) => {
    // beforeEach에서 정리 완료 — 미출근 상태 보장.
    // orgAdmin POST /attendances로 출근 기록 생성 후 employee POST /clock-out으로 퇴근.
    // clock-out은 열린 기록(clockOutAt=null)만 필요하며 정책 검사 없이 동작한다.
    const attId = await clockInViaAdmin(page)

    const { accessToken: empToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    // 오픈 휴게 있으면 종료 후 퇴근 (안전 처리)
    const afterIn = await getTodayAttendance(page, empToken)
    if (afterIn.openBreak) {
      await page.request.post(`${API_URL}/attendances/break-end`, {
        data: {},
        headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
      })
    }

    const outOk = await clockOutApi(page, empToken)
    expect(outOk, 'API 퇴근 처리 실패').toBeTruthy()

    try {
      // 첫 번째 방문: 퇴근 완료 상태 확인
      await loginAs(page, 'employee')
      await page.goto(`${BASE_URL}/me/home`)
      await page.waitForLoadState('networkidle')

      await expect(
        page.locator('.me-clock-done'),
        '퇴근 완료 후 .me-clock-done 없음 — getMyToday API 버그 미수정 또는 앱 UI 로직 오류',
      ).toBeVisible({ timeout: 10000 })

      // 핵심 검증: 새로고침 후에도 .me-clock-done 유지 (서버 상태 기반 판정)
      // getMyToday 버그 수정 전에는 퇴근 후 재방문 시 상태가 소실됐음 — 이를 실증
      await page.reload()
      await page.waitForLoadState('networkidle')

      await expect(
        page.locator('.me-clock-done'),
        '새로고침 후 .me-clock-done 소실 — getMyToday가 퇴근 후 상태를 올바르게 반환해야 함',
      ).toBeVisible({ timeout: 10000 })
    } finally {
      // 퇴근 완료 기록 삭제 (cleanupTodayAttendance 보조)
      const { accessToken: genToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
      await page.request.delete(`${API_URL}/attendances/${attId}`, {
        headers: { Authorization: `Bearer ${genToken}`, 'Content-Type': 'application/json' },
      }).catch(() => {/* 이미 삭제됐으면 무시 */})
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A2. positive — 휴가신청 (employee, /me/leaves)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A2. positive — employee /me/leaves 휴가신청', () => {
  test('잔액 카드 또는 빈 상태 렌더', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/leaves`)
    await page.waitForLoadState('networkidle')

    const hasCards = await page.locator('.me-leave-list, .me-leave-card').count()
    const hasEmpty = await page.locator('.note').count()
    const isLoading = await page.locator('.ab-loading').count()
    // 로딩 중이 아니라면 카드 또는 빈 상태 중 하나 존재
    if (!isLoading) {
      expect(hasCards + hasEmpty, '/me/leaves 컨텐츠 없음').toBeGreaterThan(0)
    }
  })

  test('me-leave-request-btn 노출 기대 (PageHead right 버튼)', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/leaves`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="me-leave-request-btn"]'),
      'me-leave-request-btn 없음 — 앱 수정 필요 (PageHead right "휴가 신청" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('me-leave-request-btn 클릭 → 모달 오픈', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/leaves`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="me-leave-request-btn"]')
    await expect(btn, 'me-leave-request-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // 모달 오픈 확인 (.modal-overlay 또는 MUI Dialog)
    const modal = page.locator('.modal-overlay, [role="dialog"]')
    await expect(modal.first(), '휴가신청 모달 없음').toBeVisible({ timeout: 8000 })
  })

  test('모달 내 me-leave-submit-btn 노출 기대', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/leaves`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="me-leave-request-btn"]')
    await expect(btn, 'me-leave-request-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // 모달 열린 상태에서 제출 버튼 testid 기대
    await expect(
      page.locator('[data-testid="me-leave-submit-btn"]'),
      'me-leave-submit-btn 없음 — 앱 수정 필요 (모달 내 "신청" 버튼에 testid 부여)',
    ).toBeVisible({ timeout: 8000 })
  })

  test('유효 데이터 입력 → 휴가신청 제출 → 성공 (잔액 있는 유형 API 셋업)', async ({ page }) => {
    // employee 토큰으로 본인 잔액 조회 — 잔액이 있는 leaveTypeId를 직접 사용
    // (활성 유형 목록에서 임의로 고르면 잔액 없는 유형이 걸려 LEAVE_BALANCE_NOT_FOUND 실패)
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const empId = jwtEmployeeId(empToken)

    const balResp = await page.request.get(`${API_URL}/leaves/balance/${empId}`, {
      headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    })
    expect(balResp.ok(), 'GET /leaves/balance 실패').toBeTruthy()
    const balBody = await balResp.json()
    const balances = (balBody?.data ?? balBody) as Array<{
      leaveTypeId: string
      remainingDays: number
    }>
    const withBalance = balances.filter((b) => b.remainingDays > 0)

    if (withBalance.length === 0) {
      // 잔액이 있는 유형 없음 — 휴가신청 제출 검증 불가 (시드 데이터 미비)
      test.skip(true, '잔액 있는 휴가 유형 없음 — 휴가신청 제출 검증 불가 (시드 데이터 확인 필요)')
      return
    }

    const targetTypeId = withBalance[0].leaveTypeId

    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/leaves`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="me-leave-request-btn"]')
    await expect(btn, 'me-leave-request-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // 모달 열림
    const modal = page.locator('.modal-overlay, [role="dialog"]')
    await expect(modal.first(), '모달 없음').toBeVisible({ timeout: 8000 })

    // 잔액 있는 휴가 유형을 명시적으로 선택 (value = leaveTypeId)
    const typeSelect = page.locator('select.sel').first()
    await typeSelect.selectOption({ value: targetTypeId })

    // 날짜 설정 (7일 후부터 8일 후 — 이전 신청과 충돌 방지)
    const start = new Date()
    start.setDate(start.getDate() + 7)
    const end = new Date()
    end.setDate(end.getDate() + 8)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)

    // 날짜 input 채우기
    const dateInputs = page.locator('input[type="date"]')
    await dateInputs.first().fill(fmt(start))
    await dateInputs.last().fill(fmt(end))

    // 제출 버튼 클릭
    const submitBtn = page.locator('[data-testid="me-leave-submit-btn"]')
    await expect(submitBtn, 'me-leave-submit-btn 없음 — 앱 수정 필요').toBeVisible()
    await submitBtn.click()

    // 성공: 모달이 닫히거나 토스트 메시지
    await expect(modal.first()).not.toBeVisible({ timeout: 12000 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A3. positive — 요청 생성/취소 (employee, /me/requests)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A3. positive — employee /me/requests 요청 생성·취소·탭 전환', () => {
  test('화면 렌더: 탭·테이블 존재', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.tabs'), '탭 영역 없음').toBeVisible()
    await expect(page.locator('table.tbl'), '요청 테이블 없음').toBeVisible()
  })

  test('탭 전환: 전체→대기중→완료', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const tabs = page.locator('.tabs .tab')
    await expect(tabs.first(), '탭 버튼 없음').toBeVisible()

    // 대기중 탭 클릭
    const pendingTab = tabs.filter({ hasText: '대기중' }).first()
    await expect(pendingTab, '대기중 탭 없음').toBeVisible()
    await pendingTab.click()
    // active 클래스 확인
    await expect(pendingTab).toHaveClass(/on/)

    // 완료 탭 클릭
    const doneTab = tabs.filter({ hasText: '완료' }).first()
    await doneTab.click()
    await expect(doneTab).toHaveClass(/on/)
  })

  test('req-new-btn 노출 기대 (PageHead right 버튼)', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="req-new-btn"]'),
      'req-new-btn 없음 — 앱 수정 필요 (PageHead right "새 요청" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('req-new-btn 클릭 → .me-req-menu 유형 선택 메뉴 오픈', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="req-new-btn"]')
    await expect(btn, 'req-new-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // 유형 선택 메뉴 모달 오픈
    await expect(page.locator('.me-req-menu'), '.me-req-menu 없음').toBeVisible({ timeout: 8000 })
  })

  test('유형 메뉴: req-type-OFFSITE_WORK testid 기대', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const newBtn = page.locator('[data-testid="req-new-btn"]')
    await expect(newBtn, 'req-new-btn 없음 — 앱 수정 필요').toBeVisible()
    await newBtn.click()

    await expect(page.locator('.me-req-menu'), '.me-req-menu 없음').toBeVisible({ timeout: 8000 })

    await expect(
      page.locator('[data-testid="req-type-OFFSITE_WORK"]'),
      'req-type-OFFSITE_WORK 없음 — 앱 수정 필요 (.me-req-item[type=OFFSITE_WORK]에 testid 부여)',
    ).toBeVisible()
  })

  test('유형 메뉴: req-type-LEAVE_CREATE testid 기대', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const newBtn = page.locator('[data-testid="req-new-btn"]')
    await expect(newBtn, 'req-new-btn 없음 — 앱 수정 필요').toBeVisible()
    await newBtn.click()

    await expect(page.locator('.me-req-menu'), '.me-req-menu 없음').toBeVisible({ timeout: 8000 })

    await expect(
      page.locator('[data-testid="req-type-LEAVE_CREATE"]'),
      'req-type-LEAVE_CREATE 없음 — 앱 수정 필요',
    ).toBeVisible()
  })

  test('유형 메뉴: req-type-CUSTOM testid 기대', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const newBtn = page.locator('[data-testid="req-new-btn"]')
    await expect(newBtn, 'req-new-btn 없음 — 앱 수정 필요').toBeVisible()
    await newBtn.click()

    await expect(page.locator('.me-req-menu'), '.me-req-menu 없음').toBeVisible({ timeout: 8000 })

    await expect(
      page.locator('[data-testid="req-type-CUSTOM"]'),
      'req-type-CUSTOM 없음 — 앱 수정 필요',
    ).toBeVisible()
  })

  test('OFFSITE_WORK 유형 선택 → 다이얼로그 오픈 → req-submit-btn 기대', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const newBtn = page.locator('[data-testid="req-new-btn"]')
    await expect(newBtn, 'req-new-btn 없음 — 앱 수정 필요').toBeVisible()
    await newBtn.click()

    await expect(page.locator('.me-req-menu'), '.me-req-menu 없음').toBeVisible({ timeout: 8000 })

    // OFFSITE_WORK 유형 선택
    const offsiteItem = page.locator('[data-testid="req-type-OFFSITE_WORK"]')
    await expect(offsiteItem, 'req-type-OFFSITE_WORK 없음 — 앱 수정 필요').toBeVisible()
    await offsiteItem.click()

    // 다이얼로그 오픈 (MUI Dialog or .modal-overlay)
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog, 'OFFSITE_WORK 다이얼로그 없음').toBeVisible({ timeout: 8000 })

    // req-submit-btn testid 기대
    await expect(
      page.locator('[data-testid="req-submit-btn"]'),
      'req-submit-btn 없음 — 앱 수정 필요 (OffsiteWorkDialog "신청" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('OFFSITE_WORK 신청 → 목록 PENDING 반영', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    const newBtn = page.locator('[data-testid="req-new-btn"]')
    await expect(newBtn, 'req-new-btn 없음 — 앱 수정 필요').toBeVisible()
    await newBtn.click()

    await expect(page.locator('.me-req-menu'), '.me-req-menu 없음').toBeVisible({ timeout: 8000 })

    const offsiteItem = page.locator('[data-testid="req-type-OFFSITE_WORK"]')
    await expect(offsiteItem, 'req-type-OFFSITE_WORK 없음 — 앱 수정 필요').toBeVisible()
    await offsiteItem.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog, 'OFFSITE_WORK 다이얼로그 없음').toBeVisible({ timeout: 8000 })

    // 필드 채우기 (MUI TextField — label로 접근)
    const today = new Date().toISOString().slice(0, 10)
    const dateInput = dialog.locator('input[type="date"]').first()
    await dateInput.fill(today)
    await dialog.locator('input[placeholder="예: 강남 고객사"]').fill('E2E 테스트 목적지')
    await dialog.locator('textarea').first().fill('E2E 테스트 사유')

    // req-submit-btn 클릭
    const submitBtn = page.locator('[data-testid="req-submit-btn"]')
    await expect(submitBtn, 'req-submit-btn 없음 — 앱 수정 필요').toBeVisible()
    await submitBtn.click()

    // 다이얼로그 닫힘 → 목록 반영
    await expect(dialog).not.toBeVisible({ timeout: 12000 })
    await page.waitForLoadState('networkidle')

    // 대기중 탭으로 이동해 목록 확인
    const pendingTab = page.locator('.tabs .tab', { hasText: '대기중' }).first()
    await pendingTab.click()
    await page.waitForLoadState('networkidle')

    const rows = page.locator('table.tbl tbody tr')
    const rowCount = await rows.count()
    expect(rowCount, '대기중 탭에 요청 행 없음 — 요청 생성 미반영').toBeGreaterThan(0)
  })

  test('PENDING 요청 취소: req-cancel-btn 기대 → ConfirmDialog → 취소 완료', async ({ page }) => {
    // API로 PENDING 요청 미리 생성
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const reqId = await createOffsiteRequest(page, empToken)
    expect(reqId, '요청 ID 없음').toBeTruthy()

    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    // 대기중 탭으로 이동
    const pendingTab = page.locator('.tabs .tab', { hasText: '대기중' }).first()
    await pendingTab.click()
    await page.waitForLoadState('networkidle')

    // req-cancel-btn testid 기대
    const cancelBtns = page.locator('[data-testid="req-cancel-btn"]')
    await expect(cancelBtns.first(), 'req-cancel-btn 없음 — 앱 수정 필요 (PENDING 행 취소 버튼에 testid 부여)').toBeVisible({ timeout: 10000 })

    // 첫 번째 취소 버튼 클릭
    await cancelBtns.first().click()

    // ConfirmDialog 오픈
    const confirmDialog = page.locator('.confirm')
    await expect(confirmDialog, '취소 확인 다이얼로그 없음').toBeVisible({ timeout: 8000 })

    // 확인 버튼 클릭 (.yes)
    const confirmBtn = confirmDialog.locator('.yes')
    await expect(confirmBtn, 'ConfirmDialog 확인 버튼(.yes) 없음').toBeVisible()
    await confirmBtn.click()

    // 다이얼로그 닫힘
    await expect(confirmDialog).not.toBeVisible({ timeout: 10000 })

    // API로 취소 상태 검증
    const verifyResp = await page.request.get(`${API_URL}/requests?scope=mine&limit=100`, {
      headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    })
    const body = await verifyResp.json()
    const items: Array<{ id: string; status: string }> = Array.isArray(body?.data)
      ? body.data
      : body?.data?.items ?? []
    const cancelled = items.find((r) => r.id === reqId)
    expect(cancelled?.status, '취소 후 API 검증: 상태가 CANCELLED 여야 함').toBe('CANCELLED')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// A4. positive — 전자결재 문서함 (employee, /me/documents)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('A4. positive — employee /me/documents 화면', () => {
  test('화면 렌더: Seg 탭·테이블 존재', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/documents`)
    await page.waitForLoadState('networkidle')

    // Seg 컴포넌트 (box 탭)
    await expect(page.locator('.seg, [class*="seg"]').first(), 'Seg 탭 없음').toBeVisible({ timeout: 8000 })
    // 테이블 또는 빈 상태
    const hasTable = await page.locator('table.tbl').count()
    const isEmpty = await page.locator('.c.muted').count()
    expect(hasTable + isEmpty, '/me/documents 테이블 없음').toBeGreaterThan(0)
  })

  test('me-doc-create-btn 노출 기대 (PageHead right 기안 등록 버튼)', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/documents`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('[data-testid="me-doc-create-btn"]'),
      'me-doc-create-btn 없음 — 앱 수정 필요 (PageHead right "기안 등록" 버튼에 testid 부여)',
    ).toBeVisible()
  })

  test('me-doc-create-btn 클릭 → DocModal(create) 오픈', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/documents`)
    await page.waitForLoadState('networkidle')

    const btn = page.locator('[data-testid="me-doc-create-btn"]')
    await expect(btn, 'me-doc-create-btn 없음 — 앱 수정 필요').toBeVisible()
    await btn.click()

    // DocModal 오픈 (.modal)
    await expect(page.locator('.modal'), 'DocModal 없음').toBeVisible({ timeout: 10000 })
  })

  test('박스 탭 전환: 기안함→결재함', async ({ page }) => {
    await loginAs(page, 'employee')
    await page.goto(`${BASE_URL}/me/documents`)
    await page.waitForLoadState('networkidle')

    // Seg 탭에서 "결재함" 버튼 클릭
    const approvalTab = page.locator('button, [role="tab"]').filter({ hasText: /결재함|approval/i })
    if (await approvalTab.count() > 0) {
      await approvalTab.first().click()
      await page.waitForLoadState('networkidle')
      // 탭 전환 후 화면 유지 확인
      await expect(page.locator('table.tbl')).toBeVisible()
    } else {
      // Seg 옵션 버튼 첫 번째 클릭
      const segOptions = page.locator('.seg button, .seg-btn')
      const optCount = await segOptions.count()
      if (optCount > 1) {
        await segOptions.nth(1).click()
        await page.waitForLoadState('networkidle')
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. negative — 본인 스코핑 / 멀티테넌시
// ─────────────────────────────────────────────────────────────────────────────

test.describe('B. negative — 본인 스코핑: employee GET /requests 본인 데이터만', () => {
  test('employee: GET /requests — 전부 본인(requesterId) 요청만 반환', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    const empId = jwtEmployeeId(accessToken)

    const resp = await page.request.get(`${API_URL}/requests?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.ok(), 'GET /requests 실패').toBeTruthy()
    const body = await resp.json()
    const data = body?.data ?? []
    const items: Array<{ id: string; requesterId?: string }> = Array.isArray(data)
      ? data
      : data.items ?? []

    // requesterId가 있는 항목은 전부 본인
    for (const item of items) {
      if (item.requesterId) {
        expect(
          item.requesterId,
          `타인(requesterId=${item.requesterId}) 요청이 employee 응답에 포함됨 — 멀티테넌시 위반`,
        ).toBe(empId)
      }
    }
  })

  test('employee: GET /leaves/balance/:employeeId — 본인 잔액 조회 성공', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    const empId = jwtEmployeeId(accessToken)

    const resp = await page.request.get(`${API_URL}/leaves/balance/${empId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    // 본인 데이터 조회는 성공 (200)
    expect(resp.ok(), 'employee 본인 잔액 조회 실패').toBeTruthy()
  })

  test('employee: GET /leaves/balance/타인_ID → 403 또는 빈 배열 (타인 잔액 차단)', async ({
    page,
  }) => {
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const { accessToken: salesToken } = await login(
      page,
      ACCOUNTS.sales.email,
      ACCOUNTS.sales.password,
    )
    const salesId = jwtEmployeeId(salesToken)

    const resp = await page.request.get(`${API_URL}/leaves/balance/${salesId}`, {
      headers: { Authorization: `Bearer ${empToken}`, 'Content-Type': 'application/json' },
    })
    // 타인 잔액: 403 차단이 정답(서비스 LEAVE_BALANCE_FORBIDDEN). 만약 200이면
    // 응답을 실제 파싱해 타인(salesId) 잔액이 포함되지 않았는지(본인 스코핑 필터) 검증한다.
    const status = resp.status()
    if (status === 403) {
      expect(status, '타인 잔액 조회는 403으로 차단돼야 함').toBe(403)
    } else {
      expect(resp.ok(), `타인 잔액 조회 예상치 못한 상태(${status}) — 403이거나 본인 스코핑된 200이어야 함`).toBeTruthy()
      const body = await resp.json()
      const data = body?.data ?? body
      const items: Array<{ employeeId?: string; employee?: { id?: string } }> = Array.isArray(data)
        ? data
        : (data?.items ?? [])
      for (const it of items) {
        const owner = it.employeeId ?? it.employee?.id
        if (owner) {
          expect(
            owner,
            `타인(salesId=${salesId}) 잔액이 employee 응답에 노출됨 — 멀티테넌시/본인 스코핑 위반`,
          ).not.toBe(salesId)
        }
      }
    }
  })

  test('employee: GET /attendances/me/today — 200 (본인 오늘 출퇴근)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    const resp = await page.request.get(`${API_URL}/attendances/me/today`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.ok(), 'employee GET /attendances/me/today 실패').toBeTruthy()
  })
})

test.describe('B2. negative — 조직 격리: employee(개발팀)·sales(영업팀) 간 데이터 비노출', () => {
  test('employee가 만든 요청이 sales 응답에 포함되지 않음', async ({ page }) => {
    // employee로 요청 생성
    const { accessToken: empToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )
    const empId = jwtEmployeeId(empToken)
    await createOffsiteRequest(page, empToken)

    // sales로 요청 목록 조회
    const { accessToken: salesToken } = await login(
      page,
      ACCOUNTS.sales.email,
      ACCOUNTS.sales.password,
    )

    const resp = await page.request.get(`${API_URL}/requests?limit=100`, {
      headers: { Authorization: `Bearer ${salesToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.ok(), 'sales GET /requests 실패').toBeTruthy()

    const body = await resp.json()
    const data = body?.data ?? []
    const items: Array<{ requesterId?: string }> = Array.isArray(data) ? data : data.items ?? []

    // sales 요청 목록에 employee(개발팀) requesterId 포함 금지
    for (const item of items) {
      if (item.requesterId) {
        expect(
          item.requesterId,
          `employee(개발팀) 요청이 sales(영업팀) 응답에 노출됨 — 멀티테넌시 위반`,
        ).not.toBe(empId)
      }
    }
  })

  test('sales: GET /attendances/me/today — 200 (본인 데이터)', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.sales.email, ACCOUNTS.sales.password)
    const resp = await page.request.get(`${API_URL}/attendances/me/today`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    expect(resp.ok(), 'sales GET /attendances/me/today 실패').toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. positive — 관리자도 /me/* 접근 가능 (라우트 허용)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('C. positive — 관리자도 /me/home 접근 가능 (EMPLOYEE 이상)', () => {
  test('genAdmin: /me/home 직접 접근 → 화면 렌더 (차단 아님)', async ({ page }) => {
    await loginAs(page, 'genAdmin')
    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')

    // /me/home 에 머무름 (리다이렉트 없음) — 매트릭스 2-2: /me/* 는 모든 역할 허용
    const landed = new URL(page.url()).pathname
    expect(landed, 'genAdmin 이 /me/home 에서 리다이렉트됨 — 라우트 허용 필요').toBe('/me/home')

    // 화면 렌더 확인
    await expect(page.locator('.me-clock'), '.me-clock 영역 없음 — genAdmin /me/home 접근 시').toBeVisible()
  })

  test('admin(SUPER_ADMIN): /me/home 직접 접근 → 화면 렌더', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${BASE_URL}/me/home`)
    await page.waitForLoadState('networkidle')

    const landed = new URL(page.url()).pathname
    expect(landed, 'admin 이 /me/home 에서 리다이렉트됨 — 라우트 허용 필요').toBe('/me/home')

    await expect(page.locator('.me-clock')).toBeVisible()
  })
})
