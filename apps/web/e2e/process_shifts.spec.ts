/**
 * AbleWork ERP — 근무일정 프로세스 통합 E2E (Chromium)
 *
 * 커버 영역:
 *   1. 근무유형 CRUD        — 생성 → 수정 → 삭제
 *   2. 템플릿 CRUD + SFT-1  — 09:00-18:00 저장/표시 시간 정규화 회귀
 *   3. 일정 생성            — 단건 생성 → API 반영
 *   4. 단건 삭제 가드 (A-2) — 미확정 삭제 성공 / 확정 삭제 400 가드
 *   5. 패턴 적용 52h 경고   — schedule-patterns apply → warnings 포함 확인
 *
 * 전략: 셋업·검증은 API, 핵심 액션만 UI 클릭.
 * 의존: apps/api + apps/web 기동 중 (포트 4001/4000).
 * 격리: 생성 데이터에 Date.now() 접미사 — 병렬 충돌 방지.
 * 원복: 테스트 종료 시 afterAll에서 생성 데이터 삭제.
 */
import { test, expect, type Page } from '@playwright/test'
import { ACCOUNTS, BASE_URL, API_URL, login, uiLogin } from './helpers'

// ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 1회 로그인해서 토큰을 반환하는 thin wrapper */
async function adminToken(page: Page): Promise<string> {
  const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
  return accessToken
}

/** UUID 형식 직원 + 조직 ID 쌍을 반환 (UUID org를 가진 첫 번째 직원) */
async function getUuidEmployee(
  page: Page,
  token: string,
): Promise<{ employeeId: string; organizationId: string }> {
  const resp = await page.request.get(`${API_URL}/employees?limit=20`, {
    headers: authHeader(token),
  })
  const body = await resp.json()
  const items = (body?.data?.items ?? []) as Array<{
    id: string
    organizations: Array<{ organizationId: string }>
  }>
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
  for (const emp of items) {
    for (const org of emp.organizations ?? []) {
      if (UUID_RE.test(emp.id) && UUID_RE.test(org.organizationId)) {
        return { employeeId: emp.id, organizationId: org.organizationId }
      }
    }
  }
  throw new Error('UUID 형식 직원+조직 쌍을 찾을 수 없습니다')
}

// ── describe 1: 근무유형 CRUD ──────────────────────────────────────────────────

