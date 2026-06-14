# Phase 1 전수 갭 분석 보고서

> 작성일: 2026-06-12
> 기준: `refs/hr/` Shiftee 헬프센터 문서 12개 메뉴(급여·전자계약 제외) vs 현재 구현
> 분석 방법: 도메인별 8개 + 비즈니스 로직 연계 감사 1개, 총 9개 병렬 정밀 분석
> 목표 수준: **구조·기능 동등성** (디자인은 AbleWork MUI 유지)

---

## 0. 구현 현황 (2026-06-14 코드 재검증)

> 본 문서는 2026-06-12 시점의 **문제 스냅샷**이다. 이후 Wave 1~7 구현으로 **대부분 해소**되었으며, 아래는 8개 클러스터 병렬 코드 검증 결과다. (✅완료 / 🟡부분·잔존 / ⏳미구현)

**총평: Phase 1 핵심 결함은 사실상 모두 해소됨.** "등록만 되고 연계 안 됨"의 4대 원인(C1 승인→데이터 반영, C2 결재 시드/자동승인, C3 설정 계층, C4 계약 불일치)이 전부 ✅.

| 영역 | 상태 | 비고 |
|---|:--:|---|
| **C1** 승인→실데이터 반영 | ✅ | `requests.service.ts` `applyApprovedRequest`가 LEAVE/SHIFT/ATTENDANCE/DEVICE를 동일 `$transaction`에서 적용(잔액 차감/복원 포함) |
| **C2** 결재 시드 + 자동승인 폴백 | ✅ | `seed.ts` documentForm 6종·approvalRule 3종(isAutoApprove:false). 규칙 부재 시 기본 결재선 생성(무규칙 즉시승인 제거) |
| **C3** CompanySettings + 설정 API | ✅ | `CompanySettingsService`(캐싱), GET/PATCH `/company-settings`·`/permission-settings`, `allow_unscheduled` 실제 enforcement |
| **C4** FE↔BE 계약 21건 | ✅ | #1~#21 전부 필드명 정합 확인(좌표·근로정보·employmentType·shifts·휴가발생·요청필터·일괄승인·리포트·메시지·알림·readAt 등) |
| **C5** 미존재 엔드포인트 | ✅ (1건 🟡) | standardization-rules·custom-types·company/permission-settings·approval-rules PATCH/DELETE·휴가 그룹/유형/규칙 수정삭제·POST /leaves·attendances/unconfirm·forgot/reset-password 전부 신설. 🟡 `wage-info`는 **독립 모듈 미신설**이나 기능은 `employees/:id/wage-info`로 제공(404 해소) |
| **C6** 보안 | ✅ (1건 🟡) | C6-1 employees 권한가드(자기승격 차단)·C6-2 shifts 소속검증·C6-3 clock-in 소속검증·C6-5 결재 계층 정확화 ✅. 🟡 **C6-4 `GET /shifts` 서버측 직원 스코핑 미강제** — FE는 본인 employeeId 필터를 보내나 BE는 필터 생략 시 회사 전체 반환(사내 일정 가시성, 잔존) |
| **C7** 이벤트 시스템 | ✅ (1건 🟡) | EVENTS 상수·`leave.requested` 발행명 정합·고아 이벤트(NOTIFIABLE_EVENTS SSOT)·MailService 주입 ✅. 🟡 `sendInviteCode` 호출처 부재(초대코드 이메일 데드코드 잔존) |
| **C8** Cron/배치 | ✅ | 휴가 자동발생(`@Cron 0 1 * * *`, 근속구간·그룹중복 버그 수정)·결근 배치(30분, 멱등)·메시지 자동화(트리거 조건·당일 멱등) 전부 동작 |
| **도메인표** 8개 | ✅ | 조직/직원/근무일정/출퇴근/휴가/요청결재/리포트메시지/회사설정 핵심 갭 해소(조직 `address` 텍스트 컬럼만 부수 미추가) |

**잔존(후속 권고):**
- 🟡 `GET /shifts` 서버측 직원 스코핑 — EMPLOYEE 호출 시 본인 일정만 반환하도록 BE 강제(C6-4)
- 🟡 `wage-info` 독립 모듈화(현재 employees 모듈 내 제공으로 기능상 충족)
- 🟡 `sendInviteCode` 데드코드 정리 또는 초대코드 이메일 발송 배선(C7)
- 조직 `address` 텍스트 컬럼(부수), 양식별 기본결재선 `defaultLineId`는 Phase 2 갭(AP-01-03)로 이관

---

## 1. 총평

**사용자 보고("데이터 등록만 되고 실제 연계가 안 된다")는 정확하며, 구조적 원인이 확인됨.**

