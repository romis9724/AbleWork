/**
 * AB Workforce 관리자 네비게이션 정의.
 * 디자인 핸드오프 NAV_SECTIONS 를 실제 라우트에 매핑.
 * NEVER 목록(급여·마감 관리·전자계약)은 제외 — CLAUDE.md 구현 범위 준수.
 */
import { HRI } from './icons'
import type { ReactElement, SVGProps } from 'react'

export interface AbNavItem {
  id: string
  label: string
  icon: (p?: SVGProps<SVGSVGElement>) => ReactElement
  path: string
  /** 미처리 카운트 뱃지 키 (런타임에 주입) */
  badgeKey?: 'requests'
}

export interface AbNavSection {
  title: string
  items: AbNavItem[]
}

export const ADMIN_NAV: AbNavSection[] = [
  {
    title: '운영',
    items: [
      { id: 'home', label: '홈', icon: HRI.home, path: '/admin/dashboard' },
      { id: 'schedule', label: '근무일정', icon: HRI.schedule, path: '/admin/shifts' },
      { id: 'attendance', label: '출퇴근기록', icon: HRI.clock, path: '/admin/attendances' },
      { id: 'leave', label: '휴가', icon: HRI.leave, path: '/admin/leave/status' },
      { id: 'requests', label: '요청 내역', icon: HRI.request, path: '/admin/requests', badgeKey: 'requests' },
    ],
  },
  {
    title: '인사',
    items: [
      { id: 'employees', label: '직원 관리', icon: HRI.people, path: '/admin/employees' },
      { id: 'organizations', label: '조직 관리', icon: HRI.profile, path: '/admin/organizations' },
    ],
  },
  {
    title: '전자결재',
    items: [
      { id: 'eStatus', label: '결재 현황', icon: HRI.approval, path: '/admin/approval/status' },
      { id: 'eDocs', label: '문서대장', icon: HRI.contract, path: '/admin/approval/documents' },
      { id: 'eInbox', label: '내 문서함', icon: HRI.backup, path: '/admin/approval/inbox' },
      { id: 'eLines', label: '공용 결재선 관리', icon: HRI.aline, path: '/admin/approval/lines' },
      { id: 'eForms', label: '기안양식 관리', icon: HRI.contract, path: '/admin/approval/forms' },
      { id: 'eOwners', label: '문서 담당 관리', icon: HRI.people, path: '/admin/approval/doc-managers' },
      { id: 'eBackup', label: '전자결재 백업', icon: HRI.backup, path: '/admin/approval/backup' },
    ],
  },
  {
    title: '정산·문서',
    items: [
      { id: 'report', label: '리포트', icon: HRI.report, path: '/admin/reports' },
      { id: 'messages', label: '메시지', icon: HRI.message, path: '/admin/messages' },
    ],
  },
  {
    title: '관리',
    items: [
      { id: 'settings', label: '회사 설정', icon: HRI.settings, path: '/admin/settings/company' },
    ],
  },
]

export const ADMIN_FOOT: AbNavItem[] = [
  { id: 'audit', label: '감사 로그', icon: HRI.report, path: '/admin/audit-logs' },
]

/** 전체 항목 평탄화 (번호 매기기용) */
export const ADMIN_NAV_FLAT: AbNavItem[] = ADMIN_NAV.reduce<AbNavItem[]>(
  (acc, s) => acc.concat(s.items),
  [],
)

/** 현재 경로에 가장 길게 매칭되는 항목 id */
export function activeNavId(pathname: string): string | null {
  const all = [...ADMIN_NAV_FLAT, ...ADMIN_FOOT]
  let best: AbNavItem | null = null
  for (const item of all) {
    if (pathname === item.path || pathname.startsWith(item.path + '/')) {
      if (!best || item.path.length > best.path.length) best = item
    }
  }
  return best?.id ?? null
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: '최고관리자',
  GENERAL_ADMIN: '총괄관리자',
  ORG_ADMIN: '조직관리자',
  EMPLOYEE: '직원',
}
