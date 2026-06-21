/**
 * 공용 결재선 필터 (C-9b) — 작성자·결재자·작성일이 실제 조회에 반영되는지 검증.
 *
 * 기존 결함(role-feature-audit C-9b): 공용 결재선 관리 화면에 작성일·결재선명·결재자명·
 * 작성자명 필터 UI가 모두 그려지나 [조회] 시 결재선명(search)만 적용되고 나머지 3종은
 * 무시됐다("표면 only"). BE 목록 API가 해당 파라미터를 받지 않은 게 원인.
 *
 * 본 스펙은 BE 파라미터(author/approver/dateFrom/dateTo) + FE [조회] 배선을 검증한다.
 * 셋업/검증은 API로, UI는 결재자명 필터 한 케이스를 스모크한다.
 */
import { test, expect, type Page } from '@playwright/test'
import { API_URL, BASE_URL, ACCOUNTS, login, jwtEmployeeId, uiLogin } from './helpers'

const H = (t: string) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' })

interface Line {
  id: string
  name: string
}

test.describe('공용 결재선 필터 (C-9b)', () => {
  const ts = Date.now()
  const PREFIX = `C9B-${ts}-`
  const NAME_A = `${PREFIX}A`
  const NAME_B = `${PREFIX}B`

  let adminTok = ''
  let lineAId = ''
  let lineBId = ''

  /** 응답에서 이번 run이 만든 라인 이름만 정렬해 추린다(다른 시드/테스트 데이터 노이즈 제거) */
  const mine = (lines: Line[]): string[] =>
    lines
      .filter((l) => l.name.startsWith(PREFIX))
      .map((l) => l.name)
      .sort()

  async function list(page: Page, params: Record<string, string>): Promise<Line[]> {
    const resp = await page.request.get(`${API_URL}/shared-approval-lines`, {
      headers: H(adminTok),
      params,
    })
    expect(resp.ok()).toBeTruthy()
    const body = await resp.json()
    return (body?.data ?? body) as Line[]
  }

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    const admin = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    const gen = await login(page, ACCOUNTS.genAdmin.email, ACCOUNTS.genAdmin.password)
    const org = await login(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    const emp = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    adminTok = admin.accessToken

    // 라인 A: 작성자=admin(최고관리자), 결재자=orgAdmin(김조직)
    const ra = await page.request.post(`${API_URL}/shared-approval-lines`, {
      headers: H(admin.accessToken),
      data: {
        name: NAME_A,
        steps: [{ role: 'APPROVER', assigneeId: jwtEmployeeId(org.accessToken), stepOrder: 0 }],
      },
    })
    expect(ra.ok()).toBeTruthy()
    lineAId = (await ra.json()).data.id

    // 라인 B: 작성자=genAdmin(이총무), 결재자=employee(홍길동)
    const rb = await page.request.post(`${API_URL}/shared-approval-lines`, {
      headers: H(gen.accessToken),
      data: {
        name: NAME_B,
        steps: [{ role: 'APPROVER', assigneeId: jwtEmployeeId(emp.accessToken), stepOrder: 0 }],
      },
    })
    expect(rb.ok()).toBeTruthy()
    lineBId = (await rb.json()).data.id

    await page.close()
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    for (const id of [lineAId, lineBId]) {
      if (id) await page.request.delete(`${API_URL}/shared-approval-lines/${id}`, { headers: H(adminTok) })
    }
    await page.close()
  })

  test('필터 없이(prefix) — 이번 run의 두 라인이 모두 조회된다', async ({ page }) => {
    expect(mine(await list(page, { search: PREFIX }))).toEqual([NAME_A, NAME_B])
  })

  test('결재선명(search) — 정확한 이름이면 A만', async ({ page }) => {
    expect(mine(await list(page, { search: NAME_A }))).toEqual([NAME_A])
  })

  test('작성자명(author) — 최고관리자→A, 이총무→B', async ({ page }) => {
    expect(mine(await list(page, { author: '최고관리자', search: PREFIX }))).toEqual([NAME_A])
    expect(mine(await list(page, { author: '이총무', search: PREFIX }))).toEqual([NAME_B])
  })

  test('결재자명(approver) — 김조직→A, 홍길동→B', async ({ page }) => {
    expect(mine(await list(page, { approver: '김조직', search: PREFIX }))).toEqual([NAME_A])
    expect(mine(await list(page, { approver: '홍길동', search: PREFIX }))).toEqual([NAME_B])
  })

  test('작성일(dateFrom/dateTo) — 오늘은 포함, 미래 시작일은 제외', async ({ page }) => {
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const today = new Date()
    const tomorrow = new Date(today.getTime() + 86_400_000)
    expect(
      mine(await list(page, { search: PREFIX, dateFrom: iso(today), dateTo: iso(today) })),
    ).toEqual([NAME_A, NAME_B])
    expect(mine(await list(page, { search: PREFIX, dateFrom: iso(tomorrow) }))).toEqual([])
  })

  test('결재자명 미존재 — 전체 빈 배열', async ({ page }) => {
    expect(await list(page, { approver: `ZZNOEXIST${ts}` })).toEqual([])
  })

  test('[UI] 결재자명 입력 후 [조회] — 테이블에 A만 남고 B는 사라진다', async ({ page }) => {
    await uiLogin(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    await page.goto(`${BASE_URL}/admin/approval/lines`)
    await page.waitForLoadState('networkidle')

    // 결재선명(prefix)으로 이번 run에 한정 + 결재자명=김조직(라인 A의 결재자)
    await page.locator('.fld', { hasText: '결재선명' }).locator('input').fill(PREFIX)
    await page.locator('.fld', { hasText: '결재자명' }).locator('input').fill('김조직')
    await page.getByRole('button', { name: '조회' }).click()

    // A는 표시, B는 표시되지 않음 (웹-first assertion 자동 재시도)
    await expect(page.getByText(NAME_A, { exact: true })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(NAME_B, { exact: true })).toHaveCount(0)
  })
})
