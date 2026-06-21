/**
 * AbleWork ERP — 요청→전자결재 자동연동 통합 E2E
 *
 * 전략:
 * - 요청 생성은 UI(me/requests 다이얼로그) 우선, 불안정한 경우 API 직접 호출.
 * - 검증은 항상 API: document 자동생성·status=PENDING·request.documentId 연결.
 * - 직원(홍길동, seed-emp-001)으로만 요청 생성 — 다른 spec과 병렬 충돌 방지.
 * - 고유성: 시작일·제목에 타임스탬프 포함.
 * - 각 test는 독립적(shared state 없음). AAA 패턴.
 */
import { test, expect } from '@playwright/test'
import { ACCOUNTS, API_URL, BASE_URL, login, uiLogin, jwtEmployeeId } from './helpers'

// ── 공통 헬퍼 ─────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function empLogin(page: Parameters<typeof login>[0]) {
  const tokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
  return tokens
}

async function getDocument(page: Parameters<typeof login>[0], token: string, docId: string) {
  const resp = await page.request.get(`${API_URL}/documents/${docId}`, {
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return body?.data ?? body
}

async function getRequest(page: Parameters<typeof login>[0], token: string, requestId: string) {
  const resp = await page.request.get(`${API_URL}/requests/${requestId}`, {
    headers: authHeaders(token),
  })
  const body = await resp.json()
  return body?.data ?? body
}

async function postRequest(
  page: Parameters<typeof login>[0],
  token: string,
  type: string,
  payload: Record<string, unknown>,
) {
  const resp = await page.request.post(`${API_URL}/requests`, {
    data: { type, payload },
    headers: authHeaders(token),
  })
  return { resp, body: await resp.json() }
}

// ── 케이스 1: LEAVE_CREATE → UI + API 검증 ────────────────────────────────────

test.describe('요청→전자결재 자동연동', () => {
  test('케이스1: LEAVE_CREATE — 휴가 신청 → document 자동생성(PENDING), request.documentId 연결', async ({ page }) => {
    // Arrange
    const { accessToken } = await empLogin(page)
    const ts = Date.now()

    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    // Act — UI에서 요청 생성
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    // "새 요청" 버튼 클릭 → 유형 선택 메뉴
    await page.getByRole('button', { name: '새 요청' }).click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    // 휴가 신청 선택
    await page.getByRole('button', { name: '휴가 신청' }).click()

    // 다이얼로그 오픈 확인
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 8000 })

    // 휴가 유형 선택 (연차)
    const leaveTypeSelect = dialog.getByLabel('휴가 유형')
    await leaveTypeSelect.click()
    const annualOption = page.getByRole('option').filter({ hasText: '연차' }).first()
    await expect(annualOption).toBeVisible({ timeout: 8000 })
    await annualOption.click()

    // 날짜 입력 (미래 날짜로 고유하게)
    const futureDate = new Date(Date.now() + ts % 30 * 86400000 + 7 * 86400000)
    const dateStr = futureDate.toISOString().slice(0, 10)
    await dialog.getByLabel('시작일').fill(dateStr)
    await dialog.getByLabel('종료일').fill(dateStr)

    // 신청 제출
    await dialog.getByRole('button', { name: '신청' }).click()

    // 다이얼로그 닫히고 토스트 표시 대기
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Assert — API로 최신 요청 조회 후 documentId 확인
    await expect.poll(async () => {
      const listResp = await page.request.get(`${API_URL}/requests?type=LEAVE_CREATE&limit=5`, {
        headers: authHeaders(accessToken),
      })
      const listBody = await listResp.json()
      const items: Array<{ id: string; type: string; documentId: string | null; status: string }> =
        listBody?.data?.items ?? listBody?.data ?? []
      const latest = items.find((r) => r.type === 'LEAVE_CREATE' && r.documentId)
      return latest?.documentId ?? null
    }, { timeout: 10000 }).not.toBeNull()

    // 최신 LEAVE_CREATE 요청의 documentId로 문서 상태 검증
    const listResp = await page.request.get(`${API_URL}/requests?type=LEAVE_CREATE&limit=5`, {
      headers: authHeaders(accessToken),
    })
    const listBody = await listResp.json()
    const items: Array<{ id: string; type: string; documentId: string | null; status: string }> =
      listBody?.data?.items ?? listBody?.data ?? []
    const createdReq = items.find((r) => r.type === 'LEAVE_CREATE' && r.documentId)

    expect(createdReq).toBeDefined()
    expect(createdReq!.documentId).toBeTruthy()
    expect(createdReq!.status).toBe('PENDING')

    const doc = await getDocument(page, accessToken, createdReq!.documentId!)
    expect(doc.status).toBe('PENDING')
    expect(doc.formId).toContain('leave')
    // approvalLine + step 자동생성 확인
    const lines: Array<{ steps: Array<{ status: string }> }> = doc.approvalLines ?? []
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].status).toBe('PENDING')
  })

  // ── 케이스 2: SHIFT_CREATE → API 직접 (UI에서 날짜 입력이 native date picker라 플래키 가능) ──

  test('케이스2: SHIFT_CREATE — 근무일정 변경 요청 → shift 양식 document 자동생성', async ({ page }) => {
    // Arrange
    const { accessToken } = await empLogin(page)
    const ts = Date.now()
    const futureDate = new Date(Date.now() + 10 * 86400000)
    const dateStr = futureDate.toISOString().slice(0, 10)

    // Act — API 직접(UI는 date picker 플래키 위험)
    const { resp, body } = await postRequest(page, accessToken, 'SHIFT_CREATE', {
      date: dateStr,
      startTime: '09:00',
      endTime: '18:00',
      reason: `E2E SHIFT_CREATE ${ts}`,
    })

    // Assert
    expect(resp.status()).toBe(201)
    const req = body?.data ?? body
    expect(req.type).toBe('SHIFT_CREATE')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const doc = await getDocument(page, accessToken, req.documentId)
    expect(doc.status).toBe('PENDING')
    // shift_change 또는 shift 양식 연결 확인
    expect(doc.formId).toBeTruthy()
    const lines: Array<{ steps: Array<{ role: string; status: string }> }> = doc.approvalLines ?? []
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].status).toBe('PENDING')
  })

  // ── 케이스 3: ATTENDANCE_EDIT → API 직접 ─────────────────────────────────────

  test('케이스3: ATTENDANCE_EDIT — 출퇴근 정정 요청 → attendance_correction 문서 자동생성', async ({ page }) => {
    // Arrange
    const { accessToken } = await empLogin(page)
    const ts = Date.now()
    const pastDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)

    // Act
    const { resp, body } = await postRequest(page, accessToken, 'ATTENDANCE_EDIT', {
      date: pastDate,
      clockInAt: '08:55',
      clockOutAt: '18:05',
      reason: `E2E ATTENDANCE_EDIT ${ts}`,
    })

    // Assert
    expect(resp.status()).toBe(201)
    const req = body?.data ?? body
    expect(req.type).toBe('ATTENDANCE_EDIT')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const doc = await getDocument(page, accessToken, req.documentId)
    expect(doc.status).toBe('PENDING')
    expect(doc.formId).toBeTruthy()
    const lines: Array<{ steps: Array<{ status: string }> }> = doc.approvalLines ?? []
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].status).toBe('PENDING')
  })

  // ── 케이스 4: DEVICE_CHANGE → API 직접 ──────────────────────────────────────

  test('케이스4: DEVICE_CHANGE — 기기변경 요청 → document 자동생성, approval step 존재', async ({ page }) => {
    // Arrange
    const { accessToken } = await empLogin(page)
    const ts = Date.now()

    // Act
    const { resp, body } = await postRequest(page, accessToken, 'DEVICE_CHANGE', {
      reason: `E2E DEVICE_CHANGE 기기교체 ${ts}`,
    })

    // Assert
    expect(resp.status()).toBe(201)
    const req = body?.data ?? body
    expect(req.type).toBe('DEVICE_CHANGE')
    expect(req.status).toBe('PENDING')
    expect(req.documentId).toBeTruthy()

    const doc = await getDocument(page, accessToken, req.documentId)
    expect(doc.status).toBe('PENDING')
    // device 양식 확인
    expect(doc.formId).toContain('device')
    const lines: Array<{ steps: Array<{ status: string }> }> = doc.approvalLines ?? []
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].status).toBe('PENDING')
  })

  // ── 케이스 5-a: OFFSITE_WORK → UI + API 검증 ─────────────────────────────────

  test('케이스5-a: OFFSITE_WORK — 외근/출장 신청 → 201 + 내 요청 목록 반영 + document 생성', async ({ page }) => {
    // Arrange
    const { accessToken } = await empLogin(page)
    const ts = Date.now()

    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    // Act — UI
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '새 요청' }).click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    // 기타 → 외근/출장 선택
    await page.getByRole('button', { name: '외근/출장' }).click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 8000 })

    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    await dialog.getByLabel('일자').fill(futureDate)
    await dialog.getByLabel('목적지').fill(`E2E 고객사 ${ts}`)
    await dialog.getByLabel('사유').fill(`E2E OFFSITE_WORK 테스트 ${ts}`)

    await dialog.getByRole('button', { name: '신청' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Assert — 목록에서 '외근/출장 요청' 행 확인 (테이블 셀만)
    await expect(page.getByRole('cell', { name: '외근/출장 요청' }).first()).toBeVisible({ timeout: 10000 })

    // API 검증 — documentId 연결 확인
    await expect.poll(async () => {
      const listResp = await page.request.get(`${API_URL}/requests?type=OFFSITE_WORK&limit=5`, {
        headers: authHeaders(accessToken),
      })
      const lb = await listResp.json()
      const items: Array<{ type: string; documentId: string | null; status: string }> =
        lb?.data?.items ?? lb?.data ?? []
      return items.find((r) => r.type === 'OFFSITE_WORK' && r.documentId)?.documentId ?? null
    }, { timeout: 10000 }).not.toBeNull()

    const listResp2 = await page.request.get(`${API_URL}/requests?type=OFFSITE_WORK&limit=5`, {
      headers: authHeaders(accessToken),
    })
    const lb2 = await listResp2.json()
    const items2: Array<{ type: string; documentId: string | null; status: string }> =
      lb2?.data?.items ?? lb2?.data ?? []
    const offsite = items2.find((r) => r.type === 'OFFSITE_WORK' && r.documentId)!
    expect(offsite).toBeDefined()

    const doc = await getDocument(page, accessToken, offsite.documentId!)
    expect(doc.status).toBe('PENDING')
    expect(doc.formId).toContain('offsite')
  })

  // ── 케이스 5-b: CUSTOM → UI + API 검증 ────────────────────────────────────────

  test('케이스5-b: CUSTOM — 기타 요청 신청 → 201 + 내 요청 목록 반영 + document 생성', async ({ page }) => {
    // Arrange
    const { accessToken } = await empLogin(page)
    const ts = Date.now()
    const customTitle = `E2E 기타요청 ${ts}`

    await uiLogin(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)

    // Act — UI
    await page.goto(`${BASE_URL}/me/requests`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '새 요청' }).click()
    await expect(page.locator('.modal')).toBeVisible({ timeout: 8000 })

    // 기타 요청 선택
    await page.getByRole('button', { name: '기타 요청' }).click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 8000 })

    await dialog.getByLabel('제목').fill(customTitle)
    await dialog.getByLabel('내용').fill(`E2E CUSTOM 내용 ${ts}`)

    await dialog.getByRole('button', { name: '신청' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Assert — 목록에서 '기타 요청' 행 확인
    await expect(page.getByText('기타 요청').first()).toBeVisible({ timeout: 10000 })

    // API 검증
    await expect.poll(async () => {
      const listResp = await page.request.get(`${API_URL}/requests?type=CUSTOM&limit=5`, {
        headers: authHeaders(accessToken),
      })
      const lb = await listResp.json()
      const items: Array<{ type: string; documentId: string | null; payload: { title?: string } }> =
        lb?.data?.items ?? lb?.data ?? []
      return (
        items.find(
          (r) => r.type === 'CUSTOM' && r.documentId && r.payload?.title === customTitle,
        )?.documentId ?? null
      )
    }, { timeout: 10000 }).not.toBeNull()

    const listResp2 = await page.request.get(`${API_URL}/requests?type=CUSTOM&limit=5`, {
      headers: authHeaders(accessToken),
    })
    const lb2 = await listResp2.json()
    const items2: Array<{ type: string; documentId: string | null; payload: { title?: string } }> =
      lb2?.data?.items ?? lb2?.data ?? []
    const custom = items2.find(
      (r) => r.type === 'CUSTOM' && r.documentId && r.payload?.title === customTitle,
    )!
    expect(custom).toBeDefined()

    const doc = await getDocument(page, accessToken, custom.documentId!)
    expect(doc.status).toBe('PENDING')
    expect(doc.formId).toContain('custom')
  })

  // ── 케이스 6: REQUEST_NO_APPROVER ─────────────────────────────────────────────
  //
  // 시드 환경에서는 seed-admin(SUPER_ADMIN)이 항상 존재해 fallback 관리자로 지정되므로
  // 일반 직원 계정에서 NO_APPROVER를 유발하기가 불가능하다.
  // 이 케이스는 BE 로직 확인 수준에서: 회사에 다른 관리자가 없고 요청자 본인만 있을 경우
  // 400 REQUEST_NO_APPROVER를 반환하는 코드 경로를 service 로직(requests.service.ts:479)으로
  // 확인하고, 현재 시드 환경의 상태를 명시적으로 문서화한다.
  test('케이스6: REQUEST_NO_APPROVER 시드 환경 진단 — fallback 관리자 존재로 400 유발 불가 확인', async ({ page }) => {
    // Arrange: 시드에는 seed-admin(SUPER_ADMIN)이 있어 fallback이 항상 성립함
    const { accessToken } = await empLogin(page)

    // Act: OFFSITE_WORK는 전용 approvalRule이 없어 fallback 경로를 탄다
    const ts = Date.now()
    const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
    const { resp, body } = await postRequest(page, accessToken, 'OFFSITE_WORK', {
      date: futureDate,
      destination: `E2E 진단용 ${ts}`,
      reason: `케이스6 진단 ${ts}`,
    })

    // Assert: 관리자 fallback이 성공해 201이 돌아와야 함
    // (만약 모든 관리자가 사라진 환경이면 400 REQUEST_NO_APPROVER가 반환되어야 함)
    expect(resp.status()).toBe(201)
    const req = body?.data ?? body
    expect(req.documentId).toBeTruthy()

    // 진단: 시드 환경에서 REQUEST_NO_APPROVER가 발생하지 않음을 명시적으로 검증
    // BE 경로: requests.service.ts L476-482에 정의됨
    // 테스트 불가 사유: seed-admin(SUPER_ADMIN, seed-emp-admin)이 항상 존재하고
    //                  해당 직원과 다른 ID이므로 self-approval 체크를 통과함
    expect(req.status).toBe('PENDING')
    const doc = await getDocument(page, accessToken, req.documentId!)
    expect(doc.status).toBe('PENDING')
    // approver가 fallback으로 배정되었음을 step으로 확인
    const lines: Array<{ steps: Array<{ assigneeId: string | null; status: string }> }> =
      doc.approvalLines ?? []
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0].steps[0].assigneeId).toBeTruthy()
  })
})
