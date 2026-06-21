# 역할별 1년 여정 통합테스트 매트릭스 (크롬 E2E)

> 목적: 신입사원(EMPLOYEE) 1년 여정(`newbie-1year-journey-matrix.md`)에 이어, **나머지 권한 3종**
> (SUPER_ADMIN · GENERAL_ADMIN · ORG_ADMIN)의 1년 여정을 역할에 맞는 케이스로 시뮬레이션·테스트한다.
> 각 역할이 1년간 실제 수행하는 업무 + **RBAC 경계**(권한 계층·조직 스코프)를 시간순으로 검증.
>
> 권한: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1). 시드: admin·genadmin·orgadmin(개발팀 결재자).
> 환경: web 4000·api 4001. 오늘 2026-06-21.

## 상태 범례
✅ PASS · ❌ FAIL · 🔧 진행중 · 🔲 PENDING

## 격리 전략
- **SUPER_ADMIN 여정 = 단독 실행**: 전역 company-settings·permission-settings·알림규칙을 변경하므로 set→검증→**원복**, 다른 여정과 동시 실행 금지.
- **GENERAL_ADMIN·ORG_ADMIN = 병렬**: 자체 직원/문서/조직 데이터 위주, 전역 토글·권한설정 미변경 → 무충돌.

---

## 여정 분할

| 스펙 | 역할 | 실행 | 상태 |
|---|---|---|---|
| `journey_role_genadmin.spec.ts` | GENERAL_ADMIN | 병렬 | ✅ (32/32) |
| `journey_role_orgadmin.spec.ts` | ORG_ADMIN | 병렬 | ✅ (17/17) |
| `journey_role_superadmin.spec.ts` | SUPER_ADMIN | 단독(후행) | ✅ (25/25, 전역변경 원복) |

---

## 케이스 계획

### G. GENERAL_ADMIN 1년 — 전사 HR/결재 관리자 (`journey_role_genadmin.spec.ts`) — ✅ 32/32 (9.0s)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| G1 | 전사 직원 등록(조직 A/B)·수정·근로정보·UI 목록 | CRUD 반영 | ✅ (×5) |
| G2 | 휴가 그룹·유형·발생규칙·수동발생 | 잔액 생성 | ✅ (×4) |
| G3 | 근무유형·템플릿·일정·UI | CRUD | ✅ (×4) |
| G4 | 문서 결재자 승인/반려 | 상태 전이 | ✅ (×2) |
| G5 | 기안양식 생성·수정·삭제 + 공용결재선 생성·수정 | CRUD(GENERAL 허용) | ✅ (×5) |
| G6 | 메시지 템플릿·발송→발송내역·자동화 CRUD | 반영 | ✅ (×4) |
| G7 | 리포트 직원·출퇴근·실시간·UI·스냅샷 행조회 | 집계·행 | ✅ (×4) |
| G8 | 알림규칙 event·webhook 저장(D-1) | 403 없이 반영 | ✅ (×2) |
| G9 | RBAC: permission-settings PATCH(D-2) | 403(SUPER 전용) | ✅ |
| G10 | 전 조직 직원 접근 | dev+sales 200 | ✅ |

### O. ORG_ADMIN 1년 — 조직관리자(개발팀 결재자) (`journey_role_orgadmin.spec.ts`) — ✅ 17/17 (13.8s)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| O1 | 본인 조직 직원 조회 + 수정 | scoped 200 | ✅ |
| O2 | 휴가 요청 결재 UI 승인/반려 | APPROVED/REJECTED | ✅ |
| O3 | 출퇴근 정정 결재 | APPROVED | ✅ |
| O4 | 근무일정 생성→조회→삭제 | scoped CRUD | ✅ |
| O5 | 리포트 스냅샷 조회 | 200 | ✅ |
| O6 | 부서협조 UI 승인 / 부서수신 UI 반송 | DEPT_COLLABORATOR APPROVED·DEPT_RECEIVER BOUNCED | ✅ |
| O7 | RBAC: 영업팀 직원 조회·수정 | 403 (×2) | ✅ |
| O8 | RBAC: 조직생성·알림규칙·휴가발생·휴가유형 | 403 (×4) | ✅ |
| O9 | 결재함(pending)·완료함·inbox 화면 | 200·크래시 없음 (×3) | ✅ |

