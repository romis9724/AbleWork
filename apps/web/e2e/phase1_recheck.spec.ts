/**
 * AbleWork ERP - Phase 1 Re-check (6 fixed pages)
 * Verifies runtime errors are resolved after fixes.
 * Screenshots: e2e/screenshots/phase1-recheck/
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots/phase1-recheck');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

interface RecheckResult {
  url: string;
  role: 'admin' | 'employee';
  httpStatus: number;
  state: 'PASS' | 'FAIL' | 'ERROR';
  hasRuntimeError: boolean;
  errorDetails: string;
  pageTitle: string;
  contentSummary: string;
  screenshotFile: string;
  notes: string;
}

const recheckResults: RecheckResult[] = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

async function checkPageForErrors(
  page: Page,
  url: string,
  role: 'admin' | 'employee',
  screenshotName: string,
): Promise<RecheckResult> {
  let httpStatus = 0;
  let state: 'PASS' | 'FAIL' | 'ERROR' = 'PASS';
  let hasRuntimeError = false;
  let errorDetails = '';
  let pageTitle = '';
  let contentSummary = '';
  let notes = '';
  let screenshotFile = '';

  // Capture console errors
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    httpStatus = response?.status() ?? 0;

    // Wait for React hydration
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      notes = 'networkidle timeout';
    }

    // Extra settle time for async data fetching
    await page.waitForTimeout(2000);

    // Check for Next.js / React runtime error overlay
    const errorOverlaySelectors = [
      '[data-nextjs-dialog]',
      '[data-nextjs-dialog-overlay]',
      '#__next-error',
      '.nextjs-toast-errors',
      '[data-nextjs-toast-errors]',
    ];
    for (const sel of errorOverlaySelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        hasRuntimeError = true;
        const text = await page.locator(sel).first().textContent().catch(() => '');
        errorDetails += `[overlay: ${sel}] ${text?.trim().slice(0, 200)}\n`;
      }
    }

    // Check for visible error text patterns in the body
    const bodyText = (await page.textContent('body')) ?? '';
    const runtimeErrorPatterns = [
      /TypeError:/i,
      /ReferenceError:/i,
      /Cannot read propert/i,
      /is not a function/i,
      /is not defined/i,
      /Unhandled Runtime Error/i,
      /Application error/i,
      /An error occurred in the Server Components/i,
    ];
    for (const pattern of runtimeErrorPatterns) {
      if (pattern.test(bodyText)) {
        hasRuntimeError = true;
        const match = bodyText.match(pattern);
        if (match) {
          // Extract a snippet around the match
          const idx = bodyText.indexOf(match[0]);
          const snippet = bodyText.slice(Math.max(0, idx - 20), idx + 150).trim();
          errorDetails += `[body pattern] ${snippet}\n`;
        }
      }
    }

    // Collect significant console errors (filter out known noise)
    const significantErrors = consoleErrors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('Warning:') &&
        !e.includes('hydration') &&
        !e.includes('net::ERR_ABORTED'),
    );
    if (significantErrors.length > 0) {
      errorDetails += `[console errors] ${significantErrors.slice(0, 3).join(' | ')}\n`;
    }

    if (pageErrors.length > 0) {
      hasRuntimeError = true;
      errorDetails += `[page errors] ${pageErrors.slice(0, 3).join(' | ')}\n`;
    }

    // Extract page title
    const titleLocators = ['h5', 'h6', 'h1', 'h2', 'h3', 'h4'];
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

    // Content inventory
    const tables = await page.locator('table').count();
    const buttons = await page.locator('button').count();
    const forms = await page.locator('form').count();
    const cards = await page.locator('[class*="MuiCard"], [class*="MuiPaper"]').count();
    const parts: string[] = [];
    if (tables > 0) parts.push(`table:${tables}`);
    if (buttons > 0) parts.push(`btn:${buttons}`);
    if (forms > 0) parts.push(`form:${forms}`);
    if (cards > 0) parts.push(`card:${cards}`);
    contentSummary = parts.join(', ') || 'minimal content';

    // Determine overall state
    if (httpStatus >= 500) {
      state = 'FAIL';
      errorDetails = `HTTP ${httpStatus}\n` + errorDetails;
    } else if (hasRuntimeError) {
      state = 'FAIL';
    } else if (httpStatus === 200) {
      state = 'PASS';
    } else {
      state = 'ERROR';
    }

    screenshotFile = await screenshot(page, screenshotName);
  } catch (err) {
    state = 'ERROR';
    errorDetails = err instanceof Error ? err.message : String(err);
    screenshotFile = await screenshot(page, screenshotName).catch(() => 'screenshot-failed');
  }

  const result: RecheckResult = {
    url,
    role,
    httpStatus,
    state,
    hasRuntimeError,
    errorDetails: errorDetails.trim(),
    pageTitle,
    contentSummary,
    screenshotFile: path.basename(screenshotFile),
    notes,
  };

  recheckResults.push(result);

  const icon = state === 'PASS' ? 'PASS' : 'FAIL';
  const errorFlag = hasRuntimeError ? ' [RUNTIME ERROR]' : '';
  console.log(`  [${icon}${errorFlag}] ${url}`);
  if (pageTitle) console.log(`        title: ${pageTitle}`);
  if (contentSummary) console.log(`        content: ${contentSummary}`);
  if (errorDetails) console.log(`        error: ${errorDetails.slice(0, 300)}`);

  return result;
}

// ─── Admin pages recheck ─────────────────────────────────────────────────────

test.describe('Phase 1 Recheck — Admin pages (5)', () => {
  test('recheck 5 fixed admin pages', async ({ page, context }) => {
    await injectSession(context, page, 'admin@ablework.io', 'admin1234!');
    // Warm up
    await page.goto(`${BASE_URL}/admin/dashboard`, { waitUntil: 'networkidle' });

    const adminPages: [string, string][] = [
      [`${BASE_URL}/admin/attendances/now`, 'recheck_01_attendances_now'],
      [`${BASE_URL}/admin/reports/snapshots`, 'recheck_02_reports_snapshots'],
      [`${BASE_URL}/admin/messages/automations`, 'recheck_03_messages_automations'],
      [`${BASE_URL}/admin/settings/notifications`, 'recheck_04_settings_notifications'],
      [`${BASE_URL}/admin/messages`, 'recheck_05_messages'],
    ];

    console.log('\n=== ADMIN RECHECK ===');
    for (const [url, name] of adminPages) {
      // Remove stale listeners between pages
      page.removeAllListeners('console');
      page.removeAllListeners('pageerror');
      await checkPageForErrors(page, url, 'admin', name);
    }

    const adminRecheckResults = recheckResults.filter((r) => r.role === 'admin');
    expect(adminRecheckResults.length).toBe(5);
  });
});

// ─── Employee /me/messages recheck ───────────────────────────────────────────

test.describe('Phase 1 Recheck — Employee /me/messages (1)', () => {
  test('recheck /me/messages as employee', async ({ page, context }) => {
    await injectSession(context, page, 'employee@ablework.io', 'employee1234!');
    await page.goto(`${BASE_URL}/me/home`, { waitUntil: 'networkidle' });

    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');

    console.log('\n=== EMPLOYEE RECHECK ===');
    await checkPageForErrors(
      page,
      `${BASE_URL}/me/messages`,
      'employee',
      'recheck_06_me_messages',
    );

    const empResults = recheckResults.filter((r) => r.role === 'employee');
    expect(empResults.length).toBe(1);
  });
});

// ─── Summary ─────────────────────────────────────────────────────────────────

test.describe('Phase 1 Recheck — Summary', () => {
  test('print final recheck summary', async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pass = recheckResults.filter((r) => r.state === 'PASS');
    const fail = recheckResults.filter((r) => r.state === 'FAIL' || r.state === 'ERROR');

    const divider = '─'.repeat(80);
    console.log('\n' + '═'.repeat(80));
    console.log('PHASE 1 RECHECK — FINAL SUMMARY');
    console.log('═'.repeat(80));

    console.log('\n[PASS] ' + pass.length + ' pages');
    for (const r of pass) {
      const urlShort = r.url.replace('http://localhost:3000', '');
      console.log(`  ✓ ${urlShort}  (${r.contentSummary})`);
    }

    console.log('\n[FAIL/ERROR] ' + fail.length + ' pages');
    for (const r of fail) {
      const urlShort = r.url.replace('http://localhost:3000', '');
      console.log(`  ✗ ${urlShort}  HTTP:${r.httpStatus}`);
      if (r.errorDetails) {
        console.log(`    Error: ${r.errorDetails.slice(0, 400)}`);
      }
    }

    console.log('\n' + divider);
    console.log(
      `Total: 6  PASS: ${pass.length}  FAIL/ERROR: ${fail.length}`,
    );
    console.log(divider);

    // Save JSON
    const reportPath = path.join(SCREENSHOTS_DIR, 'PHASE1_RECHECK_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(recheckResults, null, 2));
    console.log(`\nReport saved: ${reportPath}`);

    expect(recheckResults.length).toBe(6);
  });
});
