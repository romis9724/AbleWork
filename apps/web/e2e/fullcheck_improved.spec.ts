/**
 * AbleWork ERP - Comprehensive Full Screen Check
 * Tests all admin and employee screens with better error handling
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
  screenState: 'FUNCTIONAL' | 'PLACEHOLDER' | '404' | 'ERROR' | 'NAVIGATION_ERROR' | 'REDIRECTED';
  mainElements: string[];
  screenshotPath: string;
  actualUrl?: string;
  notes?: string;
}

const results: ScreenCheckResult[] = [];

async function ss(page: Page, name: string) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function loginViaUI(page: Page, email: string, password: string) {
  console.log(`\n>>> Logging in as: ${email}`);
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);

  const loginDone = page.waitForResponse(
    (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
    { timeout: 15000 },
  );
  
  await page.locator('button[type="submit"]').click();
  await loginDone;
  
  // Wait for navigation
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 10000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  
  const currentUrl = page.url();
  console.log(`>>> Login successful, redirected to: ${currentUrl}`);
  return currentUrl;
}

async function checkScreen(
  page: Page,
  url: string,
  screenshotName: string,
  category: string = '',
): Promise<ScreenCheckResult> {
  const shortUrl = url.replace(BASE_URL, '');
  console.log(`  → Checking: ${shortUrl}`);

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const httpStatus = response?.status() || 0;
    const actualUrl = page.url();
    
    await page.waitForLoadState('networkidle').catch(() => {});
    
    // Take screenshot
    const screenshotPath = await ss(page, screenshotName);

    // Detect screen state based on HTTP status and URL changes
    let screenState: ScreenCheckResult['screenState'] = 'FUNCTIONAL';
    
    if (actualUrl.includes('/login')) {
      screenState = 'REDIRECTED';
    } else if (httpStatus === 404) {
      screenState = '404';
    } else if (httpStatus >= 500) {
      screenState = 'ERROR';
    } else if (httpStatus === 200) {
      screenState = 'FUNCTIONAL';
    }

    // Collect main UI elements
    const mainElements: string[] = [];
    
    try {
      const buttons = await page.locator('button').count();
      if (buttons > 0) mainElements.push(`Buttons: ${buttons}`);
      
      const tables = await page.locator('table').count();
      if (tables > 0) mainElements.push(`Tables: ${tables}`);
      
      const forms = await page.locator('form').count();
      if (forms > 0) mainElements.push(`Forms: ${forms}`);
      
      const headings = await page.locator('h1, h2, h3').count();
      if (headings > 0) mainElements.push(`Headings: ${headings}`);
      
      const navItems = await page.locator('nav').count();
      if (navItems > 0) mainElements.push(`Nav: ${navItems}`);
    } catch (e) {
      // Ignore element count errors
    }

    return {
      url,
      httpStatus,
      screenState,
      mainElements,
      screenshotPath,
      actualUrl,
    };
  } catch (error) {
    const screenshotPath = await ss(page, `${screenshotName}_error`).catch(() => 'failed');
    return {
      url,
      httpStatus: 0,
      screenState: 'NAVIGATION_ERROR',
      mainElements: [],
      screenshotPath,
      notes: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN SCREENS
// ─────────────────────────────────────────────────────────────

test.describe('ADMIN SCREENS - PART 1', () => {
  test.setTimeout(120000);

  test('Check admin dashboard and core screens', async ({ page, context }) => {
    // Login admin
    await loginViaUI(page, 'admin@ablework.io', 'admin1234!');

    // Dashboard
    let result = await checkScreen(page, `${BASE_URL}/admin/dashboard`, 'admin_001_dashboard', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Organizations
    result = await checkScreen(page, `${BASE_URL}/admin/organizations`, 'admin_002_organizations', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Employees
    result = await checkScreen(page, `${BASE_URL}/admin/employees`, 'admin_003_employees', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Positions
    result = await checkScreen(page, `${BASE_URL}/admin/positions`, 'admin_005_positions', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Timeclock Areas
    result = await checkScreen(page, `${BASE_URL}/admin/timeclock-areas`, 'admin_006_timeclock_areas', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Shifts
    result = await checkScreen(page, `${BASE_URL}/admin/shifts`, 'admin_007_shifts', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Shift Types
    result = await checkScreen(page, `${BASE_URL}/admin/shifts/types`, 'admin_008_shifts_types', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Shift Templates
    result = await checkScreen(page, `${BASE_URL}/admin/shifts/templates`, 'admin_009_shifts_templates', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Shift Patterns
    result = await checkScreen(page, `${BASE_URL}/admin/shifts/patterns`, 'admin_010_shifts_patterns', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Attendances
    result = await checkScreen(page, `${BASE_URL}/admin/attendances`, 'admin_011_attendances', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);
  });
});

test.describe('ADMIN SCREENS - PART 2', () => {
  test.setTimeout(120000);

  test('Check admin leave and request screens', async ({ page }) => {
    // Re-login
    await loginViaUI(page, 'admin@ablework.io', 'admin1234!');

    // Attendances Now
    let result = await checkScreen(page, `${BASE_URL}/admin/attendances/now`, 'admin_012_attendances_now', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Leave Types
    result = await checkScreen(page, `${BASE_URL}/admin/leave/types`, 'admin_013_leave_types', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Leave Accrual Rules
    result = await checkScreen(page, `${BASE_URL}/admin/leave/accrual-rules`, 'admin_014_leave_accrual_rules', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Leave Status
    result = await checkScreen(page, `${BASE_URL}/admin/leave/status`, 'admin_015_leave_status', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Requests
    result = await checkScreen(page, `${BASE_URL}/admin/requests`, 'admin_016_requests', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Request Rules
    result = await checkScreen(page, `${BASE_URL}/admin/requests/rules`, 'admin_017_requests_rules', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Approval Forms
    result = await checkScreen(page, `${BASE_URL}/admin/approval/forms`, 'admin_018_approval_forms', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Reports
    result = await checkScreen(page, `${BASE_URL}/admin/reports`, 'admin_019_reports', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Reports Standardization
    result = await checkScreen(page, `${BASE_URL}/admin/reports/standardization`, 'admin_020_reports_standardization', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Reports Snapshots
    result = await checkScreen(page, `${BASE_URL}/admin/reports/snapshots`, 'admin_021_reports_snapshots', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);
  });
});

test.describe('ADMIN SCREENS - PART 3', () => {
  test.setTimeout(120000);

  test('Check admin settings screens', async ({ page }) => {
    // Re-login
    await loginViaUI(page, 'admin@ablework.io', 'admin1234!');

    // Messages
    let result = await checkScreen(page, `${BASE_URL}/admin/messages`, 'admin_022_messages', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Messages Automations
    result = await checkScreen(page, `${BASE_URL}/admin/messages/automations`, 'admin_023_messages_automations', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Settings Notifications
    result = await checkScreen(page, `${BASE_URL}/admin/settings/notifications`, 'admin_024_settings_notifications', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Settings Company
    result = await checkScreen(page, `${BASE_URL}/admin/settings/company`, 'admin_025_settings_company', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Settings Permissions
    result = await checkScreen(page, `${BASE_URL}/admin/settings/permissions`, 'admin_026_settings_permissions', 'admin');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);
  });
});

// ─────────────────────────────────────────────────────────────
// EMPLOYEE SCREENS
// ─────────────────────────────────────────────────────────────

test.describe('EMPLOYEE SCREENS', () => {
  test.setTimeout(120000);

  test('Check employee self-service screens', async ({ page }) => {
    // Login employee
    await loginViaUI(page, 'employee@ablework.io', 'employee1234!');

    // Home
    let result = await checkScreen(page, `${BASE_URL}/me/home`, 'employee_001_home', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Shifts
    result = await checkScreen(page, `${BASE_URL}/me/shifts`, 'employee_002_shifts', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Attendances
    result = await checkScreen(page, `${BASE_URL}/me/attendances`, 'employee_003_attendances', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Leaves
    result = await checkScreen(page, `${BASE_URL}/me/leaves`, 'employee_004_leaves', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Requests
    result = await checkScreen(page, `${BASE_URL}/me/requests`, 'employee_005_requests', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Messages
    result = await checkScreen(page, `${BASE_URL}/me/messages`, 'employee_006_messages', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);

    // Profile
    result = await checkScreen(page, `${BASE_URL}/me/profile`, 'employee_007_profile', 'employee');
    results.push(result);
    console.log(`    ✓ Status: ${result.screenState} (HTTP ${result.httpStatus})`);
  });
});

// ─────────────────────────────────────────────────────────────
// SUMMARY REPORT
// ─────────────────────────────────────────────────────────────

test.describe('SUMMARY REPORT', () => {
  test('Generate comprehensive full check summary', async ({ page }) => {
    // Write detailed report
    const reportPath = path.join(SCREENSHOTS_DIR, 'FULLCHECK_DETAILED_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

    // Generate CSV-style report
    const csvReport = [
      'URL,HTTP_STATUS,SCREEN_STATE,ELEMENTS_COUNT,ACTUAL_URL,NOTES',
      ...results.map(r => 
        `"${r.url}",${r.httpStatus},"${r.screenState}","${r.mainElements.join('; ')}","${r.actualUrl || ''}","${r.notes || ''}"`
      )
    ].join('\n');

    const csvPath = path.join(SCREENSHOTS_DIR, 'FULLCHECK_REPORT.csv');
    fs.writeFileSync(csvPath, csvReport);

    console.log(`\n✓ Detailed report saved to: ${reportPath}`);
    console.log(`✓ CSV report saved to: ${csvPath}`);

    // Summary stats
    const functional = results.filter((r) => r.screenState === 'FUNCTIONAL').length;
    const placeholder = results.filter((r) => r.screenState === 'PLACEHOLDER').length;
    const notFound = results.filter((r) => r.screenState === '404').length;
    const error = results.filter((r) => r.screenState === 'ERROR').length;
    const navError = results.filter((r) => r.screenState === 'NAVIGATION_ERROR').length;
    const redirected = results.filter((r) => r.screenState === 'REDIRECTED').length;

    console.log('\n' + '='.repeat(80));
    console.log('FULLCHECK COMPREHENSIVE SUMMARY'.padStart(50));
    console.log('='.repeat(80));
    console.log(`Total Screens Checked: ${results.length}`);
    console.log(`✓ Functional:        ${functional.toString().padStart(3)} (${((functional/results.length)*100).toFixed(1)}%)`);
    console.log(`⚠ Placeholder:       ${placeholder.toString().padStart(3)} (${((placeholder/results.length)*100).toFixed(1)}%)`);
    console.log(`✗ 404 Not Found:     ${notFound.toString().padStart(3)} (${((notFound/results.length)*100).toFixed(1)}%)`);
    console.log(`✗ Error:             ${error.toString().padStart(3)} (${((error/results.length)*100).toFixed(1)}%)`);
    console.log(`✗ Navigation Error:  ${navError.toString().padStart(3)} (${((navError/results.length)*100).toFixed(1)}%)`);
    console.log(`⟲ Redirected:        ${redirected.toString().padStart(3)} (${((redirected/results.length)*100).toFixed(1)}%)`);
    console.log('='.repeat(80));

    // Detailed breakdown by category
    const adminScreens = results.filter((r) => r.url.includes('/admin'));
    const employeeScreens = results.filter((r) => r.url.includes('/me'));

    console.log('\nADMIN SCREENS BREAKDOWN:');
    adminScreens.forEach((r) => {
      const status = r.screenState === 'FUNCTIONAL' ? '✓' : r.screenState === '404' ? '✗' : '⚠';
      console.log(`  ${status} ${r.url.replace(BASE_URL, '').padEnd(45)} ${r.screenState.padEnd(20)} HTTP ${r.httpStatus}`);
    });

    console.log('\nEMPLOYEE SCREENS BREAKDOWN:');
    employeeScreens.forEach((r) => {
      const status = r.screenState === 'FUNCTIONAL' ? '✓' : r.screenState === '404' ? '✗' : '⚠';
      console.log(`  ${status} ${r.url.replace(BASE_URL, '').padEnd(45)} ${r.screenState.padEnd(20)} HTTP ${r.httpStatus}`);
    });

    expect(results.length).toBeGreaterThan(0);
  });
});
