/**
 * AbleWork ERP — 전자결재 부서수신 반송 E2E (역할별 갭 C-7)
 *
 * C-7: 결재 완료(APPROVED) 후 활성화된 부서수신(DEPT_RECEIVER) 단계를 부서 담당자가
 *      부서함에서 반송 → 해당 단계 BOUNCED.
 *
 * 셋업 메모: 개발팀에는 별도 문서담당자(OrganizationDocManager)가 없어, 부서수신 단계는
 * 상신 시 부서 결재자(approverId = orgAdmin)로 해석된다. 따라서 orgAdmin이 부서함에서 처리한다.
 *
 * 전략: 문서 상신·선행 승인은 API, 반송 클릭만 UI, 결과(단계 BOUNCED)는 API로 검증.
 * 전제: web/api/DB 기동 + 시드 계정. 포트는 helpers.ts(env 오버라이드).
 */
import { test, expect, type Page } from '@playwright/test'
import {
  ACCOUNTS,
  type Tokens,
  API_URL,
  login,
  jwtEmployeeId,
  uiLogin,
  firstFormId,
  createSubmittedDoc,
  docStatus,
  getSteps,
  stepActionApi,
  openDocInBox,
} from './helpers'

const COMMENT_PLACEHOLDER = '결재 의견을 입력하세요 (반려·전결 시 필수)'

interface OrgNode {
  id: string
  name: string
  children?: OrgNode[]
}

/** 조직 트리를 평탄화해 이름으로 조직 id를 찾는다 */
async function findOrgIdByName(page: Page, token: string, name: string): Promise<string> {
  const resp = await page.request.get(`${API_URL}/organizations`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await resp.json()
  const tree = (body?.data ?? body) as OrgNode[]
  const flat: OrgNode[] = []
  const walk = (nodes: OrgNode[]) =>
    nodes.forEach((n) => {
      flat.push(n)
      if (n.children?.length) walk(n.children)
    })
  walk(Array.isArray(tree) ? tree : [])
  const found = flat.find((o) => o.name === name)
  if (!found) throw new Error(`조직 '${name}'을 찾을 수 없습니다`)
  return found.id
}

test.describe('전자결재 부서수신 반송 (C-7)', () => {
  let adminTokens: Tokens
  let empTokens: Tokens
  let adminEmployeeId: string
  let devOrgId: string
  let formId: string

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    adminTokens = await login(page, ACCOUNTS.admin.email, ACCOUNTS.admin.password)
    empTokens = await login(page, ACCOUNTS.employee.email, ACCOUNTS.employee.password)
    adminEmployeeId = jwtEmployeeId(adminTokens.accessToken)
    devOrgId = await findOrgIdByName(page, adminTokens.accessToken, '개발팀')
    formId = await firstFormId(page, empTokens.accessToken)
    await page.close()
  })

  test('부서 담당자가 부서함에서 반송하면 부서수신 단계가 BOUNCED 된다', async ({ page }) => {
    const title = `E2E 부서수신반송 ${Date.now()}`
    // 결재(admin) → 부서수신(개발팀) 2단계
    const docId = await createSubmittedDoc(
      page,
      empTokens.accessToken,
      formId,
      [
        { role: 'APPROVER', assigneeId: adminEmployeeId, stepOrder: 1 },
        { role: 'DEPT_RECEIVER', organizationId: devOrgId, stepOrder: 2 },
      ],
      title,
    )

    // admin이 결재 승인 → 문서 APPROVED, 부서수신 단계 활성화(PENDING)
    const step1 = (await getSteps(page, adminTokens.accessToken, docId)).find(
      (s) => s.stepOrder === 1,
    )!
    const approve = await stepActionApi(page, adminTokens.accessToken, docId, step1.id, 'approve')
    expect(approve.ok()).toBeTruthy()
    expect(await docStatus(page, adminTokens.accessToken, docId)).toBe('APPROVED')

    // 부서 담당자(orgAdmin)가 부서함에서 의견 입력 후 반송
    await uiLogin(page, ACCOUNTS.orgAdmin.email, ACCOUNTS.orgAdmin.password)
    await openDocInBox(page, '/me/documents', '부서함', title)
    await page.getByPlaceholder(COMMENT_PLACEHOLDER).fill('E2E 부서수신 반송 사유')
    await page.getByRole('button', { name: '반송', exact: true }).click()

    // 부서수신 단계가 BOUNCED 처리됐는지 API로 검증
    await expect
      .poll(
        async () => {
          const steps = await getSteps(page, adminTokens.accessToken, docId)
          return steps.find((s) => s.role === 'DEPT_RECEIVER')?.status
        },
        { timeout: 10000 },
      )
      .toBe('BOUNCED')
  })
})
