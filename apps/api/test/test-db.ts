/**
 * 통합(e2e) 테스트용 전용 DB 유틸.
 *
 * 운영/개발 DB(`ablework`)를 건드리지 않도록, 동일한 접속 정보에서
 * DB 이름만 `ablework_test`로 치환한 URL을 사용한다. 시크릿(비밀번호)은
 * 코드에 하드코딩하지 않고 런타임 환경변수(.env → process.env)에서 가져온다.
 */
import { readFileSync } from 'node:fs'
import * as path from 'node:path'

/** 테스트 DB 이름 (가드: 운영 DB 보호) */
export const TEST_DB_NAME = 'ablework_test'

/** 의존성 없이 .env 파일에서 KEY=VALUE 를 파싱한다 (dotenv 미사용). */
export function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {}
  let raw = ''
  try {
    raw = readFileSync(filePath, 'utf-8')
  } catch {
    return out
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/** 기준 DATABASE_URL에서 DB 이름만 `ablework_test`로 치환한 테스트 URL을 만든다. */
export function deriveTestDatabaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    throw new Error(
      'DATABASE_URL이 설정되어 있지 않습니다. apps/api/.env 를 확인하세요. (통합 테스트는 .env의 접속정보를 재사용합니다)',
    )
  }
  // postgresql://user:pass@host:port/<db>?params  →  .../ablework_test?params
  return baseUrl.replace(/\/([^/?]+)(\?|$)/, `/${TEST_DB_NAME}$2`)
}

/**
 * 테스트 워커 프로세스의 환경변수를 테스트 DB로 강제 설정한다.
 * setupFiles 단계에서 호출 → AppModule/PrismaService 로드 전에 DATABASE_URL 확정.
 */
export function applyTestEnv(): { databaseUrl: string } {
  const apiRoot = path.resolve(__dirname, '..')
  const fileEnv = parseEnvFile(path.join(apiRoot, '.env'))
  const baseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL
  const testUrl = deriveTestDatabaseUrl(baseUrl)

  process.env.DATABASE_URL = testUrl
  process.env.REDIS_URL = process.env.REDIS_URL ?? fileEnv.REDIS_URL ?? 'redis://localhost:6379'
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? fileEnv.JWT_SECRET ?? 'test-jwt-secret'
  process.env.NODE_ENV = 'test'
  // 외부 연동 무력화: Discord webhook 미설정 → 미발송, Mail 은 fire-and-forget
  process.env.DISCORD_WEBHOOK_URL = ''

  return { databaseUrl: testUrl }
}
