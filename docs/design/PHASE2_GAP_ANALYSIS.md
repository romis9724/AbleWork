# Phase 2 전자결재 구현 갭 분석 (Goal 11~17)

> 작성: 2026-06-14 · 방식: 7개 Goal 병렬 탐색 + 갭 적대적 재검증 + 종합 (15-agent 워크플로)
> 관련: [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md), [FEATURE_LIST.md](./FEATURE_LIST.md), CLAUDE.md §9
> 목적: 재사용 — 다음 세션에서 Phase 2 잔여 작업·우선순위를 즉시 파악 (LLM 토큰 절약)

## 종합

**전체 완성도 ~83%.** 핵심 골격(양식/작성/상신/결재처리/HR연동/문서함)은 견고하게 동작한다. 가장 큰 미완 영역: **부서협조·부서수신(G14) 전체 미구현**, **결재 알림 기본 활성화 경로 단절(G17/G15)**, **양식 동적필드 빌더 부재(G11/G12)**.

## 구현 진행 (2026-06-14 업데이트)

- ✅ **G14 AP-04-07 문서담당자 완료** (마이그레이션 협업): 스키마에 `Organization.docManagerId`(+`ApprovalStep.organizationId`) 추가 — 마이그레이션 `20260614062318_g14_dept_collab_doc_manager`. 조직 관리 화면에 문서담당자 지정(미지정 시 팀장=approverId fallback 표기). 부서협조/부서수신(AP-04-02/06)에서 이 담당자로 라우팅 예정.
- ✅ **G16 문서함 검색 UI 배선 완료**: BE `findAll`이 `search`(title/docNumber contains)를 이미 지원하나 FE 미배선이던 갭. `DocumentListParams.search` 추가 + 문서함 뷰(`DocumentBoxesView`, /me·/admin 공용)에 디바운스(300ms) 검색 입력. BE 무변경.
- ✅ **G11/G12 AP-01-02 양식 동적 필드 설계 + 작성 시 값 입력 완료**: 알림과 동일하게 단일 출처 `DocumentFieldDef`/`readFormFields`(@ablework/shared-constants) 신설(text/textarea/number/date/select). 양식 관리 다이얼로그에 `FormFieldsBuilder`(필드 추가/유형/필수/옵션) → `fieldsSchema:{fields}` 저장(BE DTO는 이미 수용). 기안 작성 다이얼로그는 선택 양식의 필드를 `DynamicFormFields`로 동적 렌더 → 값 검증(필수) 후 `content`에 key별 저장. 상세 다이얼로그는 라벨 매핑해 제출 값 표시. (파일 업로드 타입은 스토리지 연동 필요 → 후속)
- ✅ **G16 AP-05-06 결재 현황 + 관리자 강제 삭제 완료**: 관리자 전체 조회는 기존 `ledger` box(전 상태) 재사용. 신규 `DELETE /documents/:id/force`(GENERAL_ADMIN↑) — 임의 상태 문서 강제 삭제(이력 선삭제 후 lines→steps Cascade). **HR 요청 연결 문서는 차단**(`DOCUMENT_LINKED_TO_REQUEST` — request.documentId가 SetNull로 끊겨 워크플로 깨짐 방지). FE `/admin/approval/status` 화면(문서대장 미러 + 강제삭제 + 가드 메시지 토스트) + 사이드바 등록. 단위 4건.
- ✅ **권장 #1 — G17+G15 알림 활성화 완료** (PR 별도): 알림 이벤트 단일 출처 `NOTIFIABLE_EVENTS`(@ablework/shared-constants) 신설 → 리스너(부트스트랩 일괄 구독)·BE 기본규칙·FE 토글을 모두 정렬. 누락됐던 비휴가 요청 이벤트(shift/attendance/device/offsite/custom)와 FE-BE 이벤트 키 불일치(짧은 키 'clock_in'/'request_approved' vs 런타임 'attendance.clock_in')를 해소. `DEVICE_CHANGE_REJECTED`/`OFFSITE_WORK_REJECTED` 상수 추가. 단위 7건(listener) 추가.
  - ⚠️ **배포 시 1회 데이터 마이그레이션 필요**: 기존 환경에서 이미 webhook을 등록해 **짧은 키 규칙**(`clock_in` 등)이 `notification_rules`에 남아 있으면 새 코드와 매칭되지 않는다. 그린필드/시드 환경은 정식명을 쓰므로 무관. 배포 시 다음 매핑 UPDATE를 1회 실행:
    `clock_in→attendance.clock_in`, `late→attendance.late`, `leave_request→leave.requested`, `leave_approved→leave.approved`, `request_approved→`(삭제 또는 도메인별 *.approved로 분기). 그 외 짧은 키(clock_out/absent)는 현재 미발행이므로 삭제.

## Goal별 상태

| Goal | 상태 | ~% | 핵심 |
|---|---|---|---|
| G11 양식/공용결재선/문서번호 | 🟡 partial | 87 | CRUD·채번·version 견고. 필수 누락: 동적필드 빌더 UI(AP-01-02), 양식별 기본 결재선(AP-01-03) |
| G12 작성/상신/임시저장/회수 | 🟢 complete | 96 | submit/recall/재상신/EDITABLE 가드 완비. content 자유텍스트(동적필드 값 미수집, G11 종속) |
| G13 결재 처리(승인/반려/전결/전단계반려/취소/대결) | 🟢 complete | 96 | 8종 step 엔드포인트+상태머신+대결 완비. E2E 부재 |
| G14 협조/공람/수신 + **부서협조/부서수신** | 🔴 partial | 55 | 개인 단위는 완성(~90%). **부서 차원(접수→내부결재, 문서담당자, 부서문서함, 반송) 전무** |
| G15 HR요청→전자결재 자동연동 | 🟢 complete | 90 | $transaction 단일 원자성·멀티테넌시·자기결재차단·잔액재검증 견고. **휴가 외 유형 알림 미발송** |
| G16 문서함(기안/결재/공람/참조/수신/대장) | 🟡 partial | 80 | 5종+대장 구현. 누락: 부서문서함, 결재현황 강제삭제(AP-05-06), 검색 UI 배선 |
| G17 전자결재 Discord 알림 + FE | 🟡 partial | 75 | 이벤트→리스너→Discord 3회백오프 연결, FE 7탭 완비. **결재 알림 기본 비활성(시드/토글 키)** |

