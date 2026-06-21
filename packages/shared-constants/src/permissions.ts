import { AccessLevel, ACCESS_LEVEL_HIERARCHY } from './access-level'

/**
 * 접근 레벨 기반 정적 권한 모델 (역할 계층 게이팅).
 *
 * - company_settings 의 런타임 권한 토글(org_admin_can_manage_*)과는 별개로,
 *   메뉴/버튼/탭 등 UI 노출의 1차 기준이 되는 "최소 접근 레벨"을 정의한다.
 * - 웹(AdminShell·페이지)과 모바일 앱이 동일 모델을 공유한다.
 * - 백엔드 @Roles 데코레이터와 정합되도록 유지한다.
 */

/** level 이 min 이상인지 (계층 비교) */
export function hasLevel(level: AccessLevel | undefined | null, min: AccessLevel): boolean {
  if (!level) return false
  return ACCESS_LEVEL_HIERARCHY[level] >= ACCESS_LEVEL_HIERARCHY[min]
}

/** 관리자(/admin) 진입 가능 여부 — ORG_ADMIN 이상 */
export function isAdminLevel(level: AccessLevel | undefined | null): boolean {
  return hasLevel(level, AccessLevel.ORG_ADMIN)
}

/**
 * 관리자 네비게이션 항목별 최소 접근 레벨.
 * 키는 web nav.ts 의 AbNavItem.id 와 1:1 대응.
 * - 운영/거래성 결재: ORG_ADMIN (조직 스코프로 자동 제한)
 * - 회사 전역 설정/마스터 관리: GENERAL_ADMIN
 */
export const ADMIN_NAV_MIN_LEVEL: Record<string, AccessLevel> = {
  // 운영
  home: AccessLevel.ORG_ADMIN,
  schedule: AccessLevel.ORG_ADMIN,
  attendance: AccessLevel.ORG_ADMIN,
  leave: AccessLevel.ORG_ADMIN,
  requests: AccessLevel.ORG_ADMIN,
  // 인사 — 직원 관리는 조직관리자(조직 스코프), 조직(부서) 구조는 총괄관리자
  employees: AccessLevel.ORG_ADMIN,
  organizations: AccessLevel.GENERAL_ADMIN,
  // 전자결재 — 거래성(현황/문서함/대장)은 ORG_ADMIN, 마스터 관리는 GENERAL_ADMIN
  eStatus: AccessLevel.ORG_ADMIN,
  eDocs: AccessLevel.ORG_ADMIN,
  eInbox: AccessLevel.ORG_ADMIN,
  eLines: AccessLevel.GENERAL_ADMIN,
  eForms: AccessLevel.GENERAL_ADMIN,
  eOwners: AccessLevel.GENERAL_ADMIN,
  eBackup: AccessLevel.GENERAL_ADMIN,
  // 정산·문서
  report: AccessLevel.GENERAL_ADMIN,
  messages: AccessLevel.GENERAL_ADMIN,
  // 관리
  settings: AccessLevel.GENERAL_ADMIN,
  // 푸터
  errorAnalysis: AccessLevel.GENERAL_ADMIN,
  audit: AccessLevel.GENERAL_ADMIN,
}

/** 특정 메뉴 항목을 해당 레벨이 볼 수 있는가 */
export function canViewNav(level: AccessLevel | undefined | null, navId: string): boolean {
  const min = ADMIN_NAV_MIN_LEVEL[navId]
  if (!min) return isAdminLevel(level) // 미정의 항목은 관리자 공통 노출
  return hasLevel(level, min)
}

/**
 * 액션(버튼/토글/위험 작업)별 최소 접근 레벨.
 * 백엔드 라우트 가드 및 비즈니스 룰과 정합.
 */
