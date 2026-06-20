# 권한별 메뉴 인터랙션 점검 — 결과·발견·수정

> 목적: 4개 권한 계정(SUPER_ADMIN·GENERAL_ADMIN·ORG_ADMIN·EMPLOYEE)으로 전 메뉴 화면을
> 순회하고 주요 토글/버튼 인터랙션을 실행해 "문제 없이 동작하는지" 확인하고, 발견된 결함을
> 설계서(SYSTEM_DESIGN·RBAC) 기반으로 수정한다. 2026-06-21.

## 권한 계정 (시드)

| 계정 | 권한 | 비고 |
|---|---|---|
| admin@ablework.io | SUPER_ADMIN | 개발팀 |
| **genadmin@ablework.io** | **GENERAL_ADMIN** | **신규 추가** — 기존 시드에 4단계 중 GENERAL_ADMIN이 없어 전수 점검 불가했음 |
| orgadmin@ablework.io | ORG_ADMIN | 개발팀 결재자 |
| employee@ablework.io / sales@ablework.io | EMPLOYEE | 개발팀 / 영업팀 |

## 1차: 전 화면 순회 (`rbac_screen_sweep.spec.ts`)

4역할 × 전 화면(admin 37 + me 8 = 45) 방문 → **5xx·페이지 크래시·4xx API 0**, 권한 경계 정상.

- 판정: 서버 5xx / 페이지 크래시(uncaught) = 실패. 4xx API는 결함 후보로 수집.
- 권한 경계(정상 동작 확인):
  - ORG_ADMIN → GENERAL_ADMIN 전용 화면(조직·결재선·양식·리포트·메시지·설정·감사) 접근 시 `/admin/dashboard` 리다이렉트
  - EMPLOYEE → admin 전체 접근 시 `/me/home` 리다이렉트

## 발견·수정한 결함 (조회 API 400 → 화면 데이터 로드 실패)

순회에서 여러 핵심 화면의 초기 조회가 **FE 쿼리 ↔ BE Zod 검증 불일치(400)**로 빈 데이터/실패였다.

| API | 원인 | 수정 |
|---|---|---|
| `employees?limit=500` | limit max **200** 초과 (결재선·문서담당 직원 셀렉트가 전 직원 로드) | DTO max 200→**1000**, export 10000→1000 |
| `documents?box=ledger&limit=1000` | limit max **100** 초과 (백업 화면 전체 조회) | DTO max 100→**1000** |
| `shifts/attendances?employeeId=…` | `z.string().uuid()` 강제 (조회 필터) | `min(1)`로 완화 — 서비스 companyId 스코프 존재검증에 위임 (모듈 내 다른 FK와 정합) |

> 근거: limit은 중소기업(50~300인) 규모 전 직원/문서를 한 번에 로드하는 정당한 UX 요구. uuid 완화는 기존 S6~S8 e2e 보강에서 적용한 선례(scopeId·organizationId·assigneeId = `min(1)`)와 일관. `Employee.id`는 `@default(uuid())`라 프로덕션 데이터는 UUID이며, uuid 강제는 비-UUID 식별자 환경에서만 조회를 막는 과한 제약이었다.

## 2차: 토글/버튼 인터랙션 동작

| 항목 | 검증 | 위치 |
|---|---|---|
| 권한 설정 체크박스 | 토글 → 저장 → `GET /permission-settings` 반영 | `settings_toggles.spec.ts` (E2E) |
| 알림 이벤트 토글 | 페이지네이션 limit 누락으로 일부 토글 미반영 → 수정 | PR #58 (별도) |
| 전자결재 공통 5토글 | PATCH→GET 영속 | C-5 (역할별 갭) |
| 결재 처리(승인/반려/회수/전단계반려/취소/재상신/반송/공람) | 클릭 → 상태 전이 | approval_*·document_flows·approval_state_machine·approval_cc·approval_dept_receiver (E2E 9) |

## 결과

- 전 권한 화면 순회: **5xx·크래시·4xx 0**, 권한 경계 정상
- 토글/핵심 인터랙션: 동작·영속 검증
- api 단위 **702** · 통합 **81** · api/web typecheck **0**

## 보완 사항 요약

1. **GENERAL_ADMIN 시드 계정 추가** — 권한 4단계 전수 점검 가능
2. **조회 API 400 4건 수정** — 직원 셀렉트·백업·문서대장·근태 데이터 로드 정상화 (프로덕션 영향)
3. **권한 토글 동작 E2E** + 전 화면 순회 smoke 신설 — 회귀 방지

> 추가 신규 기능 보완 없음 — Phase 1·2 기능은 갭 문서상 구현 가능분 전수 해소 상태이며, 본 점검의 핵심 성과는 권한 전수 점검 인프라 확보와 조회 API 결함 시정이다.