## 우선순위 갭

### 🔴 High
| Goal | 항목 | effort | area | 마이그레이션 |
|---|---|:--:|---|:--:|
| G17+G15 | **결재·HR요청 알림 활성화** (DOCUMENT_SUBMITTED emit + 시드 document.* + FE 토글 키) | S | integration | ✕ 불필요 |
| G16 | AP-05-06 결재 현황(관리자 전체 조회/강제 삭제) | M | integration | ✕ |
| G11 | 양식 동적필드(fieldsSchema) 설계 빌더 UI (AP-01-02) | M | FE | ✕ |
| G14 | 부서협조(dept_collaborator) 전체 (AP-04-02) | L | BE | ⚠ **필요** |
| G14 | 부서수신(dept_receiver) 접수/수신확인/반송 (AP-04-06) | L | BE | ⚠ **필요** |
| G14 | 문서담당자(doc manager) 지정/조회 (AP-04-07) | M | BE | ⚠ **필요** |
| G16 | 부서문서함 화면+box 필터 (AP-05-04, G14 종속) | M | integration | ⚠ (G14) |

### 🟡 Medium
- G12 양식별 동적 필드 값 입력 (content 자유텍스트 단일화, G11 빌더 종속) · FE · M
- G11 양식별 기본 결재선 바인딩 (AP-01-03, `defaultLineId` FK) · integration · M · ⚠마이그레이션
- G13 결재 처리 UI E2E(Playwright) 부재 · test · M
- G15 다결재자/병렬 결재 `requiredCount`/`isParallel` 미사용 · BE · M
- G14 협조 반려(AGREEMENT) 비차단성 스펙 충돌 · BE · S
- G14 수신 반송(RETURN/bounce) 미구현 (AP-04-05) · integration · M
- G16 문서함 검색 UI 미배선(BE는 지원) · FE · S
- G17 알림 규칙 email/in_app 채널이 Discord 리스너에서 데드 옵션 · BE · S
- G11 양식 접근규칙 `form_access_rules` CRUD 부재 (AP-01-07 선택) · BE · M · ⚠
- G11 양식 담당자 `formOwnerId` 지정 (AP-01-07 선택) · BE · S

### ⚪ Low
- G17 Discord embed 구조화 템플릿 미적용 · G14 참조/공람 box 상신 후 제한 미적용 · G15 DEVICE_CHANGE 승인 시 `newDeviceId` 미갱신+거절 이벤트 고아화 · G11 `allowZipUpload`(AP-01-06 선택) · G16 FE 경로 FEATURE_LIST 불일치 · G13 전단계반려 전용 안내 다이얼로그 부재

## 권장 구현 순서

1. **G17+G15 알림 활성화** (S, high×2) — 가장 작은 노력으로 결재·HR요청 Discord 알림 전체를 살리는 quick win. **마이그레이션 불필요.**
2. **G16 결재 현황 + 관리자 강제 삭제** (M, high) — 독립적, 마이그레이션 불필요.
3. **G11 양식 fieldsSchema 빌더 → G12 동적 필드 값 입력** (M×2) — 빌더가 작성 폼의 전제. 마이그레이션 불필요.
4. **G14 부서 차원 일괄** (L, high 다수) — ⚠ **스키마/마이그레이션 필요**(dept_collaborator/dept_receiver/문서담당자). `migrate dev`가 필요해 사용자 협업 세션에서.
5. **G16 부서문서함** (M, G14 종속) — G14 이후.
6. G11 양식별 기본 결재선 FK(⚠마이그레이션) · G15 다결재자 round 조건 · G13 결재 E2E · 잔여 low 정리.

## 교차 이슈 (cross-cutting)

- **상태머신 일관성**: `requiredCount`/`isParallel`(다결재자/병렬) 미사용이 requests(G15)·approval-actions(G13) 양쪽에서 동일 — 공통 헬퍼로 통일 필요.
- **FE-BE 능력 불일치**: BE가 앞서고 FE/배선이 뒤처진 패턴 반복 — 문서함 검색(G16), 양식 fieldsSchema(G11/G12), email 알림 채널(G17).
- **테스트 공백**: BE 단위/통합/일부 e2e는 충실하나 FE 결재처리·재상신·문서함 흐름의 Playwright E2E 전무(G12/G13/G16).
- **명세 정합성**: FEATURE_LIST 분리 경로 명세 vs 통합 탭 구현 차이(G11·G12·G13·G16·G17), SYSTEM_DESIGN 엔드포인트 표기 차이(G13/G15) — 구현이 견고하면 문서 갱신, 미구현은 구현 정렬로 양방향 정합화.

## 마이그레이션 의존 항목 (사용자 `prisma migrate dev` 필요)

> Claude Code AI 가드로 `migrate dev`를 에이전트가 실행 불가. 아래는 협업 세션에서 진행:
> - G14 부서협조/부서수신/문서담당자 (신규 엔티티/컬럼)
> - G11 양식별 기본 결재선 `defaultLineId` FK
> - (§6.6 #3) 결재 규칙 스냅샷 `Request.ruleId`
