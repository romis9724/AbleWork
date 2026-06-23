# 권한별 화면 CRUD·인터랙션 브라우저 테스트 루프

> 권한 4단계 × 핵심 화면의 메뉴·CRUD·토글/버튼/링크 인터랙션을 실제 브라우저(Playwright)로 검증·자가수정하는 루프 규격.
> 상위 루프 메타규격: [`docs/design/SELF_CHECK_LOOP.md`](../design/SELF_CHECK_LOOP.md) (게이트·가드레일·서브에이전트 분리·STATE).
> 라이브 상태: [`docs/loop/RBAC_BROWSER_STATE.md`](../loop/RBAC_BROWSER_STATE.md)

---

## 0. 한눈에

- **정답지**: 권한 SSOT = [`packages/shared-constants/src/permissions.ts`](../../packages/shared-constants/src/permissions.ts) (`canViewNav`·`canDo`·`requiredLevelForPath`·`ADMIN_ROUTE_GUARDS`·`ACTION_MIN_LEVEL`). 테스트 기대값은 코드가 아니라 **이 SSOT에서 도출**한다.
- **재사용**: `apps/web/e2e/helpers.ts`의 `ACCOUNTS`·`uiLogin`·`login`. 기존 감사: `rbac-interaction-audit.md`·`role-feature-audit.md`(확장 대상, 재작성 금지).
- **수정 원칙**: 브라우저 테스트가 정답지. 실패는 **앱 실버그를 고쳐** 통과시킨다. assert 삭제·skip·기대값 하향 금지.

---

## 1. 역할 · 시드 계정

| 역할 | 레벨 | 시드 계정 | `/admin` 진입 | 조직 |
|---|---|---|---|---|
| SUPER_ADMIN | 4 | `admin@ablework.io` / `admin1234!` | ✅ | 개발팀 |
| GENERAL_ADMIN | 3 | `genadmin@ablework.io` / `genadmin1234!` | ✅ | 개발팀 |
| ORG_ADMIN | 2 | `orgadmin@ablework.io` / `orgadmin1234!` | ✅(제한) | 개발팀 |
| EMPLOYEE | 1 | `employee@ablework.io` / `employee1234!` | ❌ → `/me/home` | 개발팀 |
| EMPLOYEE(영업) | 1 | `sales@ablework.io` / `sales1234!` | ❌ | 영업팀 |

ORG_ADMIN 동적 권한(`company_settings.org_admin_can_manage_*`)은 시드 기본값 `true` 가정.

---

## 2. 매트릭스 — 역할 × 화면 × 인터랙션 (기대값)

### 2-1. 메뉴 가시성 (`canViewNav`)

| nav id | 최소레벨 | EMPLOYEE | ORG_ADMIN | GENERAL_ADMIN | SUPER_ADMIN |
|---|---|---|---|---|---|
| home·schedule·attendance·leave·requests | ORG_ADMIN | ✕(셸 진입불가) | ✓ | ✓ | ✓ |
| employees | ORG_ADMIN | ✕ | ✓ | ✓ | ✓ |
| eStatus·eDocs·eInbox | ORG_ADMIN | ✕ | ✓ | ✓ | ✓ |
| organizations | GENERAL_ADMIN | ✕ | **✕** | ✓ | ✓ |
| eLines·eForms·eOwners·eBackup | GENERAL_ADMIN | ✕ | **✕** | ✓ | ✓ |
| report·messages·settings·errorAnalysis·audit | GENERAL_ADMIN | ✕ | **✕** | ✓ | ✓ |

### 2-2. 라우트 가드 (`requiredLevelForPath`, 직접 URL 접근)

| 경로 | 최소레벨 | EMPLOYEE | ORG_ADMIN | GEN/SUPER |
|---|---|---|---|---|
| `/admin/*` (기본) | ORG_ADMIN | → `/me/home` | ✓ | ✓ |
| `/admin/organizations`, `/admin/approval/{lines,forms,doc-managers,backup}`, `/admin/reports`, `/admin/messages`, `/admin/settings`, `/admin/audit-logs`, `/admin/ai-error-analysis` | GENERAL_ADMIN | → `/me/home` | **→ 리다이렉트** | ✓ |
| `/me/*` | EMPLOYEE | ✓ | ✓ | ✓ |

> ORG_ADMIN의 GEN 전용 경로 리다이렉트 목적지는 미들웨어 동작에 맞춰 spec에서 확정(`/admin/dashboard` 추정 — 실측으로 고정).

