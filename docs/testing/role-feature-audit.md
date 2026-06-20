# 역할별 메뉴 기능 전수 감사 · 갭 레지스트리 · 통합테스트 케이스

> 목적: 각 계정 권한별 메뉴의 기능을 "FE 인터랙션 → API → 서비스 로직(실제/스텁/없음) → 데이터 흐름" 으로 추적해
> **① UI만 있고 로직이 없는 표면적 기능, ② 미구현 기능, ③ 데이터 흐름이 끊긴 곳** 을 식별하고,
> 각 갭에 **통합테스트 케이스**를 부여해 사용자가 문제 없이 사용하도록 만든다.
>
> 이 문서는 `/loop` 반복의 **영속 추적 상태**다. 매 반복: 이 표에서 미완(🔲) 갭을 우선순위순으로 골라
> 구현 → 통합테스트 추가 → 설계서(SYSTEM_DESIGN 등) 동기화 → 검증 → 상태 갱신(✅).
>
> 환경: web `4000` · api `4001` · DB 재시드 완료. 역할: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1).
> 최초 작성 2026-06-20 (병렬 감사 5에이전트). NEVER(미구현 대상): 급여·전자계약·생체인증/2FA/IP화이트리스트.

## 갭 유형 범례
- **RBAC**: FE 권한과 BE @Roles 불일치 (저장/조회 시 403 또는 과다노출)
- **FE-MISSING**: BE 로직은 완성인데 FE에 연결/버튼이 없음
- **SUPERFICIAL**: 버튼·UI는 있으나 onClick이 toast/로컬state만 (로직·API 호출 없음) ← 사용자 핵심 불만
- **BE-MISSING**: 설정·UI는 되는데 런타임에서 그 값을 실제로 사용하는 로직이 없음
- **DATAFLOW**: FE↔BE 계약 불일치로 값이 저장/표시되다 사라짐

## 상태 범례
✅ 완료 · 🔧 진행중 · 🔲 미착수 · ✓N/A 검증결과 정상(오탐)

---

## 마스터 갭 레지스트리

