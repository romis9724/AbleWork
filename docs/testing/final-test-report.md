# AbleWork 테스트 최종 결과 보고서

> 작성일: 2026-06-13 · 범위: 단위 테스트 + 통합(e2e) 테스트 + 크롬 브라우저 검증
> 목적: "빠진 부분이 없는지" 확인 + 재사용 가능한 테스트 자산 확보

---

## 1. 종합 결론

| 항목 | 결과 |
|---|---|
| **단위 테스트** | **29 suites / 576 tests 전부 통과** (착수 시 297 → +279) |
| **통합 e2e 테스트** | **5 suites / 33 tests 전부 통과** (실 DB `ablework_test`) |
| **타입체크** (`tsc --noEmit`) | **0 errors** |
| **서비스 레이어 커버리지** | **stmts 81.33% / funcs 83.29% / lines 81.65%** (목표 80%+ **달성**), branch 61.95% |
| **발견·수정한 실버그** | **13건** (멀티테넌시 11 + XSS/URL인코딩 2) |
| **커버리지 분석** | 28개 서비스 · 갭 559건 · 의심버그 154건(CRIT 20/HIGH 31) 문서화 |
| **크롬 브라우저** | 6개 화면 실데이터 연계 확인 + 라이브 CRUD(등록/삭제) 검증 |

**판정: 테스트·문서·수정 완료. 단위/통합/브라우저 3계층 모두 통과하며, 서비스 레이어 80% 목표를 달성했다.**

---

## 2. 산출물 (재사용 자산)

| 경로 | 내용 |
|---|---|
| `docs/testing/README.md` | 테스트 가이드·실행법·모킹 패턴 |
| `docs/testing/unit-test-scenarios.md` | 28개 서비스 커버리지 맵·갭·의심버그 (1428줄) |
| `docs/testing/integration-test-scenarios.md` | e2e 시나리오·하니스·시드 픽스처 |
| `docs/testing/final-test-report.md` | 본 보고서 |
| `apps/api/src/**/*.service.spec.ts` | 단위 spec 29종 (신규 12종 포함) |
| `apps/api/test/` | e2e 하니스 + spec 5종 |

### 신규 단위 spec 12종 (이번에 작성)

| 서비스 | 테스트 | 커버리지(stmts) |
|---|:--:|:--:|
| company-holidays | 17 | 100% |
| company-settings | 28 | 100% |
| permission-settings | 27 | 100% |
| document-forms | 32 | 100% |
| proxy-settings | 23 | 100% |
| shared-approval-lines | 20 | 100% |
| mail | 22 | 100% |
| discord-webhook | 16 | 100% |
| notifications | 32 | 100% |
| custom-types | 17 | 100% |
| shift-types | 16 | 100% |
| standardization-rules | 29 | 100% |
| **합계** | **279** | — |

### e2e 통합 스위트 5종 (신규)

| 파일 | 테스트 | 검증 |
|---|:--:|---|
| `smoke.e2e-spec.ts` | 6 | 부팅·로그인·가드·응답래핑 |
| `auth.e2e-spec.ts` | 7 | 로그인/토큰갱신/비밀번호변경 |
| `request-to-document.e2e-spec.ts` | 7 | 요청→문서 자동생성($transaction) |
| `approval-flow.e2e-spec.ts` | 6 | 결재→잔액차감 원자성 + 상태머신 |
| `tenancy-security.e2e-spec.ts` | 7 | ORG_ADMIN 조직범위·역할·인증가드 |

---

## 3. 단위 테스트 — 서비스 레이어 커버리지

