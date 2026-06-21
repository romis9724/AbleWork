# 신입사원 1년 여정 통합테스트 매트릭스 (크롬 E2E)

> 목적: **신입사원이 서비스에 가입(온보딩)하는 시점부터 1년간 서비스를 사용하며 발생하는 모든 케이스**를
> 시간 흐름을 가진 엔드투엔드 여정으로 시뮬레이션·테스트한다. (프로세스/조합 격리 테스트의 상위 — 단일 직원 생애주기 통합)
>
> 시간 모델: 입사일 ≈ 1년 전(2025-06), 이벤트를 2025-06 → 2026-06에 분산. 과거 데이터는 API로 ISO 날짜 지정 생성
> (`POST /attendances {clockInAt,clockOutAt}` 임의 날짜 수용, 휴가 발생 year·expiresAt, 요청 날짜 범위).
> "가입" = 관리자가 직원 계정 생성(initialPassword) → 신입 첫 로그인 → 비밀번호 설정(합류코드는 데드코드).
>
> 환경: web 4000·api 4001·DB 재시드. 오늘 2026-06-21. `/loop` 영속 추적. 시작 2026-06-21.

## 상태 범례
✅ PASS · ❌ FAIL · 🔧 진행중 · 🔲 PENDING

## 격리 전략
각 여정 스펙은 **자신만의 신입 직원**(고유 이메일)을 admin API로 생성해 1년 타임라인을 독립적으로 진행 → 4 병렬 무충돌.

---

## 여정 분할 (4 병렬)

| 스펙 | 여정 슬라이스 | 상태 |
|---|---|---|
| `journey_onboarding.spec.ts` | 가입·첫 로그인·비번설정·근로정보·퇴사/재직·기기 | ✅ (6/6) |
| `journey_attendance_year.spec.ts` | 근무일정 배정 + 12개월 출퇴근(정상/지각/조퇴/결근/휴게)·확정·정정 | ✅ (10/10) |
| `journey_leave_year.spec.ts` | 연차 부여 → 분기별 신청·결재(승인/반려/초과)·보상·반차 → 1주년 재발생 | ✅ (8/8) |
| `journey_approval_year.spec.ts` | 1년간 각종 기안/요청 6유형 + 일반 결재 + 조직이동/직무변경 | ✅ (9/9) |

---

## 케이스 계획

### J1. 온보딩·계정 생명주기 (`journey_onboarding.spec.ts`) — ✅ 6/6 (2.2s)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| J1-1 | admin이 신입 직원 생성(initialPassword·조직·직무·입사일) | 201, 목록 반영 | ✅ (조직 UUID 필수→E2E 조직 생성) |
| J1-2 | 신입이 initialPassword로 로그인 | 200 토큰 | ✅ |
| J1-3 | 비밀번호 변경(change-password) | 기존 비번 401·새 비번 200 | ✅ |
| J1-4 | 새 비번으로 UI 첫 로그인 → /me 진입 | 진입 | ✅ |
| J1-5 | 근로정보(wage-info) 등록 | 반영 | ✅ |
| J1-6 | 퇴사(deactivate) → 로그인 차단 → 재활성(activate) | 401→재활성 후 200 | ✅ |

### J2. 근태 1년 (`journey_attendance_year.spec.ts`) — ✅ 10/10 (2회 안정)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| J2-1 | 신입 생성 + 근무일정 배정(여러 달) | 일정 생성 | ✅ |
| J2-2 | 정상 출퇴근 백필(여러 날) | status=normal | ✅ |
| J2-3 | 지각(clockIn>shiftStart+10m grace) | status=late | ✅ |
| J2-4 | 조퇴(early_leave) + 휴게 PATCH | breakType 분류 | ✅ |
| J2-5 | 결근(무기록) | 리포트 absentCount 반영 | ✅ |
| J2-6 | 기간 확정(confirm-period) → 수정 불가 | 잠금 차단 | ✅ |
| J2-7 | 정정 요청(ATTENDANCE_EDIT) → genadmin 승인 | 문서 자동생성·승인(자기결재 방지) | ✅ |
| J2-8 | 월별/기간 리포트 본인 집계 | lateCount·workDays 반영 | ✅ |
| J2-UI | 관리자 출퇴근 목록·리포트 화면 진입 | 렌더링 | ✅ (+2) |

