# 루프 상태 — 권한별 화면 CRUD·인터랙션 브라우저 테스트 자가점검·수정

규격: [`docs/testing/RBAC_BROWSER_LOOP.md`](../testing/RBAC_BROWSER_LOOP.md) · 메타: [`docs/design/SELF_CHECK_LOOP.md`](../design/SELF_CHECK_LOOP.md)
브랜치: `feat/rbac-browser-test-loop`

## 목표 (Goal)
권한 4단계 × 핵심 도메인 화면의 메뉴 가시성·라우트 가드·CRUD·토글/버튼/링크 인터랙션을 Playwright로 검증하고, 실패하는 앱 실버그를 고쳐 매트릭스 셀(positive/negative)을 전부 통과시킨다.

## 정지 조건 (Done = 아래가 전부 true) — ✅ 전부 충족 (2026-06-24)
- [x] G-RBAC: in-scope 매트릭스 셀 spec 전부 PASS — **rbac-crud 307/307 PASS**(nav71·직원29·휴가25·요청29·전자결재44·me32·근무출퇴근46·조직31)
- [x] G-Regress: api 단위 **790/790** + 출퇴근/근무 기존 e2e 표적 **20/20**(process_shifts·process_attendance·shift_bulk_create). (기존 e2e 47 중 다수는 환경 불일치 사전실패 — 분류 제외, 아래 회귀 메모)
- [x] G1/G2/G5: typecheck(api·web 0) · lint(선재 warning만) · build(api·web 성공) 그린
- [x] G-Eval: 전 도메인 + ORG_ADMIN 가드 평가 CRITICAL/HIGH 0 · anti-cheat 통과
- [x] 가드레일: NEVER 0 · 멀티테넌시 0

**→ PR 초안 단계. 커밋·푸시·머지는 사용자 승인 대기.**

## 백로그 (도메인 배치 — 우선순위 순)
1. [x] nav 가시성·라우트 가드 (`nav-route-guard.spec.ts`) — **71/71 PASS**, 평가 PASS
2. [x] 직원 (`employees.spec.ts`) — **29/29 PASS**, 평가 PASS(code+security)
3. [x] 휴가 (`leave.spec.ts`) — **25/25 PASS**, 평가 PASS(code)
4. [x] 요청 (`requests.spec.ts`) — **29/29 PASS**, 평가 PASS(code+security)
5. [x] 전자결재 (`approval.spec.ts`) — **44/44 PASS**, 평가 PASS(code+security) + 방어심층 갭 1건 수정
6. [x] me 셀프서비스 (`me-selfservice.spec.ts`) — **32/32 PASS**, 평가 보안 PASS·code WARNING해소 + 백엔드 버그 1건 수정
7. [x] 근무/출퇴근 (`shifts.spec.ts` 21 + `attendances.spec.ts` 25) — **46/46 PASS**, 평가 통과 + CRITICAL 인가갭 1건 수정. (선재 HIGH 1건은 BLOCKED 기록·별도)
8. [x] 조직/직무 (`organizations.spec.ts`) — **31/31 PASS**(조직+직무 27 + positions 방어심층 4), 평가 APPROVE·보안 PASS + positions 방어심층 게이팅 1건 수정

