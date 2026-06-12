# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: final_crud_test.spec.ts >> 01. 조직 추가 - 최종테스트조직
- Location: e2e/final_crud_test.spec.ts:50:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('최종테스트조직')
Expected: visible
Error: strict mode violation: getByText('최종테스트조직') resolved to 2 elements:
    1) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">최종테스트조직</span> aka getByRole('button', { name: '최종테스트조직' }).first()
    2) <span class="MuiTypography-root MuiTypography-body1 MuiListItemText-primary mui-1utuqo0-MuiTypography-root">최종테스트조직</span> aka getByRole('button', { name: '최종테스트조직' }).nth(1)

Call log:
  - Expect "toBeVisible" with timeout 8000ms
  - waiting for getByText('최종테스트조직')

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - generic [ref=e20]:
          - listitem [ref=e21]:
            - button "인사/조직" [ref=e22] [cursor=pointer]:
              - img [ref=e24]
              - paragraph [ref=e27]: 인사/조직
              - img [ref=e28]
          - list [ref=e33]:
            - listitem [ref=e34]:
              - button "조직 관리" [ref=e35] [cursor=pointer]:
                - paragraph [ref=e37]: 조직 관리
            - listitem [ref=e38]:
              - button "직원 목록" [ref=e39] [cursor=pointer]:
                - paragraph [ref=e41]: 직원 목록
            - listitem [ref=e42]:
              - button "직무" [ref=e43] [cursor=pointer]:
                - paragraph [ref=e45]: 직무
            - listitem [ref=e46]:
              - button "출퇴근 장소" [ref=e47] [cursor=pointer]:
                - paragraph [ref=e49]: 출퇴근 장소
        - listitem [ref=e51]:
          - button "근무일정" [ref=e52] [cursor=pointer]:
            - img [ref=e54]
            - paragraph [ref=e57]: 근무일정
            - img [ref=e58]
        - listitem [ref=e61]:
          - button "출퇴근" [ref=e62] [cursor=pointer]:
            - img [ref=e64]
            - paragraph [ref=e68]: 출퇴근
            - img [ref=e69]
        - listitem [ref=e72]:
          - button "휴가" [ref=e73] [cursor=pointer]:
            - img [ref=e75]
            - paragraph [ref=e78]: 휴가
            - img [ref=e79]
        - listitem [ref=e82]:
          - button "요청" [ref=e83] [cursor=pointer]:
            - img [ref=e85]
            - paragraph [ref=e88]: 요청
            - img [ref=e89]
        - listitem [ref=e92]:
          - button "전자결재" [ref=e93] [cursor=pointer]:
            - img [ref=e95]
            - paragraph [ref=e98]: 전자결재
            - img [ref=e99]
        - listitem [ref=e102]:
          - button "리포트" [ref=e103] [cursor=pointer]:
            - img [ref=e105]
            - paragraph [ref=e108]: 리포트
            - img [ref=e109]
        - listitem [ref=e112]:
          - button "메시지" [ref=e113] [cursor=pointer]:
            - img [ref=e115]
            - paragraph [ref=e118]: 메시지
            - img [ref=e119]
        - listitem [ref=e122]:
          - button "설정" [ref=e123] [cursor=pointer]:
            - img [ref=e125]
            - paragraph [ref=e128]: 설정
            - img [ref=e129]
    - main [ref=e131]:
      - generic [ref=e132]:
        - heading "조직 관리" [level=5] [ref=e134]
        - button "조직 추가" [active] [ref=e136] [cursor=pointer]:
          - img [ref=e138]
          - text: 조직 추가
      - generic [ref=e140]:
        - generic [ref=e142]:
          - heading "조직 목록" [level=6] [ref=e143]
          - separator [ref=e144]
          - list [ref=e145]:
            - button "개발팀" [ref=e146] [cursor=pointer]:
              - generic [ref=e148]: 개발팀
              - button [ref=e149]:
                - img [ref=e150]
              - button [ref=e152]:
                - img [ref=e153]
            - button "브라우저테스트조직_1781233393629" [ref=e155] [cursor=pointer]:
              - generic [ref=e157]: 브라우저테스트조직_1781233393629
              - button [ref=e158]:
                - img [ref=e159]
              - button [ref=e161]:
                - img [ref=e162]
            - button "브라우저테스트조직_1781233478896" [ref=e164] [cursor=pointer]:
              - generic [ref=e166]: 브라우저테스트조직_1781233478896
              - button [ref=e167]:
                - img [ref=e168]
              - button [ref=e170]:
                - img [ref=e171]
            - button "브라우저테스트조직_1781233520096" [ref=e173] [cursor=pointer]:
              - generic [ref=e175]: 브라우저테스트조직_1781233520096
              - button [ref=e176]:
                - img [ref=e177]
              - button [ref=e179]:
                - img [ref=e180]
            - button "브라우저테스트조직_1781252455648" [ref=e182] [cursor=pointer]:
              - generic [ref=e184]: 브라우저테스트조직_1781252455648
              - button [ref=e185]:
                - img [ref=e186]
              - button [ref=e188]:
                - img [ref=e189]
            - button "직접테스트조직" [ref=e191] [cursor=pointer]:
              - generic [ref=e193]: 직접테스트조직
              - button [ref=e194]:
                - img [ref=e195]
              - button [ref=e197]:
                - img [ref=e198]
            - button "최종테스트조직" [ref=e200] [cursor=pointer]:
              - generic [ref=e202]: 최종테스트조직
              - button [ref=e203]:
                - img [ref=e204]
              - button [ref=e206]:
                - img [ref=e207]
            - button "최종테스트조직" [ref=e209] [cursor=pointer]:
              - generic [ref=e211]: 최종테스트조직
              - button [ref=e212]:
                - img [ref=e213]
              - button [ref=e215]:
                - img [ref=e216]
            - button "테스트조직" [ref=e218] [cursor=pointer]:
              - generic [ref=e220]: 테스트조직
              - button [ref=e221]:
                - img [ref=e222]
              - button [ref=e224]:
                - img [ref=e225]
            - button "테스트조직" [ref=e227] [cursor=pointer]:
              - generic [ref=e229]: 테스트조직
              - button [ref=e230]:
                - img [ref=e231]
              - button [ref=e233]:
                - img [ref=e234]
            - button "개발팀_수정" [ref=e236] [cursor=pointer]:
              - generic [ref=e238]: 개발팀_수정
              - button [ref=e239]:
                - img [ref=e240]
              - button [ref=e242]:
                - img [ref=e243]
        - paragraph [ref=e247]: 좌측 목록에서 조직을 선택하면 상세 정보를 확인할 수 있습니다.
      - alert [ref=e248]:
        - img [ref=e250]
        - generic [ref=e252]: 조직이 추가되었습니다.
        - button "Close" [ref=e254] [cursor=pointer]:
          - img [ref=e255]
  - generic [ref=e257]:
    - img [ref=e259]
    - button "Open Tanstack query devtools" [ref=e307] [cursor=pointer]:
      - img [ref=e308]
  - alert [ref=e356]
  - button "Open Next.js Dev Tools" [ref=e362] [cursor=pointer]:
    - img [ref=e363]
