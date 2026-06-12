/**
 * AbleWork ERP - Full Screen Check
 * Tests all admin and employee screens to verify implementation status
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots/fullcheck');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

interface ScreenCheckResult {
  url: string;
  httpStatus: number;
  screenState: 'FUNCTIONAL' | 'PLACEHOLDER' | '404' | 'ERROR' | 'LOADING_ERROR';
  mainElements: string[];
  screenshotPath: string;
  notes?: string;
}

const results: ScreenCheckResult[] = [];

async function ss(page: Page, name: string) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function getTokens(page: Page, email: string, password: string) {
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

async function injectAuthCookies(context: BrowserContext, email: string, password: string, page: Page) {
  const { accessToken, refreshToken } = await getTokens(page, email, password);
  await context.addCookies([
    { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
  ]);
  return { accessToken, refreshToken };
}

async function checkScreen(
  page: Page,
  url: string,
  screenshotName: string,
): Promise<ScreenCheckResult> {
  try {
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    const httpStatus = response?.status() || 0;
    
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    const screenshotPath = await ss(page, screenshotName);

    // Detect screen state
    let screenState: 'FUNCTIONAL' | 'PLACEHOLDER' | '404' | 'ERROR' | 'LOADING_ERROR' = 'FUNCTIONAL';
    const pageText = await page.textContent('body');
    
    if (httpStatus === 404 || pageText?.includes('404') || pageText?.includes('not found')) {
      screenState = '404';
    } else if (httpStatus >= 500) {
      screenState = 'ERROR';
    } else if (pageText?.includes('Loading') || pageText?.includes('placeholder')) {
      screenState = 'PLACEHOLDER';
    }

    // Collect main UI elements
    const mainElements: string[] = [];
    
    // Check for common UI patterns
    const buttons = await page.locator('button').count();
    if (buttons > 0) mainElements.push(`Buttons: ${buttons}`);
    
    const tables = await page.locator('table').count();
    if (tables > 0) mainElements.push(`Tables: ${tables}`);
    
    const forms = await page.locator('form').count();
    if (forms > 0) mainElements.push(`Forms: ${forms}`);
    
    const headings = await page.locator('h1, h2, h3').count();
    if (headings > 0) mainElements.push(`Headings: ${headings}`);
    
    const links = await page.locator('a').count();
    if (links > 0) mainElements.push(`Links: ${links}`);
    
    const inputs = await page.locator('input').count();
    if (inputs > 0) mainElements.push(`Inputs: ${inputs}`);

    return {
      url,
      httpStatus,
      screenState,
      mainElements,
      screenshotPath,
    };
  } catch (error) {
    const screenshotPath = await ss(page, screenshotName).catch(() => 'failed');
    return {
      url,
      httpStatus: 0,
      screenState: 'LOADING_ERROR',
      mainElements: [],
      screenshotPath,
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN SCREENS
// ─────────────────────────────────────────────────────────────

test.describe('ADMIN SCREENS', () => {
  let adminEmail = 'admin@ablework.io';
  let adminPassword = 'admin1234!';

  test('Admin: Dashboard, Employees, Positions, Shifts, Attendances, Leaves, Requests', async ({
    page,
    context,
  }) => {
    // Login admin
    await injectAuthCookies(context, adminEmail, adminPassword, page);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Admin Dashboard
    let result = await checkScreen(page, `${BASE_URL}/admin/dashboard`, 'admin_001_dashboard');
    results.push(result);
    console.log(`✓ /admin/dashboard - ${result.screenState}`);

    // Admin Organizations
    result = await checkScreen(page, `${BASE_URL}/admin/organizations`, 'admin_002_organizations');
    results.push(result);
    console.log(`✓ /admin/organizations - ${result.screenState}`);

    // Admin Employees
    result = await checkScreen(page, `${BASE_URL}/admin/employees`, 'admin_003_employees');
    results.push(result);
    console.log(`✓ /admin/employees - ${result.screenState}`);

    // Get first employee ID for detail screen
    // Try to extract from the table/list
    const employeeLinks = await page.locator('a[href*="/admin/employees/"]').first();
    const employeeHref = await employeeLinks.getAttribute('href').catch(() => null);
    if (employeeHref) {
      result = await checkScreen(page, `${BASE_URL}${employeeHref}`, 'admin_004_employee_detail');
      results.push(result);
      console.log(`✓ /admin/employees/[id] - ${result.screenState}`);
    } else {
      // Try with a dummy ID
      result = await checkScreen(
        page,
        `${BASE_URL}/admin/employees/test-id`,
        'admin_004_employee_detail_dummy',
      );
      results.push(result);
      console.log(`✓ /admin/employees/[dummy-id] - ${result.screenState}`);
    }

    // Admin Positions
    result = await checkScreen(page, `${BASE_URL}/admin/positions`, 'admin_005_positions');
    results.push(result);
    console.log(`✓ /admin/positions - ${result.screenState}`);

    // Admin Timeclock Areas
    result = await checkScreen(page, `${BASE_URL}/admin/timeclock-areas`, 'admin_006_timeclock_areas');
    results.push(result);
    console.log(`✓ /admin/timeclock-areas - ${result.screenState}`);

    // Admin Shifts
    result = await checkScreen(page, `${BASE_URL}/admin/shifts`, 'admin_007_shifts');
    results.push(result);
    console.log(`✓ /admin/shifts - ${result.screenState}`);

    // Admin Shift Types
    result = await checkScreen(page, `${BASE_URL}/admin/shifts/types`, 'admin_008_shifts_types');
    results.push(result);
    console.log(`✓ /admin/shifts/types - ${result.screenState}`);

    // Admin Shift Templates
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/shifts/templates`,
      'admin_009_shifts_templates',
    );
    results.push(result);
    console.log(`✓ /admin/shifts/templates - ${result.screenState}`);

    // Admin Shift Patterns
    result = await checkScreen(page, `${BASE_URL}/admin/shifts/patterns`, 'admin_010_shifts_patterns');
    results.push(result);
    console.log(`✓ /admin/shifts/patterns - ${result.screenState}`);

    // Admin Attendances
    result = await checkScreen(page, `${BASE_URL}/admin/attendances`, 'admin_011_attendances');
    results.push(result);
    console.log(`✓ /admin/attendances - ${result.screenState}`);

    // Admin Attendances Now
    result = await checkScreen(page, `${BASE_URL}/admin/attendances/now`, 'admin_012_attendances_now');
    results.push(result);
    console.log(`✓ /admin/attendances/now - ${result.screenState}`);

    // Admin Leave Types
    result = await checkScreen(page, `${BASE_URL}/admin/leave/types`, 'admin_013_leave_types');
    results.push(result);
    console.log(`✓ /admin/leave/types - ${result.screenState}`);

    // Admin Leave Accrual Rules
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/leave/accrual-rules`,
      'admin_014_leave_accrual_rules',
    );
    results.push(result);
    console.log(`✓ /admin/leave/accrual-rules - ${result.screenState}`);

    // Admin Leave Status
    result = await checkScreen(page, `${BASE_URL}/admin/leave/status`, 'admin_015_leave_status');
    results.push(result);
    console.log(`✓ /admin/leave/status - ${result.screenState}`);

    // Admin Requests
    result = await checkScreen(page, `${BASE_URL}/admin/requests`, 'admin_016_requests');
    results.push(result);
    console.log(`✓ /admin/requests - ${result.screenState}`);

    // Admin Request Rules
    result = await checkScreen(page, `${BASE_URL}/admin/requests/rules`, 'admin_017_requests_rules');
    results.push(result);
    console.log(`✓ /admin/requests/rules - ${result.screenState}`);

    // Admin Approval Forms
    result = await checkScreen(page, `${BASE_URL}/admin/approval/forms`, 'admin_018_approval_forms');
    results.push(result);
    console.log(`✓ /admin/approval/forms - ${result.screenState}`);

    // Admin Reports
    result = await checkScreen(page, `${BASE_URL}/admin/reports`, 'admin_019_reports');
    results.push(result);
    console.log(`✓ /admin/reports - ${result.screenState}`);

    // Admin Reports Standardization
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/reports/standardization`,
      'admin_020_reports_standardization',
    );
    results.push(result);
    console.log(`✓ /admin/reports/standardization - ${result.screenState}`);

    // Admin Reports Snapshots
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/reports/snapshots`,
      'admin_021_reports_snapshots',
    );
    results.push(result);
    console.log(`✓ /admin/reports/snapshots - ${result.screenState}`);

    // Admin Messages
    result = await checkScreen(page, `${BASE_URL}/admin/messages`, 'admin_022_messages');
    results.push(result);
    console.log(`✓ /admin/messages - ${result.screenState}`);

    // Admin Messages Automations
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/messages/automations`,
      'admin_023_messages_automations',
    );
    results.push(result);
    console.log(`✓ /admin/messages/automations - ${result.screenState}`);

    // Admin Settings Notifications
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/settings/notifications`,
      'admin_024_settings_notifications',
    );
    results.push(result);
    console.log(`✓ /admin/settings/notifications - ${result.screenState}`);

    // Admin Settings Company
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/settings/company`,
      'admin_025_settings_company',
    );
    results.push(result);
    console.log(`✓ /admin/settings/company - ${result.screenState}`);

    // Admin Settings Permissions
    result = await checkScreen(
      page,
      `${BASE_URL}/admin/settings/permissions`,
      'admin_026_settings_permissions',
    );
    results.push(result);
    console.log(`✓ /admin/settings/permissions - ${result.screenState}`);
  });
});

// ─────────────────────────────────────────────────────────────
// EMPLOYEE SCREENS
// ─────────────────────────────────────────────────────────────

test.describe('EMPLOYEE SCREENS', () => {
  let employeeEmail = 'employee@ablework.io';
  let employeePassword = 'employee1234!';

  test('Employee: Home, Shifts, Attendances, Leaves, Requests, Messages, Profile', async ({
    page,
    context,
  }) => {
    // Login employee
    await injectAuthCookies(context, employeeEmail, employeePassword, page);
    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');

    // Employee Home
    let result = await checkScreen(page, `${BASE_URL}/me/home`, 'employee_001_home');
    results.push(result);
    console.log(`✓ /me/home - ${result.screenState}`);

    // Employee Shifts
    result = await checkScreen(page, `${BASE_URL}/me/shifts`, 'employee_002_shifts');
    results.push(result);
    console.log(`✓ /me/shifts - ${result.screenState}`);

    // Employee Attendances
    result = await checkScreen(page, `${BASE_URL}/me/attendances`, 'employee_003_attendances');
    results.push(result);
    console.log(`✓ /me/attendances - ${result.screenState}`);

    // Employee Leaves
    result = await checkScreen(page, `${BASE_URL}/me/leaves`, 'employee_004_leaves');
    results.push(result);
    console.log(`✓ /me/leaves - ${result.screenState}`);

    // Employee Requests
    result = await checkScreen(page, `${BASE_URL}/me/requests`, 'employee_005_requests');
    results.push(result);
    console.log(`✓ /me/requests - ${result.screenState}`);

    // Employee Messages
    result = await checkScreen(page, `${BASE_URL}/me/messages`, 'employee_006_messages');
    results.push(result);
    console.log(`✓ /me/messages - ${result.screenState}`);

    // Employee Profile
    result = await checkScreen(page, `${BASE_URL}/me/profile`, 'employee_007_profile');
    results.push(result);
    console.log(`✓ /me/profile - ${result.screenState}`);
  });
});

// ─────────────────────────────────────────────────────────────
// Generate Summary Report
// ─────────────────────────────────────────────────────────────

test.describe('SUMMARY REPORT', () => {
  test('Generate full check summary', async ({ page }) => {
    // Wait for all checks to complete
    await page.waitForTimeout(100);

    const reportPath = path.join(SCREENSHOTS_DIR, 'FULLCHECK_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Full check report saved to: ${reportPath}`);

    // Summary stats
    const functional = results.filter((r) => r.screenState === 'FUNCTIONAL').length;
    const placeholder = results.filter((r) => r.screenState === 'PLACEHOLDER').length;
    const notFound = results.filter((r) => r.screenState === '404').length;
    const error = results.filter((r) => r.screenState === 'ERROR').length;
    const loadingError = results.filter((r) => r.screenState === 'LOADING_ERROR').length;

    console.log('\n' + '='.repeat(60));
    console.log('FULLCHECK SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Screens: ${results.length}`);
    console.log(`✓ Functional: ${functional}`);
    console.log(`⚠ Placeholder: ${placeholder}`);
    console.log(`✗ 404 Not Found: ${notFound}`);
    console.log(`✗ Error: ${error}`);
    console.log(`✗ Loading Error: ${loadingError}`);
    console.log('='.repeat(60));

    // Detailed summary by category
    console.log('\nADMIN SCREENS:');
    results
      .filter((r) => r.url.includes('/admin'))
      .forEach((r) => {
        console.log(`  ${r.url}: ${r.screenState}`);
      });

    console.log('\nEMPLOYEE SCREENS:');
    results
      .filter((r) => r.url.includes('/me'))
      .forEach((r) => {
        console.log(`  ${r.url}: ${r.screenState}`);
      });

    expect(results.length).toBeGreaterThan(0);
  });
});
