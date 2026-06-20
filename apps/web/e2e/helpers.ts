/**
 * AbleWork ERP — E2E 공통 헬퍼
 *
 * 포트는 env로 오버라이드(로컬 dev가 modoostudy와 공존해 web 4000 / api 4001 사용).
 * 기본값은 현재 로컬 dev 포트. 3000대 환경(CI 등)은 E2E_BASE_URL/E2E_API_URL로 조정한다.
 *
 * 전 spec 공통 전략: 데이터/문서 셋업은 API로, 핵심 액션만 UI 클릭, 결과는 API로 검증해
 * UI 텍스트 의존 플래키를 줄인다.
 */
import { expect, type Page } from '@playwright/test'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:4000'
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4001/api/v1'

/** 시드 계정 (apps/api/prisma/seed.ts와 동기) */
export const ACCOUNTS = {
  admin: { email: 'admin@ablework.io', password: 'admin1234!' }, // SUPER_ADMIN · 개발팀
  genAdmin: { email: 'genadmin@ablework.io', password: 'genadmin1234!' }, // GENERAL_ADMIN · 개발팀
  employee: { email: 'employee@ablework.io', password: 'employee1234!' }, // EMPLOYEE · 개발팀
  orgAdmin: { email: 'orgadmin@ablework.io', password: 'orgadmin1234!' }, // ORG_ADMIN · 개발팀
  sales: { email: 'sales@ablework.io', password: 'sales1234!' }, // EMPLOYEE · 영업팀
} as const

export interface Tokens {
  accessToken: string
  refreshToken: string
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** API 로그인 — 토큰 확보(셋업·검증용) */
export async function login(page: Page, email: string, password: string): Promise<Tokens> {
  const resp = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await resp.json()
  return {
    accessToken: body?.data?.accessToken as string,
    refreshToken: body?.data?.refreshToken as string,
  }
}

/** JWT payload에서 employeeId 추출 (별도 me 엔드포인트가 없어 토큰을 디코드) */
export function jwtEmployeeId(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'))
  return payload.employeeId as string
}

/**
 * UI 로그인 — 쿠키 주입만으로는 Zustand authStore(skipHydration)가 채워지지 않아
 * 결재 액션 노출 조건(myPendingStep = user.employeeId 매칭)이 성립하지 않는다.
 * 실제 로그인 폼을 거쳐 store를 정상 하이드레이트한다.
 */
export async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(/\/(admin|me)\//, { timeout: 20000 })
}

export async function firstFormId(page: Page, token: string): Promise<string> {
  const resp = await page.request.get(`${API_URL}/document-forms`, { headers: authHeaders(token) })
  const body = await resp.json()
  const forms = (body?.data ?? body) as Array<{ id: string; isActive?: boolean }>
  return (forms.find((f) => f.isActive !== false) ?? forms[0]).id
}

export interface StepInput {
  role: string
  assigneeId?: string
  organizationId?: string
  stepOrder: number
}

/** 직원 토큰으로 문서 생성 + 상신. documentId 반환. */
export async function createSubmittedDoc(
  page: Page,
  empToken: string,
  formId: string,
  steps: StepInput[],
  title: string,
): Promise<string> {
  const created = await (
    await page.request.post(`${API_URL}/documents`, {
      data: { formId, title, content: { body: 'E2E 테스트 문서' } },
      headers: authHeaders(empToken),
    })
  ).json()
  const documentId = (created?.data ?? created).id as string
  const submit = await page.request.post(`${API_URL}/documents/${documentId}/submit`, {
    data: { steps },
    headers: authHeaders(empToken),
  })
  expect(submit.ok()).toBeTruthy()
  return documentId
}

export async function docStatus(page: Page, token: string, documentId: string): Promise<string> {
  const body = await (
    await page.request.get(`${API_URL}/documents/${documentId}`, { headers: authHeaders(token) })
  ).json()
  return (body?.data ?? body).status as string
}

export interface DocStep {
  id: string
  role: string
  stepOrder: number
  status: string
  assignee?: { id: string; name: string } | null
  organization?: { id: string; name: string } | null
}

/** 문서의 모든 결재 step을 stepOrder 순으로 평탄화해 반환 */
export async function getSteps(page: Page, token: string, documentId: string): Promise<DocStep[]> {
  const body = await (
    await page.request.get(`${API_URL}/documents/${documentId}`, { headers: authHeaders(token) })
  ).json()
  const doc = body?.data ?? body
  const steps = ((doc.approvalLines ?? []) as Array<{ steps: DocStep[] }>).flatMap((l) => l.steps)
  return steps.sort((a, b) => a.stepOrder - b.stepOrder)
}

/** step 액션을 API로 직접 호출(셋업용). action = approve|reject|return-prev|cancel-approval|... */
export async function stepActionApi(
  page: Page,
  token: string,
  documentId: string,
  stepId: string,
  action: string,
  comment?: string,
) {
  return page.request.post(`${API_URL}/documents/${documentId}/steps/${stepId}/${action}`, {
    data: comment ? { comment } : {},
    headers: authHeaders(token),
  })
}

/** 회수(API) */
export async function recallApi(page: Page, token: string, documentId: string) {
  return page.request.post(`${API_URL}/documents/${documentId}/recall`, {
    data: {},
    headers: authHeaders(token),
  })
}

/**
 * 문서함/결재함 화면에서 탭 전환 + 제목으로 문서 행을 찾아 DocModal을 연다.
 *
 * 실제 UI 구조(UI 통일 개편):
 * - 탭은 MUI Tab(role=tab)이 아니라 커스텀 `<button>` (admin inbox·me/documents 공통, BOX_TABS 라벨).
 * - 검색 입력(`제목 · 문서번호 검색`)은 admin inbox에만 존재 — 있으면 필터링.
 * - 문서 행은 `.tbl-link`(텍스트=제목). DocModal은 role=dialog가 아니라 `.modal`.
 */
export async function openDocInBox(
  page: Page,
  boxPath: string,
  tabName: string,
  title: string,
): Promise<void> {
  await page.goto(`${BASE_URL}${boxPath}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: tabName, exact: true }).click()

  const search = page.getByPlaceholder('제목 · 문서번호 검색')
  if (await search.count()) {
    await search.fill(title)
  }

  const link = page.locator('.tbl-link', { hasText: title }).first()
  await expect(link).toBeVisible({ timeout: 10000 })
  await link.click()
  await expect(page.locator('.modal')).toBeVisible({ timeout: 10000 })
}

/**
 * 문서대장(/admin/approval/documents)에서 제목으로 문서를 찾아 DocModal을 연다.
 * 결재함과 달리 처리 완료한 단계의 문서도 열람 가능 — 결재취소(C-2) 진입 경로.
 * 검색 placeholder가 결재함('제목 · 문서번호 검색')과 달리 공백 없는 '제목·문서번호 검색'.
 */
export async function openDocInLedger(page: Page, title: string): Promise<void> {
  await page.goto(`${BASE_URL}/admin/approval/documents`)
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder('제목·문서번호 검색').fill(title)
  const link = page.locator('.tbl-link', { hasText: title }).first()
  await expect(link).toBeVisible({ timeout: 10000 })
  await link.click()
  await expect(page.locator('.modal')).toBeVisible({ timeout: 10000 })
}

/** 특정 stepOrder의 결재 단계 상태를 반환 (없으면 undefined) */
export async function stepStatusAt(
  page: Page,
  token: string,
  documentId: string,
  stepOrder: number,
): Promise<string | undefined> {
  const steps = await getSteps(page, token, documentId)
  return steps.find((s) => s.stepOrder === stepOrder)?.status
}
