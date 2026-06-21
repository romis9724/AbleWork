/**
 * AbleWork ERP — 설정·권한 프로세스 통합 E2E
 *
 * 커버 범위:
 *   C-5: 전자결재 공통 5토글 UI 변경 → 저장 → GET으로 영속 확인 (.strip() 회귀 방지)
 *   D-3: 회사설정 일반 weekStartDay 변경 → 저장 → GET 반영 확인 (saveSettings 미호출 회귀 방지)
 *   D-1: GENERAL_ADMIN이 알림규칙 event/webhook 토글·저장 → 403 없이 GET에 반영
 *
 * 전략: UI 변경·저장, 영속은 API GET으로 단언. 각 테스트는 자기 값을 set→assert하며
 * 순서 비의존·자기완결. 원복으로 공유 dev DB 오염 방지.
 */
import { test, expect } from '@playwright/test'
import { ACCOUNTS, BASE_URL, API_URL, login, uiLogin } from './helpers'

// ── 공통 유틸 ────────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function getCompanySettings(page: Parameters<typeof login>[0], token: string) {
  const res = await page.request.get(`${API_URL}/company-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  return body.data as Record<string, unknown>
}

async function patchCompanySettings(
  page: Parameters<typeof login>[0],
  token: string,
  patch: Record<string, unknown>,
) {
  const res = await page.request.patch(`${API_URL}/company-settings`, {
    data: patch,
    headers: authHeaders(token),
  })
  expect(res.ok()).toBeTruthy()
}

// ── C-5: 전자결재 공통 5토글 ─────────────────────────────────────────────────

test.describe('C-5: 전자결재 공통 5토글 — UI 저장 → GET 영속', () => {
  /**
   * ApprovalCommonPanel이 PATCH할 때 5개 키를 모두 포함하는지 검증한다.
   * 과거 .strip() 누락으로 인해 upperLineChange·zipUpload·mobilePush·emailNotify·userDisplay가
   * 저장되지 않던 회귀를 방지한다.
   * 대표 2가지 조합(prevReject + upperLineChange)을 토글해 저장하고 GET 확인.
   */
  test('SUPER_ADMIN: 전단계반려·상위결재선변경 토글 → 저장 → GET 반영', async ({ page }) => {
    // Arrange
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const before = await getCompanySettings(page, accessToken)
    const prevRejectBefore = before.approvalPrevStepReject as boolean
    const upperLineBefore = before.approvalUpperLineChange as boolean

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/settings/company?section=approval`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // Act — 전단계반려 반전: "사용 안 함" 또는 "사용" 클릭
    const prevRejectLabel = prevRejectBefore ? '사용 안 함' : '사용'
    const upperLineLabel = upperLineBefore ? '사용 안 함' : '사용'

    // 전단계반려 라디오 그룹은 첫 번째 .set-block:nth-of-type(2) 안에 있다.
    // 텍스트 내용으로 버튼을 찾는다.
    const radios = page.locator('.rad-grp')

    // 전단계반려(첫 번째 .rad-grp)
    await radios.nth(0).getByText(prevRejectLabel, { exact: true }).click()
    // 상위결재선변경(두 번째 .rad-grp)
    await radios.nth(1).getByText(upperLineLabel, { exact: true }).click()

    // 저장 버튼 클릭
    await page.getByRole('button', { name: '저장', exact: true }).click()

    // Assert — GET으로 영속 확인
    try {
      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, accessToken)
            return s.approvalPrevStepReject
          },
          { timeout: 8000 },
        )
        .toBe(!prevRejectBefore)

      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, accessToken)
            return s.approvalUpperLineChange
          },
          { timeout: 8000 },
        )
        .toBe(!upperLineBefore)
    } finally {
      // 원복
      await patchCompanySettings(page, accessToken, {
        approvalPrevStepReject: prevRejectBefore,
        approvalUpperLineChange: upperLineBefore,
      })
    }
  })

  test('SUPER_ADMIN: 압축업로드·모바일푸시·이메일수신 토글 → 저장 → GET 반영', async ({ page }) => {
    // Arrange
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const before = await getCompanySettings(page, accessToken)
    const zipBefore = before.approvalAllowZipUpload as boolean
    const mobileBefore = before.approvalMobilePush as boolean
    const emailBefore = before.approvalEmailNotify as boolean

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/settings/company?section=approval`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // Act — 3번째(zipUpload), 4번째(mobile), 5번째(email) 라디오 그룹 반전
    const radios = page.locator('.rad-grp')

    await radios.nth(2).getByText(zipBefore ? '사용 안 함' : '사용', { exact: true }).click()
    await radios.nth(3).getByText(mobileBefore ? '사용 안 함' : '사용', { exact: true }).click()
    await radios.nth(4).getByText(emailBefore ? '사용 안 함' : '사용', { exact: true }).click()

    await page.getByRole('button', { name: '저장', exact: true }).click()

    // Assert
    try {
      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, accessToken)
            return [s.approvalAllowZipUpload, s.approvalMobilePush, s.approvalEmailNotify]
          },
          { timeout: 8000 },
        )
        .toEqual([!zipBefore, !mobileBefore, !emailBefore])
    } finally {
      // 원복
      await patchCompanySettings(page, accessToken, {
        approvalAllowZipUpload: zipBefore,
        approvalMobilePush: mobileBefore,
        approvalEmailNotify: emailBefore,
      })
    }
  })
})

// ── D-3: weekStartDay + timeFormat ───────────────────────────────────────────

test.describe('D-3: 회사설정 일반 — weekStartDay 변경 → 저장 → GET 반영', () => {
  /**
   * 일반 섹션에서 저장 시 updateCompany만 호출하고 saveSettings를 빠뜨리는 회귀를 검증한다.
   * weekStartDay를 현재 값과 다른 값으로 변경 후 저장하고 GET으로 확인한다.
   */
  test('SUPER_ADMIN: weekStartDay 변경 → 저장 → GET 반영', async ({ page }) => {
    // Arrange
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const before = await getCompanySettings(page, accessToken)
    const weekDayBefore = (before.weekStartDay as string) ?? 'monday'
    // 현재 값과 다른 값 선택 (monday↔tuesday 토글)
    const weekDayTarget = weekDayBefore === 'monday' ? 'tuesday' : 'monday'
    const weekDayTargetLabel = weekDayTarget === 'monday' ? '월요일' : '화요일'

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/settings/company?section=general`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // Act — "1주 시작 요일" select 변경
    const weekSelect = page.locator('select').filter({ hasText: weekDayTargetLabel }).first()
    // select를 직접 찾기 어려우면 레이블 인근 select 사용
    const allSelects = page.locator('select')
    // 1주 시작 요일 select: 요일 option들을 가진 select (WEEK_DAYS 기반)
    // 모든 select 중 현재 weekDayBefore 값을 가진 select
    const count = await allSelects.count()
    let weekSelectEl = null
    for (let i = 0; i < count; i++) {
      const sel = allSelects.nth(i)
      const val = await sel.inputValue()
      if (val === weekDayBefore || val === weekDayTarget) {
        // 요일 옵션 존재 여부 확인
        const optCount = await sel.locator('option').count()
        if (optCount >= 7) {
          weekSelectEl = sel
          break
        }
      }
    }

    expect(weekSelectEl).not.toBeNull()
    await weekSelectEl!.selectOption(weekDayTarget)

    // 저장 버튼
    await page.getByRole('button', { name: '저장', exact: true }).click()

    // Assert — GET으로 영속 확인
    try {
      await expect
        .poll(
          async () => {
            const s = await getCompanySettings(page, accessToken)
            return s.weekStartDay
          },
          { timeout: 8000 },
        )
        .toBe(weekDayTarget)
    } finally {
      // 원복
      await patchCompanySettings(page, accessToken, { weekStartDay: weekDayBefore })
    }
  })
})

