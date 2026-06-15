/**
 * S6. 전자결재 직접 기안 결재 흐름 (documents.controller 직접 호출).
 * HR 요청 연동(S2/S3)과 별개로, 전자결재 메뉴의 일반 기안 전 구간을 검증한다:
 *  - 다단계 순차 결재 / 반려 / 전결(pre-approve) / 협조(agree) / 공람(view) / 수신(receive)
 *  - 결재 취소(cancel-approval) / 본인 결재자 금지 / 임시저장 수정·삭제 / 비결재자 차단
 *
 * 시드 결재자: admin=seed-emp-admin, orgadmin=seed-emp-orgadmin(개발팀), sales=seed-emp-sales(영업팀)
 * 기안자: employee=seed-emp-001(홍길동)
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const EMP_HONG = 'seed-emp-001'
const EMP_ADMIN = 'seed-emp-admin'
const EMP_ORGADMIN = 'seed-emp-orgadmin'
const EMP_SALES = 'seed-emp-sales'
const FORM_CUSTOM = 'seed-form-custom'

interface StepInput {
  role: string
  assigneeId?: string
  organizationId?: string
  stepOrder: number
}

describe('S6. 전자결재 직접 기안 결재 흐름 (approval-documents.e2e)', () => {
  let ctx: TestContext
  let empToken: string
  let adminToken: string
  let orgadminToken: string
  let salesToken: string
  /** 전결 허용 양식 (allowPreApproval=true) — beforeAll에서 생성 */
  let preApprovalFormId: string

  beforeAll(async () => {
    ctx = await createTestApp()
    empToken = await login(ctx.app, 'employee')
    adminToken = await login(ctx.app, 'admin')
    orgadminToken = await login(ctx.app, 'orgadmin')
    salesToken = await login(ctx.app, 'sales')

    const formRes = await authedRequest(ctx.app, adminToken)
      .post('/document-forms')
      .send({ name: 'e2e 전결 허용 양식', visibilityScope: 'PUBLIC', allowPreApproval: true })
    expect([200, 201]).toContain(formRes.status)
    preApprovalFormId = formRes.body.data.id
    expect(preApprovalFormId).toBeTruthy()
  })

  afterAll(async () => {
    await closeTestApp(ctx)
  })

  // ── 헬퍼 ────────────────────────────────────────────────────────────────────
  const createDoc = async (
    token: string,
    steps: StepInput[],
    opts: { formId?: string; title?: string } = {},
  ): Promise<string> => {
    const res = await authedRequest(ctx.app, token)
      .post('/documents')
      .send({
        formId: opts.formId ?? FORM_CUSTOM,
        title: opts.title ?? 'e2e 직접 기안',
        content: { body: '<p>본문</p>' },
        steps,
      })
    expect([200, 201]).toContain(res.status)
    return res.body.data.id as string
  }

  const submitDoc = async (token: string, docId: string) => {
    const res = await authedRequest(ctx.app, token).post(`/documents/${docId}/submit`).send({})
    expect([200, 201]).toContain(res.status)
  }

  const stepByOrder = (docId: string, stepOrder: number) =>
    ctx.prisma.approvalStep.findFirst({ where: { line: { documentId: docId }, stepOrder } })

  const docStatus = async (docId: string) =>
    (await ctx.prisma.document.findUnique({ where: { id: docId } }))!.status

  const act = (token: string, docId: string, stepId: string, action: string, comment?: string) =>
    authedRequest(ctx.app, token)
      .post(`/documents/${docId}/steps/${stepId}/${action}`)
      .send(comment ? { comment } : {})

  // ── 1. 다단계 순차 결재 ────────────────────────────────────────────────────────
  it('6-1. 2단계 순차 결재: step1 승인 → step2 활성화 → step2 승인 → APPROVED', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
      { role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 2 },
    ])
    await submitDoc(empToken, docId)

    let s1 = await stepByOrder(docId, 1)
    let s2 = await stepByOrder(docId, 2)
    expect(s1!.status).toBe('PENDING')
    expect(s2!.status).toBe('WAITING') // 2번째는 대기

    // step1 승인 → step2 활성화
    const a1 = await act(adminToken, docId, s1!.id, 'approve', '1차 승인')
    expect([200, 201]).toContain(a1.status)
    s1 = await stepByOrder(docId, 1)
    s2 = await stepByOrder(docId, 2)
    expect(s1!.status).toBe('APPROVED')
    expect(s2!.status).toBe('PENDING')
    expect(await docStatus(docId)).toBe('PENDING') // 아직 진행중

    // step2 승인 → 문서 APPROVED
    const a2 = await act(orgadminToken, docId, s2!.id, 'approve', '최종 승인')
    expect([200, 201]).toContain(a2.status)
    expect(await docStatus(docId)).toBe('APPROVED')
  })

  // ── 2. 반려 ────────────────────────────────────────────────────────────────
  it('6-2. 반려 → 문서 REJECTED + 이후 단계 CANCELLED', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
      { role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 2 },
    ])
    await submitDoc(empToken, docId)

    const s1 = await stepByOrder(docId, 1)
    const rej = await act(adminToken, docId, s1!.id, 'reject', '반려 사유')
    expect([200, 201]).toContain(rej.status)

    expect(await docStatus(docId)).toBe('REJECTED')
    const s1After = await stepByOrder(docId, 1)
    const s2After = await stepByOrder(docId, 2)
    expect(s1After!.status).toBe('REJECTED')
    expect(s2After!.status).toBe('CANCELLED') // 이후 결재단계 취소
  })

  // ── 3. 전결 ────────────────────────────────────────────────────────────────
  it('6-3. 전결(pre-approve) → 이후 결재 SKIPPED + 수신 활성화 + 문서 APPROVED', async () => {
    const docId = await createDoc(
      empToken,
      [
        { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
        { role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 2 },
        { role: 'RECEIVER', assigneeId: EMP_SALES, stepOrder: 3 },
      ],
      { formId: preApprovalFormId, title: 'e2e 전결' },
    )
    await submitDoc(empToken, docId)

    const s1 = await stepByOrder(docId, 1)
    const pre = await act(adminToken, docId, s1!.id, 'pre-approve', '전결 처리')
    expect([200, 201]).toContain(pre.status)

    expect(await docStatus(docId)).toBe('APPROVED')
    expect((await stepByOrder(docId, 1))!.status).toBe('PRE_APPROVED')
    expect((await stepByOrder(docId, 2))!.status).toBe('SKIPPED') // 이후 결재 생략
    expect((await stepByOrder(docId, 3))!.status).toBe('PENDING') // 수신은 활성화
  })

  it('6-3b. 전결 미허용 양식에서 pre-approve 시도 → 거부(4xx)', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
    ])
    await submitDoc(empToken, docId)
    const s1 = await stepByOrder(docId, 1)
    const pre = await act(adminToken, docId, s1!.id, 'pre-approve')
    expect(pre.status).toBeGreaterThanOrEqual(400) // FORM_CUSTOM은 allowPreApproval=false
  })

  // ── 4. 협조 ────────────────────────────────────────────────────────────────
  it('6-4. 협조(AGREEMENT) 단계 처리 → 흐름 진행', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
      { role: 'AGREEMENT', assigneeId: EMP_ORGADMIN, stepOrder: 2 },
    ])
    await submitDoc(empToken, docId)

    const s1 = await stepByOrder(docId, 1)
    await act(adminToken, docId, s1!.id, 'approve').expect((r) => expect([200, 201]).toContain(r.status))

    const s2 = await stepByOrder(docId, 2)
    expect(s2!.status).toBe('PENDING')
    const agr = await act(orgadminToken, docId, s2!.id, 'agree', '협조합니다')
    expect([200, 201]).toContain(agr.status)
    expect((await stepByOrder(docId, 2))!.status).toBe('APPROVED')
    expect(await docStatus(docId)).toBe('APPROVED')
  })

  // ── 5. 공람 ────────────────────────────────────────────────────────────────
  it('6-5. 공람(VIEWER) view → VIEWED (비차단, 문서 흐름과 독립)', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
      { role: 'VIEWER', assigneeId: EMP_SALES, stepOrder: 2 },
    ])
    await submitDoc(empToken, docId)

    // 공람은 비차단이라 상신 즉시 PENDING
    const viewer = await stepByOrder(docId, 2)
    expect(viewer!.status).toBe('PENDING')
    const v = await act(salesToken, docId, viewer!.id, 'view')
    expect([200, 201]).toContain(v.status)
    expect((await stepByOrder(docId, 2))!.status).toBe('VIEWED')

    // 결재자 승인 → 문서 APPROVED
    const s1 = await stepByOrder(docId, 1)
    await act(adminToken, docId, s1!.id, 'approve').expect((r) => expect([200, 201]).toContain(r.status))
    expect(await docStatus(docId)).toBe('APPROVED')
  })

  // ── 6. 수신 ────────────────────────────────────────────────────────────────
  it('6-6. 수신(RECEIVER): 최종 승인 후 PENDING → receive → RECEIVED', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
      { role: 'RECEIVER', assigneeId: EMP_SALES, stepOrder: 2 },
    ])
    await submitDoc(empToken, docId)

    // 수신은 최종 승인 전까지 WAITING
    expect((await stepByOrder(docId, 2))!.status).toBe('WAITING')

    const s1 = await stepByOrder(docId, 1)
    await act(adminToken, docId, s1!.id, 'approve').expect((r) => expect([200, 201]).toContain(r.status))
    expect(await docStatus(docId)).toBe('APPROVED')
    const receiver = await stepByOrder(docId, 2)
    expect(receiver!.status).toBe('PENDING') // 승인 후 수신 활성화

    const rcv = await act(salesToken, docId, receiver!.id, 'receive')
    expect([200, 201]).toContain(rcv.status)
    expect((await stepByOrder(docId, 2))!.status).toBe('RECEIVED')
    expect(await docStatus(docId)).toBe('APPROVED') // 수신은 문서 상태 불변
  })

  // ── 7. 결재 취소 ────────────────────────────────────────────────────────────
  it('6-7. 결재 취소(cancel-approval): 승인 후 본인 결재 취소 → step PENDING 복귀', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
      { role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 2 },
    ])
    await submitDoc(empToken, docId)

    const s1 = await stepByOrder(docId, 1)
    await act(adminToken, docId, s1!.id, 'approve').expect((r) => expect([200, 201]).toContain(r.status))
    expect((await stepByOrder(docId, 1))!.status).toBe('APPROVED')
    expect((await stepByOrder(docId, 2))!.status).toBe('PENDING')

    const cancel = await act(adminToken, docId, s1!.id, 'cancel-approval', '실수로 승인')
    expect([200, 201]).toContain(cancel.status)
    expect((await stepByOrder(docId, 1))!.status).toBe('PENDING') // 본인 단계 복귀
    expect((await stepByOrder(docId, 2))!.status).toBe('WAITING') // 다음 단계 재대기
    expect(await docStatus(docId)).toBe('PENDING')
  })

  // ── 8. 본인 결재자 금지 ──────────────────────────────────────────────────────
  it('6-8. 기안자 본인을 결재자로 지정 후 상신 → 거부(4xx)', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_HONG, stepOrder: 1 }, // 기안자=홍길동 본인
    ])
    const res = await authedRequest(ctx.app, empToken).post(`/documents/${docId}/submit`).send({})
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(await docStatus(docId)).toBe('DRAFT') // 상신 실패 → 여전히 DRAFT
  })

  // ── 9. 임시저장 수정·삭제 ─────────────────────────────────────────────────────
  it('6-9. 임시저장(DRAFT) 수정(PATCH) → 삭제(DELETE)', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
    ])
    expect(await docStatus(docId)).toBe('DRAFT')

    const patch = await authedRequest(ctx.app, empToken)
      .patch(`/documents/${docId}`)
      .send({ title: '수정된 제목' })
    expect([200, 201]).toContain(patch.status)
    expect((await ctx.prisma.document.findUnique({ where: { id: docId } }))!.title).toBe('수정된 제목')

    const del = await authedRequest(ctx.app, empToken).delete(`/documents/${docId}`).send()
    expect([200, 201, 204]).toContain(del.status)
    expect(await ctx.prisma.document.findUnique({ where: { id: docId } })).toBeNull()
  })

  // ── 10. 권한: 비결재자 ────────────────────────────────────────────────────────
  it('6-10. 결재 단계 담당자가 아닌 사용자가 승인 시도 → 403', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
    ])
    await submitDoc(empToken, docId)
    const s1 = await stepByOrder(docId, 1)
    // sales(담당자 아님)가 승인 시도
    const res = await act(salesToken, docId, s1!.id, 'approve')
    expect(res.status).toBe(403)
    expect(await docStatus(docId)).toBe('PENDING') // 변동 없음
  })

  // ── 11. 공람·참조 사후 추가 ───────────────────────────────────────────────────
  it('6-11. 진행중 문서에 공람·참조 사후 추가(POST /:id/cc)', async () => {
    const docId = await createDoc(empToken, [
      { role: 'APPROVER', assigneeId: EMP_ADMIN, stepOrder: 1 },
    ])
    await submitDoc(empToken, docId)

    const cc = await authedRequest(ctx.app, empToken)
      .post(`/documents/${docId}/cc`)
      .send({ steps: [{ role: 'VIEWER', assigneeId: EMP_SALES }] })
    expect([200, 201]).toContain(cc.status)

    const viewerStep = await ctx.prisma.approvalStep.findFirst({
      where: { line: { documentId: docId }, role: 'VIEWER', assigneeId: EMP_SALES },
    })
    expect(viewerStep).toBeTruthy()
    expect(viewerStep!.status).toBe('PENDING') // 공람은 즉시 확인 가능
  })
})
