/**
 * 양식함(분류) 관리 — 이름 수정(rename) 추가 검증.
 *
 * 기존: 좌측 [추가][수정] 두 버튼이 동일한 다이얼로그(추가/삭제만 지원)를 열어 "수정"이
 * 실제로는 동작하지 않았다(라벨 거짓). 이제 단일 [분류 관리] 버튼 + 다이얼로그 인라인
 * rename으로 정리했다. 본 스펙은 추가→이름 수정→반영→삭제 전체 흐름을 검증한다.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, ACCOUNTS, uiLogin } from './helpers'

test.describe('양식함 분류 관리', () => {
  test('분류 추가 → 이름 수정 → 반영 → 삭제', async ({ page }) => {
    // orig/renamed는 서로 부분문자열이 아니어야 hasText 매칭이 정확하다(가↔나)
    const ts = Date.now()
    const orig = `분류가${ts}`
    const renamed = `분류나${ts}`

    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/approval/forms`)
    await page.waitForLoadState('networkidle')

    // 단일 [분류 관리] 버튼이 다이얼로그를 연다
    await page.getByRole('button', { name: '분류 관리' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('양식함(분류) 관리')).toBeVisible({ timeout: 10_000 })

    // 추가
    await dialog.getByLabel('새 분류명').fill(orig)
    await dialog.getByRole('button', { name: '추가' }).click()
    const item = dialog.locator('li', { hasText: orig })
    await expect(item).toBeVisible({ timeout: 10_000 })

    // 이름 수정 — 수정 아이콘 클릭 시 항목이 editing 모드(standard TextField)로 전환된다.
    // 전환 후 li 텍스트가 orig→입력값으로 바뀌어 hasText:orig locator는 stale → 별도로 잡는다.
    await item.getByLabel('이름 수정').click()
    const editInput = dialog.locator('.MuiInput-root input') // standard variant(추가용은 outlined)
    await editInput.fill(renamed)
    await dialog.getByLabel('저장').click()

    // 변경 반영
    const renamedItem = dialog.locator('li', { hasText: renamed })
    await expect(renamedItem).toBeVisible({ timeout: 10_000 })
    await expect(dialog.locator('li', { hasText: orig })).toHaveCount(0)

    // 정리 — 생성한 분류 삭제(테스트 데이터 누적 방지)
    await renamedItem.getByLabel('삭제').click()
    await expect(dialog.locator('li', { hasText: renamed })).toHaveCount(0)
  })
})
