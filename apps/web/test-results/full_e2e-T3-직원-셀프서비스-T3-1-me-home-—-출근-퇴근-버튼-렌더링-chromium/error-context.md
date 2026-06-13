# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full_e2e.spec.ts >> T3. 직원 셀프서비스 >> T3-1. /me/home — 출근/퇴근 버튼 렌더링
- Location: e2e/full_e2e.spec.ts:312:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: '퇴근', exact: true }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: '퇴근', exact: true }).first()

```

```yaml
- main:
  - heading "홈" [level=6]
  - paragraph: 2026년 6월 12일 금요일
  - button "출근"
- button "홈"
- button "근무일정"
- button "휴가"
- button "요청"
- button "프로필"
- button "Open Tanstack query devtools":
  - img
- alert
- button "Open Next.js Dev Tools":
  - img
```

# Test source

```ts
  224 | 
  225 |     expect(page.url()).not.toContain('/login');
  226 |     const content = await page.content();
  227 |     expect(content).not.toContain('Application error');
  228 |   });
  229 | 
  230 |   test('T2-5. /admin/leave/types — 연차 휴가 유형 포함', async ({ page }) => {
  231 |     await page.goto(`${BASE_URL}/admin/leave/types`);
  232 |     await page.waitForLoadState('networkidle');
  233 |     await ss(page, 'T2-5_admin_leave_types');
  234 | 
  235 |     expect(page.url()).not.toContain('/login');
  236 |     // Wait for API data
  237 |     await page.waitForTimeout(1500);
  238 |     const content = await page.content();
  239 |     const hasYeouncha = content.includes('연차');
  240 |     expect(hasYeouncha).toBeTruthy();
  241 |   });
  242 | 
  243 |   test('T2-6. /admin/requests — 요청 목록 페이지 렌더링', async ({ page }) => {
  244 |     await page.goto(`${BASE_URL}/admin/requests`);
  245 |     await page.waitForLoadState('networkidle');
  246 |     await ss(page, 'T2-6_admin_requests');
  247 | 
  248 |     expect(page.url()).not.toContain('/login');
  249 |     const content = await page.content();
  250 |     expect(content).not.toContain('Application error');
  251 |   });
  252 | 
  253 |   test('T2-7. 사이드바 12개 메뉴 모두 클릭 가능 (404 없이 렌더링)', async ({ page }) => {
  254 |     const NAV_PATHS = [
  255 |       { label: '대시보드', path: '/admin/dashboard' },
  256 |       { label: '조직/직원', path: '/admin/employees' },
  257 |       { label: '직무', path: '/admin/positions' },
  258 |       { label: '근무일정', path: '/admin/shifts' },
  259 |       { label: '출퇴근', path: '/admin/attendances' },
  260 |       { label: '휴가', path: '/admin/leave/types' },
  261 |       { label: '요청', path: '/admin/requests' },
  262 |       { label: '전자결재', path: '/admin/approval/forms' },
  263 |       { label: '리포트', path: '/admin/reports' },
  264 |       { label: '메시지', path: '/admin/messages' },
  265 |       { label: '알림', path: '/admin/settings/notifications' },
  266 |       { label: '설정', path: '/admin/settings/company' },
  267 |     ];
  268 | 
  269 |     const results: Array<{ label: string; path: string; status: string }> = [];
  270 | 
  271 |     for (const item of NAV_PATHS) {
  272 |       await page.goto(`${BASE_URL}${item.path}`);
  273 |       await page.waitForLoadState('networkidle');
  274 |       const url = page.url();
  275 |       // Use innerText (rendered visible text only, excludes inline script content)
  276 |       const bodyText: string = await page.evaluate(() => document.body.innerText);
  277 |       const is404 = bodyText.includes('This page could not be found');
  278 |       const isRedirectedToLogin = url.includes('/login');
  279 |       const hasAppError = bodyText.includes('Application error') || bodyText.includes('Internal Server Error');
  280 |       const status = is404 ? 'NOT_FOUND' : isRedirectedToLogin ? 'AUTH_REDIRECT' : hasAppError ? 'APP_ERROR' : 'OK';
  281 |       results.push({ label: item.label, path: item.path, status });
  282 |     }
  283 | 
  284 |     await ss(page, 'T2-7_sidebar_last_page');
  285 | 
  286 |     for (const r of results) {
  287 |       console.log(`  [${r.status}] ${r.label} (${r.path})`);
  288 |     }
  289 | 
  290 |     // Only the 4 unimplemented routes should be NOT_FOUND; all others must be OK
  291 |     const unexpectedFailures = results.filter(
  292 |       (r) =>
  293 |         r.status === 'APP_ERROR' ||
  294 |         (r.status === 'NOT_FOUND' &&
  295 |           !['전자결재', '리포트', '메시지', '설정'].includes(r.label)),
  296 |     );
  297 |     expect(unexpectedFailures).toHaveLength(0);
  298 |   });
  299 | 
  300 | });
  301 | 
  302 | // ─────────────────────────────────────────────────────────────
  303 | // T3. 직원 셀프서비스
  304 | // ─────────────────────────────────────────────────────────────
  305 | 
  306 | test.describe('T3. 직원 셀프서비스', () => {
  307 | 
  308 |   test.beforeEach(async ({ page, context }) => {
  309 |     await injectAuthCookies(context, 'employee@ablework.io', 'employee1234!', page);
  310 |   });
  311 | 
  312 |   test('T3-1. /me/home — 출근/퇴근 버튼 렌더링', async ({ page }) => {
  313 |     await page.goto(`${BASE_URL}/me/home`);
  314 |     await page.waitForLoadState('networkidle');
  315 |     await ss(page, 'T3-1_me_home');
  316 | 
  317 |     expect(page.url()).not.toContain('/login');
  318 | 
  319 |     // Use exact match to target the action buttons, not the bottom nav "출퇴근" tab
  320 |     const checkInBtn = page.getByRole('button', { name: '출근', exact: true });
  321 |     // The bottom nav has "출퇴근" label, the action button has exact "퇴근" — use first() to pick card button
  322 |     const checkOutBtn = page.getByRole('button', { name: '퇴근', exact: true }).first();
  323 |     await expect(checkInBtn).toBeVisible({ timeout: 5000 });
> 324 |     await expect(checkOutBtn).toBeVisible({ timeout: 5000 });
      |                               ^ Error: expect(locator).toBeVisible() failed
  325 |   });
  326 | 
  327 |   test('T3-2. /me/attendances — 출퇴근 기록 페이지 렌더링', async ({ page }) => {
  328 |     await page.goto(`${BASE_URL}/me/attendances`);
  329 |     await page.waitForLoadState('networkidle');
  330 |     await ss(page, 'T3-2_me_attendances');
  331 | 
  332 |     expect(page.url()).not.toContain('/login');
  333 |     const content = await page.content();
  334 |     expect(content).not.toContain('Application error');
  335 |   });
  336 | 
  337 |   test('T3-3. /me/leaves — 휴가 잔여 페이지 렌더링', async ({ page }) => {
  338 |     await page.goto(`${BASE_URL}/me/leaves`);
  339 |     await page.waitForLoadState('networkidle');
  340 |     await ss(page, 'T3-3_me_leaves');
  341 | 
  342 |     expect(page.url()).not.toContain('/login');
  343 |     const content = await page.content();
  344 |     expect(content).not.toContain('Application error');
  345 |   });
  346 | 
  347 |   test('T3-4. /me/requests — 요청 내역 페이지 렌더링', async ({ page }) => {
  348 |     await page.goto(`${BASE_URL}/me/requests`);
  349 |     await page.waitForLoadState('networkidle');
  350 |     await ss(page, 'T3-4_me_requests');
  351 | 
  352 |     expect(page.url()).not.toContain('/login');
  353 |     const content = await page.content();
  354 |     expect(content).not.toContain('Application error');
  355 |   });
  356 | 
  357 |   test('T3-5. /me/profile — 프로필 + 로그아웃 버튼 렌더링', async ({ page }) => {
  358 |     await page.goto(`${BASE_URL}/me/profile`);
  359 |     await page.waitForLoadState('networkidle');
  360 |     await ss(page, 'T3-5_me_profile');
  361 | 
  362 |     expect(page.url()).not.toContain('/login');
  363 |     const logoutBtn = page.locator('button:has-text("로그아웃")');
  364 |     await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  365 |   });
  366 | 
  367 | });
  368 | 
  369 | // ─────────────────────────────────────────────────────────────
  370 | // T4. API 연동 확인
  371 | // ─────────────────────────────────────────────────────────────
  372 | 
  373 | test.describe('T4. API 연동 확인', () => {
  374 | 
  375 |   let adminToken: string = '';
  376 | 
  377 |   test.beforeAll(async ({ browser }) => {
  378 |     const ctx = await browser.newContext();
  379 |     const page = await ctx.newPage();
  380 |     const resp = await page.request.post(`${API_URL}/auth/login`, {
  381 |       data: { email: 'admin@ablework.io', password: 'admin1234!' },
  382 |       headers: { 'Content-Type': 'application/json' },
  383 |     });
  384 |     const body = await resp.json();
  385 |     adminToken = body?.data?.accessToken ?? '';
  386 |     await ctx.close();
  387 |   });
  388 | 
  389 |   test('T4-1. /admin/employees — 실제 직원 데이터 표시 (API 연동)', async ({ page, context }) => {
  390 |     const { accessToken } = await getTokens(page, 'admin@ablework.io', 'admin1234!');
  391 |     await context.addCookies([
  392 |       { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
  393 |     ]);
  394 | 
  395 |     await page.goto(`${BASE_URL}/admin/employees`);
  396 |     await page.waitForLoadState('networkidle');
  397 | 
  398 |     // Wait for API response to render in DOM
  399 |     await page.waitForTimeout(2000);
  400 |     await ss(page, 'T4-1_employees_api_data');
  401 | 
  402 |     const content = await page.content();
  403 |     const hasHong = content.includes('홍길동');
  404 |     const hasAdmin = content.includes('최고관리자') || content.includes('최고') || content.includes('admin@ablework.io');
  405 | 
  406 |     console.log(`  홍길동: ${hasHong}, 관리자: ${hasAdmin}`);
  407 |     expect(hasHong || hasAdmin).toBeTruthy();
  408 |   });
  409 | 
  410 |   test('T4-2. /admin/leave/types — 연차 휴가 유형 표시', async ({ page, context }) => {
  411 |     const { accessToken } = await getTokens(page, 'admin@ablework.io', 'admin1234!');
  412 |     await context.addCookies([
  413 |       { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
  414 |     ]);
  415 | 
  416 |     await page.goto(`${BASE_URL}/admin/leave/types`);
  417 |     await page.waitForLoadState('networkidle');
  418 |     await page.waitForTimeout(2000);
  419 |     await ss(page, 'T4-2_leave_types_api_data');
  420 | 
  421 |     const content = await page.content();
  422 |     const hasYeouncha = content.includes('연차');
  423 |     console.log(`  연차 포함: ${hasYeouncha}`);
  424 |     expect(hasYeouncha).toBeTruthy();
```