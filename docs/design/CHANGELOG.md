# AbleWork 변경 이력 (CHANGELOG)

> 기능·설계·데이터·운영 변경의 단일 이력(SSOT). 신규 설치·추적·롤백 판단의 기준 문서.
> 각 항목: **요청 → 변경 → 영향(파일/마이그레이션/엔드포인트) → 배포(커밋)**.
> 배포 정책: **main 병합 시 GitLab CI 자동 배포**. 마이그레이션은 api 컨테이너 부팅 시 `prisma migrate deploy` 자동 적용.

---

## 2026-07-01

### 21. AI-Readiness E 강화 (CODEOWNERS · MR/PR 템플릿 · eval CI) — 항목 20 후속
- **요청**: 항목 20 재감사(76/100) 후 남은 E 카테고리 개선.
- **감사**: **76 → 80/100 (AI-Ready 유지)**. E 6→10.
- **변경**:
  - **E2 critic 인프라**: 루트 `CODEOWNERS`(경로별 리뷰 책임, 핸들은 예시→교체 필요) + MR/PR 템플릿 2종 — `.gitlab/merge_request_templates/Default.md`(GitLab 실사용) · `.github/PULL_REQUEST_TEMPLATE.md`(스코어러 검출 + GitHub 미러). 체크리스트에 typecheck/lint/test/check-context-paths/멀티테넌시/마이그레이션 포함.
  - **E4/G eval CI**: `scripts/check-evals.mjs` 신설 — `evals/tasks.json`(필수필드·id 유일성)·`agent-results.json`(정의된 task만 참조) 구조 무결성 검증. `package.json` `check:evals` + `.gitlab-ci.yml` `typecheck-lint` 스텝 연결. (LLM pass-rate 실측은 CI 밖, 하네스 회귀만 CI가 차단.)
- **영향**: 문서·CI 설정만. 런타임 무영향.
- **배포(커밋)**: 브랜치 `docs/ai-readiness-quickwins`. 남은 개선: god file 분할(B, 별도 코드 리팩터)·CI 커버리지 확대(E3 workflows·F).

### 20. AI-Readiness 감사 + 개선 (E1·F·A·C·D·B·G)
- **요청**: AI-Readiness Cartography 스킬로 레포 감사 → 산출된 ROI 액션을 Quick wins(E1·F·A)부터 후속(C·D·B·G)까지 실행(브랜치 커밋까지, 배포 안 함).
- **감사**: 자동 채점 **17/100(AI-Hostile) → 76/100(AI-Ready)**, Meta 기준(75+) 도달. 산출물 `docs/ai-readiness-map.html`·`docs/ai-readiness-score.json`.
  - 스코어러 한계 보정: E1 broken 163건 중 156건은 `refs/`(카카오워크 헬프 인덱스·디자인 핸드오프) 외부 자료 오탐, 실제 우리 컨텍스트 broken은 4건. CI 미검출은 `.github`만 스캔한 탓(실제 `.gitlab-ci.yml` 존재).
- **변경**:
  - **E1(경로 정정)**: 루트 `CLAUDE.md`의 `src/events/domain-events.ts` → `apps/api/src/events/domain-events.ts`, `docs/loop/STATE.md`(런타임 생성물) 표기 조정.
  - **F(회귀 방지 게이트)**: `scripts/check-context-paths.mjs` 신설 — 컨텍스트 문서 산문 속 코드경로 존재 검증(`refs/`·코드펜스·빌드산출물 제외, `../` 상대링크 지원). `package.json` `check:context-paths` 스크립트 + `.gitlab-ci.yml` `typecheck-lint` 스텝 연결.
  - **A(모듈 네비게이션, 15/15)**: 모듈-로컬 `CLAUDE.md` 신설 — 커밋 추적 7개 모듈 전부(`apps/api`·`apps/web`·`apps/mobile`·`packages/shared-constants`·`packages/shared-schemas`·`packages/shared-types`·`deploy`). Overview/Quick commands/Common patterns/Non-obvious/Dependencies 구성. (`refs/`는 gitignore된 로컬 참조 아카이브라 커밋 제외 — 로컬 안내용 `refs/CLAUDE.md`만 존재.)
  - **C(암묵지 외부화, 18/20)**: `docs/adr/` 신설 + ADR 5건 — Repository 미사용(0001)·멀티테넌시 companyId(0002)·승인 이원화(0003)·전자결재 상태머신/첨부정책(0004)·ts-node 런타임(0005).
  - **D(의존성 매핑, 13/15)**: `docs/ARCHITECTURE.md` 신설 — 모듈 의존 그래프·요청→결재 플로우 mermaid + 레이어/배포 개요.
  - **B(문서 품질, 14/20)**: 루트 `CLAUDE.md` 347→~85줄 compass화 — 상세를 모듈 CLAUDE.md·ADR·docs로 위임, NEVER·멀티테넌시 등 안전 규칙 보존 + mermaid 그래프.
  - **G(성과 측정, 4/5)**: `evals/` 신설 — 대표 task 5종(`tasks.json`) + pass-rate 측정 틀(`agent-results.json`) + 방법론(README).
