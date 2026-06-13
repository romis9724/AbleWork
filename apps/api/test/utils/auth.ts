/**
 * 통합 테스트용 인증 헬퍼.
 * 시드 계정으로 로그인해 Bearer 토큰을 발급받고, 인증 요청 헬퍼를 제공한다.
 */
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { API_PREFIX } from './test-app'

/** 시드 계정 (seed.ts와 동기화) */
export const SEED_ACCOUNTS = {
  admin: { email: 'admin@ablework.io', password: 'admin1234!', level: 'SUPER_ADMIN' },
  employee: { email: 'employee@ablework.io', password: 'employee1234!', level: 'EMPLOYEE' },
  orgadmin: { email: 'orgadmin@ablework.io', password: 'orgadmin1234!', level: 'ORG_ADMIN' },
  sales: { email: 'sales@ablework.io', password: 'sales1234!', level: 'EMPLOYEE' },
} as const

export type SeedAccountKey = keyof typeof SEED_ACCOUNTS

/** 시드 계정으로 로그인하여 accessToken 반환. */
export async function login(
  app: INestApplication,
  account: SeedAccountKey,
): Promise<string> {
  const { email, password } = SEED_ACCOUNTS[account]
  const res = await request(app.getHttpServer())
    .post(`/${API_PREFIX}/auth/login`)
    .send({ email, password })

  if (res.status !== 200 || !res.body?.data?.accessToken) {
    throw new Error(
      `로그인 실패 (${account}): status=${res.status} body=${JSON.stringify(res.body)}`,
    )
  }
  return res.body.data.accessToken as string
}

/** Bearer 토큰이 부착된 supertest 에이전트 팩토리. */
export function authedRequest(app: INestApplication, token: string) {
  const server = app.getHttpServer()
  const url = (p: string) => `/${API_PREFIX}${p.startsWith('/') ? p : `/${p}`}`
  return {
    get: (p: string) => request(server).get(url(p)).set('Authorization', `Bearer ${token}`),
    post: (p: string) => request(server).post(url(p)).set('Authorization', `Bearer ${token}`),
    patch: (p: string) => request(server).patch(url(p)).set('Authorization', `Bearer ${token}`),
    put: (p: string) => request(server).put(url(p)).set('Authorization', `Bearer ${token}`),
    delete: (p: string) => request(server).delete(url(p)).set('Authorization', `Bearer ${token}`),
  }
}