export const ACTION_KEYS = {
  // 직원
  EMPLOYEE_CREATE: 'employee.create',
  EMPLOYEE_MANAGE: 'employee.manage',
  EMPLOYEE_RESET_PASSWORD: 'employee.resetPassword',
  EMPLOYEE_RESET_DEVICE: 'employee.resetDevice',
  EMPLOYEE_WAGE_MANAGE: 'employee.wageManage',
  // 근태
  ATTENDANCE_UNCONFIRM: 'attendance.unconfirm',
  SHIFT_UNCONFIRM: 'shift.unconfirm',
  // 결재
  REQUEST_FORCE: 'request.force',
  // 설정
  COMPANY_EDIT_BASE: 'company.editBase',
  SETTINGS_SAVE_ADVANCED: 'settings.saveAdvanced',
  PERMISSIONS_MANAGE: 'permissions.manage',
} as const

export type ActionKey = (typeof ACTION_KEYS)[keyof typeof ACTION_KEYS]

export const ACTION_MIN_LEVEL: Record<ActionKey, AccessLevel> = {
  [ACTION_KEYS.EMPLOYEE_CREATE]: AccessLevel.GENERAL_ADMIN,
  [ACTION_KEYS.EMPLOYEE_MANAGE]: AccessLevel.ORG_ADMIN,
  [ACTION_KEYS.EMPLOYEE_RESET_PASSWORD]: AccessLevel.ORG_ADMIN,
  [ACTION_KEYS.EMPLOYEE_RESET_DEVICE]: AccessLevel.GENERAL_ADMIN,
  [ACTION_KEYS.EMPLOYEE_WAGE_MANAGE]: AccessLevel.GENERAL_ADMIN,
  [ACTION_KEYS.ATTENDANCE_UNCONFIRM]: AccessLevel.GENERAL_ADMIN,
  [ACTION_KEYS.SHIFT_UNCONFIRM]: AccessLevel.GENERAL_ADMIN,
  [ACTION_KEYS.REQUEST_FORCE]: AccessLevel.SUPER_ADMIN,
  [ACTION_KEYS.COMPANY_EDIT_BASE]: AccessLevel.SUPER_ADMIN,
  [ACTION_KEYS.SETTINGS_SAVE_ADVANCED]: AccessLevel.GENERAL_ADMIN,
  [ACTION_KEYS.PERMISSIONS_MANAGE]: AccessLevel.SUPER_ADMIN,
}

/** 특정 액션을 해당 레벨이 수행할 수 있는가 */
export function canDo(level: AccessLevel | undefined | null, action: ActionKey): boolean {
  return hasLevel(level, ACTION_MIN_LEVEL[action])
}

/**
 * 관리자 하위 경로별 최소 접근 레벨 (미들웨어 라우트 가드용).
 * /admin 진입은 ORG_ADMIN 이상이지만, 회사 전역 설정/마스터 경로는 GENERAL_ADMIN 이상만 허용.
 * 더 구체적인(긴) prefix 가 우선한다.
 */
export const ADMIN_ROUTE_GUARDS: ReadonlyArray<{ prefix: string; minLevel: AccessLevel }> = [
  { prefix: '/admin/organizations', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/approval/lines', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/approval/forms', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/approval/doc-managers', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/approval/backup', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/reports', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/messages', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/settings', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/audit-logs', minLevel: AccessLevel.GENERAL_ADMIN },
  { prefix: '/admin/ai-error-analysis', minLevel: AccessLevel.GENERAL_ADMIN },
]

/** 경로에 대해 요구되는 최소 레벨을 반환 (없으면 ORG_ADMIN = /admin 공통) */
export function requiredLevelForPath(pathname: string): AccessLevel {
  const match = ADMIN_ROUTE_GUARDS.filter((g) => pathname.startsWith(g.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0]
  return match?.minLevel ?? AccessLevel.ORG_ADMIN
}

export const ROLE_LABELS_KO: Record<AccessLevel, string> = {
  SUPER_ADMIN: '최고관리자',
  GENERAL_ADMIN: '총괄관리자',
  ORG_ADMIN: '조직관리자',
  EMPLOYEE: '직원',
}