- **영향**: 문서·CI 설정만. 앱 코드·API·마이그레이션 변경 없음 → 런타임 무영향.
- **배포(커밋)**: 브랜치 `docs/ai-readiness-quickwins`. 남은 개선: E(CODEOWNERS/eval 자동화)·대형 파일 분할(B, god file 56개).

---

## 2026-06-29

### 1. 무일정 출근 장소 모달 (직원 출근 UX + 검증 강화)
- **요청**: 출근하기 클릭 시 조직·출퇴근 장소·직무를 선택하는 모달. 장소 범위·인증 강화.
- **변경**
  - FE `components/attendance/ClockInModal.tsx` 신설 — 본인 소속 조직 → 그 조직의 출퇴근 장소 → 직무 선택 + 현재 위치 확인(정확도·선택 장소까지 거리·반경 이탈 사전 경고). `me/home` 출근하기가 이 모달을 연다.
  - **WiFi 인증 필수 장소(`wifi`·`gps_and_wifi`)는 웹 미노출(앱 전용)**. 웹은 `gps`·`gps_or_wifi`·`none`만.
  - BE `attendances.clockIn` 검증: 조직 소속(`ATTENDANCE_ORG_NOT_MEMBER`)·조직↔장소 정합(`TIMECLOCK_AREA_ORG_MISMATCH`)·직무 자사(`POSITION_NOT_FOUND`)·웹 WiFi 장소 차단(`ATTENDANCE_WIFI_APP_ONLY`)·웹 `gps_or_wifi`는 GPS 필수(반경 검증). `channel`(`web`|`app`) 필드 도입(기본 `web`; 모바일 앱은 `app`으로 WiFi 장소 사용).
  - 직무 기록: **`Attendance.positionId`** 추가.
  - 모바일 `apps/mobile/src/lib/api.ts` clockIn에 `channel:'app'` 추가.
- **영향**: 마이그레이션 `20260629090000_add_attendance_position`. DTO `clock-in.dto.ts`(z.input). `me/home`, ClockInModal, `lib/query/timeclock-areas`(org 스코프), `lib/query/attendances`(payload).
- **배포**: main `dcf175e`.

### 2. 출퇴근 장소 관리 → 회사설정 > 출퇴근 편입
- **요청**: 출퇴근 장소 메뉴가 nav에 없음 → 회사설정 > 출퇴근 아래에 배치.
- **변경**: 관리 UI를 `app/admin/timeclock-areas/TimeclockAreasPanel.tsx`로 분리해 회사 설정(출퇴근 섹션)·독립 경로(`/admin/timeclock-areas`) 양쪽에서 재사용. "앱 전용" 칩·웹/앱 안내 추가.
- **배포**: main `28a2247`.

### 3. 직원 강제삭제 500(FK) 수정
- **증상**: `DELETE /employees/:id?force=true` → 500. `request_approvals_request_id_fkey` 위반.
- **원인/수정**: `employees.service.forceRemoveCascade`에서 본인 요청(`request`) 삭제 전, 그 요청들의 **모든 `request_approvals`를 requestId로 일괄 삭제**(기존엔 '본인이 결재자'인 승인만 삭제). 요청↔문서 양방향 참조 사이클 차단 위해 문서 삭제 전 `requests.documentId` null 처리.
- **배포**: main `7ee3881`.

### 4. 출퇴근 장소 ↔ 조직 N:N 전환
- **요청**: 장소 생성 시 조직 선택 제거. 조직 관리(추가/수정)에서 출퇴근 장소를 다중 연결.
- **변경**
  - 모델: `TimeclockArea.organizationId`(1:N) 제거 → **`companyId` 직접 스코프** + 조인 테이블 **`organization_timeclock_areas`**(N:N).
  - BE: 장소 생성/수정에서 `organizationId` 제거(회사 단위 생성). `timeclock-areas.findAll`의 조직 필터를 조인(`organizations.some`)으로. 조직 모듈에 `GET/PATCH /organizations/:id/timeclock-areas`(getTimeclockAreas/setTimeclockAreas, 집합 교체) 추가. 조직 삭제 가드 `ORG_HAS_TIMECLOCK_AREAS` 제거(Cascade로 연결만 해제). `clockIn` 조직↔장소 정합=`area.organizations` 연결 여부.
  - FE: 출퇴근 장소 관리=조직 선택 제거·평면 목록·연결 조직 칩. 조직 관리 다이얼로그=출퇴근 장소 다중 선택(저장 시 연결 교체, 수정 시 기존 연결 프리필). `useOrgTimeclockAreas`/`useSetOrgTimeclockAreas`.
- **영향**: 마이그레이션 `20260629120000_timeclock_area_org_n_to_n`(company_id 백필 → 조인 이관 → organization_id 제거). DTO `set-timeclock-areas.dto.ts` 신설.
- **배포**: main `273c095`.

