/**
 * AbleWork ERP — 휴가 프로세스 통합 E2E (Chromium)
 *
 * 커버 범위:
 *   C-1. 그룹/유형 CRUD — 고유명 생성→수정→삭제 (UI+API)
 *   C-2. 자동발생 규칙 생성·수정 (B-4, UI+API)
 *   C-3. 수동발생 발생연도·만료일 지정 (B-2, UI+API)
 *   C-4. 잔액 조회 권한 — 본인 200 / 타 직원 403 (API)
 *   C-5. 휴가 신청 정상(1일) vs 잔액초과(>15일) (API)
 *
 * 전략:
 *   - 셋업·검증은 page.request (API), 핵심 액션만 UI 클릭
 *   - 모든 생성 데이터에 Date.now() 접미사 → 병렬 충돌 방지
 *   - 시드 직원(seed-emp-001, 연차 15일) 잔액을 전량 소모하지 않음
 *     → 1일 신청만, 초과 테스트는 admin 자신 잔액(15일) 기준 30일 신청
 *   - 그룹/유형 생성 후 cleanUp은 finally로 항상 실행
 *
 * 전제: web(:4000) · api(:4001) · DB 가동, 시드 계정 유효.
 */
import { test, expect, type Page } from '@playwright/test'
import { ACCOUNTS, BASE_URL, API_URL, login, uiLogin, jwtEmployeeId } from './helpers'

// ── 공통 헬퍼 ──────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function apiGet(page: Page, token: string, path: string) {
  const resp = await page.request.get(`${API_URL}${path}`, { headers: authHeaders(token) })
  return resp.json()
}

