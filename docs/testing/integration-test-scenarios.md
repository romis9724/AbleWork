# AbleWork 통합(e2e) 테스트 시나리오

> 기준일: 2026-06-15 · 대상: `apps/api` HTTP 레이어 + 실 PostgreSQL(`ablework_test`)
> 재사용 목적: 향후 세션에서 통합 테스트 범위·전제·기대결과를 즉시 파악 (LLM 토큰 절약).
> 총계: **9 스위트 / 78 케이스 전부 통과.** 2026-06-15 전자결재 직접 기능(S6·S7·S8) 38건 추가.

## 하니스 개요

| 항목 | 내용 |
|---|---|
| 실행 | `pnpm --filter api test:e2e` (= `jest --config ./test/jest-e2e.json`) |
| 대상 DB | **`ablework_test`** (개발 `ablework`와 분리. DB명만 치환, `.env` 접속정보 재사용) |
| 초기화 | `globalSetup`이 매 실행 시 `prisma migrate deploy` → 전 테이블 TRUNCATE → `seed.ts` |
| 부트스트랩 | `test/utils/test-app.ts` — 실제 `main.ts`와 동일한 prefix(`api/v1`)·GlobalExceptionFilter·ResponseTransformInterceptor 적용 |
| 인증 | `test/utils/auth.ts` — 시드 계정 로그인 → Bearer 토큰. `authedRequest(app, token)` 헬퍼 |
| 외부연동 | Discord webhook 미설정(`DISCORD_WEBHOOK_URL=''`)→미발송, Mail은 fire-and-forget, 알림규칙 `isActive:false` |
| 격리 | `maxWorkers:1` (단일 워커, 순차) — 실 DB 공유 상태 충돌 방지 |

### 시드 픽스처 (seed.ts)

| ID | 설명 | 권한 | 조직 |
|---|---|---|---|
| `seed-company-001` | AbleWork 테스트 회사 | — | — |
| `seed-emp-admin` (admin@ablework.io) | 최고관리자 | SUPER_ADMIN | — |
| `seed-emp-001` (employee@ablework.io, 홍길동) | 일반 직원 | EMPLOYEE | 개발팀 |
| `seed-emp-orgadmin` (orgadmin@ablework.io, 김조직) | 조직관리자 = **개발팀 결재자** | ORG_ADMIN | 개발팀 |
| `seed-emp-sales` (sales@ablework.io, 박영업) | 영업팀 직원 | EMPLOYEE | 영업팀 |
| `seed-org-dev` | 개발팀 (approverId=seed-emp-orgadmin) | — | — |
| `seed-org-sales` | 영업팀 | — | — |
| `seed-leave-type-annual` | 연차 (deductionDays 1) | — | — |
| leaveBalance × 4 | 전 직원 당해연도 연차 15일 | — | — |
| documentForm × 6 | leave/shift/attendance/device/offsite/custom | — | — |
| approvalRule × 3 | LEAVE_CREATE / SHIFT_CREATE / ATTENDANCE_EDIT (1라운드, 1인 승인) | — | — |

> ⚠️ 시드에는 **회사가 1개**뿐이다. 회사 간(cross-company) 테넌시 검증이 필요한 케이스는 테스트 내에서 제2 회사/직원/유저를 직접 생성한 뒤 검증한다(필요 시).

---

## 테스트 스위트 구성

| 파일 | 영역 | 핵심 검증 |
|---|---|---|
| `smoke.e2e-spec.ts` | 하니스 | 부팅·로그인·가드·응답래핑 |
| `auth.e2e-spec.ts` | 인증 | 로그인/토큰/갱신/비밀번호 변경 |
| `request-to-document.e2e-spec.ts` | 핵심플로우 ① | 요청→문서 자동생성 ($transaction) |
| `approval-flow.e2e-spec.ts` | 핵심플로우 ②④ | 결재→잔액차감 원자성 + 상태전이 |
| `tenancy-security.e2e-spec.ts` | 보안 | ORG_ADMIN 타조직 403 + 인증가드 |
| `integrity-security.e2e-spec.ts` | 무결성·권한 | 레코드 소유권·자기결재 방지·잔액 권한 + 기초데이터 삭제 가드 |
| `approval-documents.e2e-spec.ts` | 전자결재 직접 결재 | 다단계/반려/전결/협조/공람/수신/결재취소/본인결재자 금지/임시저장 CRUD/사후 공람추가 |
| `approval-admin.e2e-spec.ts` | 전자결재 관리 CRUD | 기안양식·번호규칙·접근규칙 / 양식분류 / 공용결재선 / 대리결재 + 권한·삭제차단 |
| `approval-boxes.e2e-spec.ts` | 문서함·부서 | box별(draft/in_progress/completed/pending_approval/viewer/reference/receiver/ledger/status/dept-docs) 조회·검색 + 부서협조/부서수신 |