> permission-settings GET은 ORG_ADMIN 허용(200) → 403 케이스에서 제외(정확). O8은 확실한 403 엔드포인트 4종으로 구성.

### S. SUPER_ADMIN 1년 — 시스템 관리자 (`journey_role_superadmin.spec.ts`, 단독) — ✅ 25/25 (9.2s, 전역 변경 전부 원복)
| # | 단계 | 기대 | 상태 |
|---|---|---|---|
| S1 | 회사 일반설정(weekStartDay·timeFormat) | 변경→GET→원복 | ✅ |
| S2 | 근태 정책(lateGracePeriodMinutes·noShiftClockPolicy) | 변경→반영→원복 | ✅ |
| S3 | 전자결재 공통 5토글 | 변경→반영→원복 | ✅ |
| S4 | 권한설정(permission-settings) | 변경→GET→원복(SUPER 200) | ✅ |
| S5 | 알림규칙 event·webhook | 반영→원복 | ✅ (×2) |
| S6 | 조직/직무 구축 + 직원 등록 | 생성·수정·UI | ✅ (×5) |
| S7 | 감사 로그 조회 + 날짜필터 | 활동 기록 노출 | ✅ (×2) |
| S8 | 출퇴근 확정 → 확정해제(unconfirm) | SUPER 가능 | ✅ |
| S9 | 문서 강제 삭제(force delete) | 관리자 가능(자기결재 방지 규칙 정상) | ✅ |
| S10 | 전 조직(dev+sales) 접근 | 200·UI | ✅ (×3) |
| S11 | 리포트·스냅샷 생성·행조회 | 행·목록·UI | ✅ (×4) |
| S_RBAC | permission-settings GET/PATCH 200·관리 화면 진입 | SUPER 전권 | ✅ (×3) |

> 전역 변경(S1~S5) 전부 try/finally 원복 + GET 재확인 → 공유 dev DB 무오염.

---

## 최종 결과 (2026-06-21)

**역할별 1년 여정 E2E — 통합 재실행 74/74 PASS (31.5s, 3 스펙 순차 실행, 교차 회귀 0, SUPER 전역변경 원복 유지).**

- GENERAL_ADMIN 32 · ORG_ADMIN 17 · SUPER_ADMIN 25 = **74**
- EMPLOYEE(신입) 33은 별도 문서(`newbie-1year-journey-matrix.md`) → **4개 권한 전수 1년 여정 = 107 케이스**
- 역할별 핵심:
  - GENERAL_ADMIN: 전사 HR·결재·양식/결재선·메시지·리포트·알림규칙(D-1) + 권한설정 403(D-2)·전조직 접근
  - ORG_ADMIN: 본인 조직 직원/일정·휴가/정정 결재·부서협조/수신 + **RBAC 경계 6종 403**(타조직·조직생성·알림규칙·휴가발생/유형)
  - SUPER_ADMIN: 회사설정/근태/전자결재토글/권한설정/알림규칙(변경→검증→**원복**)·조직구축·감사로그·확정해제·강제삭제·전조직·연말 리포트
- **제품 결함 0** (자기결재 방지 등은 규칙 정상 동작 확인, 테스트 정상 시나리오로 교정).
- SUPER 전역 변경(S1~S5)은 try/finally 원복 + GET 재확인 → 공유 dev DB 무오염.
- ⚠️ 미커밋: 신규 스펙 3건(`journey_role_*.spec.ts`).

## 운영 메모
- 실행: `cd apps/web && pnpm exec playwright test <spec> --reporter=list`.
- SUPER 여정은 GENERAL·ORG 완료 후 단독 실행. 전역 변경은 반드시 원복.
- 격리: 각 스펙 자체 직원/조직(고유 식별자, UUID 조직). orgadmin=개발팀(seed-org-dev) 결재자.
- EMPLOYEE 여정은 `newbie-1year-journey-matrix.md` 참조(이미 33/33 ✅).
