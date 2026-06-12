/**
 * AbleWork ERP - Employee (Me) CRUD Test
 * Tests all /me/* screens for the employee account
 *
 * Employee account: employee@ablework.io / employee1234!
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots/crud-test-me');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const EMPLOYEE_EMAIL = 'employee@ablework.io';
const EMPLOYEE_PASSWORD = 'employee1234!';

// ─── helpers ──────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string): Promise<string> {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function getTokens(page: Page) {
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: EMPLOYEE_EMAIL, password: EMPLOYEE_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  return {
    accessToken: body?.data?.accessToken as string,
    refreshToken: body?.data?.refreshToken as string,
  };
}

async function loginEmployee(context: BrowserContext, page: Page) {
  const { accessToken, refreshToken } = await getTokens(page);
  await context.addCookies([
    { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
  ]);
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
}

// Collect console errors and network failures during a page operation
function attachCollectors(page: Page) {
  const consoleErrors: string[] = [];
  const networkErrors: { url: string; status: number; statusText: string }[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      networkErrors.push({
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });

  return { consoleErrors, networkErrors };
}

// ─── T1: Home (/me/home) ──────────────────────────────────────────────────────

test.describe('T1: Home (/me/home)', () => {
  test('T1-1: 페이지 로드 - 출근 버튼 렌더링 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/home`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T1-1_home_loaded');

    // Verify page heading
    const heading = page.locator('h6, h5, h4, h3, h2, h1').filter({ hasText: '홈' }).first();
    await expect(heading).toBeVisible();

    // Verify clock-in button is rendered (initial state = not clocked in)
    const clockInBtn = page.locator('button').filter({ hasText: '출근' }).first();
    await expect(clockInBtn).toBeVisible();

    await ss(page, 'T1-1_home_clock_in_button');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T1-2: 출근 버튼 클릭 - GPS 에러 Snackbar 확인 (앱 크래시 금지)', async ({
    page,
    context,
  }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    // Deny geolocation permission so GPS fails
    await context.grantPermissions([], { origin: BASE_URL });

    await page.goto(`${BASE_URL}/me/home`);
    await page.waitForLoadState('networkidle');

    const clockInBtn = page.locator('button').filter({ hasText: '출근' }).first();
    await expect(clockInBtn).toBeVisible();
    await clockInBtn.click();

    // Expect a Snackbar / Alert to appear with an error message - not a crash
    // GPS denial: either geolocation unavailable or permission denied
    const snackbar = page.locator('[role="alert"]').first();
    await expect(snackbar).toBeVisible({ timeout: 12000 });

    // Verify page is still alive (heading still visible)
    const heading = page.locator('h6, h5, h4, h3, h2, h1').filter({ hasText: '홈' }).first();
    await expect(heading).toBeVisible();

    await ss(page, 'T1-2_home_gps_error_snackbar');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});

// ─── T2: My Shifts (/me/shifts) ───────────────────────────────────────────────

test.describe('T2: My Shifts (/me/shifts)', () => {
  test('T2-1: 페이지 로드 - 달력 렌더링 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/shifts`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T2-1_shifts_loaded');

    const heading = page.locator('h6, h5').filter({ hasText: '내 근무일정' }).first();
    await expect(heading).toBeVisible();

    // Calendar: month label visible (e.g. "2026년 6월")
    const monthLabel = page.locator('text=/\\d{4}년 \\d{1,2}월/').first();
    await expect(monthLabel).toBeVisible();

    // Weekday headers present
    const sunHeader = page.locator('text=일').first();
    await expect(sunHeader).toBeVisible();

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T2-2: < > 버튼으로 월 이동 - 날짜 변경 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/shifts`);
    await page.waitForLoadState('networkidle');

    // Capture current month label
    const monthLabel = page.locator('text=/\\d{4}년 \\d{1,2}월/').first();
    const beforeText = await monthLabel.textContent();

    // Click previous month
    const prevBtn = page.locator('button').filter({ has: page.locator('[data-testid="ChevronLeftIcon"]') }).first();
    // fallback: find buttons with chevron icons
    const prevBtnFallback = page.locator('button:has([class*="ChevronLeft"]), button:has(svg[data-testid="ChevronLeftIcon"])').first();

    const prevButton = (await prevBtn.count()) > 0 ? prevBtn : prevBtnFallback;
    await prevButton.click();
    await page.waitForTimeout(500);

    const afterPrevText = await monthLabel.textContent();
    expect(afterPrevText).not.toBe(beforeText);

    await ss(page, 'T2-2_shifts_prev_month');

    // Click next month twice to move forward
    const nextBtn = page.locator('button').filter({ has: page.locator('[data-testid="ChevronRightIcon"]') }).first();
    const nextBtnFallback = page.locator('button:has([class*="ChevronRight"]), button:has(svg[data-testid="ChevronRightIcon"])').first();
    const nextButton = (await nextBtn.count()) > 0 ? nextBtn : nextBtnFallback;

    await nextButton.click();
    await page.waitForTimeout(500);
    const afterNextText = await monthLabel.textContent();
    expect(afterNextText).toBe(beforeText);

    await ss(page, 'T2-2_shifts_next_month');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});

// ─── T3: My Attendances (/me/attendances) ─────────────────────────────────────

test.describe('T3: My Attendances (/me/attendances)', () => {
  test('T3-1: 이번 달 기록 목록 로드 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/attendances`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T3-1_attendances_loaded');

    const heading = page.locator('h6, h5').filter({ hasText: '내 출퇴근 기록' }).first();
    await expect(heading).toBeVisible();

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T3-2: 빈 상태 정상 표시 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/attendances`);
    await page.waitForLoadState('networkidle');

    // No crash — either records list or empty state message
    const body = await page.textContent('body');
    const hasRecords = await page.locator('[class*="MuiCard"]').count();
    const hasEmptyMsg =
      body?.includes('출퇴근 기록이 없습니다') ||
      body?.includes('기록이 없') ||
      body?.includes('데이터가 없') ||
      hasRecords > 0;

    expect(hasEmptyMsg).toBeTruthy();

    await ss(page, 'T3-2_attendances_empty_or_records');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});

// ─── T4: My Leaves (/me/leaves) ───────────────────────────────────────────────

test.describe('T4: My Leaves (/me/leaves)', () => {
  test('T4-1: 잔여 휴가 로드 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/leaves`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T4-1_leaves_loaded');

    const heading = page.locator('h6, h5').filter({ hasText: '내 휴가' }).first();
    await expect(heading).toBeVisible();

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T4-2: FAB "+" 버튼 클릭 - 휴가 신청 Dialog 열림 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/leaves`);
    await page.waitForLoadState('networkidle');

    const fab = page.locator('button[aria-label="휴가 신청"]');
    await expect(fab).toBeVisible();
    await fab.click();

    // Dialog should open
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await ss(page, 'T4-2_leaves_dialog_opened');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T4-3: Dialog 내 휴가 유형 Select 로드 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/leaves`);
    await page.waitForLoadState('networkidle');

    const fab = page.locator('button[aria-label="휴가 신청"]');
    await fab.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // "휴가 유형" select field should be present
    const selectField = dialog.locator('label:has-text("휴가 유형"), [aria-label="휴가 유형"], input[name*="leave"], div[class*="MuiSelect"]').first();
    await expect(selectField).toBeVisible();

    await ss(page, 'T4-3_leaves_dialog_leave_type_select');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T4-4: 날짜 입력 후 취소 버튼 클릭', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/leaves`);
    await page.waitForLoadState('networkidle');

    const fab = page.locator('button[aria-label="휴가 신청"]');
    await fab.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill start date
    const startDateInput = dialog.locator('input[type="date"]').first();
    if (await startDateInput.count() > 0) {
      await startDateInput.fill('2026-07-01');
    }

    // Cancel
    const cancelBtn = dialog.locator('button').filter({ hasText: '취소' }).first();
    await cancelBtn.click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    await ss(page, 'T4-4_leaves_dialog_cancelled');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});

// ─── T5: My Requests (/me/requests) ──────────────────────────────────────────

test.describe('T5: My Requests (/me/requests)', () => {
  test('T5-1: 요청 목록 로드 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/requests`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T5-1_requests_loaded');

    const heading = page.locator('h6, h5').filter({ hasText: '내 요청' }).first();
    await expect(heading).toBeVisible();

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T5-2: 탭 전환 (전체/대기중/완료)', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/requests`);
    await page.waitForLoadState('networkidle');

    // All tabs should be visible
    const allTab = page.locator('[role="tab"]').filter({ hasText: '전체' }).first();
    const pendingTab = page.locator('[role="tab"]').filter({ hasText: '대기중' }).first();
    const doneTab = page.locator('[role="tab"]').filter({ hasText: '완료' }).first();

    await expect(allTab).toBeVisible();
    await expect(pendingTab).toBeVisible();
    await expect(doneTab).toBeVisible();

    // Click 대기중
    await pendingTab.click();
    await page.waitForLoadState('networkidle');
    await ss(page, 'T5-2_requests_tab_pending');

    // Click 완료
    await doneTab.click();
    await page.waitForLoadState('networkidle');
    await ss(page, 'T5-2_requests_tab_done');

    // Click 전체
    await allTab.click();
    await page.waitForLoadState('networkidle');
    await ss(page, 'T5-2_requests_tab_all');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T5-3: FAB "+" 클릭 - 요청 유형 메뉴 표시 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/requests`);
    await page.waitForLoadState('networkidle');

    const fab = page.locator('button[aria-label="요청 신청"]');
    await expect(fab).toBeVisible();
    await fab.click();

    // Menu dialog should open
    const menuDialog = page.locator('[role="dialog"]');
    await expect(menuDialog).toBeVisible({ timeout: 5000 });

    // Should contain request type items
    const leaveOption = menuDialog.locator('text=휴가 신청').first();
    await expect(leaveOption).toBeVisible();

    await ss(page, 'T5-3_requests_menu_opened');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T5-4: "휴가 신청" 선택 - Dialog 열림 및 휴가 유형 목록 확인 후 취소', async ({
    page,
    context,
  }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/requests`);
    await page.waitForLoadState('networkidle');

    const fab = page.locator('button[aria-label="요청 신청"]');
    await fab.click();

    const menuDialog = page.locator('[role="dialog"]');
    await expect(menuDialog).toBeVisible({ timeout: 5000 });

    // Select 휴가 신청 from menu
    const leaveOption = menuDialog.locator('text=휴가 신청').first();
    await leaveOption.click();

    // Leave dialog should now be open — target by aria name to avoid strict mode collision
    const leaveDialog = page.getByRole('dialog', { name: '휴가 신청' });
    await expect(leaveDialog).toBeVisible({ timeout: 5000 });

    // Verify dialog title
    const dialogTitle = leaveDialog.locator('h2, [class*="MuiDialogTitle"]').first();
    const titleText = await dialogTitle.textContent();
    expect(titleText).toContain('휴가 신청');

    // Verify 휴가 유형 select field is present
    const selectLabel = leaveDialog.locator('label:has-text("휴가 유형")').first();
    await expect(selectLabel).toBeVisible();

    await ss(page, 'T5-4_requests_leave_dialog_opened');

    // Cancel — click cancel inside the leave dialog specifically
    const cancelBtn = leaveDialog.locator('button').filter({ hasText: '취소' }).first();
    await cancelBtn.click();

    await expect(leaveDialog).not.toBeVisible({ timeout: 5000 });
    await ss(page, 'T5-4_requests_leave_dialog_cancelled');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});

// ─── T6: My Messages (/me/messages) ──────────────────────────────────────────

test.describe('T6: My Messages (/me/messages)', () => {
  test('T6-1: 메시지 목록 로드 - 빈 상태 정상 표시', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/messages`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T6-1_messages_loaded');

    const heading = page.locator('h6, h5').filter({ hasText: '내 메시지' }).first();
    await expect(heading).toBeVisible();

    // Either messages list or empty state message — no crash
    const body = await page.textContent('body');
    const hasContent =
      body?.includes('받은 메시지가 없습니다') ||
      body?.includes('메시지가 없') ||
      (await page.locator('[class*="MuiCard"]').count()) > 0;

    expect(hasContent).toBeTruthy();

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});

// ─── T7: My Profile (/me/profile) ─────────────────────────────────────────────

test.describe('T7: My Profile (/me/profile)', () => {
  test('T7-1: 이름/전화 필드 로드 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/profile`);
    await page.waitForLoadState('networkidle');

    await ss(page, 'T7-1_profile_loaded');

    const heading = page.locator('h6, h5').filter({ hasText: '내 프로필' }).first();
    await expect(heading).toBeVisible();

    // Name field
    const nameLabel = page.locator('label:has-text("이름")').first();
    await expect(nameLabel).toBeVisible();

    // Phone field
    const phoneLabel = page.locator('label:has-text("전화번호")').first();
    await expect(phoneLabel).toBeVisible();

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T7-2: 이름 변경 후 저장 버튼 클릭 - Snackbar 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/profile`);
    await page.waitForLoadState('networkidle');

    // Find name input via label
    const nameInput = page.locator('input').filter({ has: page.locator('..') }).nth(0);
    // More reliable: find by label association
    const nameField = page.locator('label:has-text("이름") ~ div input, label:has-text("이름") + div input').first();
    const fallbackNameField = page.locator('input[type="text"]').first();

    const targetInput = (await nameField.count()) > 0 ? nameField : fallbackNameField;

    // Read current value and append a character to trigger change
    const currentName = await targetInput.inputValue();
    await targetInput.fill(currentName.length > 0 ? currentName : '테스트직원');

    const saveBtn = page.locator('button').filter({ hasText: '저장' }).first();
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Snackbar should appear (success or error)
    const snackbar = page.locator('[role="alert"]').first();
    await expect(snackbar).toBeVisible({ timeout: 10000 });

    await ss(page, 'T7-2_profile_save_snackbar');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });

  test('T7-3: 비밀번호 변경 폼 입력 확인 및 로그아웃 버튼 확인', async ({ page, context }) => {
    await loginEmployee(context, page);
    const { consoleErrors, networkErrors } = attachCollectors(page);

    await page.goto(`${BASE_URL}/me/profile`);
    await page.waitForLoadState('networkidle');

    // Password change section
    const pwChangeLabel = page.locator('text=비밀번호 변경').first();
    await expect(pwChangeLabel).toBeVisible();

    // Current password field
    const currentPwField = page.locator('input[type="password"]').nth(0);
    await expect(currentPwField).toBeVisible();
    await currentPwField.fill('employee1234!');

    // New password field
    const newPwField = page.locator('input[type="password"]').nth(1);
    await expect(newPwField).toBeVisible();
    await newPwField.fill('newpass123!');

    // Confirm password field
    const confirmPwField = page.locator('input[type="password"]').nth(2);
    await expect(confirmPwField).toBeVisible();
    await confirmPwField.fill('newpass123!');

    await ss(page, 'T7-3_profile_password_form_filled');

    // Logout button
    const logoutBtn = page.locator('button').filter({ hasText: '로그아웃' }).first();
    await expect(logoutBtn).toBeVisible();

    await ss(page, 'T7-3_profile_logout_button_visible');

    if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors);
    if (networkErrors.length > 0) console.log('Network errors:', networkErrors);
  });
});