### S5/S6. 무결성·권한 (`integrity-security.e2e-spec.ts`)
| # | 시나리오 | 기대 |
|---|---|---|
| 5-1 | 타 직원 휴가를 LEAVE_DELETE 요청·승인 | 소유권 불일치로 삭제 안 됨(롤백), 원본 보존 |
| 5-2 | 외부 결재자 없는 상태에서 요청 생성 | 400 `REQUEST_NO_APPROVER` (자기결재 방지) |
| 5-3/5-4 | EMPLOYEE 본인/타인 휴가 잔액 조회 | 본인 200 / 타인 403 `LEAVE_BALANCE_FORBIDDEN` |
| 5-5 | SUPER_ADMIN 타 직원 잔액 조회 | 200 |
| 5-6 | 사용 중 기안양식 삭제 | 403 `FORM_IN_USE` |
| 5-7 | 진행 중 요청 있는 승인 규칙 삭제 | 403 `APPROVAL_RULE_IN_USE` |

> 삭제 가드의 단위 테스트(정상/차단)는 각 서비스 spec에 포함: organizations/positions/shift-types/shift-templates/leaves/document-forms/custom-types/timeclock-areas/employees(deactivate).

---

## 시나리오 상세

### S0. 하니스 스모크 (`smoke.e2e-spec.ts`) — ✅ 구현·통과
- 앱이 `ablework_test`에 연결되어 부팅
- 시드 계정 로그인 → 토큰 발급, 4계정 전부 로그인 가능
- 토큰 없는/위조 토큰으로 보호 엔드포인트 → 401
- 인증 토큰으로 `/employees` 조회 → `{success:true, data:{items:[...]}}`

### S1. 인증 (`auth.e2e-spec.ts`)
| # | 시나리오 | 기대 |
|---|---|---|
| 1-1 | 올바른 자격증명 로그인 | 200, accessToken/refreshToken 반환 |
| 1-2 | 잘못된 비밀번호 | 401 |
| 1-3 | 미존재 이메일 | 401 (이메일 열거 방지: 동일 메시지) |
| 1-4 | refreshToken으로 토큰 갱신 | 200, 새 토큰 |
| 1-5 | 위조 refreshToken | 401 |
| 1-6 | 비밀번호 변경 후 신규 비밀번호 로그인 | 변경 성공 → 기존 비번 401, 신규 비번 200 (변경 복구 포함) |
| 1-7 | 비밀번호 변경 시 현재 비번 오류 | 400 |

### S2. 요청→전자결재 자동연동 (`request-to-document.e2e-spec.ts`) — CLAUDE.md §10-1
> 홍길동(개발팀 EMPLOYEE)이 휴가/근무일정/출퇴근 정정 요청 → 문서·결재선·결재단계 원자 생성.

| # | 시나리오 | 기대 |
|---|---|---|
| 2-1 | LEAVE 요청 생성 | request 1건 + document(status=PENDING, request.documentId 연결) + approvalLine 1 + approvalStep ≥1 생성, 모두 동일 companyId. ⚠️ 연동 FK는 `request.documentId`에 저장(`document.requestId`는 미사용) |
| 2-2 | 생성된 document의 결재자 = GENERAL_ADMIN↑ 최초(시드 기준 **seed-emp-admin**). org.approverId가 아니라 결재규칙 fallback(GENERAL_ADMIN↑, createdAt asc, 본인 제외) | approvalStep.assignee = admin |
| 2-3 | SHIFT_CREATE 요청 | shift_change 양식 기반 문서 자동생성 |
| 2-4 | ATTENDANCE_EDIT 요청 | attendance_correction 양식 기반 문서 자동생성 |
| 2-5 | 요청 목록/상세 조회 | 생성한 요청이 조회됨 |
| 2-6 | 잔액 초과 휴가 요청(>15일) | 검증 실패(LEAVE_BALANCE_INSUFFICIENT) 또는 정책에 따른 거부 — 실제 동작 확인 후 확정 |
| 2-7 | (원자성) 결재규칙 없는 타입 등 실패 유도 시 request/document 동시 롤백 | 부분 생성 없음 |