- 백엔드 스키마(52테이블)와 화면 골격(39페이지)은 80% 수준으로 완성도가 있음.
- 그러나 **(a) 승인 → 실데이터 반영 파이프라인이 0%**, **(b) FE↔BE API 계약 불일치 15건+**,
  **(c) 설정(company_settings) 계층 통째로 부재**, **(d) 시드 데이터 부재로 결재 플로우 미발동** —
  이 4가지가 겹쳐 "등록은 되는데 아무 일도 안 일어나는" 체감을 만들고 있음.

---

## 2. 시스템 전반 치명 결함 (도메인 횡단)

### C1. 승인 → 실데이터 미반영 (최대 갭)
- `requests.service.ts` 승인 시 `leave.approved` 등 이벤트만 emit. 구독자는 Discord 알림 리스너뿐.
- **`Leave` 레코드를 생성하는 코드가 코드베이스 전체에 0건.** 잔액 차감, Shift 생성, Attendance 정정 반영 모두 없음.
- 파급: 리포트 `usedLeaveDays` 항상 0, 근무현황 `ON_LEAVE` 절대 표시 안 됨.
- 해법: 승인 `$transaction` **내부**에 유형별 적용 로직 동기 구현 (CLAUDE.md §7 원자성 요구).

### C2. 결재 시드 부재 + 자동승인 폴백
- `seed.ts`에 `documentForm`/`approvalRule` 시드 없음 → 모든 요청이 **결재선 없이 즉시 자동승인**되고,
  `*.auto_approved` 이벤트는 구독자 0 → 완전한 no-op.

### C3. CompanySettingsService 미존재 + 설정 API 부재
- `GET/PATCH /company-settings`, `/permission-settings` 엔드포인트 자체가 없음 → **설정 3개 페이지 전부 404** (UI만 존재).
- company_settings를 읽는 비즈니스 로직은 지각 판정 2개 키뿐. `allow_unscheduled`(무일정 정책) 등 핵심 룰 미적용.
- 기본값 3중 불일치: 지각 유예 서비스 10 / seed 0 / CLAUDE.md 15.

### C4. FE↔BE 계약 불일치 (15건+) — "쓰기 동작 전멸"의 직접 원인

| # | 위치 | 불일치 | 증상 |
|---|---|---|---|
| 1 | timeclock-areas | `latitude/longitude/radius` ↔ `locationLat/locationLng/locationRadiusMeters` | GPS 장소 생성 항상 400 |
| 2 | 근로정보 | `scheduledWorkHours/effectiveDate` ↔ `contractedHoursPerWeek/effectiveFrom`+`contractedWorkDays` | 근로정보 추가 항상 400 |
| 3 | 직원 수정 | `employmentType: 'regular'` ↔ enum `FULL_TIME...` | 기본정보 저장 400 |
| 4 | 직원 수정 | `joinedAt/resignedAt`이 UpdateEmployeeSchema에 없음 | 입사/퇴사일 입력 조용히 무시 |
| 5 | shifts 생성 | `organizationId/shiftTypeId` payload 누락 | 일정 생성 항상 400 |
| 6 | shifts 필터 | `startDate/endDate` ↔ `startAt/endAt` | 기간 필터 무시 (전 기간 조회) |
| 7 | shift-types | `deemedHours/preShiftNote` ↔ `deemedWorkHours/confirmedAlert` | 간주근무 설정 조용히 유실 |
| 8 | shifts 수정 | ko-KR 로케일 시간 문자열 → HH:MM 검증 실패 | 일정 수정 저장 불가 |
| 9 | 휴가 수동발생 | `employeeIds[]+note` ↔ `employeeId+memo` | 휴가 부여 항상 400 |
| 10 | 발생규칙 생성 | `monthlyAccruals/yearlyAccruals` ↔ `items[]` | 규칙 생성 항상 400 |
| 11 | 보상휴가 | 잘못된 훅(`/leaves/accrual`) + 잘못된 필드 | 페이지 전체 동작 불가 |
| 12 | admin 요청 필터 | `status/allEmployees` ↔ `scope` | 관리자에게 본인 요청만 표시 |
| 13 | 일괄승인 | `ids` ↔ `requestIds` | 항상 400 |
| 14 | now-at-work | `name/status` ↔ `employeeName/workingStatus` | 현황 카드 깨짐 |
| 15 | 리포트 | `actualWorkDays...` ↔ `totalWorkDays...` | 표 주요 컬럼 undefined |
| 16 | 스냅샷 | FE가 `name` 미전송 (BE 필수) | 생성 항상 400 |
| 17 | 메시지 발송 | `name/templateId/recipientIds` ↔ `title/content/recipientEmployeeIds` | 발송 항상 400 |
| 18 | 자동화 생성 | `templateId` 누락 + 날짜 포맷 | 생성 400, 토글 404 (PATCH 부재) |
| 19 | 비밀번호 변경 | `confirmPassword` 필수 누락 | 항상 400 |
| 20 | 알림 저장 | `PATCH rules/webhook` ↔ `rules/:id` (UUID 파싱) | 저장 400 |
| 21 | me/messages | `isRead` ↔ `readAt` | 전부 미읽음 표시 |

