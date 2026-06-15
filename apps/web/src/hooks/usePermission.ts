'use client'
import { useAuthStore } from '@/stores/auth.store'
import {
  canDo,
  hasLevel,
  AccessLevel,
  type ActionKey,
} from '@ablework/shared-constants'

/**
 * 현재 로그인 사용자의 접근 레벨 기반 권한 헬퍼.
 * 버튼/탭/필터/토글/드롭다운 등 UI 게이팅의 단일 진입점.
 */
export function usePermission() {
  const user = useAuthStore((s) => s.user)
  const level = user?.accessLevel ?? null

  return {
    level,
    isSuperAdmin: level === AccessLevel.SUPER_ADMIN,
    isGeneralAdmin: hasLevel(level, AccessLevel.GENERAL_ADMIN),
    isOrgAdmin: hasLevel(level, AccessLevel.ORG_ADMIN),
    /** 특정 액션 수행 가능 여부 (ACTION_KEYS 사용) */
    can: (action: ActionKey) => canDo(level, action),
    /** 특정 최소 레벨 이상 여부 */
    atLeast: (min: AccessLevel) => hasLevel(level, min),
  }
}
