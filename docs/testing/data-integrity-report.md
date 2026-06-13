# AbleWork 데이터 무결성·삭제/수정 정합성 결과 리포트

> 작성일: 2026-06-13 · 범위: 삭제/수정 시 참조무결성 + 역할별 보안 + 기초 데이터(최고관리자 설정값) 정합성
> 관련 설계: [SYSTEM_DESIGN.md](../design/SYSTEM_DESIGN.md) §6.4~6.6

## 1. 종합 결론

- 적대적 감사(17개 분석 에이전트)로 **132건**(CRITICAL 8 / HIGH 43 / MEDIUM 68 / LOW 13) 식별.
- 꼭 필요한 **참조무결성·보안 가드를 구현**하고, **기초 데이터(유형·발생규칙·기안양식·승인규칙 등)** 삭제 영향까지 2차로 보강.
- 가드가 반환하는 **구체 사유 메시지를 프론트엔드에 노출**(이전엔 generic "삭제에 실패했습니다"만 표시).
- 검증: **단위 595 / 통합(e2e) 40 테스트 전부 통과**, 루트 `pnpm typecheck` 5/5(API·Web·공유패키지 3), 크롬 브라우저 실동작 확인.

## 2. 구현한 삭제 가드 (사용 중이면 차단)

| 엔티티 | 차단 조건 | 에러코드 | 라운드 |
|---|---|---|:--:|
| 조직 `Organization` | 하위조직 / 활성직원 / 출퇴근장소 / 근무일정 | `ORG_HAS_CHILDREN/EMPLOYEES/TIMECLOCK_AREAS/SHIFTS` | 1 |
| 직무 `Position` | 활성 직원 배정 | `POSITION_IN_USE` | 1 |
| 근무유형 `ShiftType` | 사용 중 템플릿/근무일정 | `SHIFT_TYPE_IN_USE` | 1 |
| 근무 템플릿 `ShiftTemplate` | 생성된 근무일정 | `SHIFT_TEMPLATE_IN_USE` | 1 |
| 휴가 유형 `LeaveType` | 잔여 휴가 보유 직원 | `LEAVE_TYPE_IN_USE` | 1 |
| 휴가 그룹 `LeaveGroup` | 자식 유형 잔여 휴가 보유(+자식 cascade soft-delete) | `LEAVE_GROUP_IN_USE` | 1 |
| **기안양식 `DocumentForm`** | 이 양식으로 작성된 문서 | `FORM_IN_USE` | **2** |
| **커스텀 요청유형 `CustomRequestType`** | 사용 중 활성 승인 규칙 | `CUSTOM_TYPE_IN_USE` | **2** |
| **승인 규칙 `ApprovalRule`** | 진행 중(PENDING) 요청 | `APPROVAL_RULE_IN_USE` | **2** |
| **출퇴근 장소 `TimeclockArea`** | 이 장소로 기록된 출퇴근 | `TIMECLOCK_AREA_IN_USE` | **2** |

### 검증했으나 가드 불필요(안전) — 기초 데이터
- **발생규칙 `LeaveAccrualRule`**: 자식 item만 `Cascade`. 잔액은 휴가유형을 참조하므로 규칙 삭제와 무관. 하드 삭제 안전.
- **표준화규칙 `StandardizationRule`**: 역참조 없음.
- **스케줄패턴 `SchedulePattern`**: 생성된 근무일정과 FK 분리.
- **공용결재선 `SharedApprovalLine`**: `ApprovalLine.sharedLineRef`가 `SetNull`, 상신 시 단계 복사 → 원본 삭제 무영향.

## 3. 직원 퇴사(deactivate) 정합성 (라운드 1)
- 미결 결재(assignee, PENDING/WAITING) 보유 시 차단 → `EMPLOYEE_HAS_PENDING_APPROVALS`.
- 퇴사 시 그 직원을 결재자(`approverId`)로 지정한 조직의 `approverId`를 `null` 해제(`$transaction`).

