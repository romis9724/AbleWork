# 전자결재 조합 통합테스트 매트릭스 (크롬 E2E)

> 목적: 전자결재(AP) 프로세스를 **경우의 수 조합**으로 심화 통합테스트한다.
> 차원: 관리자 환경설정 × 양식/템플릿 생성 × 기안 작성 × **결재라인 구성(역할 조합)** × **처리 액션(승인·반려·전결·전단계반려·취소·회수·재상신·협조·공람·참조·수신·부서)** × **처리 주체(관리자·조직관리자·직원)**.
> P7 기본(`process-integration-test-matrix.md`)의 단일 happy-path를 넘어 **조합·순열·예외 경계**를 커버한다.
>
> 이 문서는 `/loop` 반복의 영속 추적 상태다. 환경: web `4000`·api `4001`·DB 재시드. 시작 2026-06-21.

## 빌딩블록 (정찰 확정)
- step 역할: `APPROVER·AGREEMENT·REFERENCE·VIEWER·RECEIVER·DEPT_COLLABORATOR·DEPT_RECEIVER` (개인=assigneeId, 부서=organizationId)
- 상신: `POST /documents/:id/submit {steps?, sharedLineId?}`, step=`{role, assigneeId|organizationId, stepOrder}` (stepOrder min 0)
- 액션: `approve·reject·pre-approve·return-prev·cancel-approval·agree·view·receive·dept-collab·bounce·recall·cc(VIEWER/REFERENCE)·submit`
- step status: `PENDING·WAITING·APPROVED·PRE_APPROVED·PROXY_APPROVED·RETURNED·CANCELLED·SKIPPED·VIEWED·RECEIVED·BOUNCED`
- 시드 결재자: admin(SUPER)·genadmin(GENERAL)·orgadmin(ORG, 개발팀 결재자)·employee(개발팀 기안자)·sales(영업팀)
- M-of-N(병렬/다결재자)은 주로 요청→규칙 경로(ApprovalRuleDetail.requiredCount/round). 직접 상신은 stepOrder 순차.

## 상태 범례
✅ PASS · ❌ FAIL · 🔧 진행중 · 🔲 PENDING

---

## 스펙 분할 (4 병렬, 각자 자체 문서·양식 생성으로 격리)

| 스펙 | 영역 | 상태 |
|---|---|---|
| `approval_combo_lines.spec.ts` | 결재라인 구성 × 결과 (단일·다단계·중간반려·전단계반려·결재취소·actor 변주) | ✅ (6/6, 전 UI구동) |
| `approval_combo_collab.spec.ts` | 협조·공람·참조·수신·부서 + 복합 문서(전 역할 1문서) + 사후 cc | ✅ (8/8) |
| `approval_combo_lifecycle.spec.ts` | 임시저장·회수·재상신·전결(허용/미허용)·공용결재선 prefill | ✅ (6/6, API구동·UI는 supplement/state_machine) |
| `approval_combo_admin_rbac.spec.ts` | 양식 생성/접근규칙/채번/공용결재선/대리결재 + 권한·예외 경계 | ✅ (10/10) |

---

## 케이스 계획

### A. 결재라인 구성 × 결과 (`approval_combo_lines.spec.ts`) — ✅ 6/6 (23.6s, 핵심 액션 전부 UI 클릭)
| # | 조합 | 기대 | 상태 |
|---|---|---|---|
| A1 | 단일 APPROVER(admin) 승인 | 문서 APPROVED | ✅ |
| A2 | 2단계 순차(admin→orgadmin) 모두 승인 | step1 PENDING·step2 WAITING→APPROVED | ✅ |
| A3 | 3단계 순차, 2단계에서 반려 | 문서 REJECTED, 3단계 CANCELLED | ✅ |
| A4 | 3단계, 3단계자가 전단계반려(return-prev) | 2단계 PENDING 복원, 3단계 RETURNED | ✅ |
| A5 | 2단계 승인 후 1단계자 결재취소 | 1단계 PENDING 복원, 2단계 WAITING | ✅ (문서대장에서 결재취소 클릭) |
| A6 | actor 변주: orgadmin→sales→admin 혼합 라인 승인 | 순차 진행·APPROVED | ✅ (3계정 각 uiLogin) |

### B. 협조·공람·참조·수신·부서 + 복합 (`approval_combo_collab.spec.ts`) — ✅ 8/8 (21.1s)
| # | 조합 | 기대 | 상태 |
|---|---|---|---|
| B1 | AGREEMENT 동의(UI)→APPROVER 승인(UI) | 협조 APPROVED, 문서 APPROVED | ✅ |
| B2 | VIEWER view (비차단) | VIEWED, APPROVER PENDING 독립 유지 | ✅ |
| B3 | REFERENCE 확인 | step VIEWED | ✅ |
| B4 | RECEIVER: 최종승인 후 수신함 UI receive | RECEIVED, 문서 APPROVED 유지 | ✅ |
| B5 | DEPT_COLLABORATOR 부서함 UI 처리 | step APPROVED(라벨='승인', action=dept-collab) | ✅ |
| B6 | DEPT_RECEIVER 부서함 UI 반송 | BOUNCED, 문서 APPROVED 유지 | ✅ |
| B7 | **복합 5역할 1문서**: APPROVER+AGREEMENT+VIEWER+REFERENCE+RECEIVER | 전체 완주·각 status(APPROVED·APPROVED·VIEWED·VIEWED·RECEIVED) | ✅ |
| B8 | 진행중 문서 사후 cc(VIEWER+REFERENCE) | 동시 생성·assignee 단언 | ✅ |