// ── D-1: GENERAL_ADMIN 알림규칙 저장 ─────────────────────────────────────────

test.describe('D-1: GENERAL_ADMIN 알림규칙 — 403 없이 저장 → GET 반영', () => {
  /**
   * GENERAL_ADMIN이 알림규칙 event 토글을 변경하고 webhook URL을 저장해도 403이 없음을 검증한다.
   * 이전에 SUPER_ADMIN 전용이었던 엔드포인트를 GENERAL_ADMIN으로 하향 조정한 회귀 보호.
   */
  test('GENERAL_ADMIN: 이벤트 알림 토글 → GET에 isActive 반영', async ({ page }) => {
    // Arrange — API로 초기 상태 확인
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const rulesRes = await page.request.get(`${API_URL}/notifications/rules?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(rulesRes.ok()).toBeTruthy()
    const rulesBody = await rulesRes.json()
    const rules: Array<{ eventType: string; isActive: boolean }> =
      rulesBody?.data?.items ?? rulesBody?.data ?? []

    // attendance.clock_in 이벤트를 대표로 사용
    const testEvent = 'attendance.clock_in'
    const ruleBefore = rules.find((r) => r.eventType === testEvent)
    const activeBefore = ruleBefore?.isActive ?? false

    await uiLogin(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await page.goto(`${BASE_URL}/admin/settings/company?section=notification`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')

    // MUI CircularProgress가 사라질 때까지 대기 (알림규칙 로딩)
    await page.waitForSelector('[role="progressbar"]', { state: 'detached', timeout: 10000 }).catch(() => {})

    // Act — MUI Switch: "출근"(attendance.clock_in) 레이블 근방 Switch 토글
    // FormControlLabel은 Switch + label 텍스트 조합. label 텍스트로 찾는다.
    // NOTIFIABLE_EVENTS에서 attendance.clock_in의 label 확인
    const switchLabel = page.getByRole('checkbox').filter({ hasText: '' })
    // MUI Switch는 input[type=checkbox]이며 FormControlLabel 내에 있다
    // label 텍스트 "출근"을 포함하는 FormControlLabel의 Switch를 찾는다
    const clockInLabel = page.locator('label').filter({ hasText: '출근' }).first()
    const clockInSwitch = clockInLabel.locator('input[type="checkbox"]')

    await expect(clockInSwitch).toBeVisible({ timeout: 10000 })
    const currentChecked = await clockInSwitch.isChecked()
    // isActive와 checked 상태가 일치하는지 확인
    expect(currentChecked).toBe(activeBefore)

    // 토글 클릭 (MUI Switch는 label 클릭으로 토글)
    await clockInLabel.locator('span.MuiSwitch-root').click()

    // Assert — GET으로 403 없이 반영 확인
    try {
      await expect
        .poll(
          async () => {
            const res = await page.request.get(`${API_URL}/notifications/rules?limit=100`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            // 403이면 false 반환해 poll이 계속 실패하도록
            if (!res.ok()) return null
            const body = await res.json()
            const items: Array<{ eventType: string; isActive: boolean }> =
              body?.data?.items ?? body?.data ?? []
            return items.find((r) => r.eventType === testEvent)?.isActive
          },
          { timeout: 8000 },
        )
        .toBe(!activeBefore)
    } finally {
      // 원복
      await page.request.patch(`${API_URL}/notifications/rules/event`, {
        data: { eventType: testEvent, isActive: activeBefore },
        headers: authHeaders(accessToken),
      })
    }
  })

  test('GENERAL_ADMIN: Webhook URL 저장 → GET 반영 (403 없음)', async ({ page }) => {
    // Arrange
    const { accessToken } = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const rulesRes = await page.request.get(`${API_URL}/notifications/rules?limit=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const rulesBody = await rulesRes.json()
    const rules: Array<{ eventType: string; webhookUrl?: string | null }> =
      rulesBody?.data?.items ?? rulesBody?.data ?? []
    const webhookBefore = rules.find((r) => r.webhookUrl)?.webhookUrl ?? ''

    const testWebhook = 'https://discord.com/api/webhooks/e2e-test/mock-token'

    await uiLogin(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    await page.goto(`${BASE_URL}/admin/settings/company?section=notification`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    await page.waitForSelector('[role="progressbar"]', { state: 'detached', timeout: 10000 }).catch(() => {})

    // Act — Webhook URL TextField 수정 후 저장
    const webhookField = page.getByLabel('Webhook URL')
    await expect(webhookField).toBeVisible({ timeout: 10000 })
    await webhookField.fill(testWebhook)

    // "저장" 버튼 (MUI Button) — Webhook 섹션 내 저장 버튼
    // 화면에 저장 버튼이 여러 개일 수 있으므로 Webhook URL 인근 버튼 사용
    const webhookCard = page.locator('text=등록한 Webhook URL 하나로').locator('..')
    const saveBtn = webhookCard.getByRole('button', { name: '저장' }).first()
    await saveBtn.click()

    // Assert
    try {
      await expect
        .poll(
          async () => {
            const res = await page.request.get(`${API_URL}/notifications/rules?limit=100`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            })
            if (!res.ok()) return null
            const body = await res.json()
            const items: Array<{ webhookUrl?: string | null }> =
              body?.data?.items ?? body?.data ?? []
            return items.find((r) => r.webhookUrl)?.webhookUrl
          },
          { timeout: 8000 },
        )
        .toBe(testWebhook)
    } finally {
      // 원복 — webhook을 이전 값으로 복구
      await page.request.patch(`${API_URL}/notifications/rules/webhook`, {
        data: { webhookUrl: webhookBefore },
        headers: authHeaders(accessToken),
      })
    }
  })
})