## 4. 역할별 보안 불변식 (라운드 1)
- **레코드 소유권**: HR 요청(휴가/근무/근태의 수정·삭제) 승인 반영은 요청자 본인 소유 레코드만(apply 단계 `where`에 `employeeId` 강제).
- **자기결재 금지**: 외부 결재자 없으면 요청 거부(`REQUEST_NO_APPROVER`) + 요청자=결재자 차단(`REQUEST_SELF_APPROVAL`).
- **휴가 잔액 조회**: 본인 또는 ORG_ADMIN↑만(`LEAVE_BALANCE_FORBIDDEN`).

## 5. 수정(update) 정책
기초 데이터 수정은 차단하지 않되 기존 데이터는 스냅샷 보존:
- 기안양식 `fieldsSchema` 변경 → 기존 문서 `content`는 작성 시점 값 보존.
- 휴가유형 `deductionDays` 변경 → 승인된 휴가 `daysUsed` 불변(미래 신청부터 적용).
- 커스텀 유형 `fields` 교체 → 기존 요청 `payload` 스냅샷 보존.

## 6. 프론트엔드 — 가드 사유 메시지 노출 (라운드 2)
이전: 삭제 실패 시 모든 화면이 generic "삭제에 실패했습니다."만 표시 → 사용자가 차단 사유를 알 수 없음.
조치:
- 공용 헬퍼 [`getApiErrorMessage`](../../apps/web/src/lib/api-error.ts) 신설(백엔드 `{error:{code,message}}`에서 메시지 추출).
- 적용 13개 화면: 기안양식 / 공용결재선 / 근무유형 / 근무템플릿 / 스케줄패턴 / 직무 / 조직 / 출퇴근장소 / 휴가유형·그룹 / 발생규칙 / 승인규칙 / 커스텀유형 / 회사휴일.
- 결과: 사용 중 양식 삭제 시도 → **"이 양식으로 작성된 문서가 있어 삭제할 수 없습니다."** 토스트 노출(크롬 검증 완료).

## 7. 테스트 커버리지

| 레이어 | 결과 | 비고 |
|---|---|---|
| 단위 | **29 suites / 595 tests 통과** | 각 삭제 가드의 정상/차단 케이스 + 조직 순환참조 3건 포함 |
| 통합(e2e) | **6 suites / 40 tests 통과** | `integrity-security.e2e-spec.ts` S5(소유권·자기결재·잔액) + S6(FORM_IN_USE, APPROVAL_RULE_IN_USE) |
| 타입체크 | 루트 `pnpm typecheck` **5/5** (API·Web·shared-constants/types/schemas) | 누락됐던 공유 패키지 tsconfig 복구 |
| 브라우저 | 기안양식 삭제 차단 + 사유 메시지 노출 확인 | dev DB(GEN-2026 문서 보유) |

## 8. 크롬 브라우저 검증 요약
- 관리자 로그인 → 전자결재 › 기안양식 관리 → "일반 기안서"(문서 보유) 삭제 시도.
- 결과: 행 미삭제 + 토스트 "이 양식으로 작성된 문서가 있어 삭제할 수 없습니다." → 백엔드 가드 + FE 메시지 노출 전 구간 정상.

## 9. 권고 진행 상황 (SYSTEM_DESIGN §6.6)

**추가 반영 (본 라운드):**
- ✅ **조직 계층 순환참조 검출** — `parentId` 수정 시 자기/하위 조직을 상위로 지정하면 `ORG_PARENT_CYCLE`(400) 차단. 단위 3건(자기참조·하위참조·정상재지정) 추가.
- ✅ **근무일정 확정 비대칭 정책 확정** — 근태=확정 시 정정 차단 / 근무일정=확정 후에도 결재로 변경 허용(의도된 비대칭, 문서화).

**대기 (마이그레이션/설계판단 필요):**
1. ⏳ 스키마 FK 정책(마이그레이션): `Document.form` `Cascade`→`Restrict`, `ApprovalLine.sharedLineRef` `SetNull` 명시.
2. ⏳ 결재 규칙 스냅샷(`Request.ruleId`, 마이그레이션)으로 진행 중 요청 소급 방지.
3. ⏳ 비활성 마스터 조회 필터 일원화(`Position.isActive` 등) — 선택목록은 active만/이력 표시는 보존이라는 용도 구분 확정 후 적용(일괄 필터링은 회귀 위험).
