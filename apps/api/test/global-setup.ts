/**
 * Jest e2e globalSetup — 통합 테스트 시작 전 1회 실행.
 *
 * 전용 테스트 DB(`ablework_test`)를 매 실행마다 깨끗이 초기화한다:
 *   1) prisma migrate deploy → (없으면 DB 생성 후) 전체 마이그레이션 비파괴 적용
 *   2) TRUNCATE (client)     → 모든 public 테이블 비우기 (CLI reset 가드 회피, 테스트 픽스처 초기화)
 *   3) seed.ts               → 회사/조직/직원/결재양식/시드 계정 주입
 *
 * 운영/개발 DB(`ablework`)는 절대 건드리지 않는다 (DB 이름만 `ablework_test`로 치환).
 * `ablework_test`는 통합 테스트 전용으로, 실제/운영 데이터가 존재하지 않는다.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { deriveTestDatabaseUrl } from './test-db'

/** 의존성 없이 .env 파일에서 KEY=VALUE 를 파싱한다 (dotenv 미사용). */
function parseEnvFile(filePath: string): Record<string, string> {
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

/** 모든 public 테이블을 비운다 (_prisma_migrations 제외). */
async function truncateAll(testUrl: string): Promise<void> {
  process.env.DATABASE_URL = testUrl
  // 동적 require: DATABASE_URL 설정 후 PrismaClient 생성
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('@prisma/client')
  const prisma = new PrismaClient()
  try {
    const rows: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    )
    if (rows.length > 0) {
      const names = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
      await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

export default async function globalSetup(): Promise<void> {
  const apiRoot = path.resolve(__dirname, '..')
  const fileEnv = parseEnvFile(path.join(apiRoot, '.env'))
  const baseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL
  const redisUrl = process.env.REDIS_URL ?? fileEnv.REDIS_URL

  const testUrl = deriveTestDatabaseUrl(baseUrl)
  const env = {
    ...process.env,
    ...fileEnv,
    DATABASE_URL: testUrl,
    REDIS_URL: redisUrl,
    NODE_ENV: 'test',
  }

  // eslint-disable-next-line no-console
  console.log('\n[e2e globalSetup] 테스트 DB 초기화 (ablework_test)…')

  // 1) 마이그레이션 비파괴 적용 (DB가 없으면 생성됨)
  execSync('npx prisma migrate deploy', { cwd: apiRoot, env, stdio: 'inherit' })

  // 2) 모든 테이블 비우기 (테스트 픽스처 초기화)
  await truncateAll(testUrl)

  // 3) 시드 주입
  execSync('npx ts-node prisma/seed.ts', { cwd: apiRoot, env, stdio: 'inherit' })

  // eslint-disable-next-line no-console
  console.log('[e2e globalSetup] 완료.\n')
}

// 단독 실행 지원: `npx ts-node test/global-setup.ts` 로 프로비저닝만 검증 가능
if (require.main === module) {
  globalSetup()
    .then(() => process.exit(0))
    .catch((e) => {
      // eslint-disable-next-line no-console
      console.error(e)
      process.exit(1)
    })
}
