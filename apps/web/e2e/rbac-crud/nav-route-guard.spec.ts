/**
 * RBAC 브라우저 테스트 — §2-1 메뉴 가시성 + §2-2 라우트 가드
 *
 * 정답지: packages/shared-constants/src/permissions.ts (SSOT)
 * 셀렉터 규약: data-testid="nav-<navId>" (§3)
 * 기대값은 canViewNav / requiredLevelForPath / isAdminLevel / hasLevel 으로 도출.
 *
 * 주의: nav 항목에 data-testid 가 아직 없으면 "보여야 함" 케이스가 FAIL 한다.
 *       spec 약화(텍스트 셀렉터로 우회 등) 금지 — 앱 수정은 수정 에이전트가 담당.
 */
import { test, expect } from '@playwright/test'
import {
  ACCOUNTS,
  ROLE_LEVEL,
  loginAs,
  assertNavVisible,
  assertRouteGuard,
  BASE_URL,
  pathOf,
} from '../helpers'
import { ADMIN_NAV_FLAT } from '../../src/components/ab/nav'
import { AccessLevel } from '@ablework/shared-constants'

// ─── nav id 목록 (nav.ts에서 도출, 푸터 포함) ─────────────────────────────────
// ADMIN_NAV_FLAT = 운영/인사/전자결재/정산·문서/관리 섹션
// ADMIN_FOOT 은 nav.ts에서 직접 가져옴
const MAIN_NAV_IDS = ADMIN_NAV_FLAT.map((item) => item.id)
// 푸터 항목: errorAnalysis, audit
const FOOTER_NAV_IDS = ['errorAnalysis', 'audit']
const ALL_NAV_IDS = [...MAIN_NAV_IDS, ...FOOTER_NAV_IDS]

// 예상 전체: home, schedule, attendance, leave, requests, employees, organizations,
//           eStatus, eDocs, eInbox, eLines, eForms, eOwners, eBackup,
//           report, messages, settings, errorAnalysis, audit

// ─── 라우트 가드 대상 경로 ─────────────────────────────────────────────────────
// ORG_ADMIN 이상이면 접근 가능한 경로 (기본 /admin/*)
const ORG_LEVEL_PATHS = [
  '/admin/employees',
  '/admin/shifts',
  '/admin/attendances',
  '/admin/leave/status',
  '/admin/requests',
  '/admin/approval/status',
  '/admin/approval/documents',
  '/admin/approval/inbox',
]

// GENERAL_ADMIN 이상만 접근 가능한 경로 (SSOT: ADMIN_ROUTE_GUARDS)
const GEN_LEVEL_PATHS = [
  '/admin/organizations',
  '/admin/approval/lines',
  '/admin/approval/forms',
  '/admin/reports',
  '/admin/messages',
  '/admin/settings/company',
  '/admin/audit-logs',
  '/admin/ai-error-analysis',
]

// /me/* 경로 — 모든 역할 허용
const ME_PATHS = ['/me/home']

// ─── §2-1 메뉴 가시성 ─────────────────────────────────────────────────────────

test.describe('§2-1 메뉴 가시성', () => {
  // 관리자 계정 3개만 (EMPLOYEE는 /admin 셸 진입 불가)
  const adminRoles = ['admin', 'genAdmin', 'orgAdmin'] as const

  for (const role of adminRoles) {
    test.describe(`역할: ${role} (${ROLE_LEVEL[role]})`, () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, role)
        // 관리자 대시보드에 안착 확인
        await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })
      })

      test(`nav 항목 가시성 — ${role}`, async ({ page }) => {
        const level = ROLE_LEVEL[role]
        for (const navId of ALL_NAV_IDS) {
          await assertNavVisible(page, navId, level)
        }
      })
    })
  }
})

// ─── §2-2 라우트 가드 ─────────────────────────────────────────────────────────

test.describe('§2-2 라우트 가드', () => {
  // SUPER_ADMIN
  test.describe('역할: admin (SUPER_ADMIN)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'admin')
      await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })
    })

    for (const path of ORG_LEVEL_PATHS) {
      test(`SUPER_ADMIN 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.SUPER_ADMIN)
      })
    }

    for (const path of GEN_LEVEL_PATHS) {
      test(`SUPER_ADMIN 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.SUPER_ADMIN)
      })
    }

    for (const path of ME_PATHS) {
      test(`SUPER_ADMIN /me 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.SUPER_ADMIN)
      })
    }
  })

  // GENERAL_ADMIN
  test.describe('역할: genAdmin (GENERAL_ADMIN)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'genAdmin')
      await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })
    })

    for (const path of ORG_LEVEL_PATHS) {
      test(`GENERAL_ADMIN 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.GENERAL_ADMIN)
      })
    }

    for (const path of GEN_LEVEL_PATHS) {
      test(`GENERAL_ADMIN 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.GENERAL_ADMIN)
      })
    }

    for (const path of ME_PATHS) {
      test(`GENERAL_ADMIN /me 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.GENERAL_ADMIN)
      })
    }
  })

  // ORG_ADMIN
  test.describe('역할: orgAdmin (ORG_ADMIN)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'orgAdmin')
      await expect(page).toHaveURL(/\/admin\//, { timeout: 20000 })
    })

    for (const path of ORG_LEVEL_PATHS) {
      test(`ORG_ADMIN 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.ORG_ADMIN)
      })
    }

    for (const path of GEN_LEVEL_PATHS) {
      test(`ORG_ADMIN 차단: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.ORG_ADMIN)
      })
    }

    for (const path of ME_PATHS) {
      test(`ORG_ADMIN /me 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.ORG_ADMIN)
      })
    }
  })

  // EMPLOYEE — /admin/* 전부 차단, /me/* 허용
  test.describe('역할: employee (EMPLOYEE)', () => {
    test.beforeEach(async ({ page }) => {
      await loginAs(page, 'employee')
      // EMPLOYEE 는 /me/home 으로 리다이렉트
      await expect(page).toHaveURL(/\/me\//, { timeout: 20000 })
    })

    for (const path of ORG_LEVEL_PATHS) {
      test(`EMPLOYEE 차단: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.EMPLOYEE)
      })
    }

    for (const path of GEN_LEVEL_PATHS) {
      test(`EMPLOYEE 차단: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.EMPLOYEE)
      })
    }

    for (const path of ME_PATHS) {
      test(`EMPLOYEE /me 허용: ${path}`, async ({ page }) => {
        await assertRouteGuard(page, path, AccessLevel.EMPLOYEE)
      })
    }
  })
})
