/**
 * S8. 문서함 조회(box별 분류) + 부서협조/부서수신 흐름.
 * GET /documents?box=... 가 역할·상태별로 올바르게 필터링하는지, 관리자 전용 box 권한,
 * 부서 단계(DEPT_COLLABORATOR/DEPT_RECEIVER)의 담당자 해석·처리(dept-collab/bounce)를 검증한다.
 *
 * 결재자: admin=seed-emp-admin, orgadmin=seed-emp-orgadmin(개발팀 결재자), sales=seed-emp-sales
 * 기안자: employee=seed-emp-001(홍길동, 개발팀)
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const EMP_ADMIN = 'seed-emp-admin'
const EMP_ORGADMIN = 'seed-emp-orgadmin'
const EMP_SALES = 'seed-emp-sales'
const ORG_DEV = 'seed-org-dev'
const FORM_CUSTOM = 'seed-form-custom'

interface StepInput {
  role: string
  assigneeId?: string
  organizationId?: string
  stepOrder: number
}

describe('S8. 문서함 조회 + 부서협조/수신 (approval-boxes.e2e)', () => {
  let ctx: TestContext
  let empToken: string
  let adminToken: string
  let orgadminToken: string
  let salesToken: string

  beforeAll(async () => {
    ctx = await createTestApp()
    empToken = await login(ctx.app, 'employee')
    adminToken = await login(ctx.app, 'admin')
    orgadminToken = await login(ctx.app, 'orgadmin')
    salesToken = await login(ctx.app, 'sales')
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  // ── 헬퍼 ────────────────────────────────────────────────────────────────────
  const createDoc = async (token: string, steps: StepInput[], title: string): Promise<string> => {
    const res = await authedRequest(ctx.app, token)
      .post('/documents')
      .send({ formId: FORM_CUSTOM, title, content: {}, steps })
    expect([200, 201]).toContain(res.status)
    return res.body.data.id as string
  }
  const submitDoc = async (token: string, docId: string) => {
    const res = await authedRequest(ctx.app, token).post(`/documents/${docId}/submit`).send({})
    expect([200, 201]).toContain(res.status)
  }
  const stepByOrder = (docId: string, stepOrder: number) =>
    ctx.prisma.approvalStep.findFirst({ where: { line: { documentId: docId }, stepOrder } })
  const approve = (token: string, docId: string, stepId: string, action = 'approve') =>
    authedRequest(ctx.app, token).post(`/documents/${docId}/steps/${stepId}/${action}`).send({})
  /** box 조회 — title 검색으로 대상 문서만 좁혀 누적 데이터와 격리 */
  const boxItems = async (token: string, box: string, search?: string) => {
    const qs = new URLSearchParams({ box, limit: '100', ...(search ? { search } : {}) })
    const res = await authedRequest(ctx.app, token).get(`/documents?${qs.toString()}`)
    return res
  }
  const containsDoc = (res: { body: { data: { items: { id: string }[] } } }, docId: string) =>
    res.body.data.items.some((i) => i.id === docId)

  // ── 문서함 box 분류 ───────────────────────────────────────────────────────────
  it('8-1. draft: 임시저장 문서가 기안자 기안함(draft)에 노출', async () => {
    const t = '박스-임시저장-8-1'
    const docId = await createDoc(empToken, [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }], t)
    const res = await boxItems(empToken, 'draft', t)
    expect(res.status).toBe(200)
    expect(containsDoc(res, docId)).toBe(true)
  })

  it('8-2. in_progress: 상신 문서가 기안자 진행중함에 노출', async () => {
    const t = '박스-진행중-8-2'
    const docId = await createDoc(empToken, [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }], t)
    await submitDoc(empToken, docId)
    const res = await boxItems(empToken, 'in_progress', t)
    expect(containsDoc(res, docId)).toBe(true)
  })

  it('8-3. completed: 승인 완료 문서가 기안자 완료함에 노출', async () => {
    const t = '박스-완료-8-3'
    const docId = await createDoc(empToken, [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }], t)
    await submitDoc(empToken, docId)
    const s1 = await stepByOrder(docId, 1)
    await approve(adminToken, docId, s1!.id).expect((r) => expect([200, 201]).toContain(r.status))
    const res = await boxItems(empToken, 'completed', t)
    expect(containsDoc(res, docId)).toBe(true)
  })

  it('8-4. pending_approval: 결재자 결재함에 본인이 처리할 문서 노출', async () => {
    const t = '박스-결재함-8-4'
    const docId = await createDoc(empToken, [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }], t)
    await submitDoc(empToken, docId)
    const res = await boxItems(adminToken, 'pending_approval', t)
    expect(res.status).toBe(200)
    expect(containsDoc(res, docId)).toBe(true)
  })

  it('8-5. viewer/reference: 공람·참조 담당자 함에 노출', async () => {
    const t = '박스-공람참조-8-5'
    const docId = await createDoc(
      empToken,
      [
        { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
        { role: 'VIEWER', assigneeId: EMP_SALES, stepOrder: 2 },
        { role: 'REFERENCE', assigneeId: EMP_ORGADMIN, stepOrder: 3 },
      ],
      t,
    )
    await submitDoc(empToken, docId)
    const viewerRes = await boxItems(salesToken, 'viewer', t)
    expect(containsDoc(viewerRes, docId)).toBe(true)
    const refRes = await boxItems(orgadminToken, 'reference', t)
    expect(containsDoc(refRes, docId)).toBe(true)
  })

  it('8-6. receiver: 수신 담당자 함에 노출 (최종 승인 후)', async () => {
    const t = '박스-수신-8-6'
    const docId = await createDoc(
      empToken,
      [
        { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
        { role: 'RECEIVER', assigneeId: EMP_SALES, stepOrder: 2 },
      ],
      t,
    )
    await submitDoc(empToken, docId)
    const s1 = await stepByOrder(docId, 1)
    await approve(adminToken, docId, s1!.id).expect((r) => expect([200, 201]).toContain(r.status))
    const res = await boxItems(salesToken, 'receiver', t)
    expect(containsDoc(res, docId)).toBe(true)
  })

  it('8-7. ledger/status: 관리자 전용 — admin 200, EMPLOYEE는 403', async () => {
    const ledgerAdmin = await authedRequest(ctx.app, adminToken).get('/documents?box=ledger&limit=10')
    expect(ledgerAdmin.status).toBe(200)
    const statusAdmin = await authedRequest(ctx.app, adminToken).get('/documents?box=status&limit=10')
    expect(statusAdmin.status).toBe(200)

    const statusEmp = await authedRequest(ctx.app, empToken).get('/documents?box=status&limit=10')
    expect(statusEmp.status).toBe(403)
    const ledgerEmp = await authedRequest(ctx.app, empToken).get('/documents?box=ledger&limit=10')
    expect(ledgerEmp.status).toBe(403)
  })

  it('8-8. 검색(search): 제목으로 본인 문서를 좁혀 조회', async () => {
    const t = '박스-검색고유키워드-8-8'
    const docId = await createDoc(empToken, [{ role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 }], t)
    await submitDoc(empToken, docId)
    const res = await boxItems(empToken, 'in_progress', '검색고유키워드-8-8')
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(1)
    expect(res.body.data.items[0].id).toBe(docId)
  })

  // ── 부서협조 / 부서수신 ────────────────────────────────────────────────────────
  it('8-9. 부서협조(DEPT_COLLABORATOR): 부서 결재자가 담당자로 해석 → dept-collab 처리', async () => {
    const t = '박스-부서협조-8-9'
    const docId = await createDoc(
      empToken,
      [
        { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
        { role: 'DEPT_COLLABORATOR', organizationId: ORG_DEV, stepOrder: 2 },
      ],
      t,
    )
    await submitDoc(empToken, docId)

    // 부서 단계 assignee = 개발팀 문서담당자/결재자(seed-emp-orgadmin)로 해석
    const s2 = await stepByOrder(docId, 2)
    expect(s2!.assigneeId).toBe(EMP_ORGADMIN)

    // 1차 결재 → 부서협조 단계 활성화
    const s1 = await stepByOrder(docId, 1)
    await approve(adminToken, docId, s1!.id).expect((r) => expect([200, 201]).toContain(r.status))
    expect((await stepByOrder(docId, 2))!.status).toBe('PENDING')

    // 부서 결재자가 부서협조 처리
    const collab = await approve(orgadminToken, docId, s2!.id, 'dept-collab')
    expect([200, 201]).toContain(collab.status)
    expect((await stepByOrder(docId, 2))!.status).toBe('APPROVED')
    const doc = await ctx.prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).toBe('APPROVED')
  })

  it('8-10. 부서수신(DEPT_RECEIVER) bounce → BOUNCED (문서 상태 불변)', async () => {
    const t = '박스-부서수신-8-10'
    const docId = await createDoc(
      empToken,
      [
        { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
        { role: 'DEPT_RECEIVER', organizationId: ORG_DEV, stepOrder: 2 },
      ],
      t,
    )
    await submitDoc(empToken, docId)
    const s1 = await stepByOrder(docId, 1)
    await approve(adminToken, docId, s1!.id).expect((r) => expect([200, 201]).toContain(r.status))

    // 최종 승인 후 부서수신 활성화
    const s2 = await stepByOrder(docId, 2)
    expect(s2!.status).toBe('PENDING')
    expect(s2!.assigneeId).toBe(EMP_ORGADMIN)

    const bounce = await approve(orgadminToken, docId, s2!.id, 'bounce')
    expect([200, 201]).toContain(bounce.status)
    expect((await stepByOrder(docId, 2))!.status).toBe('BOUNCED')
    const doc = await ctx.prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).toBe('APPROVED') // 수신/반송은 문서 상태 불변
  })

  it('8-11. dept-docs: 부서 담당자의 부서서류함에 부서 단계 문서 노출', async () => {
    const t = '박스-부서함-8-11'
    const docId = await createDoc(
      empToken,
      [
        { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
        { role: 'DEPT_COLLABORATOR', organizationId: ORG_DEV, stepOrder: 2 },
      ],
      t,
    )
    await submitDoc(empToken, docId)
    const res = await boxItems(orgadminToken, 'dept-docs', t)
    expect(res.status).toBe(200)
    expect(containsDoc(res, docId)).toBe(true)
  })
})
