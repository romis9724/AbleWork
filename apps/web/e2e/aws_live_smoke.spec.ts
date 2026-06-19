import { test, expect } from '@playwright/test'

// 배포된 AWS 환경(work.abmwc.net) 대상 스모크 테스트.
// 실행: LIVE_URL 미지정 시 https://work.abmwc.net
const BASE = process.env.LIVE_URL || 'https://work.abmwc.net'

test.describe('AWS live smoke (work.abmwc.net)', () => {
  test('관리자 로그인 → /admin/dashboard 진입', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#email')).toBeVisible({ timeout: 20000 })
    await page.screenshot({ path: '/tmp/ablework-01-login.png', fullPage: true })

    await page.fill('#email', 'admin@ablework.io')
    await page.fill('#password', 'admin1234!')
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/admin\/dashboard/, { timeout: 30000 })
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/admin\/dashboard/)
    // 관리자 셸이 떴는지(네비/브랜드) 가볍게 확인
    await page.waitForTimeout(1500)
    await page.screenshot({ path: '/tmp/ablework-02-admin-dashboard.png', fullPage: true })
  })

  test('비관리자(영업팀원) /admin 접근 차단', async ({ page }) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#email')).toBeVisible({ timeout: 20000 })
    await page.fill('#email', 'sales@ablework.io')
    await page.fill('#password', 'sales1234!')
    await page.click('button[type="submit"]')

    await page.waitForURL(/\/me\//, { timeout: 30000 })
    await page.screenshot({ path: '/tmp/ablework-03-employee-home.png', fullPage: true })

    // 관리자 경로 직접 접근 시도 → 미들웨어가 비관리자를 돌려보내야 함
    await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await expect(page).not.toHaveURL(/\/admin\/dashboard/)
    await page.screenshot({ path: '/tmp/ablework-04-admin-blocked.png', fullPage: true })
  })
})