## 진행 중 (체크포인트 2026-06-24) — 전 도메인 완료, 최종 게이트 진행
- **완료 도메인 8/8 ✅**: nav(71/71)·직원(29/29)·휴가(25/25)·요청(29/29)·전자결재(44/44)·me(32/32)·근무출퇴근(46/46)·조직직무(31/31) 전부 PASS·평가 통과(이번변경분 CRITICAL/HIGH 0). rbac-crud 합계 **약 307 spec**.
- **다음: 최종 게이트** — G1 typecheck · G2 lint · G5 build · G-Regress(rbac-crud 전체 + 기존 e2e[sidebar_final_test·realuser_core_flows 사전존재 실패 제외] + api 단위) → 통과 시 PR 초안. 커밋·푸시·머지는 사용자 승인 대기.
- **누적 앱 수정**: ① getMyToday 퇴근후 상태소실 버그(attendances.service.ts) ② status 일괄강제삭제 방어심층 게이팅 ③ **shifts PATCH /:id @Roles(ORG_ADMIN) — CRITICAL 인가갭(EMPLOYEE 임의 일정수정 200→403)** ④ attendances 기간확정·일괄삭제·일괄해제 GEN 게이팅(isGeneralAdmin) ⑤ 다수 testid 부착(로직 불변) ⑥ TextInput testId prop 가산.
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
- 2026-06-23 배치4(요청): `requests.spec.ts` 29/29 PASS. 수정=`RequestListPanel.tsx`에 data-testid 11개 부착(req-status-tab-*·req-filter-all/myturn·req-row·req-approve/reject-btn·req-bulk-approve-btn·req-modal-approve/reject-btn·req-force-approve/reject-btn) — 로직/클래스/게이팅 불변, 속성만. 백엔드 권한 모델: approve/reject/cancel은 @Roles 없이 service 결재선검증, force-approve/reject·approval-rules CUD=SUPER_ADMIN, GET approval-rules=ORG_ADMIN, GET /requests는 companyId+본인스코핑(EMPLOYEE 403 아님). 평가 code PASS·security PASS(CRITICAL/HIGH 0, 멀티테넌시·이중방어 검증). 평가 MEDIUM 반영: spec dead helper `getRequestStatus`를 force 테스트 GET 재조회 영속성 검증으로 연결(단언 강화).
- 2026-06-23 [기록만·PR노트] security MEDIUM/INFO: `requests.service.ts` `assertIsApprover`(~L1454)가 GENERAL_ADMIN을 결재선 지명 무관 전건 승인/거절 허용. 기존 동작·이번 변경 무관·악용가능성 낮음(EMPLOYEE는 assignee 검사로 차단, cancel은 본인만). 의도된 스펙이면 주석/문서화 권고. 루프 범위 밖 — 인라인 수정 안 함.
- 2026-06-23 배치5(전자결재): `approval.spec.ts` 44/44 PASS. 수정=① forms 화면 testid 9개(`forms/page.tsx`)+`atoms.tsx` TextInput에 `testId` prop 가산(Toggle 패턴 모방, 기존 호출부 무해)+`FormModalNative.tsx` 저장버튼 testid. ② **방어심층 갭 수정**: `status/page.tsx` 일괄 강제삭제("선택 삭제", `POST /documents/bulk-force-delete`=GEN) 버튼이 ORG_ADMIN에 노출됐던 것 → `usePermission().isGeneralAdmin` 게이팅 추가(testid `estatus-bulk-delete-btn`). 백엔드 GEN 전용 API 19건 403 전부 PASS(인가 견고), 멀티테넌시·이중방어·수평상승 전부 PASS. 거래성 GET은 companyId 스코핑.
- 2026-06-23 배치6(me): `me-selfservice.spec.ts` 32/32 PASS(3회 안정·skip0). 수정=① me/* 화면+다이얼로그 5개에 testid(로직 불변) ② **백엔드 버그 수정**: `attendances.service.ts` `getMyToday`가 `clockOutAt:null`만 걸어 **퇴근 후 attendance=null→화면 "출근 전"으로 회귀**(주석 "새로고침 유지"와 모순). → 오늘 날짜 범위(`clockInAt gte/lte`, setHours 0~23:59 서버TZ, 기존 getNowAtWork/findShiftForClockIn 동일 패턴) 필터로 교체, `clockOutAt:null` 제거. 멀티테넌시(employeeId+companyId) 유지, 다른 메서드 clockOutAt:null 불변, 단위 40/40. spec은 describe.serial+beforeEach(genAdmin DELETE /attendances/:id)로 출퇴근 정리·`.me-clock-done` 새로고침 후 유지 검증. 평가 보안 PASS·code WARNING. WARNING의 anti-cheat MEDIUM(타인 잔액 테스트 `isOkButEmpty` 항상true 무의미 단언)을 403 단언+200시 응답 실파싱 비노출 검증으로 강화 완료.
- 2026-06-23 [기록만·PR노트] code MEDIUM(재수정불요): getMyToday 야간근무 경계 — `clockInAt` 기준이라 전날밤 출근·오늘새벽 퇴근은 오늘 조회서 null. 기존 `getNowAtWork`도 동일 경계라 저장소 일관, 의도적 경계. 야간교대가 실운영 요건이면 별도 검토.
- 2026-06-23 [기록만·PR노트] LOW: `me-selfservice.spec.ts` 881줄 > 800 가드. 전 도메인 완료 후 spec 파일군 일괄 분할 검토(스코프 관리상 지금 분할 안 함).
- 2026-06-24 배치7(근무/출퇴근): `shifts.spec.ts`(21)+`attendances.spec.ts`(25) **46/46 PASS**. **CRITICAL 인가갭 수정**: shifts `PATCH /:id`에 @Roles 누락→EMPLOYEE가 회사내 임의 근무일정 수정 가능(실측 200)→`@Roles(ORG_ADMIN)` 추가(200→403). 방어심층: attendances 기간확정·일괄삭제·일괄해제 GEN 게이팅(`isGeneralAdmin` 별칭, ACCESS_LEVEL_HIERARCHY SSOT). testid 다수 부착(로직 불변). 멀티테넌시: assertShift=`organization:{companyId}`·assertAttendance=`employee:{companyId}` 강제 확인. 단위 shifts 23/23. 평가 이번변경분 CRITICAL/HIGH 0. spec 정정: waitForResponse 인터셉트로 confirm-period 응답 검증, 날짜범위 간소화(약화 아님·안정화).
- 2026-06-24 [기록만·LOW] code: `shifts.spec.ts` A3 shift-confirm-btn은 testid 존재·노출 확인 수준(클릭·API 미검증, 그리드 셀 상태 의존). 구조적 허점 아님. 여유 시 확정→확정취소 결정적 흐름 강화 가능. shifts/page.tsx(904)·attendances/page.tsx(836) 800줄 초과는 선재.
- 2026-06-23 [기록만·PR노트·사람확인] code MEDIUM: `/admin/approval/documents` 페이지(`documents/page.tsx:32`)가 진입 즉시 `box=ledger` 무조건 호출 → ORG_ADMIN은 라우트 가드(기본 ORG_ADMIN) 통과해 진입하나 service(`documents.service.ts` ledger=isCompanyAdmin GEN+)가 403 → 에러처리 없는 빈 화면. **데이터 유출 없음(보안 안전), UX 결함.** 두 SSOT 충돌(permissions.ts 주석 "대장=ORG_ADMIN" vs service "ledger=GEN") = 제품 결정 필요. 사전 존재·이번 사이클 회귀 아님. spec A2-3은 현 동작(403) 정확 문서화 — 약화 아님. 권장(별도): ADMIN_ROUTE_GUARDS에 `/admin/approval/documents` GEN 추가 또는 ORG_ADMIN에 다른 box. **루프 범위 밖 — 인라인 수정 안 함.**

## 회귀 점검 메모 (최종 게이트 G-Regress 결과)
- **rbac-crud 307/307 PASS**(전체 재회귀 6.8분, me 출퇴근 격리 강화 반영). **api 단위 790/790**. 출퇴근/근무 기존 e2e 표적 **20/20**(process_shifts·process_attendance·shift_bulk_create — 내 백엔드 변경 직접 영향 영역, 무손상 확인).
- 기존 e2e 47 중 다수(`sidebar_final_test`·`realuser_core_flows` 등)는 **사전 존재 실패**(공유 helpers 미사용·하드코딩 로그인 URL이 현 :4000/:4001 셋업과 불일치, `resp.json()`서 HTML 수신). 내 변경 무관 — 전체 회귀에서 별도 분류. 정합은 helpers uiLogin/login 마이그레이션 필요(본 루프 범위 밖, PR 노트). 내 변경 회귀 0.
- me 출퇴근 spec 격리: attendances spec의 확정기록 + shifts spec의 KST 타임존/조기출근 정책과 같은 employee 출퇴근 경합 → cleanup이 확정해제 후 삭제·clockInViaAdmin(orgAdmin POST)로 정책 우회 셋업. 단언 유지, 78/78(attendances+shifts+me 함께) 안정.

## 미해결·사람 확인 필요 (BLOCKED)
- (없음 — ORG_ADMIN 조직 스코핑 갭은 사용자 승인 하에 이번 세션에서 수정 완료. 아래 해소 로그 참조.)

## 해소 완료 (사용자 승인 작업)
- **[HIGH 해소] ORG_ADMIN 조직 스코핑 갭 (shifts·attendances)**: 사용자 승인(task_100cb4d5) 하에 수정. employees `guardOrgScope` 패턴 이식 — `shifts.service.ts` `update`/`confirm`/`remove`/`create`/`bulkCreate`(배치 헬퍼 `guardOrgScopeBulk`)와 `attendances.service.ts` `updateBreaks`에 ORG_ADMIN 소속 조직 교집합 가드(SUPER/GEN 전사 통과·EMPLOYEE 본인·ORG_ADMIN 교집합·fail-closed). attendances `update`/`remove`는 `@Roles(GENERAL_ADMIN)` 전용이라 가드 대신 주석 문서화(비대칭 함정 방지). 컨트롤러 `@CurrentUser()` 전파. assertShift select 명시. 단위 +12(shifts/attendances), full API 790/790. typecheck 0. 평가 2라운드(code+security): 핵심 갭+잔존 갭(create/bulk) 모두 해소, 멀티테넌시·fail-closed PASS. e2e 재검증: shifts21·attendances25 PASS(orgAdmin positive 무손상 — orgAdmin·셋업직원 동일조직).

## 보안 정책 (루프 중 발견 처리 기준)
- 매트릭스 범위 RBAC 버그 + 발견된 **HIGH/CRITICAL** 보안건은 (호출자 조사 후 저위험이면) 인라인 수정.
- 사전 존재 **MEDIUM/LOW**(예: `[id]/page.tsx` 900줄 초과, seed 의존)는 PR 노트로 기록만, 인라인 수정 안 함.