| ID | 도메인 | 화면 / 기능 | 유형 | 심각도 | 상태 | 수정 위치 | 통합테스트 케이스 |
|---|---|---|---|---|---|---|---|
| **THEME-1** | 공통 | 비기본 테마 쿠키 시 로그인 첫 클릭 유실(하이드레이션 불일치) | DATAFLOW | HIGH | ✅ | `stores/theme.store.ts`(init→DEFAULT) | 비기본 테마 쿠키로 `/login` → 단일 클릭에 리다이렉트, 콘솔 hydration 에러 0 |
| **SFT-1** | 근태 | 근무일정 템플릿 시간 미리보기 ISO 노출 + 선택 시 저장 깨짐 | DATAFLOW | MED | ✅ | `app/admin/shifts/page.tsx`(toHHMM 정규화) | 템플릿 선택→추가 시 09:00-18:00로 저장, 표시 정상 |
| **A-1** | 근태 | ShiftType `noClockInRequired`·`isDeemedWork` 런타임 무효(결근 자동판정/간주근로 미반영) | BE-MISSING | HIGH | ✅ | `attendance-absent.scheduler.ts`(shiftType.noClockInRequired:false 필터), `attendances.service.ts`(findShiftForClockIn shiftType select + determineStatus isDeemedWork 분기) | noClockInRequired→absent 자동생성 제외 / isDeemedWork→deemed_work (**단위테스트 추가·통과**, API typecheck✅) |
| **A-2** | 근태 | admin 근무일정 단건 삭제 버튼 없음(BE `DELETE /shifts/:id`·훅 존재) | FE-MISSING | MED | ✅ | `app/admin/shifts/page.tsx`(수정 모달 삭제 버튼+ConfirmDialog, 확정 가드) | 미확정 일정 삭제→그리드 제거 / 확정 일정 삭제→400 (typecheck✅, 동작=E2E #19) |
| **A-3** | 근태 | me/home 휴게 시작 `breakType` 미전달(항상 rest) | DATAFLOW | MED | ✅ | `lib/query/attendances.ts`(useBreakStart breakType 파라미터), `app/me/home/page.tsx`(휴게/식사 버튼) | rest/meal 구분 기록 (typecheck✅) |
| **A-4** | 근태 | now-at-work 조직 필터가 클라이언트 문자열 매칭(BE 파라미터 없음) | DATAFLOW | MED | ✅ | `attendances.service.getNowAtWork(organizationId)`·controller `@Query`·`now/page.tsx`(id 기반 서버필터, 클라 필터 제거)·`useNowAtWork(orgId)` | organizationId(주소속) 서버필터 (api·web typecheck✅·재기동) |
| **A-5** | 근태 | me/attendances 페이지네이션 미전달(월 20건 초과 누락) | DATAFLOW | MED | ✅ | `app/me/attendances/page.tsx`(limit:'100') | 한 달 전체 조회 (typecheck✅) |
| **A-6** | 근태 | 템플릿 `autoBreak` 토글 저장 무효(BE DTO·컬럼 없음) | DATAFLOW | LOW | ✅ | `app/admin/shifts/templates/page.tsx`(무효 토글·schema·미사용 import 제거) | 오해 유발 토글 제거 (typecheck✅). BE 미지원이라 제거 선택 — 회사설정 auto_break_enabled로 대체 |
| **A-7** | 근태 | 표준화규칙 삭제 버튼 누락(BE DELETE 존재) | FE-MISSING | LOW | ✅ | `app/admin/reports/standardization/page.tsx`(삭제 mutation+버튼+확인) | 삭제→목록 제거 (typecheck✅). (근무유형 활성토글은 별도 잔여) |
| **A-8** | 근태 | 패턴 적용 시 주52h 경고 미호출(`createdBy` 하드코딩) | BE-MISSING | LOW | 🔲 | `schedule-patterns` applyPattern | 패턴 적용 시 주52h 초과→warning |
| **B-1** | 요청 | ~~me/requests scope 미전달로 타인 요청 노출~~ | RBAC | — | ✓N/A | — | **오탐**: `RequestFilterSchema.scope.default('mine')` + 컨트롤러 파이프 적용으로 EMPLOYEE는 본인만. 검증완료 |
| **B-2** | 휴가 | 수동발생·보상휴가 폼에 `year`·`expiresAt` 없음(BE DTO엔 존재) | DATAFLOW | HIGH | ✅ | `LeaveStatusPanel.tsx`·`LeaveCompensationPanel.tsx`(발생연도·만료일 입력 추가) | year/expiresAt 지정 발생→잔액 만료일 반영 (typecheck✅, 동작=E2E #19) |
| **B-3** | 휴가 | "예약 부여" 라디오 더미(grantMode 무시) | SUPERFICIAL | MED | ✅ | `LeaveStatusPanel.tsx`(더미 라디오 제거→발생연도·만료일 필드로 대체) | 더미 제거, 실제 입력 필드로 교체 |
| **B-4** | 휴가 | 발생규칙 수정 버튼 없음(BE `PATCH`·`/run?year` 존재) | FE-MISSING | MED | 🔲 | `app/admin/leave/accrual-rules/*` | 규칙 수정→반영 / 과거연도 수동실행 |
| **B-5** | 요청 | 승인규칙 편집기 6개 유형 누락 + scopeOrgIds/scopePositionIds UI 없음 | FE-MISSING | MED | ✅ | `RequestRulesPanel.tsx`(REQUEST_TYPES에 LEAVE_MODIFY·LEAVE_DELETE·SHIFT_MODIFY·SHIFT_DELETE·ATTENDANCE_CREATE·ATTENDANCE_DELETE·CUSTOM 추가) | 누락 유형 규칙 생성 가능 (typecheck✅). **scope UI는 별도 잔여(B-5b)** |
| **B-6** | 요청 | me/requests OFFSITE_WORK·CUSTOM 신청 경로 없음(BE 매핑 존재) | FE-MISSING | MED | ✅ | `offsite-custom-request-dialogs.tsx`(신규)+`page.tsx`(union·MENU_GROUPS·렌더) | 외근/출장·기타 신청→document 자동생성 (**동작검증: 201 + 내 요청 목록 반영**) |
| **C-1** | 전자결재 | 전단계 반려(return-prev) 버튼 없음(BE 완성) | FE-MISSING | HIGH | ✅ | `components/approval/DocModal.tsx`(hasPrevFlowStep+버튼) | 전단계 반려→이전 결재자에 반환, 이후 CANCELLED (typecheck✅, 동작=E2E #19 대기) |
| **C-2** | 전자결재 | 결재취소(cancel-approval) 버튼 없음(BE 완성) | FE-MISSING | HIGH | ✅ | `DocModal.tsx`(runStepAction stepId 파라미터화·myActedStep·결재취소 버튼) | 본인 처리 단계 취소→이전 단계 복원 (typecheck✅, 동작=E2E #19 대기) |
| **C-3** | 전자결재 | RECALLED/REJECTED 재상신 경로 없음(view만 열림) | FE-MISSING | HIGH | ✅ | `DocModal.tsx`(isEditableMine·canReDraft·handleResubmit·재상신 버튼) | 회수/반려 문서 수정→재상신→PENDING (typecheck✅, REJECTED는 allowReDraft 게이트, 동작=E2E #19 대기) |
| **C-4** | 전자결재 | FormModalNative 핵심 필드 편집 불가(allowZipUpload·allowReDraft·allowPreApproval·fieldsSchema·defaultLineId·formOwnerId) | FE-MISSING | HIGH | 🟡 | `components/approval/FormModalNative.tsx`(전결허용·재기안허용·zip 3토글 추가; BE·타입 기지원) | 전결/재기안/zip 설정→저장 (typecheck✅). **잔여(C-4b): defaultLineId·formOwnerId·fieldsSchema(동적필드 빌더)** |
| **C-5** | 전자결재 | 공통 관리 5토글 저장 안 됨(.strip()로 무시) | SUPERFICIAL | HIGH | ✅ | `company-settings.controller.ts`(PatchSettingsSchema +5)·`company-settings.service.ts`(MAP+DEFAULTS) | 5토글 PATCH→GET 영속 (curl 검증완료: upperLineChange·allowZipUpload·mobilePush·emailNotify·userDisplay) |
| **C-6** | 전자결재 | 기안 시 공용 결재선 선택 UI 없음(sharedLineId 미전달) | FE-MISSING | MED | ✅ | `DocModal.tsx`(useSharedApprovalLines + 공용결재선 select·applySharedLine) | 공용결재선 선택→steps prefill (typecheck✅, 동작=E2E #19) |
| **C-7** | 전자결재 | DEPT_RECEIVER 반송(bounce) 버튼 없음(BE 완성) | FE-MISSING | MED | ✅ | `DocModal.tsx`(canReceive DEPT_RECEIVER 분기 반송 버튼) | 부서수신 반송→BOUNCED (typecheck✅, 동작=E2E #19 대기) |
| **C-8** | 전자결재 | 공람/참조 추가가 본인 only(BE는 임의 직원 지원) | FE-MISSING | MED | ✅ | `DocModal.tsx`(직원+역할 picker·handleAddCc, useEmployees) | 타 직원 공람/참조 추가→step 생성 (typecheck✅, 동작=E2E #19) |
| **C-9** | 전자결재 | 문서대장 검색 UI 없음 / 공용결재선 결재자·작성자·날짜 필터 표면 only | FE-MISSING/SUPERFICIAL | LOW | 🟡 | `approval/documents/page.tsx`(제목·문서번호 검색 입력+debounce, useDocuments search 지원) | 문서대장 검색→필터 반영 (typecheck✅). **잔여(C-9b): 공용결재선 결재자/작성자/날짜 필터는 BE 미지원** |
| **C-10** | 전자결재 | 백업 첨부파일 실제 번들 다운로드 미구현(BE 없음) | BE-MISSING | LOW | 🔲 | `approval/backup` + BE export 엔드포인트 | 첨부 포함 백업→zip 생성 |
| **D-1** | 알림 | 알림 규칙 조회/저장 SUPER_ADMIN 전용 ↔ FE는 GENERAL_ADMIN 진입 → 403 | RBAC | HIGH | ✅ | `notifications.controller.ts`(rules 5라우트 @Roles SUPER_ADMIN→**GENERAL_ADMIN**) | 정책: 회사설정 영역이라 BE를 GENERAL_ADMIN으로 하향. GENERAL_ADMIN 조회/저장 가능 (api typecheck✅·재기동) |
| **D-2** | 권한 | permission-settings PATCH SUPER_ADMIN 전용 ↔ FE GENERAL_ADMIN 저장버튼 활성 → 403 | RBAC | HIGH | ✅ | `permissions.ts`(PERMISSIONS_MANAGE GENERAL_ADMIN→**SUPER_ADMIN**) | 정책: 권한 변경은 권한상승 표면이라 BE SUPER_ADMIN 유지·FE를 상향해 일치. GENERAL_ADMIN엔 저장버튼 비활성 |
| **D-3** | 설정 | 회사설정 일반 섹션 weekStartDay 저장 소실(saveSettings 미호출) | DATAFLOW | MED | ✅ | `app/admin/settings/company/page.tsx`(handleSave general→saveSettings 추가) | 일반에서 weekStartDay·timeFormat 변경 저장→GET 반영 (PATCH 경로 검증완료) |
| **D-4** | 인사 | 직원 근로정보 수정/삭제 없음(FE+BE 모두) | BE-MISSING | MED | ✅ | BE: `employees.controller`(PATCH/DELETE `:id/wage-info/:wageId`)+`employees.service`(update/deleteWageInfo·assertWageInfo·guardOrgScope·GENERAL_ADMIN); FE: `lib/query/employees`(useUpdate/DeleteWageInfo)+`employees/[id]/page.tsx`(수정/삭제 버튼·edit 다이얼로그·확인) | 근로정보 수정→반영, 삭제→제거 (api·web typecheck✅·재기동, 동작=E2E #19) |
| **D-5** | 인사 | 직원 엑셀 일괄 업로드 버튼만(준비중 토스트, BE 없음) | SUPERFICIAL/BE-MISSING | MED | 🔲 | `EmployeesPanel.tsx`+BE `POST /employees/bulk` | CSV 업로드→N명 생성 |
| **D-6** | 인사 | 직원 CSV export 현재 페이지(≤20)만 | DATAFLOW | LOW | ✅ | `EmployeesPanel.tsx`(handleExportAll — 필터 유지 전체 조회 후 export) | 20건 초과 시 전체 export (typecheck✅) |
| **E-1** | 메시지 | admin 발송내역 탭이 본인 수신만 노출(회사 발송이력 API 없음) | BE-MISSING | HIGH | ✅ | BE `GET /messages/sent`(ORG_ADMIN, 회사 전체 + 수신/읽음 집계)·service findSentMessages; FE `useSentMessages`+발송내역 탭 전환(제목·수신·읽음·발송일시) | 발송 후 admin 발송이력에 표시 (api typecheck✅·재기동, GET sent 200, 동작=E2E #19) |
| **E-2** | 메시지 | 템플릿 변수 문법 불일치(FE 안내 `#{}` ↔ BE `{{}}`) | DATAFLOW | HIGH | ✅ | `message-automation.processor.ts`(renderTemplate 양델리미터+employee/month) · `messages/page.tsx` 안내 정정 | `#{이름}`·`#{month}` 치환 (단위테스트 21/21, `#{}` 5건 추가) |
| **E-3** | 감사 | 감사로그 기록 3개 도메인만(결재·직원·확정 등 미기록) | BE-MISSING | MED | ✅ | 직원: `employees.service`(create/deactivate); 결재: `approval-actions.service`(approve/reject→DOCUMENT_APPROVED·APPROVE_STEP·REJECT, AuditModule import); FE 라벨 5종 | 직원 등록/퇴사 + 결재 승인/반려 audit 기록·표시 (api typecheck✅·spec employees 33/33·approval 32/32) |
| **E-4** | 메시지 | 자동화규칙 헤더 버튼 toast only(존재하는 `/automations` 라우트 미이동) | SUPERFICIAL | MED | ✅ | `app/admin/messages/page.tsx`(router.push) | 버튼 클릭→/admin/messages/automations 이동 (브라우저 검증완료) |
| **E-5** | 메시지 | 자동화 규칙 수정/삭제 FE 없음(BE 완성) | FE-MISSING | MED | ✅ | `app/admin/messages/automations/page.tsx`(edit 겸용 다이얼로그+update/delete mutation·삭제 확인) | 수정→반영, 삭제→제거 (typecheck✅, 동작=E2E #19) |
| **E-6** | 대시보드 | admin 새로고침 버튼 toast only(invalidateQueries 없음) | SUPERFICIAL | MED | ✅ | `app/admin/dashboard/page.tsx`(handleRefresh→invalidateQueries) | 새 출퇴근 생성→새로고침→KPI 갱신 (코드연결, TanStack 무효화) |
| **E-7** | 리포트 | 지각/조퇴 범위 필터 BE 묵살(TODO 주석) | BE-MISSING | MED | ✅ | `reports.service.ts`(shift 시작/종료와 clockIn/Out 분 비교로 lateThreshold·earlyLeaveThreshold 재판정, TODO 제거) | 임계 분 지정→집계 반영 (API typecheck✅·재기동, diffMinutes 방향 확인) |
| **E-8** | 리포트 | 스냅샷 행 조회 API/FE 없음(마감 후 열람 불가) | BE-MISSING | MED | ✅ | `reports.controller`(GET snapshots/:id/rows)·`reports.service`(findSnapshotRows)·`snapshots/page.tsx`(행 보기 모달) | 스냅샷 생성→행 조회 (api·web typecheck✅·재기동) |
| **E-9** | 리포트 | 커스텀 열 FE 전무(BE 완성) | FE-MISSING | LOW | 🔲 | `reports/*` | 커스텀 열 생성→리포트 반영 |
| **E-10** | 메시지 | 발송내역 행 클릭 상세 없음(toast) / in_app type 불일치('auto' vs 'automated') | SUPERFICIAL/DATAFLOW | LOW | 🟡 | `messages/page.tsx`(행 클릭 시 제목+내용 스니펫 toast — sent API가 content 포함) | 클릭 시 내용 표시 (typecheck✅). **잔여(E-10b): 풀 상세 모달, in_app type 통일** |

---

## 구현 로드맵(반복 우선순위)

권한·보안·"표면적" 우선, 그다음 결재 FE-MISSING 클러스터, 그다음 BE 로직/누락, 마지막 LOW.

1. **HIGH-SUPERFICIAL/RBAC 묶음**: E-6, E-4, C-5, D-3, E-2 (표면적·설정 소실·문법불일치 — 사용자 핵심 불만, 저위험)
2. **RBAC 정책 확정 묶음**: D-1, D-2 (알림·권한 SUPER_ADMIN↔GENERAL_ADMIN — **정책 결정 필요**, 기본안: 회사설정 영역이므로 BE를 GENERAL_ADMIN으로 하향)
3. **전자결재 FE-MISSING 묶음**: C-1, C-2, C-3, C-7, C-8, C-6, C-4 (DocModal/FormModal 액션 복원)
4. **휴가·요청 묶음**: B-2, B-4, B-5, B-6, B-3
5. **근태 BE 로직 묶음**: A-1(HIGH), A-2, A-3, A-4, A-5
6. **메시지·리포트·감사 묶음**: E-1, E-3, E-5, E-7, E-8, E-9, E-10
7. **인사 묶음**: D-4, D-5, D-6
8. **LOW 잔여**: A-6, A-7, A-8, C-9, C-10

## 통합테스트 반영 방침
- 위 "통합테스트 케이스" 열을 BE 통합테스트(`apps/api/**/*.e2e-spec` 또는 기존 e2e 하니스)와 FE Playwright E2E(`apps/web`)로 구현.
- 데이터 흐름 검증 중심: 요청→서비스→DB→응답→FE 반영의 끝단까지.
- 설계서 동기화: 구현 시 `docs/design/SYSTEM_DESIGN.md`(해당 도메인 플로우)·`FEATURE_LIST.md` 갱신.

## 검증 메모(오탐 방지)
- **B-1 오탐**: 정적 감사가 `RequestFilterSchema.scope.default('mine')`를 놓쳐 "누출"로 보고했으나, 컨트롤러가 `ZodValidationPipe(RequestFilterSchema)`를 적용해 scope 기본 'mine' → EMPLOYEE 본인 스코핑 정상. **갭 아님**.
- 교훈: 정적 에이전트 보고는 구현 전 반드시 코드/경험적으로 재검증한다.
