# 루프 상태 — 권한별 화면 CRUD·인터랙션 브라우저 테스트 자가점검·수정

규격: [`docs/testing/RBAC_BROWSER_LOOP.md`](../testing/RBAC_BROWSER_LOOP.md) · 메타: [`docs/design/SELF_CHECK_LOOP.md`](../design/SELF_CHECK_LOOP.md)
브랜치: `feat/rbac-browser-test-loop`

## 목표 (Goal)
권한 4단계 × 핵심 도메인 화면의 메뉴 가시성·라우트 가드·CRUD·토글/버튼/링크 인터랙션을 Playwright로 검증하고, 실패하는 앱 실버그를 고쳐 매트릭스 셀(positive/negative)을 전부 통과시킨다.

## 정지 조건 (Done = 아래가 전부 true)
- [ ] G-RBAC: in-scope 매트릭스 셀 spec 전부 PASS
- [ ] G-Regress: 기존 e2e 47 spec + api 단위 그린
- [ ] G1/G2/G5: typecheck · lint · build 그린
- [ ] G-Eval: 평가 CRITICAL/HIGH 0 · anti-cheat 통과
- [ ] 가드레일: NEVER 0 · 멀티테넌시 0

## 백로그 (도메인 배치 — 우선순위 순)
1. [x] nav 가시성·라우트 가드 (`nav-route-guard.spec.ts`) — **71/71 PASS**, 평가 PASS
2. [x] 직원 (`employees.spec.ts`) — **29/29 PASS**, 평가 PASS(code+security)
3. [x] 휴가 (`leave.spec.ts`) — **25/25 PASS**, 평가 PASS(code)
4. [ ] 요청 (`requests.spec.ts`)
5. [ ] 전자결재 (`approval.spec.ts`)
6. [ ] me 셀프서비스 (`me-selfservice.spec.ts`)
7. [ ] 근무/출퇴근 (`shifts.spec.ts`·`attendances.spec.ts`)
8. [ ] 조직/직무 (`organizations.spec.ts`)

## 진행 중 (체크포인트 2026-06-23)
- **완료 도메인 3/8**: nav(71/71)·직원(29/29)·휴가(25/25) 전부 PASS·평가 PASS. 회귀 0(내 변경 기준).
- **다음 배치: 4) 요청(requests)** → 5) 전자결재 → 6) me → 7) 근무/출퇴근 → 8) 조직/직무.
- 재개 방법: 본 STATE + docs/testing/RBAC_BROWSER_LOOP.md §7 진입 프롬프트. API는 ts-node — 백엔드 변경 시 `kill $(lsof -ti:4001); pnpm --filter api dev` 재시작 필요.
- 이전 배치 이력:
- 누적 발견·수정: ① AdminShell nav/footer testid ② `GET /employees` 인가갭→`@Roles(ORG_ADMIN)` ③ reset-device·wage-add 숨김 게이팅+`canManageWage` 정합 ④ **HIGH: guardOrgScope EMPLOITEE 수평 PII/임금 노출→본인 한정**.
- 변경 파일(미커밋): AdminShell.tsx, employees/[id]/page.tsx, EmployeesPanel.tsx, EmployeeCreateDialog.tsx, components/ab/atoms.tsx(Toggle testId), api employees.controller.ts·service.ts(+spec), e2e helpers.ts·rbac-crud/{nav-route-guard,employees}.spec.ts.

## 발견·결정 로그 (append-only)
- 2026-06-23 격리는 worktree 대신 피처 브랜치 채택(실행 중 dev 서버·공유 DB 의존, pnpm 모노레포 worktree 마찰 회피).
- 2026-06-23 셋업: API·인프라 기동 상태 확인, genadmin/employee 시드 로그인 OK.
- 2026-06-23 매트릭스 2-2 실측 확정: 관리자레벨이지만 권한부족 경로 → `/admin/dashboard` 리다이렉트, 비관리자(EMPLOYEE) → `/me/home`, 미인증 → `/login`.
- 2026-06-23 배치1(nav·라우트가드): spec 71/71 PASS. 수정=AdminShell nav/footer에 `data-testid="nav-<id>"` +2줄. 평가 PASS(CRITICAL/HIGH 0).
- 2026-06-23 평가 피드백 반영: helpers `assertRouteGuard` 안착 단언 정정(차단 시 path≠ & /login≠ 분리 단언). LOW: spec FOOTER_NAV_IDS 하드코딩(현재 영향0, 차기 도메인 때 ADMIN_FOOT import 권고).

## 회귀 점검 메모 (최종 게이트 G-Regress 참고)
- 회귀 스모크(sidebar_final_test·realuser_core_flows·rbac_screen_sweep): rbac_screen_sweep 4역할 전부 PASS. **내 변경 회귀 0**.
- 단, `sidebar_final_test.spec.ts`·`realuser_core_flows.spec.ts`는 **사전 존재 실패**(내 변경 무관): 공유 helpers.ts를 안 쓰고 자체 하드코딩 로그인 URL을 호출 → API 대신 HTML 수신(`resp.json()`서 `Unexpected token '<'`). 현재 :4001 dev 셋업과 불일치. 최종 전체 회귀 시 이 부류는 별도 분류(또는 helpers.ts uiLogin/login으로 마이그레이션 권고 — 본 루프 범위 밖, PR 노트).

## 미해결·사람 확인 필요 (BLOCKED)
- (없음 — F-3/F-4는 이번 루프에서 수정 진행)

## 보안 정책 (루프 중 발견 처리 기준)
- 매트릭스 범위 RBAC 버그 + 발견된 **HIGH/CRITICAL** 보안건은 (호출자 조사 후 저위험이면) 인라인 수정.
- 사전 존재 **MEDIUM/LOW**(예: `[id]/page.tsx` 900줄 초과, seed 의존)는 PR 노트로 기록만, 인라인 수정 안 함.