### S3. 결재 처리 → 실데이터 반영 (`approval-flow.e2e-spec.ts`) — CLAUDE.md §10-2, §10-4
> 결재 완료의 부수효과(휴가 잔액 차감)와 상태머신 전이를 검증.

| # | 시나리오 | 기대 |
|---|---|---|
| 3-1 | LEAVE 문서 최종 승인 | document APPROVED, approvalStep APPROVED |
| 3-2 | **잔액 차감 원자성** | 승인 전 remaining=15 → 승인 후 remaining=15-(deductionDays×일수), usedDays 증가. 차감과 상태변경이 같은 $transaction |
| 3-3 | 반려(reject) | document REJECTED, 잔액 미차감 |
| 3-4 | 권한 없는 사용자가 승인 시도(결재자 아님) | 403 (APPROVAL_STEP_NOT_CURRENT 등) |
| 3-5 | **회수→재상신→승인** 상태전이 | PENDING→(회수)RECALLED→(재상신)PENDING→(승인)APPROVED 전 구간 검증 |
| 3-6 | 회수는 기안자만 가능 | 타인 회수 시도 → 403 |
| 3-7 | 이미 승인된 문서 재승인 | 거부(상태 불변) |
| 3-8 | 동일 휴가 2회 승인 방지(멱등/중복차감 없음) | 잔액 1회만 차감 |

### S4. 멀티테넌시·권한 보안 (`tenancy-security.e2e-spec.ts`) — CLAUDE.md §10-3
| # | 시나리오 | 기대 |
|---|---|---|
| 4-1 | ORG_ADMIN(개발팀)이 영업팀(seed-org-sales) 데이터 접근 | 403 또는 404 (타 조직 차단) |
| 4-2 | ORG_ADMIN이 자기 조직(개발팀) 데이터 접근 | 200 |
| 4-3 | EMPLOYEE가 관리자 전용 엔드포인트(직원 등록 등) 접근 | 403 |
| 4-4 | 토큰 없이 보호 엔드포인트 | 401 |
| 4-5 | (가능 시) 타 회사 리소스 ID로 수정/삭제 시도 | 404 (companyId 격리) — 제2 회사 생성 후 검증 |

### S6. 전자결재 직접 기안 결재 흐름 (`approval-documents.e2e-spec.ts`)
> HR 요청 연동(S2/S3)과 별개로, 전자결재 메뉴의 일반 기안 전 구간을 `documents` API 직접 호출로 검증.
> 결재자: admin=seed-emp-admin, orgadmin=seed-emp-orgadmin, sales=seed-emp-sales / 기안자: employee(홍길동).
> 전결 테스트용 `allowPreApproval=true` 양식은 beforeAll에서 생성.

| # | 시나리오 | 기대 |
|---|---|---|
| 6-1 | 2단계 순차 결재 | 상신 시 step1=PENDING·step2=WAITING → step1 승인 시 step2=PENDING → step2 승인 시 문서 APPROVED |
| 6-2 | 반려(reject) | 문서 REJECTED, 이후 결재단계 CANCELLED |
| 6-3 | 전결(pre-approve, 허용 양식) | 현재 PRE_APPROVED, 이후 결재 SKIPPED, 수신 PENDING, 문서 APPROVED |
| 6-3b | 전결 미허용 양식에서 pre-approve | 4xx 거부 (`DOCUMENT_PRE_APPROVAL_NOT_ALLOWED`) |
| 6-4 | 협조(AGREEMENT) → agree | step APPROVED, 흐름 진행/완료 |
| 6-5 | 공람(VIEWER) → view | 상신 즉시 PENDING(비차단) → VIEWED, 문서 흐름과 독립 |
| 6-6 | 수신(RECEIVER) → receive | 최종 승인 전 WAITING → 승인 후 PENDING → RECEIVED, 문서 상태 불변 |
| 6-7 | 결재 취소(cancel-approval) | 승인 후 본인 단계 PENDING 복귀, 다음 단계 WAITING 재대기 |
| 6-8 | **기안자 본인을 결재자로 지정 후 상신** | **4xx `APPROVAL_SELF_NOT_ALLOWED`** (FE 규칙을 BE에서도 강제 — 본 테스트로 누락 발견·보강) |
| 6-9 | 임시저장(DRAFT) 수정(PATCH)→삭제(DELETE) | 제목 갱신 후 삭제 시 레코드 제거 |
| 6-10 | 결재 담당자 아닌 사용자 승인 시도 | 403, 문서 상태 불변 |
| 6-11 | 진행중 문서에 공람·참조 사후 추가(POST /:id/cc) | VIEWER step 추가, status=PENDING |

