/**
 * AbleWork ERP — 권한별 전 화면 순회 smoke (RBAC 인터랙션 점검 1차)
 *
 * 목적: 4개 권한 계정으로 admin/me 전 화면을 방문해 "깨짐 없이 뜨는지"를 자동 점검한다.
 *   - 판정(실패 조건): 서버 5xx 응답 / 페이지 크래시(uncaught exception)
 *   - 참고 수집: 콘솔 error (favicon 등 noise 제외 후 보고)
 *   - 권한 경계: 하위 권한이 상위 전용 화면 접근 시 리다이렉트(차단)는 정상으로 본다.
 *
 * 이 spec은 인터랙션(버튼/토글) 점검의 1차 게이트다. 화면이 뜨는 것을 보장한 뒤
 * 도메인별 인터랙션 spec(approval_* 등)으로 동작을 검증한다.
 *
 * 전제: web/api/DB 기동 + 시드 계정(genadmin 포함). 포트는 helpers.ts(env 오버라이드).
 */
import { test, expect } from '@playwright/test'
import { ACCOUNTS, BASE_URL, uiLogin } from './helpers'

const ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/employees',
  '/admin/organizations',
  '/admin/positions',
  '/admin/shifts',
  '/admin/shifts/patterns',
  '/admin/shifts/templates',
  '/admin/shifts/types',
  '/admin/attendances',
  '/admin/attendances/now',
  '/admin/timeclock-areas',
  '/admin/leave/list',
  '/admin/leave/status',
  '/admin/leave/types',
  '/admin/leave/accrual-rules',
  '/admin/leave/compensation',
  '/admin/requests',
  '/admin/requests/rules',
  '/admin/requests/custom-types',
  '/admin/approval/inbox',
  '/admin/approval/documents',
  '/admin/approval/status',
  '/admin/approval/lines',
  '/admin/approval/forms',
  '/admin/approval/doc-managers',
  '/admin/approval/common',
  '/admin/approval/service-setting',
  '/admin/approval/backup',
  '/admin/reports',
  '/admin/reports/snapshots',
  '/admin/reports/standardization',
  '/admin/messages',
  '/admin/messages/automations',
  '/admin/audit-logs',
  '/admin/settings/company',
  '/admin/settings/notifications',
  '/admin/settings/permissions',
]

const ME_ROUTES = [
  '/me/home',
  '/me/shifts',
  '/me/attendances',
  '/me/leaves',
  '/me/requests',
  '/me/documents',
  '/me/messages',
  '/me/profile',
]

const ALL_ROUTES = [...ADMIN_ROUTES, ...ME_ROUTES]

const ROLES = [
  { name: 'SUPER_ADMIN', acct: ACCOUNTS.admin },
  { name: 'GENERAL_ADMIN', acct: ACCOUNTS.genAdmin },
  { name: 'ORG_ADMIN', acct: ACCOUNTS.orgAdmin },
  { name: 'EMPLOYEE', acct: ACCOUNTS.employee },
] as const

/** 콘솔 noise 필터 — favicon/소스맵/외부 리소스 등 화면 결함과 무관한 것 제외 */
function isMeaningfulConsoleError(text: string): boolean {
  const noise = [
    'favicon',
    'Failed to load resource: the server responded with a status of 404',
    'manifest',
    'Download the React DevTools',
    'net::ERR_',
  ]
  return !noise.some((n) => text.includes(n))
}

test.describe('권한별 전 화면 순회 smoke', () => {
  for (const role of ROLES) {
    test(`${role.name}: 전 화면 방문 — 5xx·크래시 없음`, async ({ page }) => {
      // 45개 화면 순회 + dev 첫 컴파일 누적 → 기본 30s로는 부족. 넉넉히 부여.
      test.setTimeout(180_000)
      const serverErrors: string[] = []
      const clientErrors: string[] = []
      const pageErrors: string[] = []
      const consoleErrors: string[] = []

      page.on('response', (r) => {
        const s = r.status()
        const u = r.url()
        // API(/api/v1) 호출만 대상. 권한 차단(401/403)은 정상이므로 제외, 400/404/422만 결함 후보로 수집.
        if (s >= 500) serverErrors.push(`${s} ${r.request().method()} ${u}`)
        else if ([400, 404, 422].includes(s) && u.includes('/api/v1')) {
          clientErrors.push(`${s} ${r.request().method()} ${u.replace(/^https?:\/\/[^/]+/, '')}`)
        }
      })
      page.on('pageerror', (e) => pageErrors.push(String(e.message ?? e)))
      page.on('console', (msg) => {
        if (msg.type() === 'error' && isMeaningfulConsoleError(msg.text())) {
          consoleErrors.push(msg.text())
        }
      })

      await uiLogin(page, role.acct.email, role.acct.password)

      const redirected: string[] = []
      for (const route of ALL_ROUTES) {
        // 'load'(window.onload)/networkidle은 일부 화면(예: 폴링/계속 로딩되는 리소스)에서
        // 끝나지 않아 화면이 정상인데도 행 → DOM 렌더 기준(domcontentloaded) + 짧은 settle로 점검.
        await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(500)
        const landed = new URL(page.url()).pathname
        if (landed !== route) redirected.push(`${route} → ${landed}`)
      }

      // 참고용 출력 (권한 경계 리다이렉트 + 콘솔 에러)
      if (redirected.length) {
        console.log(`[${role.name}] 리다이렉트(권한 경계 추정):\n  ${redirected.join('\n  ')}`)
      }
      if (consoleErrors.length) {
        console.log(`[${role.name}] 콘솔 에러(참고 ${consoleErrors.length}건):\n  ${[...new Set(consoleErrors)].slice(0, 15).join('\n  ')}`)
      }
      if (clientErrors.length) {
        console.log(`[${role.name}] 4xx API(결함 후보):\n  ${[...new Set(clientErrors)].join('\n  ')}`)
      }

      // 실패 조건: 서버 5xx / 페이지 크래시
      expect(serverErrors, `5xx 응답:\n${serverErrors.join('\n')}`).toEqual([])
      expect(pageErrors, `페이지 크래시:\n${pageErrors.join('\n')}`).toEqual([])
    })
  }
})
