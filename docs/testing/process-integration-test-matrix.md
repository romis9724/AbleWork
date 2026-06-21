# 프로세스별 통합테스트 매트릭스 (크롬 E2E)

> 목적: AbleWork ERP의 **각 업무 프로세스**를 크롬(Chromium) 기반 Playwright E2E로 통합테스트한다.
> 각 프로세스는 **여러 옵션**(역할 4종 · 정상/예외 분기 · 상태 전이)으로 케이스를 구성한다.
> 전략: **셋업·검증은 API, 핵심 액션만 UI 클릭**(플래키 최소화) — `apps/web/e2e/helpers.ts` 공통화.
>
> 이 문서는 `/loop` 반복의 **영속 추적 상태**다. 매 반복: PENDING 프로세스를 골라 스펙 작성 → 실행 → green → 상태 갱신.
>
> 환경: web `4000` · api `4001` · DB 재시드 완료(시드 5계정). 역할: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1).
> 시드 계정: admin / genadmin / orgadmin / employee(개발팀) / sales(영업팀) — 비번 `<id>1234!`.
> 시작일: 2026-06-21.

## 상태 범례
✅ PASS · ❌ FAIL · 🔧 진행중 · 🔲 PENDING · ⏸ 보류(환경/설계 블록)

---

## 프로세스 요약

| # | 프로세스 | 스펙 파일 | 케이스 | 상태 |
|---|---|---|---|---|
| P1 | 인증·RBAC | `rbac_screen_sweep` · `process_auth.spec.ts` | 로그인 4분기 + 라우트가드 + 로그아웃 | ✅ (14/14) |
| P2 | 인사·조직 | `process_hr.spec.ts` | 직원 등록/수정/근로정보 CRUD/CSV/조직·직무 | ✅ (7/7) |
| P3 | 근무일정 | `process_shifts.spec.ts` | 유형/템플릿/패턴(52h)/생성/삭제(가드)/확정 | ✅ (9/9) +결함1수정 |
| P4 | 출퇴근 | `process_attendance.spec.ts` | 출근/퇴근/휴게(rest·meal)/장소/now필터/정정 | ✅ (10/10) |
| P5 | 휴가 | `process_leaves.spec.ts` | 그룹·유형/자동발생·수정/수동발생(만료)/잔액 권한/신청 | ✅ (8/8) |
| P6 | 요청→결재연동 | `process_requests.spec.ts` | LEAVE/SHIFT/ATTENDANCE/DEVICE/OFFSITE·CUSTOM/자기결재방지 | ✅ (7/7) |
| P7 | 전자결재 | `approval_*` · `document_flows` · `approval_supplement` · **`approval_combo_*`** | 승인/반려/회수/재상신/전결/협조/공람/수신/취소/전단계반려/부서반송/공용결재선 + **조합 30**(→`approval-combination-test-matrix.md`) | ✅ (14 + 조합 30 = 44) |
| P8 | 리포트 | `process_reports.spec.ts` | 실시간/표준화 CRUD/지각·조퇴 임계/스냅샷 행조회 | ✅ (12/12) |
| P9 | 메시지·알림 | `process_messages.spec.ts` | 템플릿/발송/발송내역/자동화 CRUD | ✅ (4/4) +결함2수정 |
| P10 | 설정·권한 | `settings_toggles` + `process_settings.spec.ts` | 권한 체크박스/전자결재 5토글/회사설정 일반/알림규칙 | ✅ (6/6) |

---

## 최종 결과 (2026-06-21)

**10개 프로세스 × 다옵션 크롬(Chromium) E2E — 통합 재실행 91/91 PASS (3.0분, 16 스펙 동시 실행, 교차 회귀 0).**