async function apiPost(page: Page, token: string, path: string, data: unknown) {
  const resp = await page.request.post(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  return { resp, body: await resp.json() }
}

async function apiPatch(page: Page, token: string, path: string, data: unknown) {
  const resp = await page.request.patch(`${API_URL}${path}`, {
    data,
    headers: authHeaders(token),
  })
  return { resp, body: await resp.json() }
}

async function apiDelete(page: Page, token: string, path: string) {
  const resp = await page.request.delete(`${API_URL}${path}`, { headers: authHeaders(token) })
  return resp
}

// ── 테스트 스위트 ──────────────────────────────────────────────────────────────

test.describe('휴가 프로세스 통합 테스트', () => {
  // ── C-1: 그룹/유형 CRUD ──────────────────────────────────────────────────────

  test.describe('C-1: 휴가 그룹/유형 CRUD', () => {
    test('휴가 그룹을 생성·수정·삭제하면 API에 반영된다', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const suffix = Date.now()
      const groupName = `E2E그룹${suffix}`
      const groupNameEdited = `E2E그룹수정${suffix}`
      let groupId: string | null = null

      try {
        // Act — 생성 (UI)
        await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
        await page.goto(`${BASE_URL}/admin/leave/types`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle')

        // "그룹 추가" 버튼 클릭
        await page.getByRole('button', { name: '그룹 추가' }).first().click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

        // 그룹명 입력
        await page.getByLabel('그룹명').fill(groupName)
        await page.getByRole('button', { name: '추가', exact: true }).click()

        // Assert — 생성 확인 (API)
        await expect.poll(
          async () => {
            const body = await apiGet(page, accessToken, '/leaves/groups')
            const groups = body?.data ?? body
            return groups.some((g: { name: string }) => g.name === groupName)
          },
          { timeout: 10000 },
        ).toBe(true)

        // 생성된 그룹 ID 확보
        const body = await apiGet(page, accessToken, '/leaves/groups')
        const groups = body?.data ?? body
        const created = groups.find((g: { name: string }) => g.name === groupName)
        expect(created).toBeDefined()
        groupId = created.id

        // Act — 수정 (API, UI 편집 아이콘이 특정 행에 있어 API로 직접 패치)
        const patchResult = await apiPatch(page, accessToken, `/leaves/groups/${groupId}`, {
          name: groupNameEdited,
          overageLimitDays: 5,
        })
        expect(patchResult.body?.success).toBe(true)

        // Assert — 수정 반영
        const afterPatch = await apiGet(page, accessToken, '/leaves/groups')
        const patchedGroups = afterPatch?.data ?? afterPatch
        const updated = patchedGroups.find((g: { id: string }) => g.id === groupId)
        expect(updated?.name).toBe(groupNameEdited)
        expect(Number(updated?.overageLimitDays)).toBe(5)
      } finally {
        // Act — 삭제 (cleanup)
        if (groupId) {
          await apiDelete(page, accessToken, `/leaves/groups/${groupId}`)
          // Assert — 삭제 확인: 소프트 삭제이므로 isActive=false 확인
          const afterDel = await apiGet(page, accessToken, '/leaves/groups')
          const remaining = afterDel?.data ?? afterDel
          const deletedGroup = remaining.find((g: { id: string }) => g.id === groupId)
          // 소프트 삭제: 목록에는 남아 있지만 isActive=false
          if (deletedGroup) {
            expect(deletedGroup.isActive).toBe(false)
          }
        }
      }
    })

    test('휴가 유형을 생성·수정·삭제하면 API에 반영된다', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const suffix = Date.now()
      const groupName = `E2E유형테스트그룹${suffix}`
      const typeName = `E2E유형${suffix}`
      const typeNameEdited = `E2E유형수정${suffix}`
      let groupId: string | null = null
      let typeId: string | null = null

      try {
        // Arrange — 그룹 먼저 API로 생성 (UUID 필요)
        const groupResult = await apiPost(page, accessToken, '/leaves/groups', {
          name: groupName,
          overageLimitDays: 0,
        })
        expect(groupResult.body?.success).toBe(true)
        groupId = groupResult.body?.data?.id

        // Act — 유형 생성 (UI)
        await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
        await page.goto(`${BASE_URL}/admin/leave/types`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle')

        // "휴가 유형" 탭 클릭 (MUI Tab)
        await page.getByRole('tab', { name: '휴가 유형' }).click()
        await page.getByRole('button', { name: '유형 추가' }).first().click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

        // 이름 입력 (MUI required 필드는 label에 * 포함 — first()로 정확히 지정)
        await page.getByLabel('이름').first().fill(typeName)

        // 그룹 셀렉트 (MUI Select: role=combobox, aria-labelledby 연결 없음 — 첫 번째 combobox)
        await page.getByRole('combobox').first().click()
        await page.getByRole('option', { name: groupName }).click()

        // 저장
        await page.getByRole('button', { name: '추가', exact: true }).click()

        // Assert — 생성 확인 (API)
        await expect.poll(
          async () => {
            const body = await apiGet(page, accessToken, '/leaves/types')
            const types = body?.data ?? body
            return types.some((t: { name: string }) => t.name === typeName)
          },
          { timeout: 10000 },
        ).toBe(true)

        // 생성된 유형 ID 확보
        const typesBody = await apiGet(page, accessToken, '/leaves/types')
        const types = typesBody?.data ?? typesBody
        const createdType = types.find((t: { name: string }) => t.name === typeName)
        expect(createdType).toBeDefined()
        typeId = createdType.id

        // Act — 수정 (API)
        const patchResult = await apiPatch(page, accessToken, `/leaves/types/${typeId}`, {
          name: typeNameEdited,
          deductionDays: 0.5,
        })
        expect(patchResult.body?.success).toBe(true)

        // Assert — 수정 반영
        const afterPatch = await apiGet(page, accessToken, '/leaves/types')
        const patchedTypes = afterPatch?.data ?? afterPatch
        const updatedType = patchedTypes.find((t: { id: string }) => t.id === typeId)
        expect(updatedType?.name).toBe(typeNameEdited)
      } finally {
        // Cleanup: 유형 → 그룹 순서로 삭제
        if (typeId) {
          await apiDelete(page, accessToken, `/leaves/types/${typeId}`)
        }
        if (groupId) {
          await apiDelete(page, accessToken, `/leaves/groups/${groupId}`)
        }
      }
    })
  })

  // ── C-2: 자동발생 규칙 생성·수정 (B-4) ──────────────────────────────────────

  test.describe('C-2: 자동발생 규칙 생성·수정 (B-4)', () => {
    test('발생 규칙을 UI로 생성하고 수정하면 API에 반영된다', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const suffix = Date.now()
      const groupName = `E2E발생규칙그룹${suffix}`
      const ruleName = `E2E발생규칙${suffix}`
      const ruleNameEdited = `E2E발생규칙수정${suffix}`
      let groupId: string | null = null
      let ruleId: string | null = null

      try {
        // Arrange — 그룹 생성 (UUID 필요)
        const groupResult = await apiPost(page, accessToken, '/leaves/groups', {
          name: groupName,
          overageLimitDays: 0,
        })
        expect(groupResult.body?.success).toBe(true)
        groupId = groupResult.body?.data?.id

        // Act — 발생 규칙 생성 (UI)
        await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
        await page.goto(`${BASE_URL}/admin/leave/accrual-rules`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle')

        await page.getByRole('button', { name: '규칙 추가' }).first().click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

        // 규칙명 입력
        await page.getByLabel('규칙명').fill(ruleName)

        // 휴가 그룹 선택 (MUI Select: role=combobox — dialog 내 유일한 combobox)
        await page.getByRole('combobox').first().click()
        await page.getByRole('option', { name: groupName }).click()

        // 월 기준 발생 행: 근속월수=12, 발생일수=1.5
        const monthlyBoxes = page.locator('input[type="number"]')
        await monthlyBoxes.nth(0).fill('12') // 근속월수
        await monthlyBoxes.nth(1).fill('1.5') // 발생일수

        // 저장
        await page.getByRole('button', { name: '추가', exact: true }).click()

        // Assert — 생성 확인 (API)
        await expect.poll(
          async () => {
            const body = await apiGet(page, accessToken, '/leaves/accrual-rules')
            const rules = body?.data ?? body
            return rules.some((r: { name: string }) => r.name === ruleName)
          },
          { timeout: 10000 },
        ).toBe(true)

        const rulesBody = await apiGet(page, accessToken, '/leaves/accrual-rules')
        const rules = rulesBody?.data ?? rulesBody
        const created = rules.find((r: { name: string }) => r.name === ruleName)
        expect(created).toBeDefined()
        ruleId = created.id

        // Act — 수정 버튼 클릭 (UI: aria-label="수정" IconButton)
        await page.reload({ waitUntil: 'networkidle' })
        const ruleRow = page.locator('tr').filter({ hasText: ruleName })
        await ruleRow.locator('[aria-label="수정"]').click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 8000 })

        // 규칙명 변경
        const ruleNameInput = page.getByLabel('규칙명')
        await ruleNameInput.clear()
        await ruleNameInput.fill(ruleNameEdited)

        // 수정 버튼 클릭
        await page.getByRole('button', { name: '수정', exact: true }).click()

        // Assert — 수정 반영 (API)
        await expect.poll(
          async () => {
            const body = await apiGet(page, accessToken, '/leaves/accrual-rules')
            const updatedRules = body?.data ?? body
            return updatedRules.some((r: { name: string }) => r.name === ruleNameEdited)
          },
          { timeout: 10000 },
        ).toBe(true)

        const afterEdit = await apiGet(page, accessToken, '/leaves/accrual-rules')
        const editedRules = afterEdit?.data ?? afterEdit
        const editedRule = editedRules.find((r: { id: string }) => r.id === ruleId)
        expect(editedRule?.name).toBe(ruleNameEdited)
      } finally {
        if (ruleId) {
          await apiDelete(page, accessToken, `/leaves/accrual-rules/${ruleId}`)
        }
        if (groupId) {
          await apiDelete(page, accessToken, `/leaves/groups/${groupId}`)
        }
      }
    })
  })

  // ── C-3: 수동발생 발생연도·만료일 지정 (B-2) ──────────────────────────────

  test.describe('C-3: 수동발생 발생연도·만료일 지정 (B-2)', () => {
    test('특정 직원에 수동 발생(year·expiresAt 지정) 후 잔액에 만료일이 반영된다', async ({
      page,
    }) => {
      // Arrange — 별도 UUID 직원 생성 후 수동 발생 → 잔액 확인
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
      const suffix = Date.now()
      const groupName = `E2E수동발생그룹${suffix}`
      const typeName = `E2E수동발생유형${suffix}`
      let groupId: string | null = null
      let typeId: string | null = null
      let balanceId: string | null = null

      try {
        // Arrange — 그룹 + 유형 생성 (UUID 필요)
        const groupResult = await apiPost(page, accessToken, '/leaves/groups', {
          name: groupName,
          overageLimitDays: 0,
        })
        expect(groupResult.body?.success).toBe(true)
        groupId = groupResult.body?.data?.id

        const typeResult = await apiPost(page, accessToken, '/leaves/types', {
          name: typeName,
          groupId,
          timeOption: 'full_day',
          deductionDays: 1,
          isActive: true,
        })
        expect(typeResult.body?.success).toBe(true)
        typeId = typeResult.body?.data?.id

        // UUID 직원 조회 (테스트직원 또는 첫 UUID 직원 사용)
        const empsBody = await apiGet(page, accessToken, '/employees?limit=20')
        const allEmps = empsBody?.data?.items ?? []
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        const targetEmp = allEmps.find((e: { id: string }) => uuidPattern.test(e.id))
        expect(targetEmp).toBeDefined()
        const empId: string = targetEmp.id

        // Act — 수동 발생 (UI: /admin/leave/status → 휴가 부여 모달)
        await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
        await page.goto(`${BASE_URL}/admin/leave/status`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle')

        // "휴가 부여" 버튼 클릭 (ab-style button)
        await page.getByRole('button', { name: '휴가 부여' }).click()
        // 모달 오픈 대기 (.modal CSS class)
        await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

        // 직원 선택 (select → option with empId value)
        await page.locator('.modal select').first().selectOption(empId)

        // 휴가 유형 선택
        await page.locator('.modal select').nth(1).selectOption(typeId!)

        // 부여 일수
        await page.locator('.modal input[type="number"]').first().fill('3')

        // 발생 연도 — 두 번째 number input
        const yearInput = page.locator('.modal input[type="number"]').nth(1)
        await yearInput.clear()
        await yearInput.fill('2026')

        // 만료일 — date input
        await page.locator('.modal input[type="date"]').fill('2026-12-31')

        // "부여" 버튼 클릭
        await page.locator('.modal').getByRole('button', { name: '부여' }).click()

        // Assert — API로 잔액 만료일 확인
        await expect.poll(
          async () => {
            const balBody = await apiGet(page, accessToken, `/leaves/balance/${empId}`)
            const balances = balBody?.data ?? balBody
            return balances.some(
              (b: { leaveTypeId: string; expiresAt: string | null }) =>
                b.leaveTypeId === typeId && b.expiresAt !== null,
            )
          },
          { timeout: 12000 },
        ).toBe(true)

        const balBody = await apiGet(page, accessToken, `/leaves/balance/${empId}`)
        const balances = balBody?.data ?? balBody
        const targetBalance = balances.find(
          (b: { leaveTypeId: string }) => b.leaveTypeId === typeId,
        )
        expect(targetBalance).toBeDefined()
        balanceId = targetBalance.id
        // 만료일이 2026-12-31을 포함하는지 확인
        expect(targetBalance.expiresAt).toContain('2026-12-31')
        // 부여 일수 3일 확인
        expect(Number(targetBalance.accruedDays)).toBe(3)
        // 발생 연도 확인
        expect(targetBalance.year).toBe(2026)
      } finally {
        // Cleanup: 유형 → 그룹 순서 삭제 (잔액은 유형 삭제와 함께 제거됨)
        if (typeId) {
          await apiDelete(page, accessToken, `/leaves/types/${typeId}`)
        }
        if (groupId) {
          await apiDelete(page, accessToken, `/leaves/groups/${groupId}`)
        }
      }
    })
  })

  // ── C-4: 잔액 조회 권한 ────────────────────────────────────────────────────

  test.describe('C-4: 잔액 조회 권한', () => {
    test('employee 토큰으로 본인 잔액 조회 → 200', async ({ page }) => {
      // Arrange
      const { accessToken } = await login(
        page,
        ACCOUNTS.employee.email,
        ACCOUNTS.employee.password,
      )
      const empId = jwtEmployeeId(accessToken)

      // Act
      const resp = await page.request.get(`${API_URL}/leaves/balance/${empId}`, {
        headers: authHeaders(accessToken),
      })

      // Assert
      expect(resp.status()).toBe(200)
      const body = await resp.json()
      expect(body?.success).toBe(true)
    })

    test('employee 토큰으로 타 직원 잔액 조회 → 403 LEAVE_BALANCE_FORBIDDEN', async ({
      page,
    }) => {
      // Arrange — employee(홍길동)가 sales(박영업) 잔액 조회 시도
      const { accessToken: empToken } = await login(
        page,
        ACCOUNTS.employee.email,
        ACCOUNTS.employee.password,
      )
      // sales 계정의 employeeId
      const { accessToken: salesToken } = await login(
        page,
        ACCOUNTS.sales.email,
        ACCOUNTS.sales.password,
      )
      const salesEmpId = jwtEmployeeId(salesToken)

      // Act
      const resp = await page.request.get(`${API_URL}/leaves/balance/${salesEmpId}`, {
        headers: authHeaders(empToken),
      })

      // Assert
      expect(resp.status()).toBe(403)
      const body = await resp.json()
      expect(body?.success).toBe(false)
      expect(body?.error?.code).toBe('LEAVE_BALANCE_FORBIDDEN')
    })
  })

  // ── C-5: 휴가 신청 정상 vs 잔액초과 ─────────────────────────────────────────

  test.describe('C-5: 휴가 신청 정상 vs 잔액초과', () => {
    test('1일 휴가 신청 → 문서 자동 생성(PENDING) 확인', async ({ page }) => {
      // Arrange — admin 자신의 계정으로 1일 신청 (잔액 15일 중 1일만)
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)

      // Act
      const { body } = await apiPost(page, accessToken, '/requests', {
        type: 'LEAVE_CREATE',
        payload: {
          leaveTypeId: 'seed-leave-type-annual',
          startDate: '2026-09-15',
          endDate: '2026-09-15',
          reason: `E2E 1일 신청 ${Date.now()}`,
        },
      })

      // Assert — 요청 생성 성공
      expect(body?.success).toBe(true)
      const requestData = body?.data
      expect(requestData?.type).toBe('LEAVE_CREATE')
      expect(requestData?.status).toBe('PENDING')

      // 문서 자동 생성 확인
      const docId: string = requestData?.documentId
      expect(docId).toBeTruthy()

      // 문서 상태 PENDING 확인
      const docBody = await apiGet(page, accessToken, `/documents/${docId}`)
      const doc = docBody?.data ?? docBody
      expect(doc?.status).toBe('PENDING')
    })

    test('15일 초과(30일) 신청 → LEAVE_BALANCE_INSUFFICIENT 거부', async ({ page }) => {
      // Arrange — admin 잔액 15일 기준 30일 신청 → 거부
      const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)

      // Act
      const { resp, body } = await apiPost(page, accessToken, '/requests', {
        type: 'LEAVE_CREATE',
        payload: {
          leaveTypeId: 'seed-leave-type-annual',
          startDate: '2026-09-01',
          endDate: '2026-09-30',
          reason: `E2E 초과 신청 ${Date.now()}`,
        },
      })

      // Assert — 잔액 부족 에러
      expect(resp.status()).toBe(400)
      expect(body?.success).toBe(false)
      expect(body?.error?.code).toBe('LEAVE_BALANCE_INSUFFICIENT')
    })
  })
})