```
All files                          |   81.33 |    61.95 |   83.29 |   81.65 |
  attendances.service.ts           |   75.63 |    62.01 |      80 |   75.12
  auth.service.ts                  |   81.42 |    76.92 |   77.77 |   82.53
  companies.service.ts             |     100 |      100 |     100 |     100
  company-holidays.service.ts      |     100 |      100 |     100 |     100
  company-settings.service.ts      |     100 |     92.3 |     100 |     100
  permission-settings.service.ts   |     100 |      100 |     100 |     100
  approval-actions.service.ts      |   97.45 |    85.33 |   94.44 |   97.38
  document-forms.service.ts        |     100 |      100 |     100 |     100
  documents.service.ts             |   78.74 |    60.56 |   78.72 |   79.39
  proxy-settings.service.ts        |     100 |      100 |     100 |     100
  shared-approval-lines.service.ts |     100 |      100 |     100 |     100
  employees.service.ts             |   74.19 |    61.66 |   71.42 |   72.88
  leaves.service.ts                |   84.15 |    55.68 |   89.13 |   88.64
  mail.service.ts                  |     100 |      100 |     100 |     100
  messages.service.ts              |   38.02 |      8.1 |   36.36 |   36.23   ← 보강 필요
  discord-webhook.service.ts       |     100 |      100 |     100 |     100
  notifications.service.ts         |     100 |    90.74 |     100 |     100
  organizations.service.ts         |   83.33 |    65.21 |     100 |   82.35
  positions.service.ts             |     100 |    66.66 |     100 |     100
  reports.service.ts               |   78.74 |    64.61 |   58.82 |   82.88
  custom-types.service.ts          |     100 |    88.23 |     100 |     100
  requests.service.ts              |   63.58 |    40.41 |   71.15 |   63.61   ← 보강 필요 (1438줄 대형)
  schedule-patterns.service.ts     |   87.17 |    63.33 |   86.66 |      88
  shift-templates.service.ts       |     100 |    66.66 |     100 |     100
  shift-types.service.ts           |     100 |      100 |     100 |     100
  shifts.service.ts                |   90.17 |    55.55 |   94.44 |   90.82
  standardization-rules.service.ts |     100 |    82.75 |     100 |     100
  timeclock-areas.service.ts       |     100 |    70.58 |     100 |     100
```

---

## 4. 통합 테스트 — 핵심 비즈니스 플로우 (실 DB 검증)

CLAUDE.md §10 필수 통합 케이스를 실 PostgreSQL(`ablework_test`)로 검증:

| 케이스 | 검증 내용 | 결과 |
|---|---|---|
| **요청→문서 자동생성** | LEAVE/SHIFT/ATTENDANCE 요청이 $transaction으로 request + document(PENDING) + 결재선 + 단계를 원자 생성. 필수 누락 시 부분생성 없음 | ✅ |
| **결재→잔액차감 원자성** | 휴가 3일 승인 → 문서 APPROVED + 잔액 정확히 −3 + Leave 레코드 생성. 반려 시 미차감. 재승인 시 중복차감 없음 | ✅ |
| **ORG_ADMIN 타조직 403** | 개발팀 ORG_ADMIN이 영업팀 직원 접근 → 차단, 자기 조직은 허용, 목록은 범위 제한 | ✅ |
| **회수→재상신→승인 상태전이** | DRAFT→PENDING→RECALLED→PENDING→APPROVED 전 구간. 회수는 기안자만 | ✅ |
| 인증 | 로그인/토큰갱신/비밀번호변경/권한가드 | ✅ |

**하니스 특징(재사용):** `globalSetup`이 매 실행 시 `migrate deploy → TRUNCATE → seed`로 `ablework_test`를 깨끗이 초기화 → 결정적·반복가능. 개발 DB(`ablework`)는 미접촉.

---

## 5. 발견·수정한 실버그 (13건)

테스트 작성 과정에서 확인된 "확실한" 결함을 최소 diff로 수정했다.

### 멀티테넌시 (CLAUDE.md 1순위 보안 규칙) — 11건

| 서비스 | 메서드 | 수정 |
|---|---|---|
| company-holidays | remove | `delete({where:{id}})` → `deleteMany({where:{id, companyId}})` (CRITICAL) |
| shared-approval-lines | update/remove | where에 `companyId` 추가 |
| notifications | updateRule | `update` where에 `companyId` 추가 (CRITICAL) |
| custom-types | update(내부 deleteMany) | where에 관계 `customType:{companyId}` 추가 (CRITICAL) |
| shift-types | update/remove | where에 `companyId` 추가 (CRITICAL) |
| positions | update/remove | where에 `companyId` 추가 (일관성) |
| shift-templates | update/remove | where에 `companyId` 추가 (일관성) |

> Prisma 6의 extendedWhereUnique 지원으로 `update({where:{id, companyId}})`가 타입·런타임 모두 유효함을 확인(`tsc` 통과). 기존 `assertX(companyId)` 가드와 결합해 방어 심층화.

### 입력 보안 — 2건

| 서비스 | 위치 | 수정 |
|---|---|---|
| mail | sendInviteCode | `companyName`을 `escapeHtml()` 적용 (HTML 본문 XSS, CRITICAL) |
| mail | sendPasswordReset | `token`을 `encodeURIComponent()` 적용 (URL 주입) |

---

## 6. 식별했으나 수정하지 않은 항목 (의도적 보류 + 권고)