### C5. 백엔드 모듈/엔드포인트 자체 부재 (FE는 호출 중 → 404)
- `/standardization-rules` (표준화 규칙) — 모델만 존재
- `/requests/custom-types` (커스텀 요청 유형) — 모델만 존재
- `/company-settings`, `/permission-settings`
- `PATCH/DELETE /requests/approval-rules/:id` (승인규칙 수정)
- `DELETE /leave-types`, 휴가 그룹/규칙 수정·삭제
- `POST /leaves` (관리자 휴가 직접 추가)
- `POST /attendances/unconfirm` (**확정 해제 — 현재 확정하면 영구 잠금**)
- `POST /auth/forgot-password` / `reset-password` (비밀번호 재설정)
- wage-info 모듈 (DTO 1개 파일만 존재, controller/service 없음)

### C6. 보안 결함
1. **`PATCH /employees/:id`, `POST /:id/deactivate`에 `@Roles` 미지정** → EMPLOYEE가 같은 조직 동료 수정/퇴사 처리 + **자신을 GENERAL_ADMIN으로 승격 가능**
2. `shifts create/bulkCreate` — `employeeId` 회사 소속 미검증 (타사 직원에게 일정 생성 가능)
3. `clock-in` — `timeclockAreaId` 회사 소속 미검증
4. `/me/shifts` — `employeeId` 필터 없이 호출 → **전 직원 일정 노출**
5. ORG_ADMIN 승인 권한: ApprovalStep 없으면 승인 불가 / GENERAL_ADMIN은 무조건 통과 (계층 검증 부정확)

### C7. 이벤트 시스템 미완
- `src/events/` **빈 디렉토리** — CLAUDE.md §8의 `EVENTS` 상수 미구현, 이벤트명 문자열 산재.
- `leave.requested` 구독 ↔ 실제 발행은 `leave_create.requested` → **휴가 신청 알림 영영 안 옴**.
- 고아 이벤트 다수 (`*.auto_approved`, `shift.approved`, `employee.created` 등 구독자 0).
- MailService 주입처 0건 → **이메일 발송 0건** (초대코드·비밀번호 재설정 포함).

### C8. Cron/배치 부재
- 휴가 자동 발생 스케줄러 없음 (수동 API만, 계산 버그도 있음 — 그룹 내 유형별 중복 발생, 근속 구간 오매칭)
- 결근(absent) 자동 판정 배치 없음 → 결근 카운트 항상 0
- 메시지 자동화 Cron은 돌지만 트리거 조건 전부 무시 → 매일 전 직원 중복 발송

---

## 3. 도메인별 요약 (상태: ✅완전 / 🟡부분 / ❌미구현)

| 도메인 | 핵심 갭 | P1 항목 수 |
|---|---|---|
| 조직/직무/출퇴근지역 | 출퇴근 장소 생성 불가(계약 불일치), GPS/WiFi 인증 로직 전무, 주소 컬럼 없음, 순환참조 미검증 | 7 |
| 직원 관리 | 직원 추가 UI 없음, 권한 가드 누락(보안), 근로정보 동작 불능, 초대 메일 데드코드, 재활성화 없음 | 5 |
| 근무일정 | 단건 생성 불가, 달력 뷰 없음, 패턴 `patternDefinition:{}` 하드코딩(무용), 52h 경고 미표시, me/shifts 전직원 노출 | 11 |
| 출퇴근 | 확정 영구 잠금, 무일정 정책 미적용, GPS 검증 없음, 조퇴/결근 판정 없음, now-at-work 깨짐, me/home 상태 로컬만 | 8 |
| 휴가 | 승인→차감 0%, 잔액 검증 미호출, 관리자 화면 쓰기 전멸, 발생 규칙 계산 버그, Hooks 규칙 위반(크래시 가능) | 6 |
| 요청/결재 | 승인→데이터 반영 0%, 관리자 목록 마비, 신청 유형 12종 중 3종, 커스텀 유형 404, 결재 시드 부재 | 6 |
| 리포트/메시지 | 표준화 백엔드 부재(404), 발송/자동화 생성 400, 이메일 0건, 리포트 필드 깨짐, Shift 미연동 집계 | 7 |
| 회사설정/계정 | 설정 API 전체 부재(404), 무일정 정책 미적용, 비밀번호 변경 400, 비밀번호 재설정 플로우 없음 | 6 |

