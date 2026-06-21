/**
 * AbleWork ERP — 인사·조직 프로세스 통합 E2E
 *
 * 옵션 목록:
 * 1. 직원 등록: EmployeeCreateDialog UI → GET /employees 확인
 * 2. 직원 정보 수정: 직원 상세 UI 필드 수정 → GET /employees/:id 반영 확인
 * 3. 근로정보 CRUD (D-4): 직원 상세 근로정보 탭 추가→수정→삭제 단계별 확인
 * 4. CSV 일괄 업로드 (D-5): POST /employees/bulk 직접 호출(정상+오류 혼합)
 * 5. 조직 CRUD / 직무 CRUD: 고유명 생성→삭제 확인
 * 6. RBAC: EMPLOYEE 토큰 POST /employees → 403 확인
 *
 * 전략: 셋업/검증은 API, 핵심 액션만 UI. 생성 데이터에 Date.now() 접미사로 충돌 방지.
 *
 * 전제: web(4000)/api(4001) 기동 + 시드 계정. 포트는 helpers.ts(env 오버라이드).
 */
import { test, expect } from '@playwright/test'
import { ACCOUNTS, BASE_URL, API_URL, login, uiLogin } from './helpers'

// ──────────────────────────────────────────────────────────────────────────────
// 공통 유틸
// ──────────────────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** API: 조직 목록 조회 */
async function getOrganizations(
  page: import('@playwright/test').Page,
  token: string,
): Promise<{ id: string; name: string }[]> {
  const resp = await page.request.get(`${API_URL}/organizations`, {
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return (body?.data ?? body) as { id: string; name: string }[]
}

/** API: 첫 번째 유효 조직 ID 반환 (UUID 형태인 것 우선, 없으면 첫 번째) */
async function firstRealOrgId(
  page: import('@playwright/test').Page,
  token: string,
): Promise<{ id: string; name: string }> {
  const orgs = await getOrganizations(page, token)
  const uuid = orgs.find((o) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o.id),
  )
  return uuid ?? orgs[0]
}

// ──────────────────────────────────────────────────────────────────────────────
// 테스트 스위트
// ──────────────────────────────────────────────────────────────────────────────

test.describe('인사·조직 프로세스 E2E', () => {
  // ── 옵션 1: 직원 등록 ─────────────────────────────────────────────────────────
  test('직원 등록: EmployeeCreateDialog UI 입력 후 제출 → GET /employees 생성 확인', async ({
    page,
  }) => {
    // Arrange
    const suffix = Date.now()
    const newEmail = `e2e-create-${suffix}@ablework.io`
    const newName = `E2E신규${suffix}`

    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = authHeaders(accessToken)

    // 새 직원이 배정될 조직 UUID 확보 (시드 조직은 non-UUID id라 Dialog 검증 통과 안 됨)
    // 미리 테스트용 조직을 API로 생성한다
    const orgResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: `E2E조직${suffix}` },
      headers,
    })
    expect(orgResp.ok()).toBeTruthy()
    const orgBody = await orgResp.json()
    const orgId: string = orgBody.data.id
    const orgName: string = orgBody.data.name

    try {
      // Act — UI 로그인 후 직원 등록 Dialog 조작
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/employees`, { waitUntil: 'domcontentloaded' })

      // "직원 추가하기" 버튼 클릭
      await page.getByRole('button', { name: '직원 추가하기' }).click()

      // MUI Dialog 열릴 때까지 대기
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

      // 이름 입력
      await page.getByLabel('이름').fill(newName)

      // 이메일 입력
      await page.getByLabel('이메일').fill(newEmail)

      // 소속 조직 Autocomplete — combobox role로 한정해 listbox 중복 매칭 방지
      const orgInput = page.getByRole('combobox', { name: '소속 조직' })
      await orgInput.click()
      await orgInput.fill(orgName)
      await page.getByRole('option', { name: orgName }).click()

      // 본조직 Select는 소속 조직 선택 후 자동으로 채워짐(useEffect)
      // 입사일은 default = today, 고용형태·권한은 default 그대로 사용

      // 추가 버튼 클릭
      await page.getByRole('button', { name: '추가', exact: true }).click()

      // Assert — API로 생성 확인 (dialog가 닫힐 때까지 잠시 대기)
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      const searchResp = await page.request.get(
        `${API_URL}/employees?search=${encodeURIComponent(newName)}&limit=10`,
        { headers },
      )
      const searchBody = await searchResp.json()
      const items: { name: string; user?: { email: string } }[] =
        searchBody?.data?.items ?? []
      const found = items.find(
        (e) => e.user?.email === newEmail || e.name === newName,
      )
      expect(found, `직원 "${newName}"(${newEmail})이 API 검색 결과에 없습니다`).toBeTruthy()
    } finally {
      // 정리: 테스트 조직 삭제 (직원이 있으면 삭제 실패 가능 — 무시)
      await page.request.delete(`${API_URL}/organizations/${orgId}`, { headers })
    }
  })

  // ── 옵션 2: 직원 정보 수정 ────────────────────────────────────────────────────
  test('직원 정보 수정: 상세 화면에서 사원번호 수정 → GET /employees/:id 반영 확인', async ({
    page,
  }) => {
    // Arrange — API로 테스트 직원 생성
    const suffix = Date.now()
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = authHeaders(accessToken)

    // 조직 생성
    const orgResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: `E2E수정조직${suffix}` },
      headers,
    })
    const orgId: string = (await orgResp.json()).data.id

    // 직원 생성
    const empResp = await page.request.post(`${API_URL}/employees`, {
      data: {
        name: `E2E수정직원${suffix}`,
        email: `e2e-edit-${suffix}@ablework.io`,
        joinedAt: '2024-01-01',
        employmentType: 'regular',
        accessLevel: 'EMPLOYEE',
        organizationIds: [orgId],
        primaryOrganizationId: orgId,
      },
      headers,
    })
    expect(empResp.ok()).toBeTruthy()
    const empId: string = (await empResp.json()).data.id
    const newEmpNumber = `EMP-${suffix}`

    try {
      // Act — 직원 상세 페이지 열고 사원번호 수정
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/employees/${empId}`, { waitUntil: 'domcontentloaded' })

      // 사원번호 필드 수정 (기본정보 탭이 tab=0으로 기본 활성)
      const empNumField = page.getByLabel('사원번호')
      await expect(empNumField).toBeVisible({ timeout: 15000 })
      await empNumField.fill(newEmpNumber)

      // 저장 버튼 클릭
      await page.getByRole('button', { name: '저장', exact: true }).click()

      // Assert — API로 반영 확인
      await expect
        .poll(
          async () => {
            const r = await page.request.get(`${API_URL}/employees/${empId}`, { headers })
            const b = await r.json()
            return (b?.data ?? b).employeeNumber
          },
          { timeout: 10000 },
        )
        .toBe(newEmpNumber)
    } finally {
      await page.request.delete(`${API_URL}/organizations/${orgId}`, { headers })
    }
  })

  // ── 옵션 3: 근로정보 CRUD (D-4) ───────────────────────────────────────────────
  test('근로정보 CRUD: 직원 상세 근로정보 탭에서 추가→수정→삭제 단계별 확인', async ({
    page,
  }) => {
    // Arrange — 테스트 직원 API 생성
    const suffix = Date.now()
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = authHeaders(accessToken)

    const orgResp = await page.request.post(`${API_URL}/organizations`, {
      data: { name: `E2E근로조직${suffix}` },
      headers,
    })
    const orgId: string = (await orgResp.json()).data.id

    const empResp = await page.request.post(`${API_URL}/employees`, {
      data: {
        name: `E2E근로직원${suffix}`,
        email: `e2e-wage-${suffix}@ablework.io`,
        joinedAt: '2024-01-01',
        employmentType: 'regular',
        accessLevel: 'EMPLOYEE',
        organizationIds: [orgId],
        primaryOrganizationId: orgId,
      },
      headers,
    })
    expect(empResp.ok()).toBeTruthy()
    const empId: string = (await empResp.json()).data.id

    const getWageInfos = async () => {
      const r = await page.request.get(`${API_URL}/employees/${empId}/wage-info`, { headers })
      const b = await r.json()
      const data = b?.data ?? b
      return Array.isArray(data) ? data : (data?.items ?? [])
    }

    try {
      await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      await page.goto(`${BASE_URL}/admin/employees/${empId}`, { waitUntil: 'domcontentloaded' })

      // 근로정보 탭으로 전환 (MUI Tab — label="근로정보")
      await page.getByRole('tab', { name: '근로정보' }).click()

      // ── 추가 ──────────────────────────────────────────────────────
      await page.getByRole('button', { name: '+ 근로정보 추가' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

      await page.getByLabel('시급 (원)').fill('15000')
      await page.getByLabel('주 계약시간 (시간/주)').fill('40')
      await page.getByLabel('적용시점').fill('2024-01-01')

      await page.getByRole('button', { name: '추가', exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 추가 확인
      await expect
        .poll(async () => (await getWageInfos()).length, { timeout: 8000 })
        .toBeGreaterThan(0)

      const wagesAfterAdd = await getWageInfos()
      const wageId: string = wagesAfterAdd[0].id
      expect(wagesAfterAdd[0].hourlyWage).toBe(15000)

      // ── 수정 ──────────────────────────────────────────────────────
      // 수정 아이콘 클릭 (aria-label="수정")
      await page.getByRole('button', { name: '수정' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

      // 시급 변경
      await page.getByLabel('시급 (원)').fill('18000')

      await page.getByRole('button', { name: '수정', exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 수정 확인
      await expect
        .poll(
          async () => {
            const w = await getWageInfos()
            return w.find((x: { id: string }) => x.id === wageId)?.hourlyWage
          },
          { timeout: 8000 },
        )
        .toBe(18000)

      // ── 삭제 ──────────────────────────────────────────────────────
      // 삭제 아이콘 클릭 (aria-label="삭제")
      await page.getByRole('button', { name: '삭제' }).first().click()

      // ConfirmDialog 확인 버튼 (confirmLabel="삭제")
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      const confirmButtons = page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true })
      await confirmButtons.last().click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 삭제 확인
      await expect
        .poll(async () => (await getWageInfos()).length, { timeout: 8000 })
        .toBe(0)
    } finally {
      await page.request.delete(`${API_URL}/organizations/${orgId}`, { headers })
    }
  })

  // ── 옵션 4: CSV 일괄 업로드 (D-5) ────────────────────────────────────────────
  test('CSV 일괄 업로드: POST /employees/bulk 정상 1행+오류 1행 → created·errors 확인', async ({
    page,
  }) => {
    // Arrange
    const suffix = Date.now()
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = authHeaders(accessToken)

    // 정상 행: 개발팀 조직명 사용, 이메일 고유
    // 오류 행: 동일 이메일 중복 → unique constraint 오류
    const validEmail = `bulk-ok-${suffix}@ablework.io`
    const rows = [
      {
        name: `벌크A${suffix}`,
        email: validEmail,
        joinedAt: '2024-06-01',
        employmentType: 'regular',
        organizationName: '개발팀',
      },
      {
        name: `벌크B${suffix}`,
        email: validEmail, // 중복 → 오류
        joinedAt: '2024-06-01',
        organizationName: '개발팀',
      },
    ]

    // Act — API 직접 호출 (파일 업로드 UI는 hidden input이라 플래키 우려)
    const resp = await page.request.post(`${API_URL}/employees/bulk`, {
      data: { rows },
      headers,
    })

    // Assert
    const body = await resp.json()
    expect(body.success, `bulk 응답 success가 false: ${JSON.stringify(body)}`).toBe(true)
    const data = body.data
    expect(data.created, 'created 수는 1이어야 한다').toBe(1)
    expect(data.errors.length, '오류 1건이어야 한다').toBeGreaterThanOrEqual(1)
    expect(
      data.errors[0].row,
      '오류 행 번호가 2(1-indexed + header skip이므로 3) 이상이어야 한다',
    ).toBeGreaterThanOrEqual(2)
  })

  // ── 옵션 5-A: 조직 CRUD ───────────────────────────────────────────────────────
  test('조직 CRUD: UI에서 조직 추가→수정→삭제 → API 반영 확인', async ({ page }) => {
    // Arrange
    const suffix = Date.now()
    const orgName = `E2E조직${suffix}`
    const orgNameUpdated = `E2E조직수정${suffix}`

    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = authHeaders(accessToken)

    const getOrgByName = async (name: string) => {
      const orgs = await getOrganizations(page, accessToken)
      return orgs.find((o) => o.name === name)
    }

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/organizations`, { waitUntil: 'domcontentloaded' })

    // ── 추가 ──────────────────────────────────────────────────────
    await page.getByRole('button', { name: '조직 추가' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

    await page.getByLabel('조직명').fill(orgName)
    await page.getByRole('button', { name: '추가', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // API로 추가 확인
    await expect
      .poll(async () => !!(await getOrgByName(orgName)), { timeout: 8000 })
      .toBe(true)

    const orgAfterCreate = await getOrgByName(orgName)
    const orgId = orgAfterCreate!.id

    try {
      // ── 수정 ──────────────────────────────────────────────────────
      // 트리에서 조직명 클릭 → treeitem에서 수정 아이콘 클릭
      const orgTreeItem = page.getByRole('treeitem', { name: new RegExp(orgName) }).first()
      await expect(orgTreeItem).toBeVisible({ timeout: 8000 })
      await orgTreeItem.getByRole('button', { name: `${orgName} 수정` }).click()

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      await page.getByLabel('조직명').fill(orgNameUpdated)
      await page.getByRole('button', { name: '수정', exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 수정 확인
      await expect
        .poll(async () => !!(await getOrgByName(orgNameUpdated)), { timeout: 8000 })
        .toBe(true)

      // ── 삭제 ──────────────────────────────────────────────────────
      const updatedTreeItem = page
        .getByRole('treeitem', { name: new RegExp(orgNameUpdated) })
        .first()
      await expect(updatedTreeItem).toBeVisible({ timeout: 8000 })
      await updatedTreeItem.getByRole('button', { name: `${orgNameUpdated} 삭제` }).click()

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: '확인', exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 삭제 확인
      await expect
        .poll(async () => !!(await getOrgByName(orgNameUpdated)), { timeout: 8000 })
        .toBe(false)
    } finally {
      // 혹시 조직이 남아 있으면 API로 강제 정리
      const remaining = await getOrgByName(orgNameUpdated)
      if (remaining) {
        await page.request.delete(`${API_URL}/organizations/${remaining.id}`, { headers })
      }
      const remaining2 = await getOrgByName(orgName)
      if (remaining2) {
        await page.request.delete(`${API_URL}/organizations/${remaining2.id}`, { headers })
      }
      // orgId fallback
      await page.request.delete(`${API_URL}/organizations/${orgId}`, { headers })
    }
  })

  // ── 옵션 5-B: 직무 CRUD ───────────────────────────────────────────────────────
  test('직무 CRUD: UI에서 직무 추가→수정→삭제 → API 반영 확인', async ({ page }) => {
    // Arrange
    const suffix = Date.now()
    const posName = `E2E직무${suffix}`
    const posNameUpdated = `E2E직무수정${suffix}`

    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = authHeaders(accessToken)

    const getPositionByName = async (name: string) => {
      const resp = await page.request.get(`${API_URL}/positions`, { headers })
      const body = await resp.json()
      const positions: { id: string; name: string }[] = body?.data ?? body
      return positions.find((p) => p.name === name)
    }

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/positions`, { waitUntil: 'domcontentloaded' })

    // ── 추가 ──────────────────────────────────────────────────────
    // PageHeader의 "직무 추가" contained 버튼 (EmptyState의 outlined "첫 번째 직무 추가"와 구분)
    await page.getByRole('button', { name: '직무 추가', exact: true }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })

    await page.getByLabel('직무명').fill(posName)
    await page.getByRole('button', { name: '추가', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

    // API로 추가 확인
    await expect
      .poll(async () => !!(await getPositionByName(posName)), { timeout: 8000 })
      .toBe(true)

    const posAfterCreate = await getPositionByName(posName)
    const posId = posAfterCreate!.id

    try {
      // ── 수정 ──────────────────────────────────────────────────────
      // 직무 카드에서 수정 아이콘(EditIcon) 클릭
      // 직무명 텍스트를 가진 카드의 수정 버튼 찾기
      const posCard = page.locator('text=' + posName).first().locator('xpath=ancestor::*[contains(@class,"MuiCard")]')
      // 카드 내 수정 아이콘 버튼 — aria-label 없으므로 위치로 접근
      await posCard.getByTestId('EditIcon').click().catch(() =>
        // fallback: 카드 안 첫 IconButton 클릭
        posCard.getByRole('button').first().click(),
      )

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      await page.getByLabel('직무명').fill(posNameUpdated)
      await page.getByRole('button', { name: '수정', exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 수정 확인
      await expect
        .poll(async () => !!(await getPositionByName(posNameUpdated)), { timeout: 8000 })
        .toBe(true)

      // ── 삭제 ──────────────────────────────────────────────────────
      const posCardUpdated = page
        .locator('text=' + posNameUpdated)
        .first()
        .locator('xpath=ancestor::*[contains(@class,"MuiCard")]')
      await posCardUpdated.getByTestId('DeleteIcon').click().catch(() =>
        posCardUpdated.getByRole('button').last().click(),
      )

      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 })
      await page.getByRole('button', { name: '확인', exact: true }).click()
      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })

      // API로 삭제 확인
      await expect
        .poll(async () => !!(await getPositionByName(posNameUpdated)), { timeout: 8000 })
        .toBe(false)
    } finally {
      // 혹시 남아 있으면 API로 강제 정리
      const remaining = await getPositionByName(posNameUpdated)
      if (remaining) {
        await page.request.delete(`${API_URL}/positions/${remaining.id}`, { headers })
      }
      const remaining2 = await getPositionByName(posName)
      if (remaining2) {
        await page.request.delete(`${API_URL}/positions/${remaining2.id}`, { headers })
      }
      await page.request.delete(`${API_URL}/positions/${posId}`, { headers })
    }
  })

  // ── 옵션 6: RBAC ──────────────────────────────────────────────────────────────
  test('RBAC: EMPLOYEE 토큰으로 POST /employees → 403 Forbidden 반환', async ({ page }) => {
    // Arrange
    const { accessToken } = await login(
      page,
      ACCOUNTS.employee.email,
      ACCOUNTS.employee.password,
    )

    // Act — EMPLOYEE 토큰으로 직원 생성 시도
    const resp = await page.request.post(`${API_URL}/employees`, {
      data: {
        name: '금지테스트',
        email: `forbidden-${Date.now()}@ablework.io`,
        joinedAt: '2024-01-01',
        employmentType: 'regular',
        accessLevel: 'EMPLOYEE',
        organizationIds: ['some-id'],
        primaryOrganizationId: 'some-id',
      },
      headers: authHeaders(accessToken),
    })

    // Assert — HTTP 403 또는 success: false + FORBIDDEN
    const body = await resp.json()
    const isForbidden =
      resp.status() === 403 ||
      (!body.success &&
        (body?.error?.code === 'FORBIDDEN' || body?.error?.message?.includes('권한')))
    expect(
      isForbidden,
      `EMPLOYEE가 직원 생성을 시도했을 때 403/FORBIDDEN이 아님: ${JSON.stringify(body)}`,
    ).toBe(true)
  })
})
