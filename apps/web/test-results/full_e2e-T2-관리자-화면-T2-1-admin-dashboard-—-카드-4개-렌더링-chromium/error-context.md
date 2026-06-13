# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full_e2e.spec.ts >> T2. 관리자 화면 >> T2-1. /admin/dashboard — 카드 4개 렌더링
- Location: e2e/full_e2e.spec.ts:174:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('진행 중 결재')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('진행 중 결재')

```

```yaml
- heading "AbleWork" [level=6]
- text: 관리자
- button "로그아웃"
- separator
- list:
  - listitem:
    - button "대시보드":
      - paragraph: 대시보드
  - listitem:
    - button "인사/조직":
      - paragraph: 인사/조직
  - listitem:
    - button "근무일정":
      - paragraph: 근무일정
  - listitem:
    - button "출퇴근":
      - paragraph: 출퇴근
  - listitem:
    - button "휴가":
      - paragraph: 휴가
  - listitem:
    - button "요청":
      - paragraph: 요청
  - listitem:
    - button "전자결재":
      - paragraph: 전자결재
  - listitem:
    - button "리포트":
      - paragraph: 리포트
  - listitem:
    - button "메시지":
      - paragraph: 메시지
  - listitem:
    - button "설정":
      - paragraph: 설정
- main:
  - heading "대시보드" [level=5]
  - paragraph: 현재 근무 중
  - heading [level=4]
  - paragraph: 오늘 출근
  - heading "16" [level=4]
  - paragraph: 오늘 지각
  - heading "0" [level=4]
  - paragraph: 진행 중 요청
  - heading "0" [level=4]
  - heading "최근 요청 (진행 중)" [level=6]
  - table:
    - rowgroup:
      - row "직원명 요청 유형 상태 신청일":
        - columnheader "직원명"
        - columnheader "요청 유형"
        - columnheader "상태"
        - columnheader "신청일"
    - rowgroup:
      - row "진행 중인 요청이 없습니다.":
        - cell "진행 중인 요청이 없습니다."
- button "Open Tanstack query devtools":
  - img
- alert
- button "Open Next.js Dev Tools":
  - img