test.describe('근무일정 프로세스 — 근무유형 CRUD', () => {
  let token: string
  let createdTypeId = ''
  const suffix = Date.now()
  const typeName = `E2E유형_${suffix}`
  const typeNameEdited = `E2E유형수정_${suffix}`

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    token = await adminToken(page)
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    if (!createdTypeId) return
    const page = await browser.newPage()
    const t = await adminToken(page)
    await page.request.delete(`${API_URL}/shift-types/${createdTypeId}`, {
      headers: authHeader(t),
    })
    await page.close()
  })

  test('근무유형 추가 버튼 클릭 → 다이얼로그 입력 → 저장 → API 반영', async ({ page }) => {
    // Arrange
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/shifts/types`, { waitUntil: 'domcontentloaded' })

    // Act — 유형 추가 다이얼로그 열기
    await page.getByRole('button', { name: '유형 추가' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByLabel('유형명').fill(typeName)
    // 분류 select는 기본값 '일반(REGULAR)'이므로 그대로 사용
    await dialog.getByRole('button', { name: '추가' }).click()

    // Assert — API에서 생성 확인
    await expect
      .poll(
        async () => {
          const resp = await page.request.get(`${API_URL}/shift-types`, {
            headers: authHeader(token),
          })
          const body = await resp.json()
          return (body?.data ?? []).some(
            (st: { name: string }) => st.name === typeName,
          )
        },
        { timeout: 8000 },
      )
      .toBe(true)

    // ID 저장 (수정·삭제에 사용)
    const typeResp = await page.request.get(`${API_URL}/shift-types`, {
      headers: authHeader(token),
    })
    const typeBody = await typeResp.json()
    const created = (typeBody?.data ?? []).find(
      (st: { id: string; name: string }) => st.name === typeName,
    )
    createdTypeId = created?.id ?? ''
    expect(createdTypeId).toBeTruthy()
  })

  test('근무유형 수정 아이콘 → 이름 변경 → 저장 → API 반영', async ({ page }) => {
    test.skip(!createdTypeId, '이전 단계(생성)에 의존')

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/shifts/types`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // 테이블에서 생성한 유형 행의 수정 버튼 클릭 (EditOutlinedIcon 두 번째 마지막 버튼)
    const row = page.locator('tr', { hasText: typeName })
    await expect(row).toBeVisible({ timeout: 8000 })
    // 관리 컬럼: 편집 버튼(nth(-2)), 삭제 버튼(last). 편집 클릭.
    await row.locator('button').nth(-2).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const nameInput = dialog.getByLabel('유형명')
    await nameInput.fill('')
    await nameInput.fill(typeNameEdited)
    await dialog.getByRole('button', { name: '수정' }).click()

    // GET /shift-types 목록에서 이름 변경 확인 (단건 엔드포인트 없음)
    await expect
      .poll(
        async () => {
          const resp = await page.request.get(`${API_URL}/shift-types`, {
            headers: authHeader(token),
          })
          const body = await resp.json()
          const found = (body?.data ?? []).find(
            (st: { id: string }) => st.id === createdTypeId,
          )
          return (found as { name?: string } | undefined)?.name
        },
        { timeout: 8000 },
      )
      .toBe(typeNameEdited)
  })

  test('근무유형 삭제 아이콘 → 확인 다이얼로그 → 삭제 → API에서 제거', async ({ page }) => {
    test.skip(!createdTypeId, '이전 단계(생성)에 의존')

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/shifts/types`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    const displayName = typeNameEdited || typeName
    const row = page.locator('tr', { hasText: displayName })
    await expect(row).toBeVisible({ timeout: 8000 })

    // 삭제 버튼 (마지막 IconButton)
    await row.locator('button[color="error"]').click().catch(async () => {
      await row.locator('button').last().click()
    })

    // 확인 다이얼로그 승인
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole('button', { name: '삭제' }).click()

    await expect
      .poll(
        async () => {
          const resp = await page.request.get(`${API_URL}/shift-types`, {
            headers: authHeader(token),
          })
          const body = await resp.json()
          return (body?.data ?? []).some(
            (st: { id: string }) => st.id === createdTypeId,
          )
        },
        { timeout: 8000 },
      )
      .toBe(false)

    createdTypeId = '' // afterAll cleanup 불필요
  })
})

// ── describe 2: 템플릿 CRUD + SFT-1 시간 정규화 회귀 ─────────────────────────

test.describe('근무일정 프로세스 — 템플릿 CRUD + 시간 정규화 (SFT-1)', () => {
  let token: string
  let shiftTypeId = '' // 템플릿 생성에 사용할 UUID 근무유형
  let templateId = ''
  const suffix = Date.now()
  const tmplName = `E2E템플릿_${suffix}`

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    token = await adminToken(page)
    // 테스트 전용 근무유형 생성 (UUID 보장)
    const stResp = await page.request.post(`${API_URL}/shift-types`, {
      data: {
        name: `E2E유형for템플릿_${suffix}`,
        category: 'REGULAR',
        color: '#1976d2',
        noClockInRequired: false,
        isDeemedWork: false,
      },
      headers: authHeader(token),
    })
    const stBody = await stResp.json()
    shiftTypeId = stBody?.data?.id ?? ''
    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const t = await adminToken(page)
    if (templateId) {
      await page.request.delete(`${API_URL}/shift-templates/${templateId}`, {
        headers: authHeader(t),
      })
    }
    if (shiftTypeId) {
      await page.request.delete(`${API_URL}/shift-types/${shiftTypeId}`, {
        headers: authHeader(t),
      })
    }
    await page.close()
  })

  test('템플릿 추가 → 09:00-18:00 입력 → 저장 → API 저장값 및 UI 표시 검증 (SFT-1 회귀)', async ({
    page,
  }) => {
    test.skip(!shiftTypeId, '근무유형 생성 실패')

    // Arrange
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/shifts/templates`, { waitUntil: 'domcontentloaded' })

    // Act — 다이얼로그 열어서 템플릿 생성
    await page.getByRole('button', { name: '템플릿 추가' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.getByLabel('이름').fill(tmplName)

    // 근무일정 유형 select
    await dialog.getByLabel('근무일정 유형').click()
    const menuItem = page.locator('[role="option"]', {
      hasText: new RegExp(`E2E유형for템플릿_${suffix}`),
    })
    await expect(menuItem).toBeVisible({ timeout: 5000 })
    await menuItem.click()

    await dialog.getByLabel('시작 시간').fill('09:00')
    await dialog.getByLabel('종료 시간').fill('18:00')
    await dialog.getByRole('button', { name: '추가' }).click()

    // Assert 1 — API에서 생성 확인 후 ID 저장
    await expect
      .poll(
        async () => {
          const resp = await page.request.get(`${API_URL}/shift-templates`, {
            headers: authHeader(token),
          })
          const body = await resp.json()
          const found = (body?.data ?? []).find(
            (t: { name: string }) => t.name === tmplName,
          )
          if (found) templateId = found.id
          return !!found
        },
        { timeout: 8000 },
      )
      .toBe(true)

    // Assert 2 — API 저장값 확인 (시간은 ISO로 저장됨 — BE 정상 동작)
    // BE는 HH:MM을 UTC 기준 epoch로 저장 (예: 09:00 KST = 00:00 UTC = 1970-01-01T00:00:00.000Z)
    // 이것 자체가 버그인지 여부는 설계 결정 사항이나, 현재 저장 형태를 문서화한다.
    const tmplResp = await page.request.get(`${API_URL}/shift-templates`, {
      headers: authHeader(token),
    })
    const tmplBody = await tmplResp.json()
    const savedTmpl = (tmplBody?.data ?? []).find((t: { id: string }) => t.id === templateId)
    expect(savedTmpl).toBeDefined()
    // startTime / endTime은 ISO 형태로 저장됨 (1970-01-01T...)
    expect(savedTmpl?.startTime).toMatch(/^1970-01-01T/)

    // Assert 3 (SFT-1 회귀 가드) — UI 테이블 표시가 toHHMM() 정규화되어야 함
    // BE는 09:00(KST)를 1970-01-01T00:00:00.000Z(epoch)로 저장하므로, templates/page.tsx가
    // toHHMM()로 변환해 "09:00 — 18:00"로 표시해야 한다(로스터 shifts/page.tsx와 동일 패턴).
    // ISO epoch('1970') 노출은 금지 — 이 가드가 SFT-1 회귀를 막는다.
    await page.reload({ waitUntil: 'networkidle' })
    const row = page.locator('tr', { hasText: tmplName })
    await expect(row).toBeVisible({ timeout: 8000 })
    const timeCell = row.locator('td').nth(2) // "근무 시간" 컬럼
    await expect(timeCell).toContainText('09:00')
    await expect(timeCell).toContainText('18:00')
    await expect(timeCell).not.toContainText('1970')
  })

  test('템플릿 삭제 → API에서 제거', async ({ page }) => {
    test.skip(!templateId, '이전 단계(생성)에 의존')

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/shifts/templates`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    const row = page.locator('tr', { hasText: tmplName })
    await expect(row).toBeVisible({ timeout: 8000 })
    await row.locator('button[color="error"]').click().catch(async () => {
      await row.locator('button').last().click()
    })

    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole('button', { name: '삭제' }).click()

    await expect
      .poll(
        async () => {
          const resp = await page.request.get(`${API_URL}/shift-templates`, {
            headers: authHeader(token),
          })
          const body = await resp.json()
          return (body?.data ?? []).some((t: { id: string }) => t.id === templateId)
        },
        { timeout: 8000 },
      )
      .toBe(false)

    templateId = ''
  })
})

// ── describe 3: 일정 생성 ─────────────────────────────────────────────────────

test.describe('근무일정 프로세스 — 일정 단건 생성', () => {
  let token: string
  let shiftTypeId = ''
  let employeeId = ''
  let organizationId = ''
  let createdShiftId = ''
  const suffix = Date.now()
  // 미래 날짜 (2035년) — 시드 데이터와 충돌 없음
  const shiftDate = '2035-03-10'

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    token = await adminToken(page)

    // UUID 근무유형 생성
    const stResp = await page.request.post(`${API_URL}/shift-types`, {
      data: {
        name: `E2E일정생성유형_${suffix}`,
        category: 'REGULAR',
        color: '#4caf50',
        noClockInRequired: false,
        isDeemedWork: false,
      },
      headers: authHeader(token),
    })
    shiftTypeId = (await stResp.json())?.data?.id ?? ''

    // UUID 형식 직원+조직 확보
    const empData = await getUuidEmployee(page, token)
    employeeId = empData.employeeId
    organizationId = empData.organizationId

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const t = await adminToken(page)
    if (createdShiftId) {
      await page.request.delete(`${API_URL}/shifts/${createdShiftId}`, {
        headers: authHeader(t),
      })
    }
    if (shiftTypeId) {
      await page.request.delete(`${API_URL}/shift-types/${shiftTypeId}`, {
        headers: authHeader(t),
      })
    }
    await page.close()
  })

  test('API로 근무일정 단건 생성 → GET /shifts로 반영 확인', async ({ page }) => {
    test.skip(!shiftTypeId || !employeeId, '셋업 실패')

    // Act — API로 직접 생성 (UI 모달 대신: 날짜 피커 등 복잡한 인터랙션 생략)
    const createResp = await page.request.post(`${API_URL}/shifts`, {
      data: {
        employeeId,
        organizationId,
        shiftTypeId,
        startAt: `${shiftDate}T00:00:00.000Z`,
        endAt: `${shiftDate}T09:00:00.000Z`,
      },
      headers: authHeader(token),
    })
    expect(createResp.ok()).toBeTruthy()
    const createBody = await createResp.json()
    createdShiftId = createBody?.data?.id ?? ''
    expect(createdShiftId).toBeTruthy()

    // Assert — GET /shifts로 반영 확인
    const listResp = await page.request.get(
      `${API_URL}/shifts?startAt=${shiftDate}&endAt=${shiftDate}`,
      { headers: authHeader(token) },
    )
    const listBody = await listResp.json()
    const found = (listBody?.data ?? []).some(
      (s: { id: string }) => s.id === createdShiftId,
    )
    expect(found).toBe(true)

    // UI 확인 — 로스터 화면에서 생성된 일정이 보이는지
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    // shiftDate=2035-03-10이므로 해당 주(월)로 이동 필요 없이 API만 검증으로 충분
  })
})

// ── describe 4: 단건 삭제 가드 (A-2) ─────────────────────────────────────────

test.describe('근무일정 프로세스 — 단건 삭제 가드 (A-2)', () => {
  let token: string
  let shiftTypeId = ''
  let employeeId = ''
  let organizationId = ''
  let draftShiftId = ''
  let confirmedShiftId = ''
  const suffix = Date.now()

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    token = await adminToken(page)

    // UUID 근무유형
    const stResp = await page.request.post(`${API_URL}/shift-types`, {
      data: {
        name: `E2E삭제가드유형_${suffix}`,
        category: 'REGULAR',
        color: '#ff5722',
        noClockInRequired: false,
        isDeemedWork: false,
      },
      headers: authHeader(token),
    })
    shiftTypeId = (await stResp.json())?.data?.id ?? ''

    const empData = await getUuidEmployee(page, token)
    employeeId = empData.employeeId
    organizationId = empData.organizationId

    // draft 일정 생성
    const d1 = await page.request.post(`${API_URL}/shifts`, {
      data: {
        employeeId,
        organizationId,
        shiftTypeId,
        startAt: '2036-04-07T00:00:00.000Z',
        endAt: '2036-04-07T09:00:00.000Z',
      },
      headers: authHeader(token),
    })
    draftShiftId = (await d1.json())?.data?.id ?? ''

    // confirmed 일정 생성 후 확정
    const d2 = await page.request.post(`${API_URL}/shifts`, {
      data: {
        employeeId,
        organizationId,
        shiftTypeId,
        startAt: '2036-04-08T00:00:00.000Z',
        endAt: '2036-04-08T09:00:00.000Z',
      },
      headers: authHeader(token),
    })
    confirmedShiftId = (await d2.json())?.data?.id ?? ''

    if (confirmedShiftId) {
      await page.request.post(`${API_URL}/shifts/${confirmedShiftId}/confirm`, {
        data: {},
        headers: authHeader(token),
      })
    }

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const t = await adminToken(page)

    // draft는 이미 삭제됐을 수 있음 — 무시
    if (draftShiftId) {
      await page.request.delete(`${API_URL}/shifts/${draftShiftId}`, {
        headers: authHeader(t),
      })
    }
    // confirmed는 unconfirm 후 삭제
    if (confirmedShiftId) {
      await page.request.post(`${API_URL}/shifts/${confirmedShiftId}/unconfirm`, {
        data: {},
        headers: authHeader(t),
      })
      await page.request.delete(`${API_URL}/shifts/${confirmedShiftId}`, {
        headers: authHeader(t),
      })
    }
    if (shiftTypeId) {
      await page.request.delete(`${API_URL}/shift-types/${shiftTypeId}`, {
        headers: authHeader(t),
      })
    }
    await page.close()
  })

  test('미확정 일정 DELETE → 200 성공 (draft 삭제 허용)', async ({ page }) => {
    test.skip(!draftShiftId, '셋업 실패')

    const delResp = await page.request.delete(`${API_URL}/shifts/${draftShiftId}`, {
      headers: authHeader(token),
    })
    expect(delResp.ok()).toBeTruthy()

    // GET으로 사라졌는지 확인
    const getResp = await page.request.get(`${API_URL}/shifts?startAt=2036-04-07&endAt=2036-04-07`, {
      headers: authHeader(token),
    })
    const body = await getResp.json()
    const stillExists = (body?.data ?? []).some((s: { id: string }) => s.id === draftShiftId)
    expect(stillExists).toBe(false)

    draftShiftId = '' // afterAll cleanup 불필요
  })

  test('확정된 일정 DELETE → 400 SHIFT_ALREADY_CONFIRMED 가드', async ({ page }) => {
    test.skip(!confirmedShiftId, '셋업 실패')

    const delResp = await page.request.delete(`${API_URL}/shifts/${confirmedShiftId}`, {
      headers: authHeader(token),
    })
    // 400 또는 422 응답
    expect(delResp.ok()).toBe(false)
    const body = await delResp.json()
    expect(body?.success).toBe(false)
    expect(body?.error?.code).toBe('SHIFT_ALREADY_CONFIRMED')
  })
})

// ── describe 5: 패턴 적용 주 52h 경고 (A-8) ──────────────────────────────────

test.describe('근무일정 프로세스 — 패턴 적용 주 52h 경고 (A-8)', () => {
  let token: string
  let shiftTypeId = ''
  let templateId = ''
  let patternId = ''
  let employeeId = ''
  let organizationId = ''
  const suffix = Date.now()
  // 패턴 적용 기간 — 2037년 (시드 충돌 없음)
  const applyStart = '2037-01-04' // 월요일
  const applyEnd = '2037-01-10'   // 일요일

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    token = await adminToken(page)

    // 근무유형 (10h 근무 → 7일 = 70h >> 52h)
    const stResp = await page.request.post(`${API_URL}/shift-types`, {
      data: {
        name: `E2E52h유형_${suffix}`,
        category: 'REGULAR',
        color: '#9c27b0',
        noClockInRequired: false,
        isDeemedWork: false,
      },
      headers: authHeader(token),
    })
    shiftTypeId = (await stResp.json())?.data?.id ?? ''

    // 10h 템플릿 (09:00 ~ 19:00)
    const tmplResp = await page.request.post(`${API_URL}/shift-templates`, {
      data: {
        name: `E2E52h템플릿_${suffix}`,
        shiftTypeId,
        startTime: '09:00',
        endTime: '19:00',
      },
      headers: authHeader(token),
    })
    templateId = (await tmplResp.json())?.data?.id ?? ''

    // 7/7 패턴 생성
    if (templateId) {
      const patternDef: Record<string, string> = {}
      for (let i = 0; i < 7; i++) patternDef[String(i)] = templateId

      const pResp = await page.request.post(`${API_URL}/schedule-patterns`, {
        data: {
          name: `E2E52h패턴_${suffix}`,
          repeatCycleDays: 7,
          holidayHandling: 'no_skip',
          isActive: true,
          patternDefinition: patternDef,
        },
        headers: authHeader(token),
      })
      patternId = (await pResp.json())?.data?.id ?? ''
    }

    // UUID 형식 직원 확보
    const empData = await getUuidEmployee(page, token)
    employeeId = empData.employeeId
    organizationId = empData.organizationId

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    const t = await adminToken(page)

    // 생성된 근무일정 삭제
    const listResp = await page.request.get(
      `${API_URL}/shifts?startAt=${applyStart}&endAt=${applyEnd}`,
      { headers: authHeader(t) },
    )
    const listBody = await listResp.json()
    for (const s of listBody?.data ?? []) {
      await page.request.delete(`${API_URL}/shifts/${s.id}`, {
        headers: authHeader(t),
      })
    }

    if (patternId) {
      await page.request.delete(`${API_URL}/schedule-patterns/${patternId}`, {
        headers: authHeader(t),
      })
    }
    if (templateId) {
      await page.request.delete(`${API_URL}/shift-templates/${templateId}`, {
        headers: authHeader(t),
      })
    }
    if (shiftTypeId) {
      await page.request.delete(`${API_URL}/shift-types/${shiftTypeId}`, {
        headers: authHeader(t),
      })
    }
    await page.close()
  })

  test('schedule-patterns apply → 7일 × 10h = 70h — warnings 배열 포함 확인', async ({
    page,
  }) => {
    test.skip(!patternId || !employeeId, '셋업 실패')

    // Act
    const applyResp = await page.request.post(
      `${API_URL}/schedule-patterns/${patternId}/apply`,
      {
        data: {
          employeeIds: [employeeId],
          startDate: applyStart,
          endDate: applyEnd,
        },
        headers: authHeader(token),
      },
    )

    // Assert — 성공(200) + warnings 배열 있음(저장은 허용)
    expect(applyResp.ok()).toBeTruthy()
    const body = await applyResp.json()
    expect(body?.success).toBe(true)
    expect(body?.data?.created).toBeGreaterThan(0)
    expect(Array.isArray(body?.data?.warnings)).toBe(true)
    expect(body?.data?.warnings?.length).toBeGreaterThan(0)

    // 경고 메시지에 52시간 초과 문구 포함
    const warningMsg: string = body.data.warnings[0] ?? ''
    expect(warningMsg).toMatch(/52/)
  })
})
