/**
 * S7. 전자결재 관리 기능 CRUD (admin 메뉴).
 * 기안양식 / 양식분류 / 공용 결재선 / 대리결재 의 생성·수정·삭제 + 권한·검증·삭제차단.
 *
 * 권한: 관리 CRUD는 GENERAL_ADMIN↑ (admin=SUPER_ADMIN 충족, employee=EMPLOYEE 거부).
 * 대리결재(proxy-settings)는 본인 소유만 조회·수정·삭제 가능.
 */
import { closeTestApp, createTestApp, TestContext } from './utils/test-app'
import { authedRequest, login } from './utils/auth'

const EMP_HONG = 'seed-emp-001'
const EMP_ORGADMIN = 'seed-emp-orgadmin'
const EMP_SALES = 'seed-emp-sales'
const ORG_DEV = 'seed-org-dev'

describe('S7. 전자결재 관리 기능 CRUD (approval-admin.e2e)', () => {
  let ctx: TestContext
  let adminToken: string
  let empToken: string
  let salesToken: string

  beforeAll(async () => {
    ctx = await createTestApp()
    adminToken = await login(ctx.app, 'admin')
    empToken = await login(ctx.app, 'employee')
    salesToken = await login(ctx.app, 'sales')
  })
  afterAll(async () => {
    await closeTestApp(ctx)
  })

  // ── 기안양식 (document-forms) ─────────────────────────────────────────────────
  describe('기안양식 (document-forms)', () => {
    it('7-1. GENERAL_ADMIN 양식 생성 → 수정 → 삭제(소프트, isActive=false)', async () => {
      const create = await authedRequest(ctx.app, adminToken)
        .post('/document-forms')
        .send({ name: 'e2e 관리 양식', visibilityScope: 'PUBLIC', allowReDraft: true })
      expect([200, 201]).toContain(create.status)
      const formId = create.body.data.id as string

      const patch = await authedRequest(ctx.app, adminToken)
        .patch(`/document-forms/${formId}`)
        .send({ name: 'e2e 수정 양식' })
      expect([200, 201]).toContain(patch.status)
      expect(patch.body.data.name).toBe('e2e 수정 양식')

      const del = await authedRequest(ctx.app, adminToken).delete(`/document-forms/${formId}`).send()
      expect([200, 201, 204]).toContain(del.status)
      const row = await ctx.prisma.documentForm.findUnique({ where: { id: formId } })
      expect(row!.isActive).toBe(false) // 소프트 삭제
    })

    it('7-2. EMPLOYEE 양식 생성 시도 → 403', async () => {
      const res = await authedRequest(ctx.app, empToken)
        .post('/document-forms')
        .send({ name: '권한없음', visibilityScope: 'PUBLIC' })
      expect(res.status).toBe(403)
    })

    it('7-3. 사용 중 양식 삭제 → FORM_IN_USE(403)', async () => {
      const create = await authedRequest(ctx.app, adminToken)
        .post('/document-forms')
        .send({ name: 'e2e 사용중 양식', visibilityScope: 'PUBLIC' })
      const formId = create.body.data.id as string

      // 해당 양식으로 문서(DRAFT) 생성
      const doc = await authedRequest(ctx.app, empToken)
        .post('/documents')
        .send({ formId, title: '사용 중 문서', content: {} })
      expect([200, 201]).toContain(doc.status)

      const del = await authedRequest(ctx.app, adminToken).delete(`/document-forms/${formId}`).send()
      expect(del.status).toBe(403)
      expect(del.body.error.code).toBe('FORM_IN_USE')
    })

    it('7-4. 문서번호 채번 규칙 PUT → GET', async () => {
      const create = await authedRequest(ctx.app, adminToken)
        .post('/document-forms')
        .send({ name: 'e2e 채번 양식', visibilityScope: 'PUBLIC' })
      const formId = create.body.data.id as string

      const put = await authedRequest(ctx.app, adminToken)
        .put(`/document-forms/${formId}/number-rule`)
        .send({ pattern: '{YYYY}-{SEQ:4}', resetYearly: true })
      expect([200, 201]).toContain(put.status)

      const get = await authedRequest(ctx.app, adminToken).get(`/document-forms/${formId}/number-rule`)
      expect(get.status).toBe(200)
      expect(get.body.data.pattern).toBe('{YYYY}-{SEQ:4}')
    })

    it('7-5. 양식 접근규칙 POST → GET → DELETE', async () => {
      const create = await authedRequest(ctx.app, adminToken)
        .post('/document-forms')
        .send({ name: 'e2e 접근규칙 양식', visibilityScope: 'DEPARTMENT' })
      const formId = create.body.data.id as string

      const post = await authedRequest(ctx.app, adminToken)
        .post(`/document-forms/${formId}/access-rules`)
        .send({ scopeType: 'ORGANIZATION', scopeId: ORG_DEV })
      expect([200, 201]).toContain(post.status)
      const ruleId = post.body.data.id as string

      const get = await authedRequest(ctx.app, adminToken).get(`/document-forms/${formId}/access-rules`)
      expect(get.status).toBe(200)
      expect(get.body.data.length).toBeGreaterThanOrEqual(1)

      const del = await authedRequest(ctx.app, adminToken)
        .delete(`/document-forms/${formId}/access-rules/${ruleId}`)
        .send()
      expect([200, 201, 204]).toContain(del.status)
    })
  })

  // ── 양식분류 (form-categories) ───────────────────────────────────────────────
  describe('양식분류 (form-categories)', () => {
    it('7-6. 분류 생성 → 수정 → 삭제', async () => {
      const create = await authedRequest(ctx.app, adminToken)
        .post('/form-categories')
        .send({ name: 'e2e 분류', sortOrder: 1 })
      expect([200, 201]).toContain(create.status)
      const catId = create.body.data.id as string

      const patch = await authedRequest(ctx.app, adminToken)
        .patch(`/form-categories/${catId}`)
        .send({ name: 'e2e 분류 수정' })
      expect([200, 201]).toContain(patch.status)
      expect(patch.body.data.name).toBe('e2e 분류 수정')

      const del = await authedRequest(ctx.app, adminToken).delete(`/form-categories/${catId}`).send()
      expect([200, 201, 204]).toContain(del.status)
    })

    it('7-7. 사용 중 분류 삭제 → FORM_CATEGORY_IN_USE(403)', async () => {
      const cat = await authedRequest(ctx.app, adminToken)
        .post('/form-categories')
        .send({ name: 'e2e 사용중 분류' })
      const catId = cat.body.data.id as string

      // 이 분류를 쓰는 양식 생성
      const form = await authedRequest(ctx.app, adminToken)
        .post('/document-forms')
        .send({ name: 'e2e 분류사용 양식', visibilityScope: 'PUBLIC', categoryId: catId })
      expect([200, 201]).toContain(form.status)

      const del = await authedRequest(ctx.app, adminToken).delete(`/form-categories/${catId}`).send()
      expect(del.status).toBe(403)
      expect(del.body.error.code).toBe('FORM_CATEGORY_IN_USE')
    })

    it('7-8. EMPLOYEE 분류 생성 시도 → 403', async () => {
      const res = await authedRequest(ctx.app, empToken).post('/form-categories').send({ name: '권한없음' })
      expect(res.status).toBe(403)
    })
  })

  // ── 공용 결재선 (shared-approval-lines) ──────────────────────────────────────
  describe('공용 결재선 (shared-approval-lines)', () => {
    it('7-9. 결재선 생성 → steps 수정(version 증가) → 삭제', async () => {
      const create = await authedRequest(ctx.app, adminToken)
        .post('/shared-approval-lines')
        .send({
          name: 'e2e 결재선',
          steps: [{ role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 1 }],
        })
      expect([200, 201]).toContain(create.status)
      const lineId = create.body.data.id as string
      const v1 = create.body.data.version as number

      const patch = await authedRequest(ctx.app, adminToken)
        .patch(`/shared-approval-lines/${lineId}`)
        .send({
          steps: [
            { role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 1 },
            { role: 'APPROVER', assigneeId: EMP_SALES, stepOrder: 2 },
          ],
        })
      expect([200, 201]).toContain(patch.status)
      expect(patch.body.data.version).toBeGreaterThan(v1) // steps 변경 → version 증가

      const del = await authedRequest(ctx.app, adminToken).delete(`/shared-approval-lines/${lineId}`).send()
      expect([200, 201, 204]).toContain(del.status)
    })

    it('7-10. 같은 회사 내 이름 중복 → SHARED_LINE_DUPLICATE_NAME(400)', async () => {
      const name = 'e2e 중복 결재선'
      const first = await authedRequest(ctx.app, adminToken)
        .post('/shared-approval-lines')
        .send({ name, steps: [{ role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 1 }] })
      expect([200, 201]).toContain(first.status)

      const dup = await authedRequest(ctx.app, adminToken)
        .post('/shared-approval-lines')
        .send({ name, steps: [{ role: 'APPROVER', assigneeId: EMP_SALES, stepOrder: 1 }] })
      expect(dup.status).toBe(400)
      expect(dup.body.error.code).toBe('SHARED_LINE_DUPLICATE_NAME')
    })

    it('7-11. 최종 결재자를 협조자로도 지정 → FINAL_APPROVER_IS_COLLABORATOR(400)', async () => {
      const res = await authedRequest(ctx.app, adminToken)
        .post('/shared-approval-lines')
        .send({
          name: 'e2e 충돌 결재선',
          steps: [
            { role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 1 },
            { role: 'AGREEMENT', assigneeId: EMP_ORGADMIN, stepOrder: 2 },
          ],
        })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('FINAL_APPROVER_IS_COLLABORATOR')
    })

    it('7-12. EMPLOYEE 결재선 생성 시도 → 403', async () => {
      const res = await authedRequest(ctx.app, empToken)
        .post('/shared-approval-lines')
        .send({ name: '권한없음', steps: [{ role: 'APPROVER', assigneeId: EMP_ORGADMIN, stepOrder: 1 }] })
      expect(res.status).toBe(403)
    })
  })

  // ── 대리결재 (proxy-settings) ────────────────────────────────────────────────
  describe('대리결재 (proxy-settings)', () => {
    it('7-13. 본인 대리결재 생성 → 조회 → 수정 → 삭제', async () => {
      const create = await authedRequest(ctx.app, empToken)
        .post('/proxy-settings')
        .send({ proxyId: EMP_ORGADMIN, startDate: '2026-01-01', endDate: '2026-12-31', reason: '휴가' })
      expect([200, 201]).toContain(create.status)
      const proxyId = create.body.data.id as string

      const get = await authedRequest(ctx.app, empToken).get('/proxy-settings')
      expect(get.status).toBe(200)
      expect(Array.isArray(get.body.data) ? get.body.data.length : get.body.data.items.length).toBeGreaterThanOrEqual(1)

      const patch = await authedRequest(ctx.app, empToken)
        .patch(`/proxy-settings/${proxyId}`)
        .send({ isActive: false })
      expect([200, 201]).toContain(patch.status)
      expect(patch.body.data.isActive).toBe(false)

      const del = await authedRequest(ctx.app, empToken).delete(`/proxy-settings/${proxyId}`).send()
      expect([200, 201, 204]).toContain(del.status)
    })

    it('7-14. 본인을 대리결재자로 지정 → PROXY_SELF_NOT_ALLOWED(400)', async () => {
      const res = await authedRequest(ctx.app, empToken)
        .post('/proxy-settings')
        .send({ proxyId: EMP_HONG, startDate: '2026-01-01', endDate: '2026-12-31' })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('PROXY_SELF_NOT_ALLOWED')
    })

    it('7-15. 타인의 대리결재 설정 수정 시도 → 4xx (본인만 가능)', async () => {
      const create = await authedRequest(ctx.app, empToken)
        .post('/proxy-settings')
        .send({ proxyId: EMP_ORGADMIN, startDate: '2026-02-01', endDate: '2026-02-28' })
      const proxyId = create.body.data.id as string

      // sales(타인)가 홍길동의 설정 수정 시도
      const res = await authedRequest(ctx.app, salesToken)
        .patch(`/proxy-settings/${proxyId}`)
        .send({ isActive: false })
      expect(res.status).toBeGreaterThanOrEqual(400)
    })
  })
})