### 2-3. 액션 버튼 가시성 (`canDo` / `ACTION_MIN_LEVEL`)

| 액션 | 최소레벨 | 화면 | EMPLOYEE | ORG_ADMIN | GEN | SUPER |
|---|---|---|---|---|---|---|
| EMPLOYEE_CREATE | GENERAL_ADMIN | employees | ✕ | ✕ | ✓ | ✓ |
| EMPLOYEE_MANAGE | ORG_ADMIN | employees/[id] | ✕ | ✓ | ✓ | ✓ |
| EMPLOYEE_RESET_PASSWORD | ORG_ADMIN | employees/[id] | ✕ | ✓ | ✓ | ✓ |
| EMPLOYEE_RESET_DEVICE | GENERAL_ADMIN | employees/[id] | ✕ | ✕ | ✓ | ✓ |
| EMPLOYEE_WAGE_MANAGE | GENERAL_ADMIN | employees/[id] | ✕ | ✕ | ✓ | ✓ |
| ATTENDANCE_UNCONFIRM | GENERAL_ADMIN | attendances | ✕ | ✕ | ✓ | ✓ |
| SHIFT_UNCONFIRM | GENERAL_ADMIN | shifts | ✕ | ✕ | ✓ | ✓ |
| REQUEST_FORCE | SUPER_ADMIN | requests | ✕ | ✕ | ✕ | ✓ |
| COMPANY_EDIT_BASE | SUPER_ADMIN | settings/company | ✕ | ✕ | ✕ | ✓ |
| SETTINGS_SAVE_ADVANCED | GENERAL_ADMIN | settings | ✕ | ✕ | ✓ | ✓ |
| PERMISSIONS_MANAGE | SUPER_ADMIN | settings/permissions | ✕ | ✕ | ✕ | ✓ |

### 2-4. CRUD·인터랙션 성공 경로 (positive, 권한 보유 역할로 검증)

| 화면 | 검증 인터랙션 |
|---|---|
| `/admin/employees` | 검색·조직/직무 필터·"퇴사포함" 토글·페이지네이션·추가 모달 열기 / (GEN)추가→목록 반영 / 재활성화 |
| `/admin/employees/[id]` | 탭 전환·수정 저장→반영 / (ORG)비번초기화 / (GEN)기기초기화·임금 관리 |
| `/admin/leave/types` | 그룹/유형 탭·추가→목록 반영·수정→반영·삭제→제거(확인 다이얼로그) |
| `/admin/leave/{list,status,accrual-rules}` | 필터·목록 렌더·행 조회 |
| `/admin/requests` | 목록·필터 / 승인·반려→상태 반영 |
| `/admin/approval/inbox` | 탭(기안/진행/완료)·검색·페이지네이션·기안작성 모달·상신 / 행 클릭→DocModal |
| `/admin/approval/documents` | 검색·상태필터·행 클릭→DocModal 열람 |
| `/admin/approval/forms` (GEN) | 분류 트리·추가→반영·수정·접근규칙·삭제 |
| `/admin/shifts` | 주간 네비·일괄생성 탭·셀 편집·확정 / (GEN)확정취소 |
| `/admin/attendances` | 날짜필터·필터칩·정정/생성/삭제·확정 / (GEN)확정취소 |
| `/admin/organizations` (GEN) | 트리 펼침·추가·수정·삭제 |
| `/me/home` | 출근→퇴근 버튼 흐름·휴게·KPI·요청/문서 카드 링크 이동 |
| `/me/leaves` | 잔액 카드·휴가신청 모달→제출 |
| `/me/requests` | 탭·새요청 메뉴(유형)·유형별 다이얼로그→제출·취소 |
| `/me/documents` | 탭·기안등록·행 클릭→조회 |

### 2-5. 차단 경로 (negative)

권한 없는 역할: ① nav 항목 부재(2-1) ② 직접 URL 접근 시 리다이렉트(2-2) ③ 액션 버튼 부재(2-3) ④ API 강제 호출 시 403(보강 검증).

---

## 3. 셀렉터 규약 — `data-testid`

인터랙션 요소에만 부여, 기존 마크업/스타일 불변(MUI 유지, Tailwind 금지).

```
data-testid="<domain>-<element>-<action?>"
```