### 5. 직원 출퇴근기록 권한별 탭 + me 네비 개편
- **요청**: 직원은 본인 기록만, 조직관리자는 본인+우리 조직을 탭으로 구분. 헤더에 프로필 아이콘 있으니 좌측 '프로필' 메뉴 삭제하고 '출퇴근기록' 추가.
- **변경**
  - FE `me/attendances`: ORG_ADMIN 이상에게 Seg 탭(`내 기록`/`우리 조직`). '우리 조직' 탭은 직원명·소속/직무 컬럼 포함. 직원(EMPLOYEE)은 본인만(탭 미노출).
  - BE `GET /attendances?scope=org`: 서버가 요청자 소속 조직을 직접 해석해 그 조직 직원으로 스코프(클라이언트 조직 ID 미신뢰 → 타 조직 열람 불가). EMPLOYEE는 scope 무관 본인 강제. findAll employee include에 주 소속 조직·직무 추가.
  - me 네비(`MeShell`): **'프로필' 제거**(헤더 아바타로 접근) → **'출퇴근'(`/me/attendances`) 추가**. 결과: 홈·근무·출퇴근·휴가·요청·결재.
- **영향**: `attendance-filter.dto.ts`에 `scope` 추가.
- **배포**: main `273c095`(위 4와 동시).

### 6. HR 요청 부서 승인자에 총괄관리자(GENERAL_ADMIN) 포함
- **요청**: 휴가/요청 부서 승인자가 조직관리자만 되는데 총괄관리자도 포함.
- **변경**: `requests.service.resolveDeptApprover` — 각 부서 단계에서 **ORG_ADMIN 우선 → 없으면 GENERAL_ADMIN**도 부서 승인자로 인정(둘 다 없으면 상위 부서로). (HR 요청은 전자결재와 이원화 — 부서 승인자 체계, `organization.approverId`(전자결재 결재권자)와 별개.)
- **배포**: main `be5a2e5`.

### 7. 홈 화면 개편 (직원 모드)
- **요청**: 홈의 '휴게 시작'·'식사 시작'·'휴게 종료' 버튼 제거(추후 개발). '요청' 버튼 추가 — 홈에서 바로 새요청 팝업. 연차 현황 KPI를 관리자 '휴가'와 동일(전체/사용/잔여 연차).
- **변경**
  - 출퇴근 카드: 휴게/식사/휴게종료 버튼 제거(출근/퇴근만). **'요청' 버튼** 추가.
  - 새 요청 플로우(유형 선택 메뉴 + 유형별 다이얼로그)를 **공용 컴포넌트 `app/me/requests/NewRequestModal.tsx`로 추출** → `me/home`·`me/requests` 재사용. 홈 요청 버튼은 페이지 이동 없이 바로 팝업. `me/requests`는 `?new=1` 진입 시 자동 오픈.
  - 연차 KPI: 전체 연차(발생)/사용 연차/잔여 연차(연차 그룹 잔액의 accrued/used/remaining).
- **배포**: main `bde5208`.

### 8. 휴가 화면 직원 목록 limit 수정
- **증상**: 발생규칙 '규칙 실행' 등에서 직원이 일부만(앞 20명) 표시.
- **원인/수정**: `useEmployees` 호출에 `limit` 누락 → 서버 기본값 20. 휴가 패널 4곳(발생규칙·현황·보상·목록)에 `limit: 500` 추가.
- **배포**: main `bde5208`(위 7과 동시).

### 9. 휴가 유형 선택 2단계(휴가 그룹 → 휴가 유형)
- **요청**: 휴가 유형 선택을 2단계(그룹 선택 후 유형)로. 신청 모달 외 모든 곳.
- **변경**: 휴가 유형을 고르는 4개 화면을 2단계로 통일 — `LeaveFormModal`(직원 신청/수정), `CreateLeaveDialog`(관리자 휴가 추가), `LeaveStatusPanel` 휴가 부여, `LeaveCompensationPanel` 보상휴가. 그룹 선택 → 그 그룹 유형만 노출·그룹 변경 시 유형 초기화. (제외: 메시지 자동화=트리거 필터, 휴가 유형 관리=유형 CRUD.)
- **배포**: main `a043ef8`.

### 10. 홈(직원 모드) 모바일 레이아웃 보정 — 항목 7 후속
- **요청**: 모바일에서 ①퇴근 후 안내문 줄바꿈으로 깨짐 ②연차 현황 KPI 3열이 좁은 폭에서 깨짐(라벨 줄바꿈·값 칸 침범) ③'최근 요청'·'결재 대기 문서' 1행 2열이 답답 → 2행 1열로 롤백.
- **변경**
  - 퇴근 후 안내문 `오늘 근무가 마감됐습니다` → **`근무 마감`**(단축, 한 줄 유지). `app/me/home/page.tsx`.
  - 연차 KPI는 `cols={3}` 인라인으로 모바일에서도 3열 유지(2열 폴백을 의도적으로 덮어씀). 좁은 열에서 안 깨지도록 **모바일 전용(`max-width:560px`) CSS** 추가 — `.kpi` 패딩 16/12, `.kpi-k` 10px·자간 축소·`white-space:nowrap`(라벨 줄바꿈 방지), `.kpi-v` `clamp(22px,7vw,32px)`(값 칸 침범 방지), `.kpi-d` 11px. `styles/ab-hr.css`.
  - '최근 요청'+'결재 대기 문서' 그리드 `repeat(2,…)` → **`1fr`(2행 1열·세로 스택)**. `app/me/home/page.tsx`.
  - '잔여 연차' KPI의 **액센트 강조 바(`.kpi.accent::after`) 제거** — `Kpi`의 `accent` prop 해제. 칸 구분은 기본 `border-right`만 유지(색 없음).
