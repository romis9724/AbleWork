/**
 * 근무일정 일괄 생성 — 화면 연결(복원) 검증.
 *
 * BulkCreateDialog(템플릿×조직×직원×기간 일괄 생성)와 BE API(/shifts/bulk)는 완성돼 있었으나
 * 근무일정 화면에 연결되지 않아 사용할 수 없었다. 본 스펙은 [일괄 생성] 버튼이 다이얼로그를
 * 열고 핵심 입력 필드가 렌더되는지(= 기능이 실제 도달 가능한지) 검증한다.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL, ACCOUNTS, uiLogin } from './helpers'

test.describe('근무일정 일괄 생성 (화면 연결 복원)', () => {
  test('[일괄 생성] 버튼이 일괄 생성 다이얼로그를 연다', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/shifts`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: '일괄 생성' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('근무일정 일괄 생성')).toBeVisible({ timeout: 10_000 })
    // 핵심 입력 필드가 모두 렌더되는지 — 템플릿/조직/직원/기간
    await expect(dialog.getByLabel('근무일정 템플릿')).toBeVisible()
    await expect(dialog.getByLabel('조직')).toBeVisible()
    await expect(dialog.getByLabel('시작일')).toBeVisible()
    await expect(dialog.getByLabel('종료일')).toBeVisible()
    // 조직 미선택 상태에서는 생성 버튼이 비활성(유효성 가드)
    await expect(dialog.getByRole('button', { name: '일괄 생성' })).toBeDisabled()
  })
})