> 도메인별 상세 표(기능×상태×파일)는 분석 에이전트 원본 보고서 참조 (본 문서는 종합본).

---

## 4. 구현 계획 (Wave 단위)

### Wave 1 — 보안 + 공통 인프라 (모든 후속 작업의 전제)
1. `@Roles` 누락 보강 + 자기 권한 상향 금지 (employees PATCH/deactivate)
2. 멀티테넌시 검증 보강: shifts employeeId / clock-in timeclockAreaId / me-shifts 필터
3. **CompanySettingsService 신설(캐싱)** + `GET/PATCH /company-settings` API + 기본값 단일화
4. **`src/events/domain-events.ts` EVENTS 상수** 생성 + 전체 문자열 치환 (이름 불일치 해소)
5. **결재 시드**: documentForm 5종 + 기본 approvalRule + 규칙 부재 시 기본값 "승인 필요"로 변경

### Wave 2 — FE↔BE 계약 불일치 일괄 수정 (21건, §C4 표)
- 원칙: 스키마/문서 기준으로 올바른 쪽에 맞춤 (대부분 FE 수정, 일부 BE 스키마 보강)
- 완료 기준: 모든 화면의 쓰기 동작(생성/수정/삭제)이 2xx 응답

### Wave 3 — 승인 → 실데이터 반영 파이프라인 (핵심)
1. 승인 `$transaction` 내 유형별 적용: LEAVE_CREATE(잔액 검증→차감→Leave 생성), LEAVE_DELETE(복원), SHIFT_*(shifts 반영), ATTENDANCE_*(attendances 반영), DEVICE_CHANGE(기기 초기화)
2. 요청 생성 시 `validateBalance` 연결 (+그룹 일치 검증 추가)
3. 자동승인 경로에도 동일 적용
4. SHIFT_CREATE payload 확장 (시간/템플릿 — 승인 시 Shift 생성 가능한 데이터로)

### Wave 4 — 미존재 백엔드 모듈 신설
1. attendance 확정 해제(unconfirm) + 권한 가드
2. 표준화 규칙 CRUD + 리포트 적용
3. 커스텀 요청 유형 CRUD
4. 승인규칙 PATCH/DELETE, 휴가 그룹/유형/규칙 수정·삭제, POST /leaves
5. 비밀번호 재설정 플로우 (forgot/reset + 메일 발송 + 화면)
6. permission-settings + 최소 enforcement

### Wave 5 — 핵심 비즈니스 룰 완성
1. 무일정 정책(allow_unscheduled) enforcement
2. GPS 반경 검증(haversine) + 반경 0=무제한
3. 조퇴(early_leave) 판정 + 결근(absent) 배치
4. 휴가 자동 발생 Cron + 발생 규칙 계산 수정(구간 매칭/그룹 중복 제거/만료)
5. 메시지 자동화 트리거 로직 + 멱등성 + MailService 연결
6. 리포트: Shift/WageInfo 연동 집계 + 상태값 대소문자 정리 + 52h 경고 FE 표시

### Wave 6 — UI 보강 (구조·기능 동등성)
1. 직원: 추가 다이얼로그, 검색/필터/페이지네이션, 재활성화, 조직/직무/본조직 편집
2. 근무일정: 주간 달력 뷰, 패턴 요일 매핑 UI, 패턴 적용 UI, 일괄 생성, 확정 해제 버튼
3. 출퇴근: 수기 추가, 휴게 수정, 일괄 처리, 누락 필터, me/home 서버 상태 동기화
4. 휴가: 발생 내역/휴가 목록 페이지, 유형 편집 폼 확장, Hooks 위반 수정, N+1 제거
5. 요청: 신청 유형 9종+, 취소, 승인규칙 편집기 확장, 상세 정형 렌더링
6. 설정: 회사 정보 수정, 지정 휴일 관리, 설정 페이지 실연동

### Wave 7 — 크롬 브라우저 실데이터 검증 (메뉴별)
- 시나리오: 데이터 등록→수정→연계 확인 (예: 일정 등록→출근→지각 판정→리포트 집계→휴가 신청→승인→잔액 차감)

### 제외 (P3 / Phase 1 범위 외)
- 엑셀 업로드/다운로드 전반, 지도 컴포넌트, 고급 필터(연산자), 커스텀 필드 UI, 요청 태그 산출, 첨부파일, 참조(c.c), 연차촉진, 계정탈퇴/이메일변경/언어설정