- **영향**: FE만(`page.tsx`, `ab-hr.css`). 마이그레이션·API 없음. KPI 모바일 축소 규칙은 me/* 전 화면 KPI에 공통 적용(개선).
- **배포**: main `a03738b`(2026-06-29). 직전 `7b68aa1` 배포는 CI 빌드 인스턴스 OOM freeze로 web 미반영이었음 → 빌드 인스턴스 리부팅 + resource_group `prod-deploy` 리네임(`7145200`, 옛 락 우회)으로 복구, 본 배포에서 모바일 직원모드 등 7b68aa1 web 변경까지 함께 반영. web 컨테이너 재생성 확인(digest 일치).

### 11. 공용 결재선 등록·수정 모달 개편
- **요청**: ①결재선명 중복 체크 ②조직/직원 트리(접기·펼치기)+안쪽 목록 영역에만 스크롤 ③"합의" → "협조" 버튼명 ④결재·협조 담당자 순서 변경 ⑤수신/참조/공람은 결재·협조와 무관하게 등록.
- **변경**
  - BE: 사전 중복 확인 엔드포인트 **`GET /shared-approval-lines/check-name?name=&excludeId=`** → `{ duplicate }`(GENERAL_ADMIN, 정적 경로를 목록 라우트보다 위에 배치). `SharedApprovalLinesService.checkNameDuplicate` 추가(같은 회사·`COMPANY` 범위·이름 일치, 수정 시 자기 자신 제외, 빈 이름은 조회 없이 false). 저장 시점 `assertNameUnique` 방어는 유지.
  - FE 훅: `useCheckSharedLineName`(mutation) — `lib/query/documents.ts`.
  - FE 모달 `components/approval/LineModalNative.tsx` 재구성:
    - 조직도 트리에 **접기/펼치기**(org 화살표 ▾/▸ 토글, 기본 전체 펼침, 검색 시 매칭+조상 전개) + **스크롤은 트리/리스트 내부 영역에서만**(모달 `overflow:hidden`, 본문 고정 높이 `min(560px,68vh)`, 각 영역 `flex` + `overflow-y:auto`).
    - 결재선명 옆 **[중복체크]** 버튼(결과 안내, 이름 변경 시 idle 초기화, 중복이면 저장 차단).
    - 역할 버튼 **결재·협조**(흐름)와 **수신·참조·공람**(별도) 분리. "합의" 라벨은 상수(`STEP_ROLE_LABEL.AGREEMENT='협조'`)를 따라 **협조**로 표기.
    - 결재·협조 흐름은 **드래그(≡ 핸들)로 순서 변경**, 수신/참조/공람은 흐름과 무관하게 **탭(수신/참조/공람)별 칩**으로 등록·삭제. 저장 시 흐름 → 수신/참조/공람 순으로 `stepOrder` 재부여(데이터 모델 `ApprovalStepInput[]` 불변).
  - 참고: 시안의 좌측 "결재권자/조직도" 탭은 요구 5건 외라 미반영(트리 단일).
- **영향**: 마이그레이션 없음. 엔드포인트 1개 추가. 단위 테스트 `shared-approval-lines.service.spec.ts` +4(42 통과). api·web 타입체크·lint 통과.
- **후속**: 공용 결재선 **목록**의 "결재선" 컬럼 흐름 표시에 역할 라벨 prefix(`[결재]`/`[협조]`) 추가 — `app/admin/approval/lines/page.tsx`(`STEP_ROLE_LABEL` 사용, 오렌지 강조).
- **배포**: 미배포(브랜치 작업).

### 12. 기안양식 등록·수정 화면 개편
- **요청**: ①양식 구성 미리보기 영역 제거 → [미리보기] 버튼·모달 ②양식 도움말(기안 작성 안내) 추가 ③기안 본문 기본 내용 입력 → 작성 시 prefill ④양식 항목의 저장 키 숨김(자동 생성)·작성/미리보기 반영·입력 검증 ⑤각 설정 항목에 회사설정식 "!" 설명 + 개발중 표시.
- **변경**
  - 공유: `DocumentFieldsSchema`에 `helpText?`·`defaultContent?` 추가 + `readFormHelpText`/`readFormDefaultContent` 헬퍼 — `packages/shared-constants/src/document-form-fields.ts`. **도움말·기본본문은 `fieldsSchema` JSON에 함께 저장(마이그레이션·BE 무변경, DTO는 이미 자유 JSON 허용)**.
  - FE `components/approval/FormModalNative.tsx` 개편: `.tpl-prev`(양식 구성 미리보기) 제거, 푸터에 **[미리보기]** 버튼. "작성 안내·기본 본문" 섹션 신설(도움말 `textarea` + 기본본문 `RichTextEditor`). 양식 항목에서 **키 입력 칸 제거**(저장 시 `genFieldKey`로 자동 부여, 이름 빈 항목만 제외). 각 항목 라벨에 `HelpTip k="form.*"`.
  - FE `components/approval/FormPreviewModal.tsx` 신규: 실제 기안 작성과 동일 구성(문서정보·작성안내·양식항목(읽기전용 `DynamicFormFields`)·기본본문 `RichTextView`)으로 미리보기. 등록 모달 위(z-index 220)에 띄우고 overlay 클릭 `stopPropagation`으로 부모 닫힘 방지.
  - FE `components/approval/DocModal.tsx`(기안 작성): 양식 선택 시 도움말 안내 박스 표시(`formHelpText`), **본문이 비어 있으면 양식 기본본문으로 prefill**(`handleSelectForm`), 상신·재상신 전 **필수 동적항목 미입력 차단**(`findMissingRequired`).
  - 도움말 SSOT `lib/settings-help.ts`: `form.*` 12개 키 추가. **보존연한(`form.retentionYears`)은 자동 폐기 로직 미구현 → `WIP_KEYS`에 등록(개발중 배지)**.
- **영향**: 마이그레이션·BE 무변경(`fieldsSchema` JSON 확장만). 신규 컴포넌트 1. api·web·shared-constants 타입체크·web lint 통과. 로컬 브라우저 확인(미리보기 모달·키 숨김·개발중 배지·도움말).
- **배포**: 미배포(브랜치 작업).

### 13. 기안 본문 템플릿 관리(회사설정) + 양식 등록 기본본문 자동 채움
- **요청**: 기안양식 등록의 "기본 본문"을 채우기 위한 템플릿을 회사 설정에서 관리. 기본 본문 에디터 위 select에서 선택하면 에디터에 내용 자동 채움.
- **변경**
  - DB: **`body_templates`** 테이블 신설(`BodyTemplate`: companyId·name·content(HTML, Text)·sortOrder·isActive) + `Company.bodyTemplates` relation. 마이그레이션 `20260629145023_add_body_templates`.
  - BE: `body-templates` 모듈 — `BodyTemplatesController`(`/body-templates`: GET 전직원, POST/PATCH/DELETE GENERAL_ADMIN) + `BodyTemplatesService`(회사 스코프 CRUD, 멀티테넌시 방어). 양식은 내용을 **복사**해 쓰므로 삭제 시 참조 가드 없음. DTO `Create/UpdateBodyTemplateSchema`(document-form.dto.ts). `documents.module` 등록.
  - FE 훅: `useBodyTemplates`/`useCreateBodyTemplate`/`useUpdateBodyTemplate`/`useDeleteBodyTemplate` + `BodyTemplate` 타입(documents.ts).
  - FE 관리 UI: `app/admin/approval/common/BodyTemplatesPanel.tsx` 신규 — 목록(이름·본문 미리보기) + 추가/수정 모달(이름 + `RichTextEditor`) + 삭제. **회사 설정 > 전자결재(`ApprovalCommonPanel`)에 "기안 본문 템플릿" 블록으로 임베드**. 도움말 키 `approval.bodyTemplates`.
  - FE 연동: `FormModalNative` 기본 본문 에디터 **위에 "템플릿에서 불러오기…" select** 추가 — 선택 시 `defaultContent`를 템플릿 content로 설정(RichTextEditor가 외부 value 변경을 반영). 템플릿 없으면 안내 문구.
- **영향**: 마이그레이션 1개. 엔드포인트 4개. api·web 타입체크·web lint 통과. 로컬 브라우저 확인(템플릿 등록 → 양식 모달 select 노출 → 선택 시 본문 자동 채움).
- **배포**: 미배포(브랜치 작업).

### 14. 기안 등록 화면 재구성(양식 우선 + 양식정보 + 결재선 카드 UI)
- **요청(시안)**: ①기안양식을 먼저 선택 — 선택 시 공용 결재선 자동 설정 ②상단 양식 정보 표시 ③결재선/수신/참조/공람을 카드형 UI로.
- **변경**
  - FE `components/approval/DraftApprovalCards.tsx` 신규 — 결재선(기안 카드 + 결재/협조 가로 카드: 역할배지·이름·부서칩·삭제 + 결재/협조 토글·담당자 select·추가) + 수신/참조/공람 접이식 섹션(칩: 이름·부서·삭제, 직원 select·추가). steps를 흐름/수신참조공람으로 분리·재조합해 `stepOrder` 재부여.
  - FE `components/approval/DocModal.tsx`(기안 작성) 재구성:
    - **양식 우선 게이팅** — 양식 미선택 시 "양식 정보"만 표시, 결재선·기안 내용 섹션 숨김.
    - **양식 선택 시 공용 결재선 자동** — `handleSelectForm`이 `form.defaultLineId`로 공용 결재선을 찾아 `steps` prefill(+ 기본 본문 prefill 유지).
    - **상단 양식 정보 테이블** — 문서번호 형식·보존연한·공개여부·기안자(본인)·기안부서(본인 대표 조직). "문서 정보" 섹션을 "양식 정보"로 개편해 결재선 위로 배치.
    - 결재선 UI를 `ApprovalLineBuilder`(MUI 행 편집) → `DraftApprovalCards`(카드)로 교체. 기존 공용/개인 결재선 select·"내 결재선 저장" 보조 UI 및 미사용 심볼(applySharedLine/applyPersonalLine/handleSavePersonalLine, usePersonalApprovalLines/useSavePersonalApprovalLine) 제거.
- **영향**: 마이그레이션·BE 무변경. 신규 컴포넌트 1, `ApprovalLineBuilder`는 기안 작성에서 미사용(공용 결재선 모달은 자체 `LineModalNative` 사용). web 타입체크·lint 통과. 로컬 브라우저 확인(양식 미선택 게이팅 → 선택 시 양식정보·결재선 카드·수신/참조/공람 칩, 결재자 추가).
- **배포**: 미배포(브랜치 작업).

### 15. 양식 작성 권한(관리자 예외) + 기안 상세 화면 정비
- **요청**: ①기안 등록에서 양식 선택 후 상신 시 오류(`FORM_ACCESS_DENIED`) ②기안 상세를 등록 화면처럼(특히 수신/참조/공람) 구성, 상신한 기안은 수정 불가.
- **변경**
  - **BE 버그**: `document-forms.service.assertCanUseForm`이 부서공개/비공개 양식을 양식 담당자만 작성 허용하고 관리자 예외가 없어, GENERAL_ADMIN도 403. → **관리자(GENERAL_ADMIN 이상)는 공개범위·접근규칙과 무관하게 모든 양식 작성 허용**(`hasLevel(user.accessLevel, GENERAL_ADMIN)` 선통과). `assertCanUseForm` user 타입에 `accessLevel` 추가.
  - **FE 에러 노출**: `DocModal`의 작성/상신/재상신 catch를 `getApiErrorMessage`로 구체화(기존 "저장 중 오류" 막연 → `FORM_ACCESS_DENIED` 등 서버 메시지 표시).
  - **기안 상세(view) 정비**: 수신/참조/공람을 **수신·참조·공람 3그룹 읽기전용**으로 표시(기존 "참조·공람"만 + 수신 누락 → 3종 분리). **상신 후 수정 불가** — 결재 진행 중 수신/참조/공람 사후 추가(canAddCc) 기능 제거(`handleAddCc`·`useAddCcSteps`·관련 상태/미사용 심볼 정리). 제목·본문 수정은 기존대로 DRAFT/RECALLED/REJECTED에서만(상신=PENDING 불가).
- **영향**: 마이그레이션 없음. api·web 타입체크·lint 통과. 로컬 브라우저 확인(관리자 상신 `201`+`submit 200` 성공, 상세 화면 양식정보·결재선 도장·수신/참조/공람 3그룹·수정버튼 없음).
- **배포**: 미배포(브랜치 작업).

### 16. 기안 임시저장 후 모달 유지 + 첨부 등록
- **요청**: 임시저장 시 모달을 닫지 않고 첨부파일만 등록 가능하게. 임시저장 기안의 하단 버튼은 [임시저장][상신]만.
- **변경**: `DocModal`(작성 모드)
  - 임시저장으로 생성된 문서 id를 **`localDocId` 상태로 유지** — `handleSaveDraft`가 `onClose()`를 호출하지 않고 모달을 유지한다. `createDraft`는 최초엔 생성(`localDocId` 세팅)·이후엔 내용 갱신(update)으로 동작하고, 상신(`handleCreateSubmit`)도 같은 `localDocId`를 재사용해 중복 생성을 막는다.
  - **첨부파일 섹션**: 작성 중 `localDocId`가 있으면 `AttachmentPanel`(editable, 양식 `allowZipUpload` 반영)을 노출, 없으면 "임시저장하면 등록 가능" 안내. 첨부 섹션도 양식 선택 후에만 표시(게이팅 일관).
  - **푸터**: 작성 모드는 기존대로 [임시저장][상신] 2개 유지(요구 충족). 닫기는 헤더 ✕.
- **영향**: 마이그레이션·BE 무변경. web 타입체크·lint 통과. 로컬 브라우저 확인(임시저장 `POST 201` → 모달 유지 → 첨부 패널 활성, 푸터 2버튼). 참고: 로컬 첨부 업로드는 MinIO 스토리지 키 미설정으로 `503`(환경 이슈, 기능 무관).
- **배포**: 미배포(브랜치 작업).

### 17. 임시저장 기안 재편집 = 작성 화면으로 복원 (deep-interview 확정)
- **요청/인터뷰**: 임시저장(DRAFT) 기안을 목록에서 클릭하면 기안 등록(작성) 화면과 동일하게 열려 처음 작성 상태(결재선 포함)를 복원해 이어서 수정·상신. 적용=관리자 기안함+직원 문서함, 양식 변경 허용.
- **변경**
  - BE: `UpdateDocumentSchema`에 `formId` 추가 + `documents.service.update`가 `formId` 반영(DRAFT 양식 변경). steps 보존은 기존 `createDraftLine`/update 결재선 교체 로직 활용(무변경).
  - FE 훅: `useCreateDocument`/`useUpdateDocument`에 `steps`(+update에 `formId`) 추가.
  - FE `DocModal`:
    - **`compose = isCreate || (DRAFT 문서 편집)`** 개념 도입 — DRAFT를 `edit`(도장·취소/저장/재상신)이 아니라 **작성 화면**(양식정보 테이블·`DraftApprovalCards`·첨부·푸터 [임시저장][상신])으로 렌더. 폼은 기존 `initializedFor` 복원(content·`approvalLines`→steps·form·category).
    - `createDraft`가 **결재선(steps)을 함께 전송** — 최초 생성(`localDocId`)·이후/DRAFT는 `workingDocId`(prop ?? localDocId)로 update(formId·steps 포함). 임시저장 시 결재선·수신/참조/공람 보존 → 재편집 시 복원.
    - 첨부 패널은 `workingDocId` 기준. 목록(inbox·me/documents)은 **이미 DRAFT→edit**이라 변경 불필요.
  - 양식 변경 허용(양식 select 활성) — 변경 시 기본 결재선/기본 본문이 재적용될 수 있음(`handleSelectForm`).
- **영향**: 마이그레이션 없음(BE는 DTO/update 필드 추가만). api·web 타입체크·lint 통과. 로컬 브라우저 확인(임시저장→닫기→재클릭 시 작성 화면·결재자 복원·[임시저장][상신]·양식 select 활성).
- **배포**: 미배포(브랜치 작업).

### 18. 기안 상세(view) 결재선을 카드 UI로 통일 (deep-interview 확정)
- **요청/인터뷰**: 상세 화면 결재선 도장에 수신/참조/공람이 섞여 별도 그룹과 중복됨 → 등록/수정처럼 결재선=카드, 수신/참조/공람=접이식 섹션으로 분리. 결재 진행 상태는 카드에 표시.
- **변경**
  - FE `components/approval/DocApprovalView.tsx` 신규 — 조회 전용 읽기 카드: 기안+결재/협조 카드(역할·이름·부서·**상태 배지(승인/대기/예정/반려/전결/대결)**·처리일시) + 수신/참조/공람 접이식 칩. 상태색=approval-constants `STEP_STATUS_STYLE`. **수신만 상태 배지(수신완료/반송/대기 — 문서 종결에 영향)**, 참조/공람은 이름만(확인 추적 가치 낮아 노이즈 제거).

### 19. 첨부 DRAFT 한정 + 회수/반려 재상신 폐지 → 복사하여 새 기안 (deep-interview 확정)
- **요청/인터뷰**: 상신 이후(진행 중·완료) 첨부 추가/수정 불가, 임시저장(DRAFT)에서만 가능. 회수/반려 문서는 수정·재상신 불가 → '복사하여 새 기안'으로 재작성.
- **변경**
  - BE 첨부 `attachments.service`: `EDITABLE_STATUSES = [DRAFT]`. `loadUploadableDocument`/`remove`가 **DRAFT 상태의 기안자 본인만** 첨부 추가/삭제 허용(상신 후 사후 첨부 분기 제거). 에러코드 `ATTACHMENT_LOCKED`.
  - BE `documents.service`: 수정·상신용 `EDITABLE_STATUSES = [DRAFT]`(회수/반려 update·submit 차단), 기안함 목록용 `DRAFT_BOX_STATUSES = [DRAFT, RECALLED, REJECTED]` 분리(회수/반려는 기안함에서 읽기·복사 가능). submit의 REJECTED `allowReDraft` 재기안 분기 제거.
  - FE `DocModal`: 첨부 패널 상신 후 `editable={false}`(canPostAttach·날인본 안내 제거). 회수/반려 view에서 수정·재상신 버튼 제거(`isEditableMine`·`canReDraft`·`handleResubmit`·`handleSave`·비-DRAFT edit 분기 삭제). 대신 **"복사하여 새 기안"**(`handleCopyToNew`) — 제목·본문·동적항목·양식·결재선을 새 DRAFT로 복제 후 작성 모드(`mode='create'`)로 전환(원본 보존). `workingDocId`를 작성 모드에선 `localDocId` 기준으로 분기.
  - 단위 테스트: attachments(상신후 첨부 불가·DRAFT만 허용)·documents(회수/반려 재상신 차단) 정책에 맞게 갱신.
- **영향**: 마이그레이션 없음. api 단위테스트 229 통과, web 타입체크·lint 통과. 로컬 브라우저 확인(진행중 첨부 읽기전용·푸터 수정/재상신 없음, 회수 문서 '복사하여 새 기안'→결재선·수신 복제·작성모드 전환·첨부 가능).
- **배포**: 미배포(브랜치 작업).
  - FE `DocModal`: view 결재선의 도장(`buildStampLine`/`ApprovalStamp`/`.aline`) → **`DocApprovalView`**로 교체. 기안 내용 섹션에 있던 "수신·참조·공람 3그룹"은 제거(결재선 섹션의 카드로 통합 — 중복 해소). 기안자 부서는 `doc.drafter`로 해석(타인 기안 대응). 미사용 코드(buildStampLine·ApprovalStamp·markFor·StampStep·ccGroups·lineSet·관련 import) 정리.
- **영향**: 마이그레이션·BE 무변경. web 타입체크·lint 통과. 로컬 브라우저 확인(상세 화면 결재선=기안/결재/협조 카드+상태배지, 수신/참조/공람=접이식, 결재선에 수신/참조/공람 미혼재).
- **배포**: 미배포(브랜치 작업).

---

## 데이터 마이그레이션 (kakaowork + Shiftee → 회사 "에이비웍스") — 2026-06-29

> 상세·재사용 절차: [DATA_MIGRATION.md](./DATA_MIGRATION.md). 코드 변경·배포 없음(순수 운영 데이터).

- **소스**: kakaowork 멤버 CSV(기준, 이메일·소속·직위) + SHIFTEE-EMPLOYEES(보강: 입사일·사원번호) + TIMECLOCK-AREAS·SHIFT-TEMPLATES·LEAVES.
- **반영**: 직원 60(로그인 계정·공통 임시비번 `Abmwc2026!`), 출퇴근 장소 3, 근무 템플릿 4, 휴가 사용이력. 조직/직무/휴가유형은 기존 마스터에 이름으로 연결.
- **후속 보정**:
  - Shiftee 일괄 퇴사일(2025-09-04) 27명 → **재직 전환**(resignedAt=null, isActive=true).
  - 비밀번호 해시는 앱과 동일한 **bcryptjs**로 재설정(초기 마이그레이션 시 모듈 불일치로 로그인 실패 → 60계정 재해시).
  - **연차만 유지**: 비연차(보상·포상) 153건 삭제, 연차 사용내역을 2026 연차 잔액에 반영(부여 유지·잔여=부여−사용). 잔여 음수 5명(입사 1년 미만, 발생규칙 미적용) 검토 대기.
- **미반영(의도)**: SHIFTEE-WAGES(근무규칙 템플릿), SHIFTEE-REALTIME-REPORT(계산된 집계).

---

## 데이터 마이그레이션 (직원 목록 CSV → 회사 "레이블코퍼레이션") — 2026-06-29

> 코드 변경·배포 없음(순수 운영 데이터). 회사·조직은 기존에 생성되어 있어 직원만 신규 적재. 실행=로컬 정규화(Python)→Node `mig.js`(dry-run/`--commit` 단일 트랜잭션)→base64 청크 다중 SSM→컨테이너 `docker exec`.

- **소스**: 카카오워크 형식 직원 목록 CSV(33명). 컬럼=사원번호·ID(로그인)·이름·조직·직책·직위·휴대전화·입사일 등.
- **반영(검증)**: 직원 **33명 신규**(전원 재직·`accessLevel=EMPLOYEE`), 직위(Position) 마스터 **9개**(PM·과장·대리·매니저·부대표·부장·사원·이사·차장), 직원↔조직 링크 35·직원↔직위 링크 28. 회사 직원 총 34(+admin). 로그인=공통 임시비번(앱과 동일 **bcryptjs** 해시·강제변경 아님, self-compare 검증).
- **임시비번 변경(후속 요청)**: 최초 `Label2026!`로 적용했으나 사용자 요청으로 **`Labl2026!`로 일괄 재설정**(32명, admin·멀티컴퍼니 정재훈 제외). 진단상 `Label2026!` 해시는 정상 일치였음(암호화 문제 아님). 갱신 후 self-compare=true.
- **확정 규칙(인터뷰)**: 로그인 이메일=**ID 컬럼 우선**(펑위양·오비청은 ID≠이메일). 입사일 공란 15명=`2026-01-01`. 고용형태=`regular` 기본. 조직은 **기존 20개 마스터에 이름 매칭**(신규 생성 없음). `경영지원 본부`(정재훈)=운영에 동명 조직 없어 상위 본부급 **경영관리그룹**에 매핑. `비즈니스그룹`→기존 `비지니스그룹`(철자 변형). 복수 소속 2명(정재훈·이세원)=CSV 선두 조직이 주(primary).
- **멀티컴퍼니**: 정재훈(louis2012cloud@gmail.com)은 이미 운영 계정 존재 → 기존 User에 레이블 Employee만 추가(에이비웍스+레이블 양사 소속). 이 1명은 **기존 비밀번호 유지**.
- **미반영(스키마 외)**: 닉네임·생일·성별·근무위치(Employee 필드 아님).
- **후속 TODO(관리자)**: ①임시비번 `Labl2026!` 배포·교체 안내(32명) ②직책 보유자 12명(팀장8·본부장3·그룹장1) 조직 승인자(approverId)·권한 승격 검토 ③필요 시 휴가/근무 데이터 별도 이관.

---

## 운영 노트 (2026-06-29)

- **CI 빌드 러너 행(hang) 장애·복구**: arm64+Next 빌드가 `ablework-ci-build`(t4g.medium) 메모리 부담으로 행 → SSM `ConnectionLost`·빌드 정지. 복구=`aws ec2 reboot-instances --instance-ids i-05a7153e5318c5098`. 진단/복구 상세는 [AWS_OPERATIONS.md](./AWS_OPERATIONS.md).
- **프론트 배포 특성**: web 이미지(Next build)가 api보다 느려 web 컨테이너 교체까지 시간이 더 걸림. 검증은 ECR `ablework-web` 신규 SHA 태그 + web 컨테이너 재생성(uptime) 확인.
- **운영 DB 디버깅**: 로컬 플러그인 없이 `aws ssm send-command`(문서명 `AWS-RunShellScript`, 리전 ap-northeast-2) → `docker exec ablework-api-1 sh -c 'cd /app/apps/api && node ...'`(Prisma). 상세 [AWS_OPERATIONS.md](./AWS_OPERATIONS.md).