커버리지 분석에서 154건의 의심사항이 보고되었다. 위 13건 외에는 **거짓양성**이거나 **동작/설계 변경 위험**이 있어 보류하고 권고로 기록한다.

| 분류 | 사례 | 판단 |
|---|---|---|
| 가드로 이미 보호됨 (거짓양성) | timeclock-areas update/remove의 `where:{id}` | `assertArea`가 `organization:{companyId}`로 검증. timeclockArea엔 companyId 컬럼이 없어 where 추가 불가 → 현행 유지 |
| 레이스컨디션(TOCTOU) | settings 캐시 무효화 순서, document-forms upsertNumberRule | 단일 노드 환경 위험 낮음. 분산환경 대비 시 복합 유니크 + upsert 권고 |
| 타임존 파싱 | company-holidays `new Date('YYYY-MM-DD')` | `@db.Date` 컬럼으로 실무상 안전. 명시적 TZ 고정은 정책 변경이라 보류 |
| 권한 범위 설계 | shifts/timeclock-areas의 ORG_ADMIN organizationId 범위 미검증 | 컨트롤러 가드 + 서비스 범위검증 보강은 별도 설계 필요. employees는 `guardOrgScope`로 이미 적용됨 |
| 방어 심층화(스키마) | document-forms/proxy-settings 단일 update where | 복합 유니크 마이그레이션 후 적용 권고(스키마 변경 금지 제약으로 보류) |
| 데이터 무결성 | reports.createSnapshot의 snapshot/rows 비트랜잭션 | `$transaction` 래핑 권고(대형 변경이라 별도 작업) |

---

## 7. "빠진 부분" — 잔여 커버리지 갭 (정직한 평가)

| 갭 | 상세 | 권장 후속 |
|---|---|---|
| **messages.service 38%** | 메시지 발송/자동화 분기 다수 미검증 | 단위 테스트 보강 (약 +20 케이스) |
| **requests.service 63%** | 1438줄 대형. 승인 적용·결재자 결정 분기 일부 미검증 | 단위 테스트 보강 + 파일 분리 검토 |
| **branch 61.95%** | 전체 분기 커버리지가 목표(80%) 미만 | leaves/shifts/reports 분기 보강 |
| **e2e 회사 간 격리** | 시드에 회사 1개 → cross-company 테넌시 미검증 | 제2 회사 생성 후 ID 격리 e2e 추가 |
| **e2e 미커버 도메인** | 근태(출퇴근), 근무일정 CRUD, 리포트, 협조/공람/수신/전결/대결 결재 액션 | 단위에선 커버됨. e2e 시나리오 확장 가능 |

> 핵심 비즈니스 플로우(요청→결재→잔액, 멀티테넌시, 상태머신)와 보안 클래스는 단위+통합 양쪽에서 커버됨. 위 갭은 대형 레거시 서비스의 분기 보강과 e2e 범위 확장이 중심이며, 향후 본 문서의 시나리오를 토대로 점진 보강 가능.

---

## 8. 크롬 브라우저 검증 (실데이터 연계)

개발 DB(`ablework`) + 시드 계정으로 실제 UI 동작을 확인:

| 화면 | 확인 내용 |
|---|---|
| 로그인 | admin 로그인 정상 (브랜드 오렌지 `#f36f20`) |
| 대시보드 | KPI 카드(근무중/출근/지각/진행중 요청) 렌더링 |
| 직원 관리 | 4명(박영업/김조직/홍길동/최고관리자) — 조직·권한·상태 연계, 필터·페이지네이션 |
| **휴가 현황** | 실잔액 — **홍길동 연차 15일 발생·4일 사용·11일 잔여** (이전 결재 승인이 잔액에 반영 = 실연계 입증) |
| **전자결재 문서대장** | 7개 문서 — GEN-2026-0001~0003 채번, 승인/반려 상태, **HR 요청 자동연동 문서** |
| 직무 관리 | **라이브 CRUD**: 등록("직무 추가되었습니다") → 즉시 반영 → 삭제(확인 다이얼로그 → "삭제되었습니다") → 제거 |

**결론: 단순 데이터 등록이 아니라, 등록→결재→잔액차감→화면반영의 실제 비즈니스 로직 연계가 동작함을 확인.**

---

## 9. 재실행 방법

```bash
docker compose up -d                          # 인프라
pnpm --filter api test                        # 단위 (576)
pnpm --filter api test -- --coverage          # 커버리지
pnpm --filter api test:e2e                    # 통합 (33, 실 DB 자동 초기화)
pnpm --filter api exec tsc --noEmit           # 타입체크
```