### S7. 전자결재 관리 기능 CRUD (`approval-admin.e2e-spec.ts`)
> 관리 CRUD 권한은 GENERAL_ADMIN↑(admin 충족, employee 거부). 대리결재는 본인 소유만.

| # | 시나리오 | 기대 |
|---|---|---|
| 7-1 | 기안양식 생성→수정→삭제 | 소프트 삭제(isActive=false) |
| 7-2 | EMPLOYEE 양식 생성 | 403 |
| 7-3 | 사용 중 양식 삭제 | 403 `FORM_IN_USE` |
| 7-4 | 문서번호 채번 규칙 PUT→GET | pattern 저장·조회 |
| 7-5 | 양식 접근규칙 POST→GET→DELETE | 조직 scope 규칙 CRUD (scopeId는 string FK, 서비스에서 존재검증) |
| 7-6 | 양식분류 생성→수정→삭제 | 정상 CRUD |
| 7-7 | 사용 중 분류 삭제 | 403 `FORM_CATEGORY_IN_USE` |
| 7-8 | EMPLOYEE 분류 생성 | 403 |
| 7-9 | 공용결재선 생성→steps 수정→삭제 | steps 변경 시 version 증가 |
| 7-10 | 결재선 이름 중복 | 400 `SHARED_LINE_DUPLICATE_NAME` |
| 7-11 | 최종결재자=협조자 충돌 | 400 `FINAL_APPROVER_IS_COLLABORATOR` |
| 7-12 | EMPLOYEE 결재선 생성 | 403 |
| 7-13 | 대리결재 생성→조회→수정→삭제 | 본인 소유 CRUD |
| 7-14 | 본인을 대리결재자로 지정 | 400 `PROXY_SELF_NOT_ALLOWED` |
| 7-15 | 타인 대리결재 설정 수정 | 4xx (본인만 가능) |

### S8. 문서함 조회 + 부서협조/수신 (`approval-boxes.e2e-spec.ts`)
> `GET /documents?box=...` 역할·상태별 필터링과 부서 단계 처리 검증. 검색(title)으로 누적 데이터와 격리.

| # | 시나리오 | 기대 |
|---|---|---|
| 8-1~8-3 | draft / in_progress / completed | 기안자 본인 문서가 상태별 함에 노출 |
| 8-4 | pending_approval | 결재자 결재함에 처리 대상 문서 노출 |
| 8-5 | viewer / reference | 공람·참조 담당자 함에 노출 |
| 8-6 | receiver | 수신 담당자 함에 노출(최종 승인 후) |
| 8-7 | ledger / status | 관리자 200, **EMPLOYEE 403** (관리자 전용) |
| 8-8 | 검색(search) | 제목으로 본인 문서 1건 정확 조회 |
| 8-9 | 부서협조(DEPT_COLLABORATOR) | 부서 단계 assignee=부서 결재자(seed-emp-orgadmin)로 해석, dept-collab 처리 후 APPROVED |
| 8-10 | 부서수신(DEPT_RECEIVER) bounce | step BOUNCED, 문서 상태 불변 |
| 8-11 | dept-docs | 부서 담당자의 부서서류함에 부서 단계 문서 노출 |

> 📌 **본 e2e가 발견·보강한 정합 이슈 2건**
> 1. `POST /documents/:id/submit` — 기안자 본인을 APPROVER로 지정한 상신을 BE에서 차단하지 않음(FE만 검증) → `APPROVAL_SELF_NOT_ALLOWED` 검증 추가.
> 2. `CreateFormAccessRuleSchema.scopeId` — `uuid()` 강제가 모듈 내 다른 FK(`organizationId`/`assigneeId`, `min(1)`)와 불일치 → `min(1)`로 완화(존재검증은 서비스 유지).

---

## 통합 테스트 작성 규칙 (재사용)

1. **AAA 패턴** + 한국어 `describe/it`.
2. 각 spec은 `beforeAll`에서 `createTestApp()`, `afterAll`에서 `closeTestApp(ctx)`.
3. 상태를 바꾸는 테스트는 자기 데이터를 직접 만들거나(고유 식별자) 시드 기준 델타로 검증. globalSetup이 매 실행 초기화하므로 파일 간 순서 의존 최소화.
4. DB 부수효과는 `ctx.prisma`로 직접 읽어 단언(예: 잔액 차감).
5. 외부연동(Discord/Mail) 단언 금지 — 비동기 fire-and-forget이므로 HTTP 응답·DB 상태만 검증.