- 신규 스펙 9: `process_auth`·`process_hr`·`process_shifts`·`process_attendance`·`process_leaves`·`process_requests`·`process_reports`·`process_messages`·`process_settings`
- 보충 1: `approval_supplement`(전결·협조·수신·공용결재선 prefill C-6)
- 기존 정규 6 재확인: `approval_processing`·`document_flows`·`approval_state_machine`·`approval_cc`·`approval_dept_receiver`·`settings_toggles`
- 케이스 합계: P1 14 · P2 7 · P3 9 · P4 10 · P5 8 · P6 7 · P7 14 · P8 12 · P9 4 · P10 6 = **91**
- **발견·수정한 제품 결함 3건**: SFT-1b(MED)·MSG-SEND-500(HIGH)·FE-AUTOMATION-SENDTIME(MED) — 전부 수정·회귀 가드 추가(아래 결함 표).
- 전략: API 셋업·검증 + 핵심 UI 액션. 데이터 격리(고유 식별자·역할별 직원 분리)로 병렬 무충돌.
- 잔여(결함 아님): E-7 임계는 shiftId=null 데이터라 임계 재판정 직접검증은 후속(BE는 검증됨). C-10(첨부 zip)·E-9(커스텀 열)은 환경/설계 블록으로 보류(역할별 갭 문서).
- ⚠️ 미커밋: 코드 수정 3건 + 신규 스펙 10건은 작업트리에 존재(요청 시 커밋).

## 케이스 상세 (옵션별)

### P1 인증·RBAC — ✅ 14/14 (process_auth.spec.ts, 18.7s)
| 옵션 | 역할 | 기대 | 상태 |
|---|---|---|---|
| 정상 로그인 | SUPER/GENERAL_ADMIN→`/admin`, EMPLOYEE→`/me` | 진입 | ✅ |
| 오류 비밀번호 / 빈 비번 | — | `.auth-error` 표시, `/login` 잔류 | ✅ |
| 미존재 계정 | — | 동일 에러 메시지(열거 방지) | ✅ |
| 역할 라우트 가드 | ORG_ADMIN | GENERAL_ADMIN 전용(조직·설정)→`/admin/dashboard` | ✅ |
| 역할 라우트 가드 | EMPLOYEE | admin 접근→`/me/home` | ✅ |
| 미인증 가드 | — | 보호경로→`/login` | ✅ |
| 로그아웃 | — | 로그아웃→`/login` 복귀, 재접근 차단 | ✅ |

### P2 인사·조직 (갭 D-4·D-5·D-6) — ✅ 7/7 (process_hr.spec.ts, 10.4s)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 직원 등록(다이얼로그) | 생성→목록 반영 | ✅ |
| 직원 정보 수정(PATCH) | 변경→상세 반영 | ✅ |
| 근로정보 추가/수정/삭제(D-4) | wage-info CRUD 반영 | ✅ |
| CSV 일괄 업로드(D-5) | created N + 오류행 메시지 | ✅ (POST /employees/bulk 직접; UI 파일업로드 hidden input 플래키로 API 검증) |
| 조직 CRUD / 직무 CRUD | 생성·수정·삭제 반영 | ✅ |
| RBAC: EMPLOYEE 직원등록 | 403 FORBIDDEN | ✅ |

> 셀렉터 메모(버그 아님): 소속조직 Autocomplete는 `getByRole('combobox',{name})`로 한정, 직무추가 버튼은 PageHeader/EmptyState 중복→`.first()`.

### P3 근무일정 (갭 A-2·A-8) — ✅ 9/9 (process_shifts.spec.ts, 42.6s)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 근무유형 CRUD | 생성·수정·삭제 | ✅ |
| 템플릿 CRUD | 09:00-18:00 저장·표시(SFT-1) | ✅ **결함 SFT-1b 발견·수정**(아래) |
| 일정 생성 | GET /shifts 반영 | ✅ |
| 단건 삭제(A-2) | 미확정→200 / 확정→400 SHIFT_ALREADY_CONFIRMED | ✅ |
| 패턴 적용(A-8) | 7일×10h=70h → warnings 포함 | ✅ |

### P4 출퇴근 (갭 A-3·A-4) — ✅ 10/10 (process_attendance.spec.ts, 2회 안정)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 출근/퇴근 | 기록 생성·상태 분류 | ✅ (clock-in/out=API, UI=버튼상태 — geolocation 선행이라 직접클릭 불가) |
| 휴게 rest/meal(A-3) | breakType 구분 기록·종료 | ✅ |
| 장소 관리 | timeclock-areas CRUD | ✅ (orgId UUID 필수→임시 UUID 조직 생성) |
| now-at-work 조직필터(A-4) | organizationId 서버필터(포함/미포함) | ✅ |
| 출퇴근 정정 요청 | ATTENDANCE_EDIT→문서 자동생성·PENDING | ✅ |

