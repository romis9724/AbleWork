/**
 * AbleWork ERP - Phase 1 Final Screen Survey
 * Full coverage: 27 Admin + 7 Me = 34 screens
 * Screenshots saved to: e2e/screenshots/phase1-final/
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots/phase1-final');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

type ScreenState = 'PASS' | '404' | '500' | 'PLACEHOLDER' | 'ERROR';

interface ScreenResult {
  no: number;
  url: string;
  role: 'admin' | 'employee';
  httpStatus: number;
  state: ScreenState;
  pageTitle: string;
  contentSummary: string;
  screenshotFile: string;
  notes: string;
}

const allResults: ScreenResult[] = [];

// ─── helpers ────────────────────────────────────────────────────────────────

async function screenshot(page: Page, name: string): Promise<string> {
  const file = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

async function getAuthTokens(page: Page, email: string, password: string) {
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  return {
    accessToken: body?.data?.accessToken as string,
    refreshToken: body?.data?.refreshToken as string,
  };
}

async function injectSession(
  context: BrowserContext,
  page: Page,
  email: string,
  password: string,
) {
  const { accessToken, refreshToken } = await getAuthTokens(page, email, password);
  await context.addCookies([
    { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
  ]);
}

async function checkPage(
  page: Page,
  no: number,
  url: string,
  role: 'admin' | 'employee',
  screenshotName: string,
): Promise<ScreenResult> {
  let httpStatus = 0;
  let state: ScreenState = 'PASS';
  let pageTitle = '';
  let contentSummary = '';
  let notes = '';
  let screenshotFile = '';

  try {
    // Use domcontentloaded first, then wait for network with a short extra settle
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    httpStatus = response?.status() ?? 0;

    // Give React/Next.js time to render without waiting indefinitely for network
    try {
      await page.waitForLoadState('networkidle', { timeout: 8000 });
    } catch {
      // networkidle timed out — page may have long-polling; proceed anyway
      notes = 'networkidle timeout (long-poll?)';
    }

    // Extract page title from MUI Typography h5/h6 or heading elements
    const titleLocators = [
      'h5',
      'h6',
      '[class*="MuiTypography-h5"]',
      '[class*="MuiTypography-h6"]',
      'h1',
      'h2',
      'h3',
      'h4',
    ];
    for (const sel of titleLocators) {
      const el = page.locator(sel).first();
      if ((await el.count()) > 0) {
        const text = await el.textContent().catch(() => '');
        if (text && text.trim().length > 0) {
          pageTitle = text.trim();
          break;
        }
      }
    }

    // Content summary
    const tables = await page.locator('table').count();
    const buttons = await page.locator('button').count();
    const forms = await page.locator('form').count();
    const cards = await page.locator('[class*="MuiCard"], [class*="MuiPaper"]').count();
    const chips = await page.locator('[class*="MuiChip"]').count();

    const parts: string[] = [];
    if (tables > 0) parts.push(`table:${tables}`);
    if (buttons > 0) parts.push(`btn:${buttons}`);
    if (forms > 0) parts.push(`form:${forms}`);
    if (cards > 0) parts.push(`card:${cards}`);
    if (chips > 0) parts.push(`chip:${chips}`);
    contentSummary = parts.join(', ') || 'no major elements';

    // Determine state
    if (httpStatus === 404) {
      state = '404';
    } else if (httpStatus >= 500) {
      state = '500';
    } else if (httpStatus === 200) {
      // Check for placeholder / empty patterns
      const bodyText = (await page.textContent('body')) ?? '';
      const lowerText = bodyText.toLowerCase();
      const hasPlaceholderText =
        lowerText.includes('coming soon') ||
        lowerText.includes('준비 중') ||
        lowerText.includes('placeholder') ||
        lowerText.includes('under construction') ||
        lowerText.includes('not implemented');

      // Very few interactive elements — likely a skeleton/placeholder layout
      const veryEmpty = tables === 0 && buttons <= 3 && forms === 0 && cards <= 2;

      if (hasPlaceholderText) {
        state = 'PLACEHOLDER';
        notes = 'placeholder text detected';
      } else if (veryEmpty) {
        state = 'PLACEHOLDER';
        notes = 'minimal content (likely placeholder layout)';
      } else {
        state = 'PASS';
      }
    } else {
      state = 'ERROR';
      notes = `unexpected status ${httpStatus}`;
    }

    screenshotFile = await screenshot(page, screenshotName);
  } catch (err) {
    state = 'ERROR';
    notes = err instanceof Error ? err.message : String(err);
    screenshotFile = await screenshot(page, screenshotName).catch(() => 'screenshot-failed');
  }

  const result: ScreenResult = {
    no,
    url,
    role,
    httpStatus,
    state,
    pageTitle,
    contentSummary,
    screenshotFile: path.basename(screenshotFile),
    notes,
  };

  allResults.push(result);
  const icon = state === 'PASS' ? 'PASS' : `FAIL(${state})`;
  console.log(`  [${String(no).padStart(2, '0')}] ${icon.padEnd(14)} ${url}`);
  if (notes) console.log(`        note: ${notes}`);

  return result;
}

// ─── Admin Test ──────────────────────────────────────────────────────────────

test.describe('Phase 1 — Admin Screens (27)', () => {
  test('survey all admin URLs', async ({ page, context }) => {
    await injectSession(context, page, 'admin@ablework.io', 'admin1234!');
    // Warm-up navigate to ensure session is applied
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });

    const adminUrls: [string, string][] = [
      [`${BASE_URL}/admin/dashboard`, 'admin_01_dashboard'],
      [`${BASE_URL}/admin/organizations`, 'admin_02_organizations'],
      [`${BASE_URL}/admin/employees`, 'admin_03_employees'],
      [`${BASE_URL}/admin/employees/seed-emp-001`, 'admin_04_employee_detail'],
      [`${BASE_URL}/admin/positions`, 'admin_05_positions'],
      [`${BASE_URL}/admin/timeclock-areas`, 'admin_06_timeclock_areas'],
      [`${BASE_URL}/admin/shifts`, 'admin_07_shifts'],
      [`${BASE_URL}/admin/shifts/types`, 'admin_08_shifts_types'],
      [`${BASE_URL}/admin/shifts/templates`, 'admin_09_shifts_templates'],
      [`${BASE_URL}/admin/shifts/patterns`, 'admin_10_shifts_patterns'],
      [`${BASE_URL}/admin/attendances`, 'admin_11_attendances'],
      [`${BASE_URL}/admin/attendances/now`, 'admin_12_attendances_now'],
      [`${BASE_URL}/admin/leave/types`, 'admin_13_leave_types'],
      [`${BASE_URL}/admin/leave/accrual-rules`, 'admin_14_leave_accrual_rules'],
      [`${BASE_URL}/admin/leave/status`, 'admin_15_leave_status'],
      [`${BASE_URL}/admin/leave/compensation`, 'admin_16_leave_compensation'],
      [`${BASE_URL}/admin/requests`, 'admin_17_requests'],
      [`${BASE_URL}/admin/requests/rules`, 'admin_18_requests_rules'],
      [`${BASE_URL}/admin/requests/custom-types`, 'admin_19_requests_custom_types'],
      [`${BASE_URL}/admin/approval/forms`, 'admin_20_approval_forms'],
      [`${BASE_URL}/admin/reports`, 'admin_21_reports'],
      [`${BASE_URL}/admin/reports/standardization`, 'admin_22_reports_standardization'],
      [`${BASE_URL}/admin/reports/snapshots`, 'admin_23_reports_snapshots'],
      [`${BASE_URL}/admin/messages`, 'admin_24_messages'],
      [`${BASE_URL}/admin/messages/automations`, 'admin_25_messages_automations'],
      [`${BASE_URL}/admin/settings/notifications`, 'admin_26_settings_notifications'],
      [`${BASE_URL}/admin/settings/company`, 'admin_27_settings_company'],
      [`${BASE_URL}/admin/settings/permissions`, 'admin_28_settings_permissions'],
    ];

    console.log('\n=== ADMIN SCREENS ===');
    for (let i = 0; i < adminUrls.length; i++) {
      const [url, name] = adminUrls[i];
      await checkPage(page, i + 1, url, 'admin', name);
    }

    expect(allResults.filter((r) => r.role === 'admin').length).toBeGreaterThan(0);
  });
});

// ─── Employee Test ───────────────────────────────────────────────────────────

test.describe('Phase 1 — Me (Employee) Screens (7)', () => {
  test('survey all /me URLs', async ({ page, context }) => {
    await injectSession(context, page, 'employee@ablework.io', 'employee1234!');
    await page.goto(`${BASE_URL}/me/home`, { waitUntil: 'networkidle' });

    const meUrls: [string, string][] = [
      [`${BASE_URL}/me/home`, 'me_01_home'],
      [`${BASE_URL}/me/shifts`, 'me_02_shifts'],
      [`${BASE_URL}/me/attendances`, 'me_03_attendances'],
      [`${BASE_URL}/me/leaves`, 'me_04_leaves'],
      [`${BASE_URL}/me/requests`, 'me_05_requests'],
      [`${BASE_URL}/me/messages`, 'me_06_messages'],
      [`${BASE_URL}/me/profile`, 'me_07_profile'],
    ];

    console.log('\n=== ME (EMPLOYEE) SCREENS ===');
    for (let i = 0; i < meUrls.length; i++) {
      const [url, name] = meUrls[i];
      await checkPage(page, i + 1, url, 'employee', name);
    }

    expect(allResults.filter((r) => r.role === 'employee').length).toBeGreaterThan(0);
  });
});

// ─── Summary Report ──────────────────────────────────────────────────────────

test.describe('Phase 1 — Summary Report', () => {
  test('print pass/fail table and save JSON', async () => {
    // Brief pause to ensure prior test results are in allResults
    await new Promise((resolve) => setTimeout(resolve, 100));

    const adminResults = allResults.filter((r) => r.role === 'admin');
    const meResults = allResults.filter((r) => r.role === 'employee');

    const pass = allResults.filter((r) => r.state === 'PASS').length;
    const notFound = allResults.filter((r) => r.state === '404').length;
    const serverError = allResults.filter((r) => r.state === '500').length;
    const placeholder = allResults.filter((r) => r.state === 'PLACEHOLDER').length;
    const error = allResults.filter((r) => r.state === 'ERROR').length;
    const total = allResults.length;

    const divider = '─'.repeat(80);

    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 1 FINAL CHECK — RESULTS TABLE');
    console.log('═'.repeat(80));
    console.log(
      `${'No'.padEnd(4)} ${'State'.padEnd(14)} ${'HTTP'.padEnd(6)} ${'URL'.padEnd(48)} ${'Title'}`,
    );
    console.log(divider);

    for (const r of allResults) {
      const stateLabel =
        r.state === 'PASS'
          ? 'PASS'
          : r.state === '404'
            ? 'FAIL-404'
            : r.state === '500'
              ? 'FAIL-500'
              : r.state === 'PLACEHOLDER'
                ? 'PLACEHOLDER'
                : 'ERROR';
      const urlShort = r.url.replace('http://localhost:3000', '');
      console.log(
        `${String(r.no).padStart(2).padEnd(4)} ${stateLabel.padEnd(14)} ${String(r.httpStatus).padEnd(6)} ${urlShort.padEnd(48)} ${r.pageTitle || '(no title)'}`,
      );
    }

    console.log(divider);
    console.log(`Total: ${total}  PASS: ${pass}  404: ${notFound}  500: ${serverError}  PLACEHOLDER: ${placeholder}  ERROR: ${error}`);

    console.log('\n--- 404 URLs ---');
    allResults
      .filter((r) => r.state === '404')
      .forEach((r) => console.log(`  ${r.url}`));

    console.log('\n--- 500 URLs ---');
    allResults
      .filter((r) => r.state === '500')
      .forEach((r) => console.log(`  ${r.url}`));

    console.log('\n--- PLACEHOLDER URLs ---');
    allResults
      .filter((r) => r.state === 'PLACEHOLDER')
      .forEach((r) => console.log(`  ${r.url}  [${r.notes}]`));

    console.log('\n--- ERROR URLs ---');
    allResults
      .filter((r) => r.state === 'ERROR')
      .forEach((r) => console.log(`  ${r.url}  [${r.notes}]`));

    // Save JSON report
    const reportPath = path.join(SCREENSHOTS_DIR, 'PHASE1_FINAL_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
    console.log(`\nJSON report saved: ${reportPath}`);

    // Always pass — this is a survey, not a gating test
    expect(total).toBeGreaterThan(0);
  });
});
