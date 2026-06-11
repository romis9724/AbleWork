import { test, expect } from '@playwright/test';

test('debug: login and access dashboard', async ({ page }) => {
  // 1. 로그인
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');

  await page.locator('input[type="email"]').fill('admin@ablework.io');
  await page.locator('input[type="password"]').fill('admin1234!');

  // 로그인 요청 가로채기
  const loginPromise = page.waitForResponse((resp) =>
    resp.url().includes('/auth/login') && resp.request().method() === 'POST'
  );
  await page.locator('button[type="submit"]').click();

  const loginResp = await loginPromise;
  const loginBody = await loginResp.json();
  console.log('Login API status:', loginResp.status());
  console.log('Login success:', loginBody?.success);

  // 쿠키 확인
  await page.waitForURL(/\/(admin|me)\//, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  console.log('URL after login:', page.url());

  const cookies = await page.context().cookies();
  const accessCookie = cookies.find(c => c.name === 'accessToken');
  const refreshCookie = cookies.find(c => c.name === 'refreshToken');
  console.log('accessToken cookie:', accessCookie ? `exists (length: ${accessCookie.value.length})` : 'MISSING');
  console.log('refreshToken cookie:', refreshCookie ? `exists (length: ${refreshCookie.value.length})` : 'MISSING');

  // 스크린샷
  await page.screenshot({ path: 'e2e/screenshots/debug_session_after_login.png', fullPage: true });

  // 2. 이제 직접 dashboard로 이동
  await page.goto('http://localhost:3000/admin/dashboard');
  await page.waitForLoadState('networkidle');
  console.log('URL after goto /admin/dashboard:', page.url());
  await page.screenshot({ path: 'e2e/screenshots/debug_session_dashboard.png', fullPage: true });

  // DOM 구조 덤프
  const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Page text:', bodyText);

  // 3. me/home 테스트
  // 직원으로 로그인
  await page.context().clearCookies();
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill('employee@ablework.io');
  await page.locator('input[type="password"]').fill('employee1234!');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/me\//, { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  console.log('Employee URL:', page.url());
  await page.screenshot({ path: 'e2e/screenshots/debug_session_employee.png', fullPage: true });

  const empBodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log('Employee page text:', empBodyText);
});
