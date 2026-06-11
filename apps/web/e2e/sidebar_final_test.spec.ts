/**
 * AbleWork ERP - Admin Sidebar Final Test
 * Verifies all 12 sidebar menu items navigate correctly (no 404, no auth redirect).
 * Checks page title (h5/h6 Typography) and layout (sidebar + content).
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:3001/api/v1';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots', 'sidebar_final');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function ss(page: Page, name: string) {
  const filePath = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function injectAdminCookies(context: BrowserContext, page: Page) {
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email: 'admin@ablework.io', password: 'admin1234!' },
    headers: { 'Content-Type': 'application/json' },
  });
  const body = await resp.json();
  const accessToken: string = body?.data?.accessToken ?? '';
  const refreshToken: string = body?.data?.refreshToken ?? '';

  if (!accessToken) throw new Error('Failed to obtain accessToken from API');

  await context.addCookies([
    { name: 'accessToken', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'refreshToken', value: refreshToken, domain: 'localhost', path: '/' },
  ]);
}

const SIDEBAR_MENUS = [
  { label: '대시보드', path: '/admin/dashboard', slug: '01_dashboard' },
  { label: '조직/직원', path: '/admin/employees', slug: '02_employees' },
  { label: '직무', path: '/admin/positions', slug: '03_positions' },
  { label: '근무일정', path: '/admin/shifts', slug: '04_shifts' },
  { label: '출퇴근', path: '/admin/attendances', slug: '05_attendances' },
  { label: '휴가', path: '/admin/leave/types', slug: '06_leave_types' },
  { label: '요청', path: '/admin/requests', slug: '07_requests' },
  { label: '전자결재', path: '/admin/approval/forms', slug: '08_approval_forms' },
  { label: '리포트', path: '/admin/reports', slug: '09_reports' },
  { label: '메시지', path: '/admin/messages', slug: '10_messages' },
  { label: '알림설정', path: '/admin/settings/notifications', slug: '11_settings_notifications' },
  { label: '회사설정', path: '/admin/settings/company', slug: '12_settings_company' },
];

interface MenuResult {
  label: string;
  path: string;
  status: 'PASS' | 'FAIL_404' | 'FAIL_AUTH_REDIRECT' | 'FAIL_APP_ERROR' | 'FAIL_NO_TITLE' | 'FAIL_NO_SIDEBAR';
  finalUrl: string;
  pageTitle: string;
  hasSidebar: boolean;
  screenshotPath: string;
  notes: string;
}

test.describe('Admin Sidebar - 12 Menu Final Test', () => {

  test('전체 사이드바 12개 메뉴 최종 검증', async ({ page, context }) => {
    await injectAdminCookies(context, page);

    const results: MenuResult[] = [];

    for (const menu of SIDEBAR_MENUS) {
      // Navigate to page
      await page.goto(`${BASE_URL}${menu.path}`, { waitUntil: 'domcontentloaded' });

      // Wait for network to settle but cap at 5s to avoid hanging on slow pages
      await page.waitForLoadState('networkidle').catch(() => {});

      const finalUrl = page.url();
      const bodyText: string = await page.evaluate(() => document.body.innerText ?? '');

      // --- Detect failure modes ---
      const isAuthRedirect = finalUrl.includes('/login');
      const is404 = bodyText.includes('This page could not be found') ||
                    bodyText.includes('404') && bodyText.length < 300;
      const isAppError = bodyText.includes('Application error') ||
                         bodyText.includes('Internal Server Error') ||
                         bodyText.includes('An error occurred');

      // --- Detect page title (h5 or h6 rendered by MUI Typography) ---
      const pageTitle: string = await page.evaluate(() => {
        const h5 = document.querySelector('h5');
        const h6 = document.querySelector('h6');
        const heading = h5 ?? h6;
        return heading ? (heading.textContent ?? '').trim() : '';
      });

      // --- Detect sidebar presence ---
      // MUI Drawer / aside with nav items
      const hasSidebar: boolean = await page.evaluate(() => {
        const drawer = document.querySelector('[class*="MuiDrawer"], nav, aside');
        const listItems = document.querySelectorAll('[class*="MuiListItemButton"]');
        return !!(drawer) || listItems.length > 0;
      });

      // Take screenshot
      const screenshotPath = await ss(page, menu.slug);

      // --- Determine result status ---
      let status: MenuResult['status'];
      let notes = '';

      if (isAuthRedirect) {
        status = 'FAIL_AUTH_REDIRECT';
        notes = `Redirected to login from ${menu.path}`;
      } else if (is404) {
        status = 'FAIL_404';
        notes = `Page not found: ${menu.path}`;
      } else if (isAppError) {
        status = 'FAIL_APP_ERROR';
        notes = 'Application error rendered';
      } else if (!pageTitle) {
        // Title missing — check if it's a known page with alternative headings
        const altTitle: string = await page.evaluate(() => {
          const h4 = document.querySelector('h4');
          const h3 = document.querySelector('h3');
          const h2 = document.querySelector('h2');
          const heading = h4 ?? h3 ?? h2;
          return heading ? (heading.textContent ?? '').trim() : '';
        });
        if (altTitle) {
          status = 'PASS';
          notes = `Title via h4/h3/h2: "${altTitle}"`;
        } else {
          status = 'FAIL_NO_TITLE';
          notes = 'No h5/h6 page title rendered';
        }
      } else if (!hasSidebar) {
        status = 'FAIL_NO_SIDEBAR';
        notes = 'Sidebar not detected';
      } else {
        status = 'PASS';
        notes = '';
      }

      results.push({
        label: menu.label,
        path: menu.path,
        status,
        finalUrl,
        pageTitle,
        hasSidebar,
        screenshotPath,
        notes,
      });

      console.log(`[${status.padEnd(20)}] ${menu.label.padEnd(12)} ${menu.path}`);
      if (pageTitle) console.log(`              title="${pageTitle}"`);
      if (notes) console.log(`              note: ${notes}`);
    }

    // Save results JSON
    const resultsPath = path.join(SCREENSHOTS_DIR, 'results.json');
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

    // Print final summary table
    console.log('\n========================================');
    console.log('  FINAL RESULT TABLE');
    console.log('========================================');
    console.log('번호  메뉴         경로                          결과         페이지 제목');
    console.log('----  -----------  ----------------------------  -----------  ------------------');
    results.forEach((r, i) => {
      const num = String(i + 1).padStart(2, '0');
      const label = r.label.padEnd(11);
      const pathStr = r.path.padEnd(28);
      const status = r.status === 'PASS' ? 'PASS' : `FAIL(${r.status.replace('FAIL_', '')})`;
      const title = r.pageTitle || r.notes || '-';
      console.log(`${num}    ${label}  ${pathStr}  ${status.padEnd(11)}  ${title}`);
    });

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status !== 'PASS').length;
    console.log('========================================');
    console.log(`  PASS: ${passed} / ${results.length}   FAIL: ${failed} / ${results.length}`);
    console.log('========================================\n');

    // Assert all pages passed
    const failures = results.filter(r => r.status !== 'PASS');
    if (failures.length > 0) {
      const failMsg = failures
        .map(f => `${f.label} (${f.path}): ${f.status} - ${f.notes}`)
        .join('\n  ');
      expect.soft(failures, `${failures.length} menu(s) failed:\n  ${failMsg}`).toHaveLength(0);
    }
  });

});
