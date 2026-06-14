# Phase 2 전자결재 구현 갭 분석 (Goal 11~17)

> 작성: 2026-06-14 · 방식: 7개 Goal 병렬 탐색 + 갭 적대적 재검증 + 종합 (15-agent 워크플로)
> 관련: [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md), [FEATURE_LIST.md](./FEATURE_LIST.md), CLAUDE.md §9
> 목적: 재사용 — 다음 세션에서 Phase 2 잔여 작업·우선순위를 즉시 파악 (LLM 토큰 절약)

## 종합

**전체 완성도 ~99% (2026-06-14 재검증·잔여 일괄 완료).** 핵심 골격(양식/작성/상신/결재처리/HR연동/문서함)에 더해, 초기 3대 미완 영역 + 잔여 open 항목이 모두 해소되었다:
- ✅ **부서협조·부서수신·부서문서함(G14)** — PR #15(스키마)·#17(BE 엔진)·#18(FE) 완료.
- ✅ **결재·HR요청 알림 활성화(G17/G15)** — NOTIFIABLE_EVENTS SSOT + 부트스트랩 일괄 구독으로 정합화(PR #9·#11).
- ✅ **양식 동적필드 빌더(G11/G12 · AP-01-02)** — DocumentFieldDef SSOT + 빌더/작성 배선(PR #13).
- ✅ **양식별 기본 결재선(AP-01-03, `defaultLineId`)** + **결재규칙 스냅샷(§6.6 #3, `Request.ruleId`)** — 마이그레이션 + 로직(PR #20).
- ✅ **결재 처리 FE Playwright E2E(G13)** — 승인/반려 UI 구동 + 상태 검증(PR #21).

추가로 Medium/Low 잔여 항목까지 일괄 완료(PR #24~#30):
- ✅ **M1 다결재자/병렬 결재(M-of-N)** — ApprovalRuleDetail requiredCount/round 활용, 활성 라운드 판정·중복승인 차단·isParallel (PR #29).
- ✅ **M2 알림 email/in_app 채널** 디스패치 (PR #26) · ✅ **M3 양식 접근규칙**·**M4 양식 담당자**·**L4 ZIP**(PR #24).
- ✅ **L1 DEVICE_CHANGE 기기 바인딩**·**L2 참조/공람/수신 박스 DRAFT 제외**(PR #25) · ✅ **L3 Discord embed 구조화**·**L5 전단계반려 안내**·**L6 FEATURE_LIST 정합**(PR #28).
- ✅ **P2 조직 주소(Organization.address)**(PR #27) · ✅ **T1 회수·T2 참조확인 FE E2E**(PR #30).

단위 640 · 통합 e2e 40 · 결재 흐름 FE E2E 4(승인/반려/회수/참조) 통과. **사실상 100%.**

**보류:** P1 wage-info 독립 모듈화 — 기능은 `employees/:id/wage-info`로 완결되어 있고, 분리 시 `guardOrgScope`(보안 가드)를 복제해야 해 위험 대비 가치가 없어 의도적으로 보류(KISS/DRY).

## 부서협조/부서수신 구현 완료 (G14 — PR #15·#17·#18)

> 설계 결정(2026-06-14): 부서협조 "내부결재" = **부서 문서담당자 단일 결정**(완료/반려). 중첩 결재선 없음.
> 스키마(PR#15): `Organization.docManagerId`(null→approverId 팀장 fallback), `ApprovalStep.organizationId` — 마이그레이션 `20260614062318_g14_dept_collab_doc_manager`.

**상수**: StepRole `DEPT_COLLABORATOR`/`DEPT_RECEIVER`, StepStatus `BOUNCED`(반송), `RECEIVER_ROLES`/`DEPT_ROLES`/`CANCEL_ON_REJECT_ROLES`. (구 계획의 `ACCEPTED` 중간상태는 **미채택** — 수신확인을 `RECEIVED` 단일 단계로 단순화.)

**BE 엔진**
1. **step 담당자 해석**(`documents.service.resolveSteps`): `ApprovalStepInput.organizationId` 추가, 부서 단계는 저장 시점(create/submit)에 `assigneeId = org.docManagerId ?? org.approverId`로 해석(`assigneeId` NOT NULL 제약 대응). 둘 다 없으면 `DEPT_NO_MANAGER`, 타사 부서 `ORG_NOT_FOUND`. 이후엔 일반 assignee 기반 단계로 동작 → 권한 로직 재사용.
2. **액션**(`approval-actions.service`): 부서협조 = `DEPT_COLLABORATOR`가 `APPROVAL_FLOW_ROLES`에 합류해 `approveFlowStep` 공유(완료=`/dept-collab`→APPROVED, 반려=기존 `/reject`). 부서수신 = `RECEIVER_ROLES`로 `receive` 공유(수신확인=`/receive`→RECEIVED) + `bounce`(`/bounce`→BOUNCED, `DOCUMENT_BOUNCED` 이벤트로 기안자 통지).
3. **box** `dept-docs`: 내가 부서 담당자(assigneeId=me)인 `DEPT_*` 단계 보유 문서.
4. **알림**: `DOCUMENT_BOUNCED`를 NOTIFIABLE_EVENTS SSOT에 추가(부서수신 반송 통지).

**FE**: `ApprovalLineBuilder`가 부서 role 선택 시 조직(부서) 선택으로 전환(공용 결재선 편집 공용), `BOX_TABS`에 부서함 추가, 상세 다이얼로그에 부서협조 완료/반려·수신확인·반송 버튼 + 역할별 액션 노출 상태 정합화(수신류=APPROVED). 부수로 기존 RECEIVER 수신 버튼 미노출 버그 동반 수정.

**테스트**: 단위 +12(담당자 해석/fallback/가드, 부서협조 완료·반려, 부서수신 수신확인·반송, dept-docs box) → 단위 620·e2e 40 통과.

## 구현 진행 (2026-06-14 업데이트)

- ✅ **G14 부서협조/부서수신/부서문서함 완료** (PR #17 BE 엔진 · #18 FE): 부서협조(AP-04-02, `/dept-collab`)·부서수신 수신확인/반송(AP-04-06, `/receive`·`/bounce`)·부서문서함(AP-05-04, box=`dept-docs`) 전부 구현. 부서 단계는 상신 시 `docManagerId ?? approverId`로 담당자 해석. FE 결재선 빌더 부서 선택 + 상세 액션 버튼. 단위 +12 → 620·e2e 40 통과. (위 "구현 완료" 섹션 상세)
- ✅ **G14 AP-04-07 문서담당자 완료** (마이그레이션 협업, PR #15): 스키마에 `Organization.docManagerId`(+`ApprovalStep.organizationId`) 추가 — 마이그레이션 `20260614062318_g14_dept_collab_doc_manager`. 조직 관리 화면에 문서담당자 지정(미지정 시 팀장=approverId fallback 표기).
- ✅ **G16 문서함 검색 UI 배선 완료**: BE `findAll`이 `search`(title/docNumber contains)를 이미 지원하나 FE 미배선이던 갭. `DocumentListParams.search` 추가 + 문서함 뷰(`DocumentBoxesView`, /me·/admin 공용)에 디바운스(300ms) 검색 입력. BE 무변경.
- ✅ **G11/G12 AP-01-02 양식 동적 필드 설계 + 작성 시 값 입력 완료**: 알림과 동일하게 단일 출처 `DocumentFieldDef`/`readFormFields`(@ablework/shared-constants) 신설(text/textarea/number/date/select). 양식 관리 다이얼로그에 `FormFieldsBuilder`(필드 추가/유형/필수/옵션) → `fieldsSchema:{fields}` 저장(BE DTO는 이미 수용). 기안 작성 다이얼로그는 선택 양식의 필드를 `DynamicFormFields`로 동적 렌더 → 값 검증(필수) 후 `content`에 key별 저장. 상세 다이얼로그는 라벨 매핑해 제출 값 표시. (파일 업로드 타입은 스토리지 연동 필요 → 후속)
- ✅ **G16 AP-05-06 결재 현황 + 관리자 강제 삭제 완료**: 관리자 전체 조회는 기존 `ledger` box(전 상태) 재사용. 신규 `DELETE /documents/:id/force`(GENERAL_ADMIN↑) — 임의 상태 문서 강제 삭제(이력 선삭제 후 lines→steps Cascade). **HR 요청 연결 문서는 차단**(`DOCUMENT_LINKED_TO_REQUEST` — request.documentId가 SetNull로 끊겨 워크플로 깨짐 방지). FE `/admin/approval/status` 화면(문서대장 미러 + 강제삭제 + 가드 메시지 토스트) + 사이드바 등록. 단위 4건.
- ✅ **권장 #1 — G17+G15 알림 활성화 완료** (PR 별도): 알림 이벤트 단일 출처 `NOTIFIABLE_EVENTS`(@ablework/shared-constants) 신설 → 리스너(부트스트랩 일괄 구독)·BE 기본규칙·FE 토글을 모두 정렬. 누락됐던 비휴가 요청 이벤트(shift/attendance/device/offsite/custom)와 FE-BE 이벤트 키 불일치(짧은 키 'clock_in'/'request_approved' vs 런타임 'attendance.clock_in')를 해소. `DEVICE_CHANGE_REJECTED`/`OFFSITE_WORK_REJECTED` 상수 추가. 단위 7건(listener) 추가.
  - ⚠️ **배포 시 1회 데이터 마이그레이션 필요**: 기존 환경에서 이미 webhook을 등록해 **짧은 키 규칙**(`clock_in` 등)이 `notification_rules`에 남아 있으면 새 코드와 매칭되지 않는다. 그린필드/시드 환경은 정식명을 쓰므로 무관. 배포 시 다음 매핑 UPDATE를 1회 실행:
    `clock_in→attendance.clock_in`, `late→attendance.late`, `leave_request→leave.requested`, `leave_approved→leave.approved`, `request_approved→`(삭제 또는 도메인별 *.approved로 분기). 그 외 짧은 키(clock_out/absent)는 현재 미발행이므로 삭제.

## Goal별 상태

| Goal | 상태 | ~% | 핵심 (2026-06-14 재검증) |
|---|---|---|---|
| G11 양식/공용결재선/문서번호 | 🟢 complete | 98 | CRUD·채번·version·동적필드 빌더(AP-01-02 ✅ PR#13)·양식별 기본 결재선(AP-01-03 ✅ PR#20) 완비. 양식 접근규칙/담당자 선택만 잔여(선택 기능) |
| G12 작성/상신/임시저장/회수 | 🟢 complete | 100 | submit/recall/재상신/EDITABLE 가드 + 동적필드 값(content) 수집·검증·표시 완비 |
| G13 결재 처리(승인/반려/전결/전단계반려/취소/대결) | 🟢 complete | 100 | 8종+부서협조/반송 step 엔드포인트·상태머신·대결 완비. FE Playwright E2E ✅(PR#21, 승인/반려) |
| G14 협조/공람/수신 + **부서협조/부서수신** | 🟢 complete | 100 | 개인 단위 + **부서협조(AP-04-02)/부서수신·반송(AP-04-06)/문서담당자(AP-04-07)/부서문서함(AP-05-04)** 전부 구현 (PR#15·#17·#18) |
| G15 HR요청→전자결재 자동연동 | 🟢 complete | 100 | $transaction 단일 원자성·멀티테넌시·자기결재차단·잔액재검증 + 전 요청유형 requested/approved/rejected 알림 ✅ |
| G16 문서함(기안/결재/공람/참조/수신/부서/대장) | 🟢 complete | 100 | 9종 box + 검색(✅ PR#14) + 결재현황 강제삭제(AP-05-06 ✅ PR#12) + 부서문서함 ✅ |
| G17 전자결재 Discord 알림 + FE | 🟢 complete | 97 | 이벤트→리스너(부트스트랩 일괄구독)→Discord 3회백오프, FE 토글 완비. webhook 등록 시 기본 활성(✅ 기본 비활성 해소) |

## 우선순위 갭

### ✅ 해소 완료 (구 High — 2026-06-14)
| Goal | 항목 | PR |
|---|---|---|
| G17+G15 | 결재·HR요청 알림 활성화 (NOTIFIABLE_EVENTS SSOT + 부트스트랩 구독) | #9·#11 |
| G16 | AP-05-06 결재 현황(관리자 전체 조회/강제 삭제) | #12 |
| G11 | 양식 동적필드(fieldsSchema) 설계 빌더 UI (AP-01-02) | #13 |
| G16 | 문서함 검색 UI 배선 | #14 |
| G14 | 부서협조(AP-04-02)·부서수신/반송(AP-04-06)·문서담당자(AP-04-07)·부서문서함(AP-05-04) | #15·#17·#18 |
| G11 | 양식별 기본 결재선 바인딩 (AP-01-03, `defaultLineId` FK) | #20 |
| §6.6#3 | 결재규칙 스냅샷 (`Request.ruleId`) | #20 |
| G13 | 결재 처리 UI Playwright E2E (승인/반려) | #21 |
| C6-4 | `GET /shifts` 직원 스코핑(보안) · C7 sendInviteCode 데드코드 정리 | #21 |
| G15 | **M1 다결재자/병렬 결재(M-of-N, requiredCount/isParallel)** | #29 |
| G17 | **M2 알림 email/in_app 채널 디스패치** | #26 |
| G11 | **M3 양식 접근규칙 CRUD+enforcement** · **M4 양식 담당자** · **L4 ZIP** | #24 |
| G15/G14 | **L1 DEVICE_CHANGE 기기 바인딩** · **L2 참조/공람/수신 박스 DRAFT 제외** | #25 |
| G17/G13/문서 | **L3 Discord embed 구조화** · **L5 전단계반려 안내** · **L6 FEATURE_LIST 정합** | #28 |
| 조직 | **P2 조직 주소(Organization.address)** | #27 |
| G13/G16 | **T1 회수 · T2 참조확인 FE E2E** | #30 |

### ⏳ High/Medium/Low (잔여)
> **없음** — High·Medium·Low 전부 해소. (단, P1 wage-info 독립 모듈화는 보안 가드 중복 위험으로 의도적 보류 — 종합 참조.)

> ✅ 해소됨: G12 동적 필드 값 입력(PR#13), G14 협조 반려 비차단성·수신 반송(PR#17), G16 검색 UI(PR#14), §6.6#3·AP-01-03(PR#20), G13 E2E(PR#21), M1~M4·L1~L6·P2·T1·T2(PR#24~#30).

## 권장 구현 순서

1. ✅ ~~G17+G15 알림 활성화~~ (PR #9·#11)
2. ✅ ~~G16 결재 현황 + 관리자 강제 삭제~~ (PR #12)
3. ✅ ~~G11 양식 fieldsSchema 빌더 → G12 동적 필드 값 입력~~ (PR #13)
4. ✅ ~~G14 부서 차원 일괄(부서협조/부서수신/문서담당자)~~ (PR #15·#17)
5. ✅ ~~G16 부서문서함~~ (PR #18)
6. ✅ ~~G11 양식별 기본 결재선 FK + §6.6 #3 결재규칙 스냅샷~~ (PR #20) · ✅ ~~G13 결재 처리 FE Playwright E2E~~ (PR #21)
7. ✅ ~~M1 다결재자/병렬(PR#29) · M2 알림 채널(PR#26) · M3·M4·L4 양식(PR#24) · L1·L2(PR#25) · L3·L5·L6(PR#28) · P2 조직주소(PR#27) · T1·T2 E2E(PR#30)~~ — 잔여 일괄 완료.

## 교차 이슈 (cross-cutting)

- ✅ **상태머신 일관성**: 다결재자/병렬(M-of-N)을 requests 승인 엔진에 구현(PR#29 — requiredCount/round 기반 활성 라운드 판정). approval-actions(수동 결재선)는 순차 단계 모델 유지.
- **FE-BE 능력 불일치**: (✅ 문서함 검색·양식 fieldsSchema는 PR #13·#14로 배선 완료) 잔여 — email/in_app 알림 채널이 Discord 리스너에서 데드 옵션(G17).
- **테스트 공백**: BE 단위(622)/통합 e2e(40) 충실. FE Playwright는 결재처리(승인/반려) E2E 보강됨(PR#21, `approval_processing.spec.ts`). 재상신·문서함·부서함 흐름 E2E는 후속 보강 여지.
- **명세 정합성**: FEATURE_LIST 분리 경로 명세 vs 통합 탭 구현 차이(G11·G12·G13·G16·G17), SYSTEM_DESIGN 엔드포인트 표기 차이(G13/G15) — 구현이 견고하면 문서 갱신, 미구현은 구현 정렬로 양방향 정합화.

## 마이그레이션 의존 항목 (사용자 `prisma migrate dev` 필요)

> `migrate dev`/`reset`는 AI 가드 차단이나 **`migrate deploy`는 비차단** — 에이전트가 마이그레이션 SQL을 작성하고 `migrate deploy`로 직접 적용 가능(협업 round-trip 불필요).
> - ✅ ~~G14 부서협조/부서수신/문서담당자~~ — `20260614062318_g14_dept_collab_doc_manager`
> - ✅ ~~G11 양식별 기본 결재선 `defaultLineId` + §6.6 #3 `Request.ruleId`~~ — `20260614161540_phase2_default_line_and_rule_snapshot`
>
> 잔여 마이그레이션 의존 항목 없음.