### P5 휴가 (갭 B-2·B-4) — ✅ 8/8 (process_leaves.spec.ts)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 그룹/유형 CRUD | 생성·수정·소프트삭제(isActive=false) | ✅ |
| 자동발생 규칙 생성·수정(B-4) | 규칙 반영 | ✅ |
| 수동발생(year·만료일 B-2) | 잔액 만료일 반영 | ✅ |
| 잔액 조회 권한 | 본인 200 / 타인 403 LEAVE_BALANCE_FORBIDDEN | ✅ |
| 휴가 신청 | 1일→PENDING / 30일→400 LEAVE_BALANCE_INSUFFICIENT | ✅ |

> 특성 메모(결함 아님): 그룹/유형 DELETE=소프트삭제, 잔액 보유 시 `LEAVE_*_IN_USE`(400) 차단. accrual-rules/accrual API는 UUID만 수용(시드 prefix ID 거부). MUI Select는 `getByRole('combobox')`로 접근.

### P6 요청→결재연동 (갭 B-6) — ✅ 7/7 (process_requests.spec.ts, 11.3s)
| 옵션 | 기대 | 상태 |
|---|---|---|
| LEAVE 신청 | 문서 자동생성(PENDING)·request.documentId 연결 | ✅ (UI+API) |
| SHIFT/ATTENDANCE_EDIT 신청 | 양식별 문서 자동생성 | ✅ (API — date picker native라 UI 플래키) |
| DEVICE_CHANGE 신청 | 문서 자동생성·approval step | ✅ |
| OFFSITE·CUSTOM 신청(B-6) | 201 + 내 요청 반영 + document | ✅ (UI+API) |
| 결재자 없음 | 400 REQUEST_NO_APPROVER | ✅ 진단 — 시드 admin fallback 상시 존재로 400 유발 불가(환경제약), fallback 성공(201+approver배정)으로 대체검증 |

### P8 리포트 (갭 A-7·E-7·E-8) — ✅ 12/12 (process_reports.spec.ts, 12.1s)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 실시간 리포트 조회 | 직원 필터→행 표시 + API 데이터 | ✅ |
| 표준화규칙 CRUD(A-7) | 생성→삭제(소프트) | ✅ |
| 지각·조퇴 임계(E-7) | UI 임계 조회 오류 없음 + API threshold별 lateCount 결정적 | ✅ ⚠️커버리지: 생성 출퇴근 shiftId=null이라 임계 재판정 미트리거(stored status 폴백)·임계 변화 직접 검증은 후속(shift 포함 데이터 필요). E-7 자체는 이전 루프 BE 검증됨 |
| 스냅샷 생성·행조회(E-8) | 생성→행 모달·GET rows 유효 | ✅ |

### P9 메시지·알림 (갭 E-1·E-5) — ✅ 4/4 (process_messages.spec.ts, 결함 2건 발견·수정)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 템플릿 CRUD | 생성·수정·삭제 | ✅ |
| 수동 발송→발송내역(E-1) | 발송 200 + GET /messages/sent 반영 | ✅ **결함 MSG-SEND-500 수정**(아래) |
| 자동화규칙 CRUD(E-5) | 생성·수정·삭제 | ✅ **결함 FE-AUTOMATION-SENDTIME 수정**(아래) |
| 발송내역 행 클릭(E-10) | 내용 toast/상세 | ✅ |
| 알림 이벤트 토글 | PATCH→GET 영속 | ✅ P10에서 커버(D-1) |

### P10 설정·권한 (기존 + 보강) — ✅ 6/6 (settings_toggles 1 + process_settings 5, 12.0s)
| 옵션 | 기대 | 상태 |
|---|---|---|
| 권한 체크박스 토글 | 저장→GET 반영 | ✅ (settings_toggles) |
| 전자결재 5토글(C-5) | PATCH→GET 영속(.strip 무시 회귀 방지) | ✅ |
| 회사설정 일반 weekStartDay(D-3) | 변경 저장→GET 반영 | ✅ |
| 알림규칙 webhook/event(D-1) | GENERAL_ADMIN 403 없이 저장·반영 | ✅ |

