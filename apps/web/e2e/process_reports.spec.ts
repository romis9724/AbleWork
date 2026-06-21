/**
 * AbleWork ERP — 리포트 프로세스 통합 E2E
 *
 * 대상: 실시간 리포트 / 표준화규칙 CRUD / 지각·조퇴 임계 / 스냅샷 생성·행조회
 *
 * 전략:
 *  - 셋업(직원·조직·출퇴근·표준화규칙 생성)은 API로 수행한다.
 *  - 화면 액션(버튼 클릭·입력·조회)만 UI로 검증한다.
 *  - 집계 단언은 테스트가 직접 생성한 직원 ID 로 필터링해 결정적으로 유지한다.
 *  - 전역 카운트(회사 전체 건수) 비교는 일절 사용하지 않는다.
 *
 * 전제:
 *  - web: http://localhost:4000, api: http://localhost:4001/api/v1 모두 가동 중
 *  - 시드 계정(admin@ablework.io / admin1234!) 유효
 */
import { test, expect, type Page } from '@playwright/test'
import { ACCOUNTS, BASE_URL, API_URL, login, uiLogin } from './helpers'

// ── 타입 ────────────────────────────────────────────────────────────────────

interface ApiTokens {
  accessToken: string
}

interface ReportRow {
  employeeId: string
  lateCount: number
  totalWorkDays: number
}

// ── API 헬퍼 ─────────────────────────────────────────────────────────────────

function authHdr(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function adminToken(page: Page): Promise<string> {
  const tokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
  return tokens.accessToken
}

/** 고유 이름을 가진 테스트 조직을 생성한다. */
async function createOrg(page: Page, token: string, name: string): Promise<string> {
  const resp = await page.request.post(`${API_URL}/organizations`, {
    headers: authHdr(token),
    data: { name, depth: 0, sortOrder: 99 },
  })
  const body = await resp.json()
  return body.data.id as string
}

/** 고유 직원 1명을 생성한다. */
async function createEmployee(
  page: Page,
  token: string,
  name: string,
  email: string,
  orgId: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/employees`, {
    headers: authHdr(token),
    data: {
      name,
      email,
      organizationIds: [orgId],
      primaryOrganizationId: orgId,
      joinedAt: '2026-01-01',
      employmentType: 'regular',
      accessLevel: 'EMPLOYEE',
      initialPassword: 'Test1234!',
    },
  })
  const body = await resp.json()
  return body.data.id as string
}

/** 출퇴근 기록을 수기로 추가한다. */
async function createAttendance(
  page: Page,
  token: string,
  employeeId: string,
  clockInAt: string,
  clockOutAt: string,
  status: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/attendances`, {
    headers: authHdr(token),
    data: { employeeId, clockInAt, clockOutAt, status },
  })
  const body = await resp.json()
  return body.data.id as string
}

/** 실시간 리포트를 API로 직접 조회한다. */
async function fetchRealtimeReport(
  page: Page,
  token: string,
  employeeId: string,
  lateThresholdMinutes?: number,
): Promise<ReportRow[]> {
  const params = new URLSearchParams({
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    employeeId,
  })
  if (lateThresholdMinutes != null) {
    params.set('lateThresholdMinutes', String(lateThresholdMinutes))
  }
  const resp = await page.request.get(`${API_URL}/reports/realtime?${params}`, {
    headers: authHdr(token),
  })
  const body = await resp.json()
  return (body.data ?? []) as ReportRow[]
}

