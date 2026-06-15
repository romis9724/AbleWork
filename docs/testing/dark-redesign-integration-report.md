# AB Workforce 다크 디자인 개편 — 권한별 통합 테스트 리포트

- **작업일**: 2026-06-15
- **디자인 출처**: `refs/design_handoff_ab_workforce/` (AB Workforce 핸드오프 — 순수 블랙 + 오렌지 #f36f20, radius 0, 그림자 없음, 헤어라인 테이블)
- **구현 방식**: 핸드오프 원본 CSS 포팅(`styles/ab-admin.css`·`ab-hr.css`) + AB 컴포넌트 라이브러리(`components/ab/*`) + MUI 다크 테마 전환
- **테스트 환경**: Chrome 실브라우저 / web `localhost:3000`(next start) · api `localhost:3001`(ts-node) · PostgreSQL `localhost:5433` · 시드 데이터
- **검증 기반**: ① 실브라우저 화면 렌더·동작, ② Next.js `middleware.ts` 라우팅 가드, ③ NestJS `@Roles` 가드 + API 직접 호출(curl), ④ CLAUDE.md 비즈니스 룰

## 테스트 계정

| 역할 | 라벨 | 계정 |
|---|---|---|
| SUPER_ADMIN | 최고관리자 | admin@ablework.io |
| ORG_ADMIN | 조직관리자 | orgadmin@ablework.io (개발팀) |
| EMPLOYEE | 직원 | employee@ablework.io |

## 범례

- ✅ 전체 접근 · 전체 데이터
- 🟠 접근 가능 · **소속 조직 범위** 데이터만 (서버 스코핑)
- 🔒 접근 가능하나 일부 **상위 권한 전용 액션** 제한
- ⛔ 접근 차단 — 미들웨어가 `/me/home`으로 리다이렉트
- — 해당 없음(권한 모델상 비대상)

---

## 1. 인증 · 셸

| 화면 | 기능 | 최고관리자 | 조직관리자 | 직원 |
|---|---|:---:|:---:|:---:|
| 로그인 | 이메일/비밀번호 로그인, 역할별 라우팅 | ✅ →`/admin` | ✅ →`/admin` | ✅ →`/me/home` |
| 공통 셸(헤더·사이드바) | 다크 셸, 역할 라벨 표시 | ✅ "최고관리자" | ✅ "조직관리자" | — (직원 셸) |
| 모드 전환 | 직원 모드 ↔ 관리자 모드 | ✅ | ✅ | 🔒 관리자 모드 버튼 미노출 |
| `/admin/*` 접근 가드 | 비관리자 차단 | ✅ | ✅ | ⛔ →`/me/home` (검증됨) |

## 2. 운영 (admin)

| 화면 | 기능 | 최고관리자 | 조직관리자 | 직원 |
|---|---|:---:|:---:|:---:|
| 홈(대시보드) | KPI 4칸·실시간 근무·처리 대기 요청 | ✅ | 🟠 | ⛔ |
| 근무일정 | 로스터 조회·근무 추가/수정 | ✅ | 🟠 | ⛔ |
| 근무일정 | 확정 / **확정 해제** | ✅ | 🔒 해제 불가(SUPER/GENERAL 전용) | ⛔ |
| 출퇴근기록 | 기록 조회·근무구간 타임라인·수정 | ✅ | 🟠 | ⛔ |
| 출퇴근기록 | 기간 확정 / **확정 해제** | ✅ | 🔒 해제 불가 | ⛔ |
| 휴가 현황 | 잔액 게이지·휴가 부여 | ✅ | 🟠 | ⛔ |
| 요청 내역 | 승인 / 거절 | ✅ | 🟠 | ⛔ |
| 요청 내역 | **강제 승인 / 강제 거절** | ✅ | 🔒 불가(SUPER 전용) | ⛔ |

## 3. 전자결재 (admin)

| 화면 | 기능 | 최고관리자 | 조직관리자 | 직원 |
|---|---|:---:|:---:|:---:|
| 결재 현황 | 필터·문서 조회·선택 삭제 | ✅ | 🟠 | ⛔ |
| 문서대장 | 전사 문서 조회 | ✅ | 🟠 | ⛔ |
| 내 문서함 | 기안/결재/공람/참조/수신함 | ✅ | ✅ 본인함 | ⛔(직원은 `/me/documents`) |
| 공용 결재선 관리 | 결재선 CRUD | ✅ | 🟠 | ⛔ |
| 기안양식 관리 | 양식 분류·CRUD·접근규칙 | ✅ | 🟠 | ⛔ |
| 문서 담당 관리 | 조직별 담당자 지정 | ✅ | 🟠 | ⛔ |
| 전자결재 백업 | 기간/양식 필터·CSV 백업 *(신규)* | ✅ | 🟠 | ⛔ |
| 공통 관리 | 결재 정책 설정 | ✅ | 🔒 회사 정책은 상위 권한 권장 | ⛔ |

## 4. 정산·문서 / 관리 (admin)

| 화면 | 기능 | 최고관리자 | 조직관리자 | 직원 |
|---|---|:---:|:---:|:---:|
| 리포트 | 실시간 와이드 표·CSV export | ✅ | 🟠 | ⛔ |
| 메시지 | 발송 내역·템플릿·작성 발송 | ✅ | 🟠 | ⛔ |
| 직원 관리 | 직원 목록·추가·상세 | ✅ 전사 **4명** | 🟠 소속 조직 **2명**(검증됨) | ⛔ |
| 회사 설정 | 회사 정보·휴일·출퇴근/휴게 정책 | ✅ | 🔒 회사 단위 설정 제한 | ⛔ |
| 감사 로그 *(신규)* | 감사 이력 조회·필터 | ✅ | ✅ (ORG_ADMIN+) | ⛔ API 403(검증됨) |

> NEVER 목록(급여·마감 관리·전자계약)은 CLAUDE.md 준수로 **네비/화면에서 제외**. PC 사용 현황은 데이터 소스 부재로 제외(아래 §7).

## 5. 직원 셀프서비스 (me) — 전 권한 접근 가능(관리자는 "직원 모드"로)

| 화면 | 기능 | 최고관리자 | 조직관리자 | 직원 |
|---|---|:---:|:---:|:---:|
| 홈 | 출근/퇴근/휴게·연차 KPI·최근 요청 | ✅ | ✅ | ✅(검증됨) |
| 출퇴근 | 내 출퇴근 기록 | ✅ | ✅ | ✅ |
| 근무일정 | 내 근무일정 | ✅ | ✅ | ✅ |
| 휴가 | 잔액 게이지·휴가 신청 | ✅ | ✅ | ✅(검증됨 11/15일) |
| 요청 | 요청 작성·취소·내역 | ✅ | ✅ | ✅ |
| 결재(문서) | 내 문서함·기안·결재 처리 | ✅ | ✅ | ✅ |
| 메시지 | 받은 메시지·읽음 | ✅ | ✅ | ✅ |
| 프로필 | 기본정보 수정·비밀번호 변경 | ✅ | ✅ | ✅(검증됨, 권한=EMPLOYEE) |

---

## 6. 검증 요약

- **실브라우저 직접 확인**: 로그인(다크) · admin 홈/근무일정/출퇴근/요청/결재현황/직원/감사로그(SUPER) · admin 홈/직원(ORG) · me 홈/휴가/프로필(EMPLOYEE).
- **권한 경계 확증**:
  - 직원이 `/admin/dashboard` 진입 → `/me/home`으로 **리다이렉트**(미들웨어).
  - 직원 모드(EMPLOYEE)에서 헤더 "관리자 모드" 버튼 **미노출**.
  - 조직관리자 직원 목록 = **2명**(개발팀) vs 최고관리자 = **4명**(전사) → **조직 스코핑 동작 확인**.
  - `GET /audit-logs`: 최고관리자 **200** · 조직관리자 **200** · 직원 **403**(API 직접 호출 확인).
- **콘솔 에러**: 0건.
- **빌드/타입**: `web` 프로덕션 빌드 성공 · `web`/`api` `tsc --noEmit` 0 에러.

## 7. 의도적 결정 · 비고

- **NEVER 목록 제외**: 급여(13)·마감 관리(14)·전자계약(15)은 CLAUDE.md "절대 구현 안 함"에 따라 네비/화면에서 제외. 정산·문서 섹션은 리포트·메시지만 노출.
- **PC 사용 현황 제외**: 핸드오프 부가 메뉴였으나 디바이스/PC 세션 데이터 모델·수집 인프라가 전무하고 Enterprise 인접 기능(생체/IP 화이트리스트 등 NEVER 정신)이라, 가짜 화면을 만들지 않고 네비에서 제외. 부가 메뉴는 **감사 로그**(실데이터)로 집중.
- **감사 로그 신규 백엔드**: `AuditLog` 모델 + 모듈 + `GET /audit-logs`(ORG_ADMIN+ 가드) 추가, 마이그레이션 `20260615040617_add_audit_logs` 적용, 시드 12건. 출퇴근 수정·휴가 부여·회사 설정 변경 3개 지점에 기록 와이어링(fire-and-forget).
- **전자결재 라이트 터치**: 최근 전사 통일된 공유 컴포넌트(DocumentBoxesView·결재선 빌더·동적필드 등)는 다크 MUI 테마로 이미 정합되어 그대로 유지하고, 페이지 셸(PageHead·필터·표)만 포팅 CSS로 다크 정합.
- **조직관리자 액션 제한**(🔒)은 서버 `@Roles`/비즈니스 룰 기반(확정 해제·강제 승인은 상위 권한 전용). UI는 접근 가능하되 해당 액션 호출 시 서버가 차단.

## 8. 실행 방법(재현)

```bash
docker compose up -d                                   # postgres/redis/minio
pnpm --filter api exec prisma migrate deploy           # AuditLog 포함 마이그레이션
pnpm --filter api exec ts-node prisma/seed.ts          # 시드(계정·감사로그)
# API: ts-node 직접 실행 (nest start 불가 환경)
cd apps/api && TS_NODE_TRANSPILE_ONLY=1 pnpm exec ts-node -r tsconfig-paths/register src/main.ts
# Web
pnpm --filter web build && pnpm --filter web start
```

---

## 9. 전수 검증 패스 (Ultracode) — 적대적 코드 리뷰 + 권한 매트릭스

해피패스 브라우저 테스트(§1~6) 이후, 변경된 전 코드에 대해 **적대적 다차원 코드 리뷰 워크플로**(영역별 병렬 리뷰어 → 각 발견을 회의적으로 재검증)와 **전 API 권한 매트릭스 스윕**을 추가 수행했다.

### 9.1 적대적 코드 리뷰 결과
- 6개 영역 병렬 리뷰 → **발견 51건, 검증 통과(실제 결함) 37건**. 전부 수정 완료.
- HIGH 2 / MEDIUM 13 / LOW 22. 수정 후 web·api `tsc` 0 에러, web 프로덕션 빌드 성공, ESLint 0 에러.
- 주요 수정:
  - **[HIGH] 출퇴근 CSV 다운로드 401**: `window.location.href` 직접 네비게이션은 Authorization 헤더 미전송 → 항상 401. `apiClient.get('/reports/export',{responseType:'blob'})` + Blob 다운로드로 교정. (`GET /reports/export` 인증 헤더 시 200 확인)
  - **[HIGH] 리포트 와이드표 헤더↔데이터 어긋남**: 실근로시간 컬럼이 표준근로시간과 중복(둘 다 `standardizedWorkMinutes`), `normalCount`가 엉뚱한 헤더 아래 표시. 헤더+accessor를 단일 컬럼 배열로 묶어 의미대로 재매핑(실근로시간=`totalWorkMinutes`). 브라우저 재확인.
  - [MEDIUM] 근무일정 조직 select 트리 미평탄화(하위부서 누락) → flattenOrgs 적용 / 야간근무 end<start 검증 / 대시보드 '휴가·결근' 라벨 정정 / 요청 인라인 실패 시 모달 오닫힘 / 메시지 'undefined명' 컬럼 제거(수신 데이터 계약 정합) / 회사설정 섹션 전환 시 미저장 편집 폐기 / 직원 다운로드 부분내보내기 경고 / 백업 TZ·1000건 절단 경고 / Pager 윈도잉 / TextInput controlled 정합 / 설정 저장 후 캐시 무효화.
  - [LOW] 휴가 게이지 클램프, me 근무칩 색상(color 기반), me 출퇴근 상태 라벨(oncall 등), me 홈 연차 라벨 동적화, 다수 a11y(클릭 span/div/tr/a에 role·tabIndex·키보드 핸들러), 감사로그 백엔드 하드닝(resolveActorName companyId 스코핑·날짜 검증/UTC·after 정확값 기록).

### 9.2 [보안] 출퇴근 조회 인가 스코핑 강화 (전수 검증 중 발견·수정)
- 발견: `GET /attendances`가 역할 가드/본인 강제 스코핑 없이 `companyId`로만 필터 → **EMPLOYEE가 전사 출퇴근 조회 가능**. me/출퇴근 화면도 본인 필터 없이 호출.
- 수정(shifts.findAll과 동일 정책): 컨트롤러가 `@CurrentUser()`를 서비스에 전달, 서비스에서 `ORG_ADMIN` 미만이면 `where.employeeId = user.employeeId`로 **본인 강제 스코핑**. me/출퇴근은 본인 `employeeId`를 명시 전달(관리자가 직원 모드로 봐도 본인만).
- 검증: 타입체크 통과, EMPLOYEE는 본인 레코드만 반환(서버 강제, 시드상 17건 전부 본인 소유).

### 9.3 전 API 권한 매트릭스 (GET, 3역할)
- 대부분 읽기 엔드포인트는 회사+역할 스코핑(EMPLOYEE는 본인/소속 조직 범위). 검증된 게이팅:
  - `/audit-logs`·`/company-settings`: EMPLOYEE **403**, ORG/SUPER 200
  - `/notifications/rules`: ORG도 **403**(GENERAL+ 전용)
  - `/employees`: SUPER 전사 4명 vs ORG/EMPLOYEE 소속 2명(조직 스코핑)
  - `/requests`·`/documents`: EMPLOYEE는 본인 것만
- 잔존 관찰(후속 권장, 이번 범위 외): 일부 admin 리스트 GET이 EMPLOYEE에 200을 주되 서버 스코핑에 의존 — UI는 미들웨어로 차단됨. 엔드포인트별 명시적 `@Roles` 정합은 별도 보안 점검 과제로 권장. → **§9.4에서 전수 점검·보강 완료.**

### 9.4 admin GET 엔드포인트 인가 전수 점검·보강 (후속 완료)
33개 GET 목록 엔드포인트를 3역할 런타임 매트릭스로 전수 점검. EMPLOYEE가 200을 받되 서버 스코핑·역할 가드가 없어 **타 직원/전사 데이터·관리자 설정이 노출되던 엔드포인트를 식별·차단**:
- **[보안] `/reports/*`**(realtime·export·snapshots·custom-columns): `@Roles` 전무 → EMPLOYEE가 **전사 per-employee 근무통계(근로시간·지각 등)** 조회 가능했음. `ReportsController` 클래스레벨 `@Roles(ORG_ADMIN)`로 차단(직원용 리포트 화면 없음 확인).
- 관리자 설정 GET 6종(`/requests/approval-rules`·`/messages/templates`·`/messages/automations`·`/shift-templates`·`/schedule-patterns`·`/standardization-rules`): 핸들러레벨 `@Roles(ORG_ADMIN)` 추가(쓰기는 기존 상위 권한 유지). me UI 미사용 확인 후 적용.
- **검증**: 9개 전부 EMPLOYEE **403** / ORG·SUPER **200**(admin 화면 보존). 직원 화면용(`/messages`·`/requests`·`/shifts`·`/attendances`·`/documents`·`/leaves/types`·`/organizations`·`/document-forms`)은 EMPLOYEE **200 유지**(미영향). API `tsc` 통과.
- **정상 확인(수정 불필요)**: `/employees`(조직 스코핑)·`/attendances`·`/shifts`·`/requests`·`/documents`·`/messages`·`/proxy-settings`(본인 스코핑), `/audit-logs`·`/company-settings`·`/company-holidays`·`/permission-settings`·`/notifications/*`(이미 가드), 참조 데이터(`/organizations`·`/positions`·`/leaves/types`·`/document-forms`·`/shared-approval-lines`·`/form-categories`·`/shift-types`·`/timeclock-areas`, 직원 읽기 정상).

---

## 10. 전자결재 전면 재구축 (핸드오프 네이티브)

전자결재 화면을 라이트터치(MUI 공유 컴포넌트 유지) 방식에서 **핸드오프(`refs/.../screens1·2.jsx·doc_modal·form_modal`) 디자인 네이티브**로 전면 재구축. 폰트는 다른 화면과 동일(본문 Pretendard·문서번호/날짜/단계번호 Tektur). 실제 데이터/워크플로 100% 보존.

- **신규 네이티브 모달 3종**(`components/approval/`): `DocModal`(view/edit/create — 결재선 도장 `.aline/.acol`·문서메타·기안내용·첨부·결재의견 타임라인 + 권한 기반 실제 액션[승인/반려/전결/회수/수정/상신/공람추가, useDocumentStepAction·useRecallDocument·useCreate+Submit]), `FormModalNative`(기안양식 등록/수정), `LineModalNative`(공용 결재선 — 조직도+역할버튼→ApprovalStepInput[]). 깊은 기능은 기존 빌더(ApprovalLineBuilder·DynamicFormFields·AttachmentPanel·RichText) 임베드.
- **재작성 화면**: 결재현황(필터+표+DocModal)·문서대장·내문서함(BOX_TABS)·공용결재선(LineModal)·기안양식(2-pane+FormModalNative, 접근규칙/채번 보조 유지)·문서담당(2-pane 토글)·백업·공통관리·service-setting·me/documents(모바일 box탭+DocModal).
- **라우트→모달 전환**: 상세/작성/수정을 별도 라우트 페이지에서 모달로 전환. 폐기 라우트 삭제: `approval/{status,documents,inbox}/[id]`·`inbox/[id]/edit`·`inbox/new`·`forms/[id]/edit`·`forms/new`·`me/documents/[id]`·`[id]/edit`·`new`.
- **고아 컴포넌트 9종 삭제**: DocumentBoxesView·DocumentComposeForm·DocumentDetailView·DocumentFormWizard·AddCcDialog·ApprovalActionDialog·ApprovalTimeline·ApprovalLineDialog·OrgTree·FormFieldsBuilder(폐쇄 클러스터, 어떤 페이지도 미참조 확인 후).
- **검증**: web 프로덕션 빌드 성공, 소스 `tsc` 0 에러. 브라우저 확인 — 결재현황(네이티브 Badge), **DocModal(결재선 도장·메타·실제 승인/반려 액션, 실문서 데이터)**, 기안양식 2-pane, 공용결재선 전부 핸드오프 디자인 정합·폰트 일관.

### 10.1 폰트 토큰 통일 (후속 수정)
MUI 테마 `typography.fontFamily`가 디자인 시스템과 별개로 `"Pretendard Variable", Pretendard, "Noto Sans KR", "Roboto", sans-serif`를 하드코딩 → body/모든 일반 텍스트가 이 스택(Noto/Roboto 포함)으로 계산되어 `var(--font-display)` 기반 디자인 토큰 체계와 어긋났음. **`theme/index.ts`의 fontFamily를 `var(--font-body)`로 변경**해 통일. 검증(브라우저 computed style): body·라벨·입력·표 셀 모두 `var(--font-body)`(Pretendard), eyebrow·숫자·문서번호·시각은 `var(--font-display)`(Tektur) — 전 화면(전자결재 포함) Noto/Roboto MUI 스택을 쓰는 요소 0.
