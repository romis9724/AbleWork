import type { AccessLevel } from '@ablework/shared-constants'

/**
 * API 가 발급하는 JWT 클레임 (apps/api JwtPayload 와 정합).
 */
export interface JwtClaims {
  sub: string
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
  iat?: number
  exp?: number
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * base64url 문자열을 UTF-8 문자열로 디코드한다.
 * Hermes 에는 atob 가 없을 수 있어 의존성 없이 직접 구현한다.
 */
function base64UrlDecode(input: string): string {
  // base64url → base64
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)

  const bytes: number[] = []
  let buffer = 0
  let bits = 0

  for (const char of padded) {
    if (char === '=') break
    const value = BASE64_CHARS.indexOf(char)
    if (value === -1) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  // UTF-8 바이트 시퀀스를 문자열로 복원
  return decodeUtf8(bytes)
}

function decodeUtf8(bytes: readonly number[]): string {
  let result = ''
  let i = 0
  while (i < bytes.length) {
    const byte1 = bytes[i++]
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1)
    } else if (byte1 >= 0xc0 && byte1 < 0xe0) {
      const byte2 = bytes[i++] & 0x3f
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | byte2)
    } else if (byte1 >= 0xe0 && byte1 < 0xf0) {
      const byte2 = bytes[i++] & 0x3f
      const byte3 = bytes[i++] & 0x3f
      result += String.fromCharCode(((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3)
    } else {
      // 4바이트(서로게이트 쌍) — 클레임에는 사실상 등장하지 않으나 안전하게 처리
      const byte2 = bytes[i++] & 0x3f
      const byte3 = bytes[i++] & 0x3f
      const byte4 = bytes[i++] & 0x3f
      const codePoint =
        ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4
      const offset = codePoint - 0x10000
      result += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff))
    }
  }
  return result
}

/**
 * JWT 의 payload 를 파싱한다. 서명 검증은 하지 않으며 (검증은 서버 책임),
 * 앱 기동 시 토큰에서 사용자 정보를 복원하는 용도로만 사용한다.
 */
export function decodeJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = base64UrlDecode(payload)
    const claims = JSON.parse(json) as JwtClaims
    if (!claims.sub || !claims.accessLevel) return null
    return claims
  } catch {
    return null
  }
}

/** 토큰 만료 여부 (exp 클레임 기준, exp 없으면 유효 간주) */
export function isTokenExpired(claims: JwtClaims): boolean {
  if (!claims.exp) return false
  return claims.exp * 1000 <= Date.now()
}
