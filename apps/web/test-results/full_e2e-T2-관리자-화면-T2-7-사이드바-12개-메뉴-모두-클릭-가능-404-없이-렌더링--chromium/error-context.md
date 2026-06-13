# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: full_e2e.spec.ts >> T2. 관리자 화면 >> T2-7. 사이드바 12개 메뉴 모두 클릭 가능 (404 없이 렌더링)
- Location: e2e/full_e2e.spec.ts:253:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.goto: Test timeout of 30000ms exceeded.
Call log:
  - navigating to "http://localhost:3000/admin/settings/notifications", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "AbleWork" [level=6] [ref=e7]
        - text: 관리자
      - button "로그아웃" [ref=e8] [cursor=pointer]:
        - img [ref=e9]
    - separator [ref=e11]
    - list [ref=e12]:
      - listitem [ref=e13]:
        - button "대시보드" [ref=e14] [cursor=pointer]:
          - img [ref=e16]
          - paragraph [ref=e19]: 대시보드
      - listitem [ref=e21]:
        - button "인사/조직" [ref=e22] [cursor=pointer]:
          - img [ref=e24]
          - paragraph [ref=e27]: 인사/조직
          - img [ref=e28]
      - listitem [ref=e31]:
        - button "근무일정" [ref=e32] [cursor=pointer]:
          - img [ref=e34]
          - paragraph [ref=e37]: 근무일정
          - img [ref=e38]
      - listitem [ref=e41]:
        - button "출퇴근" [ref=e42] [cursor=pointer]:
          - img [ref=e44]
          - paragraph [ref=e48]: 출퇴근
          - img [ref=e49]
      - listitem [ref=e52]:
        - button "휴가" [ref=e53] [cursor=pointer]:
          - img [ref=e55]
          - paragraph [ref=e58]: 휴가
          - img [ref=e59]
      - listitem [ref=e62]:
        - button "요청" [ref=e63] [cursor=pointer]:
          - img [ref=e65]
          - paragraph [ref=e68]: 요청
          - img [ref=e69]
      - listitem [ref=e72]:
        - button "전자결재" [ref=e73] [cursor=pointer]:
          - img [ref=e75]
          - paragraph [ref=e78]: 전자결재
          - img [ref=e79]
      - listitem [ref=e82]:
        - button "리포트" [ref=e83] [cursor=pointer]:
          - img [ref=e85]
          - paragraph [ref=e88]: 리포트
          - img [ref=e89]
      - listitem [ref=e92]:
        - button "메시지" [ref=e93] [cursor=pointer]:
          - img [ref=e95]
          - paragraph [ref=e98]: 메시지
          - img [ref=e99]
      - generic [ref=e101]:
        - listitem [ref=e102]:
          - button "설정" [ref=e103] [cursor=pointer]:
            - img [ref=e105]
            - paragraph [ref=e108]: 설정
            - img [ref=e109]
        - list [ref=e114]:
          - listitem [ref=e115]:
            - button "회사 설정" [ref=e116] [cursor=pointer]:
              - paragraph [ref=e118]: 회사 설정
          - listitem [ref=e119]:
            - button "Discord 알림" [ref=e120] [cursor=pointer]:
              - paragraph [ref=e122]: Discord 알림
          - listitem [ref=e123]:
            - button "권한 설정" [ref=e124] [cursor=pointer]:
              - paragraph [ref=e126]: 권한 설정
  - main [ref=e127]:
    - progressbar [ref=e129]:
      - img [ref=e130]
```

# Test source

```ts
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
  183 |       await expect(page.getByText(label)).toBeVisible({ timeout: 5000 });
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
> 272 |       await page.goto(`${BASE_URL}${item.path}`);
      |                  ^ Error: page.goto: Test timeout of 30000ms exceeded.
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
  324 |     await expect(checkOutBtn).toBeVisible({ timeout: 5000 });
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
```