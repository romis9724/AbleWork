import type { AccessLevel } from '@ablework/shared-constants'

/**
 * 인증 세션 유틸 — 로그인/회사 전환 공용.
 * 토큰은 쿠키에 저장(미들웨어·axios 인터셉터가 쿠키에서 읽음)하고,
 * accessToken 클레임을 디코드해 사용자 컨텍스트(auth.store)를 갱신한다.
 */

export interface JwtClaims {
  sub: string
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
}

const ACCESS_MAX_AGE = 15 * 60
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60

export function parseJwt(token: string): JwtClaims {
  const payload = token.split('.')[1]
  return JSON.parse(atob(payload))
}

export function writeAuthCookies(accessToken: string, refreshToken: string): void {
  document.cookie = `accessToken=${accessToken}; path=/; max-age=${ACCESS_MAX_AGE}`
  document.cookie = `refreshToken=${refreshToken}; path=/; max-age=${REFRESH_MAX_AGE}`
}

export function clearAuthCookies(): void {
  document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
  document.cookie = 'refreshToken=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
}