```

# Test source

```ts
  1   | /**
  2   |  * AbleWork ERP - Final CRUD Full Sweep Test (24 items)
  3   |  * Admin: admin@ablework.io / admin1234!
  4   |  * Employee: employee@ablework.io / employee1234!
  5   |  */
  6   | import { test, expect, type Page, type BrowserContext } from '@playwright/test';
  7   | import * as fs from 'fs';
  8   | import * as path from 'path';
  9   | 
  10  | const SCREENSHOTS_DIR = '/Users/user/Workspace/AbleWork/apps/web/e2e/screenshots/final-crud';
  11  | const BASE_URL = 'http://localhost:3000';
  12  | const API_URL = 'http://localhost:3001/api/v1';
  13  | 
  14  | if (!fs.existsSync(SCREENSHOTS_DIR)) {
  15  |   fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  16  | }
  17  | 
  18  | async function ss(page: Page, name: string) {
  19  |   await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
  20  | }
  21  | 
  22  | async function loginAdmin(page: Page) {
  23  |   await page.goto('/login');
  24  |   await page.waitForLoadState('networkidle');
  25  |   const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="이메일"], input[placeholder*="email"]').first();
  26  |   await emailInput.fill('admin@ablework.io');
  27  |   await page.locator('input[type="password"]').first().fill('admin1234!');
  28  |   await page.locator('button[type="submit"]').click();
  29  |   await page.waitForURL(/admin|dashboard/, { timeout: 15000 });
  30  | }
  31  | 
  32  | async function loginEmployee(page: Page, context: BrowserContext) {
  33  |   const resp = await page.request.post(`${API_URL}/auth/login`, {
  34  |     data: { email: 'employee@ablework.io', password: 'employee1234!' },
  35  |     headers: { 'Content-Type': 'application/json' },
  36  |   });
  37  |   const body = await resp.json();
  38  |   const accessToken = body?.data?.accessToken as string;
  39  |   const refreshToken = body?.data?.refreshToken as string;
  40  |   if (!accessToken) throw new Error('Employee login failed: no accessToken');
  41  |   await context.addCookies([
  42  |     { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
  43  |     { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
  44  |   ]);
  45  |   await page.goto(BASE_URL);
  46  |   await page.waitForLoadState('networkidle');
  47  | }
  48  | 
  49  | // ─── 1. /admin/organizations — 조직 추가 ─────────────────────────────────────
  50  | test('01. 조직 추가 - 최종테스트조직', async ({ page }) => {
  51  |   await loginAdmin(page);
  52  |   await page.goto('/admin/organizations');
  53  |   await page.waitForLoadState('networkidle');
  54  |   await ss(page, '01-org-list');
  55  | 
  56  |   const addBtn = page.locator('button').filter({ hasText: /조직 추가/ }).first();
  57  |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  58  |   await addBtn.click();
  59  | 
  60  |   const dialog = page.locator('[role="dialog"]');
  61  |   await expect(dialog).toBeVisible({ timeout: 5000 });
  62  | 
  63  |   const nameInput = dialog.locator('input').first();
  64  |   await nameInput.fill('최종테스트조직');
  65  |   await ss(page, '01-org-dialog');
  66  | 
  67  |   const respPromise = page.waitForResponse(
  68  |     r => r.url().includes('/organizations') && r.request().method() === 'POST',
  69  |     { timeout: 15000 }
  70  |   );
  71  |   await dialog.locator('button').filter({ hasText: '추가' }).click();
  72  |   const resp = await respPromise;
  73  |   const status = resp.status();
  74  |   const body = await resp.json().catch(() => ({}));
  75  |   await ss(page, '01-org-after-save');
  76  | 
  77  |   console.log(`[01] POST /organizations → ${status} ${JSON.stringify(body)}`);
  78  |   expect(status, `[01 FAIL] 조직 추가 API: HTTP ${status} ${JSON.stringify(body)}`).toBeLessThan(300);
> 79  |   await expect(page.getByText('최종테스트조직')).toBeVisible({ timeout: 8000 });
      |                                           ^ Error: expect(locator).toBeVisible() failed
  80  |   await ss(page, '01-org-in-list');
  81  |   console.log('[01] PASS');
  82  | });
  83  | 
  84  | // ─── 2. /admin/employees — 목록 + 행 클릭 상세 ───────────────────────────────
  85  | test('02. 직원 목록 조회 + 상세 행 클릭', async ({ page }) => {
  86  |   await loginAdmin(page);
  87  |   await page.goto('/admin/employees');
  88  |   await page.waitForLoadState('networkidle');
  89  |   await ss(page, '02-employees-list');
  90  | 
  91  |   const table = page.locator('table');
  92  |   await expect(table).toBeVisible({ timeout: 10000 });
  93  | 
  94  |   const firstRow = page.locator('tbody tr').first();
  95  |   await expect(firstRow).toBeVisible({ timeout: 8000 });
  96  |   await firstRow.click();
  97  |   await page.waitForLoadState('networkidle');
  98  |   await page.waitForTimeout(1500);
  99  |   await ss(page, '02-employee-detail');
  100 | 
  101 |   const currentUrl = page.url();
  102 |   console.log(`[02] 상세 URL: ${currentUrl}`);
  103 |   await expect(page).toHaveURL(/\/admin\/employees\/[^/]+$/, { timeout: 10000 });
  104 | 
  105 |   // Check for no API error
  106 |   const errorAlert = page.locator('[role="alert"]').filter({ hasText: /Validation failed|uuid is expected|400|찾을 수 없/ });
  107 |   const hasError = await errorAlert.isVisible({ timeout: 3000 }).catch(() => false);
  108 |   if (hasError) {
  109 |     const errText = await errorAlert.textContent().catch(() => '');
  110 |     throw new Error(`[02 FAIL] 직원 상세 API 에러: ${errText}`);
  111 |   }
  112 | 
  113 |   await ss(page, '02-employee-detail-ok');
  114 |   console.log('[02] PASS');
  115 | });
  116 | 
  117 | // ─── 3. /admin/positions — 직무 추가 + 삭제 ConfirmDialog 이름 확인 ───────────
  118 | test('03. 직무 추가(최종테스트직무) + 삭제 ConfirmDialog 이름 표시', async ({ page }) => {
  119 |   await loginAdmin(page);
  120 |   await page.goto('/admin/positions');
  121 |   await page.waitForLoadState('networkidle');
  122 |   await ss(page, '03-positions-list');
  123 | 
  124 |   const addBtn = page.locator('button').filter({ hasText: /직무 추가/ }).first();
  125 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  126 |   await addBtn.click();
  127 | 
  128 |   const addDialog = page.locator('[role="dialog"]');
  129 |   await expect(addDialog).toBeVisible({ timeout: 5000 });
  130 |   const nameInput = addDialog.locator('input').first();
  131 |   await nameInput.fill('최종테스트직무');
  132 |   await ss(page, '03-positions-dialog');
  133 | 
  134 |   await addDialog.locator('button').filter({ hasText: '추가' }).click();
  135 |   await page.waitForLoadState('networkidle');
  136 |   await page.waitForTimeout(800);
  137 |   await ss(page, '03-positions-after-add');
  138 | 
  139 |   const posCard = page.locator('.MuiCard-root, [class*="card"], .MuiPaper-root').filter({ hasText: '최종테스트직무' }).first();
  140 |   await expect(posCard, '[03 FAIL] 추가된 직무 카드가 보이지 않음').toBeVisible({ timeout: 10000 });
  141 | 
  142 |   // Click delete button
  143 |   const deleteBtn = posCard.locator('button').last();
  144 |   await deleteBtn.click();
  145 |   await page.waitForTimeout(500);
  146 |   await ss(page, '03-positions-delete-dialog');
  147 | 
  148 |   const confirmDialog = page.locator('[role="dialog"]');
  149 |   await expect(confirmDialog).toBeVisible({ timeout: 5000 });
  150 | 
  151 |   const dialogText = await confirmDialog.textContent().catch(() => '');
  152 |   console.log(`[03] ConfirmDialog text: "${dialogText}"`);
  153 | 
  154 |   const hasUndefined = dialogText.includes('undefined');
  155 |   const hasName = dialogText.includes('최종테스트직무');
  156 | 
  157 |   if (hasUndefined) throw new Error(`[03 FAIL] ConfirmDialog에 "undefined" 표시: "${dialogText}"`);
  158 |   if (!hasName) console.warn(`[03 WARN] ConfirmDialog에 직무이름 없음: "${dialogText}"`);
  159 | 
  160 |   // Proceed with deletion
  161 |   const confirmBtn = confirmDialog.locator('button').filter({ hasText: /삭제|확인/ }).last();
  162 |   await confirmBtn.click();
  163 |   await page.waitForLoadState('networkidle');
  164 |   await ss(page, '03-positions-after-delete');
  165 |   console.log(`[03] PASS (undefined: ${hasUndefined}, hasName: ${hasName})`);
  166 | });
  167 | 
  168 | // ─── 4. /admin/timeclock-areas — 장소 추가 ───────────────────────────────────
  169 | test('04. 출퇴근 장소 추가 (이름+조직+GPS)', async ({ page }) => {
  170 |   await loginAdmin(page);
  171 |   await page.goto('/admin/timeclock-areas');
  172 |   await page.waitForLoadState('networkidle');
  173 |   await ss(page, '04-timeclock-areas-list');
  174 | 
  175 |   const addBtn = page.locator('button').filter({ hasText: /장소 추가/ }).first();
  176 |   await expect(addBtn).toBeVisible({ timeout: 10000 });
  177 |   await addBtn.click();
  178 | 
  179 |   const dialog = page.locator('[role="dialog"]');
```