---

## P7 전자결재 — 베이스라인 (2026-06-21 실행 ✅ 10/10, 30.1s)

| 케이스 | 스펙 | 결과 |
|---|---|---|
| 승인→APPROVED | approval_processing | ✅ |
| 의견 반려→REJECTED | approval_processing | ✅ |
| C-1 전단계반려→직전 PENDING 복원 | approval_state_machine | ✅ |
| C-2 결재취소→본인 PENDING 복원 | approval_state_machine | ✅ |
| C-3 회수→재상신→PENDING | approval_state_machine | ✅ |
| T1 회수→RECALLED | document_flows | ✅ |
| T2 참조 확인→VIEWED | document_flows | ✅ |
| C-8 타직원 공람 추가→VIEWER step | approval_cc | ✅ |
| C-7 부서수신 반송→BOUNCED | approval_dept_receiver | ✅ |
| P10 권한 체크박스 토글 영속 | settings_toggles | ✅ |

### P7 전자결재 보충 (approval_supplement.spec.ts, 5/5, 2회 안정)
| 케이스 | 결과 |
|---|---|
| 전결(PRE_APPROVED)→이후 SKIPPED·문서 APPROVED | ✅ |
| 전결 미허용 양식→`DOCUMENT_PRE_APPROVAL_NOT_ALLOWED` | ✅ |
| 협조(AGREEMENT) 동의→step APPROVED·흐름 전진 | ✅ |
| 수신(RECEIVER) 처리→step RECEIVED, 문서 APPROVED 유지(상태 불변) | ✅ |
| 공용결재선 선택→steps prefill→상신 일치(C-6) | ✅ |

## 발견·수정한 제품 결함

| ID | 프로세스 | 결함 | 심각도 | 상태 | 수정 |
|---|---|---|---|---|---|
| SFT-1b | 근무일정 | 템플릿 관리 페이지(`shifts/templates/page.tsx`)가 근무시간을 ISO epoch(`1970-01-01T…Z`)로 표시 + 수정 다이얼로그 prefill도 ISO라 편집 시 HH:MM 정규식 위반. SFT-1 수정이 로스터(`shifts/page.tsx`)에만 적용되고 템플릿 관리 화면엔 누락됐던 것. | MED | ✅ 수정 | `templates/page.tsx`에 `toHHMM()` 추가 → 테이블 표시·수정 prefill 정규화. `process_shifts.spec.ts`에 회귀 가드(09:00·18:00 표시·`1970` 금지) 추가. typecheck✅·9/9 재통과 |
| MSG-SEND-500 | 메시지 | `POST /messages/send`가 항상 500 — `sendMessage`가 senderId 로 `user.sub`(User.id)를 넘겼으나 FK는 `employees.id` 참조라 위반(동일 컨트롤러 타 메서드는 `user.employeeId` 사용). | HIGH | ✅ 수정 | `messages.controller.ts:117` `user.sub`→`user.employeeId`. API 재기동. `process_messages.spec.ts` 옵션2를 발송 200 + 발송내역 반영 회귀 가드로 강화. 4/4 재통과 |
| FE-AUTOMATION-SENDTIME | 메시지 | 자동화 규칙 수정 시 `sendTime`을 `slice(0,5)`로 잘라 `"1970-"` 추출 → HH:mm Zod 정규식 불일치로 수정 실패(다이얼로그 안 닫힘). | MED | ✅ 수정 | `automations/page.tsx:113` `slice(0,5)`→`slice(11,16)`. typecheck✅·옵션3 PASS |

## 운영 메모
- 실행: `cd apps/web && pnpm exec playwright test <spec> --reporter=list` (workers:1).
- 신규 스펙은 `apps/web/e2e/process_*.spec.ts`. 공통 헬퍼는 `helpers.ts` 재사용/확장.
- 데이터 격리: 케이스마다 고유 식별자(타임스탬프/uuid 접미사). 전역 설정 토글은 P10에서만(병렬 충돌 방지).