```

# Test source

```ts
  83  |     const loginDone = page.waitForResponse(
  84  |       (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
  85  |       { timeout: 10000 },
  86  |     );
  87  |     await page.locator('button[type="submit"]').click();
  88  |     await loginDone;
  89  |     await page.waitForLoadState('networkidle');
  90  |     await ss(page, 'T1-2_wrong_password');
  91  | 
  92  |     // Should stay on login page or show alert
  93  |     const stillOnLogin = page.url().includes('/login');
  94  |     const alertVisible = await page.locator('[role="alert"]').isVisible().catch(() => false);
  95  |     expect(stillOnLogin || alertVisible).toBeTruthy();
  96  |   });
  97  | 
  98  |   test('T1-3. 관리자 로그인 → /admin/dashboard 이동 + accessToken 쿠키 확인', async ({ page }) => {
  99  |     await loginViaUI(page, 'admin@ablework.io', 'admin1234!');
  100 |     await ss(page, 'T1-3_admin_logged_in');
  101 | 
  102 |     const cookies = await page.context().cookies();
  103 |     const hasToken = cookies.some((c) => c.name === 'accessToken');
  104 |     expect(hasToken).toBeTruthy();
  105 | 
  106 |     // router.push('/admin/dashboard') is called from login page.
  107 |     // The middleware verifies the JWT with the same secret used by the API.
  108 |     // If the redirect stays on /login, this is the routing/JWT bug being tracked.
  109 |     const url = page.url();
  110 |     const onAdminDashboard = url.includes('/admin/dashboard');
  111 |     const onAdminArea = url.includes('/admin/');
  112 |     console.log(`  로그인 후 URL: ${url}`);
  113 |     console.log(`  /admin/dashboard 도달: ${onAdminDashboard}`);
  114 |     // BUG_REPORT: If URL is still /login, the post-login navigation to /admin/dashboard
  115 |     // failed — likely because document.cookie write happens client-side and the
  116 |     // immediate router.push triggers a middleware check before the cookie is readable.
  117 |     expect(onAdminArea).toBeTruthy();
  118 |   });
  119 | 
  120 |   test('T1-4. 대시보드 사이드바 로그아웃 → /login 이동', async ({ page, context }) => {
  121 |     await injectAuthCookies(context, 'admin@ablework.io', 'admin1234!', page);
  122 |     await page.goto(`${BASE_URL}/admin/dashboard`);
  123 |     await page.waitForLoadState('networkidle');
  124 | 
  125 |     // Click logout icon button in sidebar
  126 |     const logoutBtn = page.locator('[aria-label="로그아웃"]');
  127 |     await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  128 |     await logoutBtn.click();
  129 |     await page.waitForURL(/\/login/, { timeout: 10000 });
  130 |     await ss(page, 'T1-4_admin_logout');
  131 |     expect(page.url()).toContain('/login');
  132 |   });
  133 | 
  134 |   test('T1-5. 직원 로그인 → /me/home 이동 확인', async ({ page }) => {
  135 |     await loginViaUI(page, 'employee@ablework.io', 'employee1234!');
  136 |     await ss(page, 'T1-5_employee_logged_in');
  137 | 
  138 |     const cookies = await page.context().cookies();
  139 |     const hasToken = cookies.some((c) => c.name === 'accessToken');
  140 |     expect(hasToken).toBeTruthy();
  141 | 
  142 |     const url = page.url();
  143 |     console.log(`  직원 로그인 후 URL: ${url}`);
  144 |     // BUG_REPORT: router.push('/me/home') is called but if the URL stays on /login,
  145 |     // the client-side cookie + immediate navigation triggers a middleware redirect.
  146 |     expect(url).toMatch(/\/me\//);
  147 |   });
  148 | 
  149 |   test('T1-6. 직원 프로필 탭 로그아웃 → /login 이동', async ({ page, context }) => {
  150 |     await injectAuthCookies(context, 'employee@ablework.io', 'employee1234!', page);
  151 |     await page.goto(`${BASE_URL}/me/profile`);
  152 |     await page.waitForLoadState('networkidle');
  153 | 
  154 |     const logoutBtn = page.locator('button:has-text("로그아웃")');
  155 |     await expect(logoutBtn).toBeVisible({ timeout: 5000 });
  156 |     await logoutBtn.click();
  157 |     await page.waitForURL(/\/login/, { timeout: 10000 });
  158 |     await ss(page, 'T1-6_employee_logout');
  159 |     expect(page.url()).toContain('/login');
  160 |   });
  161 | 
  162 | });
  163 | 
  164 | // ─────────────────────────────────────────────────────────────
  165 | // T2. 관리자 화면
  166 | // ─────────────────────────────────────────────────────────────
  167 | 
  168 | test.describe('T2. 관리자 화면', () => {
  169 | 
  170 |   test.beforeEach(async ({ page, context }) => {
  171 |     await injectAuthCookies(context, 'admin@ablework.io', 'admin1234!', page);
  172 |   });
  173 | 
  174 |   test('T2-1. /admin/dashboard — 카드 4개 렌더링', async ({ page }) => {
  175 |     await page.goto(`${BASE_URL}/admin/dashboard`);
  176 |     await page.waitForLoadState('networkidle');
  177 |     await ss(page, 'T2-1_admin_dashboard');
  178 | 
  179 |     expect(page.url()).not.toContain('/login');
  180 | 
  181 |     const labels = ['현재 근무 중', '오늘 출근', '오늘 지각', '진행 중 결재'];
  182 |     for (const label of labels) {
> 183 |       await expect(page.getByText(label)).toBeVisible({ timeout: 5000 });
      |                                           ^ Error: expect(locator).toBeVisible() failed
  184 |     }
  185 | 
  186 |     const cards = page.locator('.MuiCard-root');
  187 |     await expect(cards).toHaveCount(4, { timeout: 5000 });
  188 |   });
  189 | 
  190 |   test('T2-2. /admin/employees — 직원 목록 테이블 (홍길동, 최고관리자 포함)', async ({ page }) => {
  191 |     await page.goto(`${BASE_URL}/admin/employees`);
  192 |     await page.waitForLoadState('networkidle');
  193 |     await ss(page, 'T2-2_admin_employees');
  194 | 
  195 |     expect(page.url()).not.toContain('/login');
  196 | 
  197 |     // Wait for table to load
  198 |     await page.waitForSelector('table, .MuiTable-root, .MuiTableBody-root', { timeout: 10000 }).catch(() => null);
  199 |     await page.waitForTimeout(1000); // allow API data to render
  200 | 
  201 |     const content = await page.content();
  202 |     const hasHong = content.includes('홍길동');
  203 |     const hasAdmin = content.includes('최고관리자') || content.includes('Admin') || content.includes('admin');
  204 | 
  205 |     expect(hasHong || hasAdmin).toBeTruthy();
  206 |   });
  207 | 
  208 |   test('T2-3. /admin/positions — 직무 목록 (에러 없이 렌더링)', async ({ page }) => {
  209 |     await page.goto(`${BASE_URL}/admin/positions`);
  210 |     await page.waitForLoadState('networkidle');
  211 |     await ss(page, 'T2-3_admin_positions');
  212 | 
  213 |     expect(page.url()).not.toContain('/login');
  214 |     // No 500 error text
  215 |     const content = await page.content();
  216 |     expect(content).not.toContain('Application error');
  217 |     expect(content).not.toContain('Internal Server Error');
  218 |   });
  219 | 
  220 |   test('T2-4. /admin/attendances — 출퇴근 기록 페이지 렌더링', async ({ page }) => {
  221 |     await page.goto(`${BASE_URL}/admin/attendances`);
  222 |     await page.waitForLoadState('networkidle');
  223 |     await ss(page, 'T2-4_admin_attendances');
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
```