### J3. 휴가 1년 생명주기 (`journey_leave_year.spec.ts`) — ✅ 8/8 (1.3s)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| J3-1 | 입사 시 연차 부여(year·expiresAt) | 잔액 15일 생성 | ✅ |
| J3-2 | 1분기 1일 신청 → 승인 → 차감 | remaining 14 | ✅ |
| J3-3 | 2분기 1일 신청 → 반려 | 잔액 불변 | ✅ |
| J3-4 | 30일 초과 신청 | 400 `LEAVE_BALANCE_INSUFFICIENT` | ✅ |
| J3-5 | 보상휴가 부여(5) → 사용 | compBalance.usedDays=1 | ✅ |
| J3-6 | 반차 신청·승인 | halfBalance usedDays=0.5 | ✅ |
| J3-7 | 1주년(2026) 연차 재발생 | year=2026 잔액 생성 | ✅ |
| FINAL | 1년 잔액 추이 검증 | 발생/차감/잔여 일관 | ✅ |

> 요청 결재는 `APPROVER_R1` 역할이라 `POST /requests/:id/approve` 사용(문서 steps approve와 다름). accrual은 UUID 휴가유형 필요.

### J4. 전자결재·요청 활동 1년 + 조직변경 (`journey_approval_year.spec.ts`) — ✅ 9/9 (6.8s)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| J4-1 | 휴가 요청 → 문서 자동생성 → 승인 | PENDING→APPROVED (`/requests/:id/approve`) | ✅ |
| J4-2 | 근무일정 변경 요청 | 문서 자동생성 PENDING | ✅ |
| J4-3 | 출퇴근 정정 요청 | 문서 자동생성 PENDING | ✅ |
| J4-4 | 기기변경 요청 | 문서 자동생성 PENDING | ✅ |
| J4-5 | 외근/출장(OFFSITE)·기타(CUSTOM) 요청 | 201·문서(a/b) | ✅ |
| J4-6 | 일반 전자결재 기안 UI 상신→결재 | APPROVED, 기안함→결재함→완료함 | ✅ |
| J4-7 | 조직 이동(PATCH organizationId) | 반영 | ✅ |
| J4-8 | 직무 변경(positionId) | 반영 | ✅ |

> 요청연결 문서는 `POST /requests/:id/approve`로만 승인(step role `APPROVER_R1`, 문서 steps approve는 `APPROVAL_STEP_ROLE_MISMATCH` — 이중처리 방지 설계).

---

## 최종 결과 (2026-06-21)

**신입사원 1년 여정 E2E — 통합 재실행 33/33 PASS (13.3s, 4 스펙 동시 실행, 교차 회귀 0).**

- J1 온보딩 6 · J2 근태 10 · J3 휴가 8 · J4 결재/요청/조직변경 9 = **33**
- **가입부터**(미가입 → admin 계정생성 `initialPassword` → 첫 로그인 → 비밀번호 설정) **1년 전 구간**을 시간순 시뮬레이션:
  - 근태: 1년치 출퇴근 백필(`POST /attendances` ISO 날짜) — 정상/지각/조퇴/결근/휴게·확정·정정요청 결재·리포트
  - 휴가: 입사 연차부여 → 분기별 신청·결재(승인/반려/초과)·보상·반차 → 1주년 재발생, 잔액 추이
  - 결재/요청: 6유형 요청 문서 자동생성·결재 + 일반 기안 UI 상신·결재(기안함→결재함→완료함) + 조직이동·직무변경
- 각 여정은 **자체 신입 계정**(고유 이메일)으로 독립 진행 → 4 병렬 무충돌.
- **제품 결함 0.** 개발 중 마주친 "실패"는 전부 테스트가 올바른 엔드포인트/포맷을 쓰도록 교정한 것(요청연결 문서 승인=`/requests/:id/approve`·`APPROVER_R1` 역할, ATTENDANCE_EDIT payload 포맷, 조직/휴가유형 UUID 필요) — 제품은 설계대로 동작.
- ⚠️ 미커밋: 신규 스펙 4건(`journey_*.spec.ts`)은 작업트리에 존재(요청 시 커밋).

## 운영 메모
- 실행: `cd apps/web && pnpm exec playwright test <spec> --reporter=list`.
- 과거 데이터: 출퇴근 `POST /attendances {clockInAt,clockOutAt}` ISO 날짜, 휴가 발생 year·expiresAt, 요청 날짜 범위.
- leaves accrual/accrual-rules API는 UUID ID만 수용(시드 prefix 거부) — 자체 UUID 유형/그룹 생성 또는 시드 연차 실제 UUID 사용.
- 신입은 admin이 `POST /employees {initialPassword}`로 생성, UI 첫 로그인은 `uiLogin`(초기 비번→변경 후 새 비번).
- 격리: 각 스펙 자체 신입(고유 email). 전역 회사설정 토글 금지.
