/**
 * AbleWork ERP — 설정 토글 인터랙션 동작 E2E
 *
 * 화면 순회(rbac_screen_sweep)는 "화면이 뜨는지"만 본다. 이 spec은 사용자가 직접 우려한
 * **토글/체크박스 클릭 → 저장 → 실제 반영**을 검증한다(클릭이 먹는지 + 영속).
 *
 * 전략: 토글 클릭·저장만 UI, 반영은 API로 검증. 각 테스트는 원래 값으로 원복한다.
 * 전제: web/api/DB 기동 + 시드 계정. 포트는 helpers.ts(env 오버라이드).
 */
import { test, expect } from '@playwright/test'
import { ACCOUNTS, BASE_URL, API_URL, login, uiLogin } from './helpers'

test.describe('설정 토글 인터랙션 동작', () => {
  test('SUPER_ADMIN: 권한 설정 체크박스 토글 → 저장 → API 반영', async ({ page }) => {
    const { accessToken } = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const headers = { Authorization: `Bearer ${accessToken}` }
    const getPerms = async () => {
      const b = await (await page.request.get(`${API_URL}/permission-settings`, { headers })).json()
      return b.data as { orgAdmin: Record<string, boolean>; employee: Record<string, boolean> }
    }

    const before = await getPerms()
    const beforeVal = before.orgAdmin.employee_manage

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/settings/permissions`, { waitUntil: 'domcontentloaded' })

    // 조직관리자 권한 탭의 첫 체크박스(= '직원 추가/수정' = employee_manage) 토글
    const cb = page.getByRole('checkbox').first()
    await expect(cb).toBeVisible({ timeout: 10000 })
    await cb.click()
    await page.getByRole('button', { name: '저장', exact: true }).click()

    try {
      await expect
        .poll(async () => (await getPerms()).orgAdmin.employee_manage, { timeout: 8000 })
        .toBe(!beforeVal)
    } finally {
      // 원복(다른 테스트·환경 영향 방지)
      await page.request.patch(`${API_URL}/permission-settings`, {
        data: before,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }
  })
})