### C. 기안 생명주기 × 전결/재기안 (`approval_combo_lifecycle.spec.ts`) — ✅ 6/6 (1.2s, API 구동)
| # | 조합 | 기대 | 상태 |
|---|---|---|---|
| C1 | 임시저장(DRAFT)→PATCH 수정→상신 | DRAFT→수정제목 유지→PENDING | ✅ |
| C2 | 회수(RECALLED)→수정→재상신→승인 | RECALLED→PENDING→APPROVED 전구간 | ✅ |
| C3 | 반려(REJECTED)→재상신(allowReDraft 양식) | REJECTED→PENDING | ✅ |
| C4 | 전결(allowPreApproval 양식) pre-approve | PRE_APPROVED·step2 SKIPPED·문서 APPROVED | ✅ |
| C5 | 전결 미허용 양식 pre-approve | `DOCUMENT_PRE_APPROVAL_NOT_ALLOWED` 4xx | ✅ |
| C6 | 공용결재선 sharedLineId 상신 | steps가 결재선 정의와 정확 일치 | ✅ |

> UI 경로 보완: C2 회수→재상신 UI는 `approval_state_machine`(C-3), C4 전결·C6 공용결재선 UI는 `approval_supplement`에 존재. 본 스펙은 전이 결정성 위해 API 구동.

### D. 관리자 환경설정·양식 + 권한 경계 (`approval_combo_admin_rbac.spec.ts`) — ✅ 10/10 (1.4s)
| # | 조합 | 기대 | 상태 |
|---|---|---|---|
| D1 | 기안양식 생성(토글·동적필드)→수정→소프트삭제 | CRUD, 사용중 삭제 `FORM_IN_USE` | ✅ |
| D2 | 문서번호 채번 규칙 PUT→GET | pattern 저장·조회 | ✅ |
| D3 | 양식 접근규칙(DEPARTMENT+허용규칙) | 개발팀 통과·영업팀 `FORM_ACCESS_DENIED` | ✅ |
| D4 | 공용결재선 생성→steps수정(version↑)→삭제 | `SHARED_LINE_DUPLICATE_NAME`·`FINAL_APPROVER_IS_COLLABORATOR` | ✅ |
| D5 | 대리결재 생성→수정→삭제, 본인지정 | `PROXY_SELF_NOT_ALLOWED` | ✅ |
| D6 | step2 결재자가 step1 PENDING일 때 approve | `APPROVAL_STEP_NOT_CURRENT` | ✅ |
| D7 | 기안자 본인을 APPROVER 지정 상신 | `APPROVAL_SELF_NOT_ALLOWED` | ✅ |
| D8a | 타인 회수 | 403 `DOCUMENT_NOT_DRAFTER` | ✅ |
| D8b | 이미 승인 문서 재승인 | `DOCUMENT_NOT_PENDING`·상태 APPROVED 불변 | ✅ |
| D8c | EMPLOYEE ledger box 접근 | `DOCUMENT_LEDGER_FORBIDDEN` | ✅ |

---

## 최종 결과 (2026-06-21)

**전자결재 조합 E2E — 통합 재실행 44/44 PASS (1.3분, 10 스펙 동시 실행, 교차 회귀 0).**

- 신규 조합 4 스펙 **30 케이스**: 결재라인 A 6 · 협조/복합 B 8 · 생명주기 C 6 · 관리자/권한 D 10
- 기존 6 스펙 **14 케이스** 동반 재확인: `approval_processing` 2·`document_flows` 2·`approval_state_machine` 3·`approval_cc` 1·`approval_dept_receiver` 1·`approval_supplement` 5
- **커버한 경우의 수**: 결재라인(단일/2·3단계/혼합 actor) × 결과(승인·반려·전단계반려·결재취소·회수·재상신·전결) × 협업역할(협조·공람·참조·수신·부서협조·부서수신) × **복합(5역할 1문서)** × 관리설정(양식 CRUD·접근규칙·채번·공용결재선·대리결재) × 권한경계(자기결재·차례아님·타인회수·재승인·ledger 403)
- 처리 주체 변주: admin·genadmin·orgadmin·employee·sales (UI 다계정 `uiLogin`)
- **제품 결함 0** (직전 P7 라운드에서 결재 FE/BE 결함은 이미 수정됨). 억지 통과 없음.
- ⚠️ 미커밋: 신규 스펙 4건(`approval_combo_*.spec.ts`)은 작업트리에 존재(요청 시 커밋).

## 운영 메모
- 실행: `cd apps/web && pnpm exec playwright test <spec> --reporter=list`.
- 전략: API 셋업+상신, 핵심 액션 UI(가능 시)·검증 API. 결재 버튼은 `uiLogin`(store 하이드레이트)+본인 차례 조건.
- 격리: 문서·양식·결재선·대리결재 모두 고유 식별자로 자체 생성. 기존 스펙(approval_processing/state_machine/cc/dept_receiver/supplement·document_flows) 단일 happy-path와 중복은 최소화하고 **조합·예외**에 집중.