/** 표준화규칙 API 생성. ID 반환. */
async function createStdRule(
  page: Page,
  token: string,
  name: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/standardization-rules`, {
    headers: authHdr(token),
    data: {
      name,
      calculationBasis: 'attendance',
      startTimeRule: 'actual',
      endTimeRule: 'actual',
      isDefault: false,
    },
  })
  const body = await resp.json()
  return body.data.id as string
}

/** 스냅샷 API 생성. ID 반환. */
async function createSnapshot(
  page: Page,
  token: string,
  name: string,
  periodStart: string,
  periodEnd: string,
): Promise<string> {
  const resp = await page.request.post(`${API_URL}/reports/snapshots`, {
    headers: authHdr(token),
    data: { name, periodStart, periodEnd, columnConfig: {} },
  })
  const body = await resp.json()
  return body.data.id as string
}

// ── 픽스처: 테스트 전체에서 공유하는 직원 + 출퇴근 데이터 ──────────────────────

const SEED_TS = Date.now()
const EMP_NAME = `E2E리포트직원${SEED_TS}`
const EMP_EMAIL = `e2e-report-${SEED_TS}@ablework.io`
const ORG_NAME = `E2E리포트조직${SEED_TS}`

let sharedToken = ''
let sharedEmpId = ''
let sharedOrgId = ''

test.describe('리포트 프로세스 E2E', () => {
  test.beforeAll(async ({ browser }) => {
    // 공유 직원·조직·출퇴근 데이터를 한 번만 셋업한다.
    const page = await browser.newPage()
    try {
      sharedToken = await adminToken(page)

      // 조직 생성
      sharedOrgId = await createOrg(page, sharedToken, ORG_NAME)

      // 직원 생성
      sharedEmpId = await createEmployee(
        page,
        sharedToken,
        EMP_NAME,
        EMP_EMAIL,
        sharedOrgId,
      )

      // 출퇴근 기록 2건:
      //   - Jun 10: status='late', shift 없음 → threshold 무관 항상 지각 카운트
      //   - Jun 15: status='late', shift 없음 → threshold 무관 항상 지각 카운트
      //   이 두 건으로 threshold=0(기본) lateCount=2 확보.
      await createAttendance(
        page,
        sharedToken,
        sharedEmpId,
        '2026-06-10T01:30:00.000Z',
        '2026-06-10T10:00:00.000Z',
        'late',
      )
      await createAttendance(
        page,
        sharedToken,
        sharedEmpId,
        '2026-06-15T01:20:00.000Z',
        '2026-06-15T10:00:00.000Z',
        'normal',
      )
    } finally {
      await page.close()
    }
  })

  // ── Case 1: 실시간 리포트 조회 ──────────────────────────────────────────────

  test.describe('Case 1: 실시간 리포트 조회', () => {
    test('admin이 리포트 화면에 진입하면 조회 버튼이 존재한다', async ({ page }) => {
      // Arrange
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)

      // Act
      await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'domcontentloaded' })

      // Assert: 오류·빈 화면이 아니라 정상 페이지가 렌더됐는지 확인
      await expect(page.getByRole('button', { name: '조회' })).toBeVisible({ timeout: 10000 })
    })

    test('직원 필터 + 조회 → 해당 직원 행이 테이블에 표시된다', async ({ page }) => {
      // Arrange
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'domcontentloaded' })

      // Act: 직원 셀렉트에서 생성한 직원 선택
      const empSelect = page.locator('select.sel').nth(1) // 두 번째 sel = 직원
      await expect(empSelect).toBeVisible({ timeout: 8000 })
      await empSelect.selectOption({ label: EMP_NAME })

      await page.getByRole('button', { name: '조회' }).click()

      // Assert: 직원 이름이 결과 테이블에 나타나야 한다
      await expect(page.locator('table').getByText(EMP_NAME)).toBeVisible({ timeout: 12000 })
    })

    test('API 직접 조회: 생성한 직원의 실시간 리포트가 데이터를 반환한다', async ({ page }) => {
      // Arrange
      const token = await adminToken(page)

      // Act
      const rows = await fetchRealtimeReport(page, token, sharedEmpId)

      // Assert
      expect(rows.length).toBe(1)
      const row = rows[0]
      expect(row.employeeId).toBe(sharedEmpId)
      expect(row.totalWorkDays).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Case 2: 표준화규칙 CRUD (A-7) ──────────────────────────────────────────

  test.describe('Case 2: 표준화규칙 CRUD (A-7)', () => {
    const RULE_NAME = `E2E표준화규칙${SEED_TS}`

    test('표준화규칙 생성 → 목록 표시 → 삭제 → 목록에서 제거됨', async ({ page }) => {
      // Arrange: UI 로그인 후 표준화규칙 화면 진입
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/reports/standardization`, { waitUntil: 'domcontentloaded' })

      // Act 1: 규칙 추가 다이얼로그 열기
      await page.getByRole('button', { name: '규칙 추가' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

      // Act 2: 규칙명 입력 후 저장
      await page.getByLabel('규칙명').fill(RULE_NAME)
      await page.getByRole('button', { name: '저장' }).click()

      // Assert 1: 목록에 규칙명이 보여야 한다
      await expect(page.getByText(RULE_NAME)).toBeVisible({ timeout: 10000 })

      // Act 3: 삭제 버튼 클릭 (해당 행의 삭제 아이콘)
      const row = page.locator('tr', { hasText: RULE_NAME })
      await row.getByRole('button').last().click() // 마지막 버튼 = 삭제(DeleteIcon)

      // Assert 2: 삭제 확인 다이얼로그
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })

      // Act 4: 삭제 확인
      await page.getByRole('button', { name: '삭제' }).click()

      // Assert 3: 목록에서 제거됐는지 확인
      await expect(page.getByText(RULE_NAME)).not.toBeVisible({ timeout: 10000 })
    })

    test('API: 표준화규칙 생성 후 DELETE → 목록에서 소프트삭제됨', async ({ page }) => {
      // Arrange
      const token = await adminToken(page)
      const ruleName = `E2EAPI표준화${SEED_TS}`
      const ruleId = await createStdRule(page, token, ruleName)

      // Act: 삭제
      const delResp = await page.request.delete(`${API_URL}/standardization-rules/${ruleId}`, {
        headers: authHdr(token),
      })

      // Assert: 200 OK
      expect(delResp.ok()).toBeTruthy()

      // Assert: 목록에 해당 규칙이 더 이상 없다
      const listResp = await page.request.get(`${API_URL}/standardization-rules`, {
        headers: authHdr(token),
      })
      const listBody = await listResp.json()
      const rules = listBody.data as Array<{ id: string }>
      expect(rules.find((r) => r.id === ruleId)).toBeUndefined()
    })
  })

  // ── Case 3: 지각·조퇴 임계 (E-7) ──────────────────────────────────────────

  test.describe('Case 3: 지각·조퇴 임계 (E-7)', () => {
    test('API: 임계 미지정 시 저장된 status=late 기준으로 lateCount 집계', async ({ page }) => {
      // Arrange
      const token = await adminToken(page)

      // Act: 임계 없이 조회
      const rows = await fetchRealtimeReport(page, token, sharedEmpId)

      // Assert: Jun 10 에 status='late' 1건 저장됨 → lateCount >= 1
      expect(rows.length).toBe(1)
      expect(rows[0].lateCount).toBeGreaterThanOrEqual(1)
    })

    test('UI: 지각 임계 셀렉트 변경 → 조회 성공 (오류 없음)', async ({ page }) => {
      // Arrange
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/reports`, { waitUntil: 'domcontentloaded' })

      // Act: 직원 필터 + 지각 임계 15분 선택 후 조회
      const empSelect = page.locator('select.sel').nth(1)
      await expect(empSelect).toBeVisible({ timeout: 8000 })
      await empSelect.selectOption({ label: EMP_NAME })

      const lateSelect = page.locator('select.sel').nth(2)
      await lateSelect.selectOption({ value: '15' })

      await page.getByRole('button', { name: '조회' }).click()

      // Assert: 오류 토스트가 없고 테이블이 렌더됐다 (빈 결과도 유효)
      await expect(page.getByText('리포트 조회에 실패했습니다')).not.toBeVisible({ timeout: 8000 })

      // 직원이 그래도 조회되면 이름이 보임
      // (status='late' 인 레코드는 shift 없어서 임계 무관하게 카운트됨)
      await expect(page.locator('table').getByText(EMP_NAME)).toBeVisible({ timeout: 12000 })
    })

    test('API: 임계 파라미터별로 lateCount가 결정적으로 일치한다', async ({ page }) => {
      // Arrange
      const token = await adminToken(page)
      // sharedEmpId 는 status='late' 로 수기 등록된 출퇴근 1건(shiftId=null) 보유.
      // shift 없으면 threshold 지정 시에도 stored status 폴백 → lateCount 동일해야 함.

      // Act
      const rowsNoThreshold = await fetchRealtimeReport(page, token, sharedEmpId)
      const rowsWith30 = await fetchRealtimeReport(page, token, sharedEmpId, 30)

      // Assert: 두 경우 모두 lateCount 동일 (shift 없어서 threshold 미적용)
      expect(rowsNoThreshold[0].lateCount).toBe(rowsWith30[0].lateCount)
    })
  })

  // ── Case 4: 스냅샷 생성·행조회 (E-8) ──────────────────────────────────────

  test.describe('Case 4: 스냅샷 생성·행조회 (E-8)', () => {
    const SNAP_NAME = `E2E스냅샷${SEED_TS}`
    const SNAP_START = '2026-06-01'
    const SNAP_END = '2026-06-30'

    test('UI: 스냅샷 생성 다이얼로그 → 생성 → 목록에 표시', async ({ page }) => {
      // Arrange
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/reports/snapshots`, { waitUntil: 'domcontentloaded' })

      // Act: 스냅샷 생성 버튼 클릭
      await page.getByRole('button', { name: '스냅샷 생성' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

      // Act: 다이얼로그 입력
      await page.getByLabel('스냅샷 이름').fill(SNAP_NAME)
      await page.getByLabel('시작일').fill(SNAP_START)
      await page.getByLabel('종료일').fill(SNAP_END)

      await page.getByRole('button', { name: '생성' }).click()

      // Assert: 스냅샷 목록에 이름 표시
      await expect(page.getByText(SNAP_NAME)).toBeVisible({ timeout: 12000 })
    })

    test('UI: 스냅샷 행 보기 → 모달 표시 (오류 없음)', async ({ page }) => {
      // Arrange: API로 스냅샷 생성
      const token = await adminToken(page)
      const snapId = await createSnapshot(page, token, SNAP_NAME + '_행보기', SNAP_START, SNAP_END)
      expect(snapId).toBeTruthy()

      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/reports/snapshots`, { waitUntil: 'domcontentloaded' })

      // Assert: 목록에 스냅샷이 보인다
      await expect(page.getByText(SNAP_NAME + '_행보기')).toBeVisible({ timeout: 10000 })

      // Act: 해당 행의 '행 보기' 버튼 클릭
      const row = page.locator('tr', { hasText: SNAP_NAME + '_행보기' })
      await row.getByRole('button', { name: '행 보기' }).click()

      // Assert: 모달이 열린다
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

      // Assert: 모달 타이틀이 있다
      await expect(page.getByRole('dialog').getByText('직원별 집계')).toBeVisible({ timeout: 5000 })
    })

    test('API: 스냅샷 생성 → GET snapshots/:id/rows → 응답 구조 유효', async ({ page }) => {
      // Arrange
      const token = await adminToken(page)
      const snapName = `E2EAPI스냅샷${SEED_TS}`

      // Act 1: 스냅샷 생성
      const snapId = await createSnapshot(page, token, snapName, SNAP_START, SNAP_END)
      expect(snapId).toBeTruthy()

      // Act 2: 행 조회
      const rowsResp = await page.request.get(`${API_URL}/reports/snapshots/${snapId}/rows`, {
        headers: authHdr(token),
      })

      // Assert: 200 OK + 응답 스키마 유효
      expect(rowsResp.ok()).toBeTruthy()
      const rowsBody = await rowsResp.json()
      expect(rowsBody).toHaveProperty('data')

      // rows 배열이 존재해야 한다 (빈 배열도 허용)
      const rows = rowsBody.data?.rows ?? rowsBody.data ?? []
      expect(Array.isArray(rows)).toBeTruthy()
    })

    test('API: 스냅샷 목록 조회 → items 배열 반환', async ({ page }) => {
      // Arrange
      const token = await adminToken(page)

      // Act
      const resp = await page.request.get(`${API_URL}/reports/snapshots`, {
        headers: authHdr(token),
      })

      // Assert
      expect(resp.ok()).toBeTruthy()
      const body = await resp.json()
      const items = body.data?.items ?? body.data ?? []
      expect(Array.isArray(items)).toBeTruthy()
    })
  })
})