| 예시 | 의미 |
|---|---|
| `employees-add-btn` | 직원 추가 버튼 |
| `employees-search-input` | 직원 검색 입력 |
| `employees-inactive-toggle` | 퇴사포함 토글 |
| `employees-row` | 직원 목록 행 (복수 시 `data-testid` 공통 + 내부 텍스트로 특정) |
| `emp-detail-reset-pw-btn` | 상세 비번초기화 |
| `leave-type-add-btn` / `leave-type-row` / `leave-type-delete-btn` | 휴가유형 CRUD |
| `approval-draft-btn` / `approval-submit-btn` | 기안작성·상신 |
| `me-clock-in-btn` / `me-clock-out-btn` | 출퇴근 |
| `me-leave-request-btn` | 휴가신청 |
| `req-new-btn` / `req-type-LEAVE` / `req-submit-btn` / `req-cancel-btn` | 요청 |

nav 항목은 `data-testid="nav-<navId>"` (예 `nav-organizations`)로 가시성 검증.

---

## 4. 에이전트 토폴로지 (수정/테스트/평가 분리)

| 역할 | 에이전트 | 책임 | 금지 |
|---|---|---|---|
| 오케스트레이터 | 메인 세션 | STATE·매트릭스 관리, 디스패치, 게이트 판정, PR | — |
| **테스트(작성·실행)** | `e2e-runner` | 셀 spec 작성·실행, 실패 리포트(셀ID·기대·실제·스크린샷·trace) | **앱 코드 수정 금지** |
| **수정** | `general-purpose` | 실패 근본원인 앱 수정 + 필요한 `data-testid` 부여 | **spec 수정 금지** |
| **평가** | `code-reviewer` + `security-reviewer` | 근본원인 해결·NEVER/멀티테넌시·anti-cheat(spec diff)·회귀 점검 | 구현 금지 |

**테스트 정정 예외**: 수정 측이 "테스트가 틀렸다"고 주장 → 평가가 `permissions.ts` 기준 판정 → 정당하면 **테스트 에이전트만** spec 정정.

---

## 5. 게이트 (Done = 전부 true)

- **G-RBAC**: in-scope 매트릭스 셀 spec(positive+negative) 전부 PASS
- **G-Regress**: 기존 `apps/web/e2e` 47 spec + `pnpm --filter api test` 그린
- **G1/G2/G5**: `pnpm typecheck` · `pnpm lint` · `pnpm build` 그린
- **G-Eval**: 평가 CRITICAL/HIGH 0 · anti-cheat 통과
- **가드레일**: NEVER 0 · 멀티테넌시 `companyId` 0 (SELF_CHECK_LOOP §4)

---

## 6. 파일 레이아웃

```
apps/web/e2e/
├── helpers.ts                      # ACCOUNTS·uiLogin + 매트릭스 헬퍼(assertNavVisible/assertRouteGuard/assertActionVisible)
└── rbac-crud/
    ├── nav-route-guard.spec.ts     # 2-1·2-2 (가장 빠른 회로)
    ├── employees.spec.ts           # 직원
    ├── leave.spec.ts               # 휴가
    ├── requests.spec.ts            # 요청
    ├── approval.spec.ts            # 전자결재
    ├── me-selfservice.spec.ts      # me/*
    ├── shifts.spec.ts / attendances.spec.ts
    └── organizations.spec.ts       # 조직/직무
```

실행: `cd apps/web && npx playwright test e2e/rbac-crud --project chromium`
(로컬 포트 web :4000 / api :4001. api는 ts-node 직접 실행 — 코드 변경 시 수동 재시작.)

---

## 7. 진입 프롬프트

```
docs/testing/RBAC_BROWSER_LOOP.md 와 docs/design/SELF_CHECK_LOOP.md 를 읽고 권한별 브라우저 테스트 자가점검·수정 루프를 자율 실행해라.
- docs/loop/RBAC_BROWSER_STATE.md 를 매 사이클 갱신.
- 에이전트 분리 준수(테스트=e2e-runner, 수정=general-purpose, 평가=code-reviewer+security-reviewer). 테스트는 앱을, 수정은 spec을 고치지 마라.
- §2 매트릭스 셀(positive/negative)이 전부 통과할 때까지 테스트→수정→평가 반복.
- 셀렉터는 §3 data-testid 규약. 실패는 앱 실버그를 고쳐 통과(테스트 약화 금지).
- §5 게이트 전부 true면 PR 초안까지만. NEVER 경계·막힘은 STATE BLOCKED 기록 후 다음 셀.
```
