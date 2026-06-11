import { test } from '@playwright/test';

// Warm up Next.js dev compilation for all pages
test('warmup: compile all pages', async ({ page }) => {
  // Set auth cookies directly to bypass middleware
  // First get a real token
  const loginResp = await page.request.post('http://localhost:3001/api/v1/auth/login', {
    data: { email: 'admin@ablework.io', password: 'admin1234!' },
    headers: { 'Content-Type': 'application/json' },
  });
  const loginBody = await loginResp.json();
  const adminToken = loginBody?.data?.accessToken;
  const adminRefresh = loginBody?.data?.refreshToken;
  console.log('Got admin token:', !!adminToken);

  // Set cookies in the browser context
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: adminToken,
      domain: 'localhost',
      path: '/',
    },
    {
      name: 'refreshToken',
      value: adminRefresh,
      domain: 'localhost',
      path: '/',
    },
  ]);

  // Visit each page to trigger compilation
  const pages = [
    'http://localhost:3000/admin/dashboard',
    'http://localhost:3000/admin/employees',
    'http://localhost:3000/admin/positions',
  ];

  for (const url of pages) {
    await page.goto(url, { timeout: 30000 });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    const text = await page.evaluate(() => document.body.innerText.substring(0, 100));
    console.log(`${url}: "${text}"`);
    await page.screenshot({ path: `e2e/screenshots/warmup_${url.split('/').pop()}.png`, fullPage: true });
  }

  // Employee pages
  const empLoginResp = await page.request.post('http://localhost:3001/api/v1/auth/login', {
    data: { email: 'employee@ablework.io', password: 'employee1234!' },
    headers: { 'Content-Type': 'application/json' },
  });
  const empBody = await empLoginResp.json();
  const empToken = empBody?.data?.accessToken;

  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: 'accessToken',
      value: empToken,
      domain: 'localhost',
      path: '/',
    },
  ]);

  await page.goto('http://localhost:3000/me/home', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  const empText = await page.evaluate(() => document.body.innerText.substring(0, 200));
  console.log(`/me/home: "${empText}"`);
  await page.screenshot({ path: 'e2e/screenshots/warmup_me_home.png', fullPage: true });
});
