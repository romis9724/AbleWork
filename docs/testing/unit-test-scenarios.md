# AbleWork 단위 테스트 시나리오

> 자동 생성 기준일: 2026-06-13 · 28개 서비스 병렬 커버리지 분석 결과
> 재사용 목적: 향후 세션에서 이 문서를 읽고 갭/버그 우선순위를 즉시 파악하기 위함 (LLM 토큰 절약).

## 요약

- 분석 서비스: **28개**
- 기존 단위 테스트(분석 시점): **254개**
- 식별된 커버리지 갭: **559개** (HIGH 213 / MEDIUM 253 / LOW 93)
- 권장 추가 테스트(누적): **약 648개**
- 의심 버그: **154건** (CRITICAL 20 / HIGH 31 / MEDIUM 68 / LOW 35)

## 모듈별 커버리지 한눈에

| 모듈 | spec | 기존 | 권장+ | 갭 H/M/L | 버그 |
|---|:--:|:--:|:--:|:--:|:--:|
| attendances | ✅ | 39 | 18 | 4/5/7 | 4 |
| AuthService | ✅ | 12 | 18 | 6/8/4 | 7 |
| companies | ✅ | 11 | 16 | 8/6/2 | 11 |
| approval-actions.service | ✅ | 17 | 35 | 4/17/10 | 8 |
| documents | ✅ | 24 | 18 | 2/12/4 | 5 |
| employees.service | ✅ | 25 | 30 | 17/11/2 | 6 |
| leaves | ✅ | 38 | 18 | 4/7/9 | 8 |
| messages | ✅ | 3 | 42 | 13/21/6 | 5 |
| message-automation.processor | ✅ | 17 | 22 | 2/8/5 | 4 |
| organizations | ✅ | 12 | 27 | 5/8/2 | 6 |
| positions | ✅ | 6 | 12 | 2/5/2 | 3 |
| reports | ✅ | 11 | 35 | 9/9/2 | 10 |
| schedule-patterns | ✅ | 8 | 24 | 8/8/0 | 7 |
| shift-templates | ✅ | 8 | 16 | 3/7/1 | 5 |
| shifts | ✅ | 15 | 20 | 4/10/6 | 8 |
| timeclock-areas | ✅ | 8 | 14 | 4/3/3 | 5 |
| company-holidays | ❌ | 0 | 22 | 9/13/0 | 4 |
| company-settings | ❌ | 0 | 28 | 21/5/0 | 4 |
| permission-settings.service.ts | ❌ | 0 | 35 | 14/16/5 | 4 |
| document-forms.service | ❌ | 0 | 20 | 13/12/4 | 4 |
| proxy-settings | ❌ | 0 | 28 | 11/7/2 | 4 |
| SharedApprovalLinesService | ❌ | 0 | 18 | 9/5/0 | 4 |
| mail | ❌ | 0 | 28 | 11/13/1 | 4 |
| discord-webhook | ❌ | 0 | 14 | 5/6/3 | 7 |
| notifications | ❌ | 0 | 28 | 6/11/5 | 4 |
| custom-types.service.ts | ❌ | 0 | 20 | 2/5/1 | 4 |
| shift-types | ❌ | 0 | 14 | 2/7/5 | 5 |
| standardization-rules | ❌ | 0 | 28 | 15/8/2 | 4 |

---

## 모듈별 상세 시나리오

### attendances

- spec 존재: 예 · 기존 테스트 39개 · 권장 추가 18개
- public 메서드: `findAll`, `createManual`, `clockIn`, `clockOut`, `breakStart`, `breakEnd`, `update`, `updateBreaks`, `remove`, `getMyToday`, `getNowAtWork`, `confirmPeriod`, `unconfirm`, `determineStatus`

**커버된 시나리오:**

- determineStatus: Shift 없음 → oncall 판정
- determineStatus: 지각 유예 내 정상 출근
- determineStatus: 지각 유예 초과 → late 판정
- determineStatus: 조기 출근 → oncall 판정
- determineStatus: 조기 출근 유예 내 정상
- determineStatus: 회사 설정 읽어서 지각 유예 적용
- clockIn: 출근 기록 생성 및 CLOCK_IN 이벤트 발행
- clockIn: 지각 시 LATE 이벤트도 발행
- clockIn: 이미 진행 중이면 ConflictException
- clockIn: 직원 미존재 → NotFoundException
- clockIn: 타사 출퇴근 장소 → NotFoundException
- clockIn: 무일정 정책 'never' → ForbiddenException
- clockIn: 무일정 정책 'if_no_shift' 조건부 허용
- clockIn: 무일정 정책 'always' 허용
- clockIn: GPS 반경 검증 (초과/범위/무제한/필수)
- clockIn: gps_or_wifi 반경 초과 시 폴백
- clockIn: authMethod='none' GPS 스킵
- clockOut: 퇴근 기록 업데이트
- clockOut: 확정된 기록 수정 불가
- clockOut: Shift 종료 전 퇴근 → early_leave
- clockOut: 지각 + 조퇴 → late 우선
- clockOut: Shift 없음 상태 유지
- update: 미확정 기록 수정 + 확정됨 차단
- remove: 미확정 기록 삭제
- remove: 확정된 기록 삭제 불가
- confirmPeriod: 기간/ID 목록 기반 확정
- unconfirm: GENERAL/SUPER_ADMIN 권한 분기
- unconfirm: ORG_ADMIN 거부
- createManual: 상태 자동 판정 + 직원 검증
- updateBreaks: $transaction 교체 + 확정 기록 차단
- getMyToday: 미퇴근 + 열린 휴게 반환

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `breakStart` | 출근 기록 미존재 또는 확정된 기록에서 휴게 시작 시도 | 휴게는 미퇴근(clockOutAt=null) 미확정(isConfirmed=false) 기록에서만 생성 가능 |
| HIGH | `breakEnd` | 출근 기록 미존재 또는 확정된 기록에서 휴게 종료 시도 | 휴게는 미퇴근 미확정 기록에서만 수정 가능 |
| HIGH | `findAll` | organizationId 필터와 companyId 검증 조합 | organizationId 필터 사용 시에도 companyId 보안 필터는 필수 (코드상 있음) — 타사 조직 직원 노출 검증 |
| HIGH | `confirmPeriod` | ORG_ADMIN 권한으로 타 조직 근태 확정 시도 | ORG_ADMIN은 자신의 조직에만 접근 가능 — 서비스 레벨 organizationId 필터 부재 |
| MEDIUM | `createManual` | 같은 Shift를 여러 attendance가 공유하려 할 때 (unique constraint) | attendances.shift_id는 unique — 첫 번째 기록만 연결, 이후는 shiftId=null |
| MEDIUM | `findAll` | startDate/endDate 모두 있을 때 필터 병합 (경계값) | clockInAt gte startDate AND lte endDate 모두 적용되어야 함 |
| MEDIUM | `getNowAtWork` | 타임존 이슈로 '오늘'의 정의가 달라지는 경우 | 00:00~23:59:59.999Z는 UTC 기준이지만 로컬 타임존이 적용될 수 있음 |
| MEDIUM | `determineStatus` | lateGrace=0일 때 경계값 (clockInAt === shiftStart) | 정확히 shift 시작 시각 출근 시 normal로 판정 (late_grace_minutes 기본 10분) |
| MEDIUM | `clockOut` | resolveClockOutStatus에서 Shift 조회 실패 | Shift 미존재 또는 endAt 미정의 시 status 변경 없음 |
| LOW | `breakStart` | 이미 열려있는 휴게가 있을 때 추가 생성 | 하나의 attendance 당 동시 진행 중인 휴게는 1개여야 함 (DB constraint 확인 필요) |
| LOW | `breakEnd` | 진행 중인 휴게가 여러 개일 때 가장 최근 것 선택 | orderBy startAt desc로 마지막 휴게 선택 (정상) |
| LOW | `getMyToday` | 여러 개의 진행 중인 휴게가 있을 때 첫 번째만 반환 | 한 번에 하나의 휴게만 진행 가능하지만 DB에서 여럿 있을 수 있음 |
| LOW | `updateBreaks` | breaks 배열에 시간 역순 데이터(startAt > endAt) 전달 | 휴게는 startAt <= endAt이어야 함 (서비스 레벨 검증 부재) |
| LOW | `findShiftForClockIn` | 하루에 여러 Shift가 있을 때 가장 먼저 시작하는 것 선택 확인 | orderBy startAt asc로 첫 Shift 선택 (명시적 테스트 부재) |
| LOW | `clockIn` | lat/lng 타입이 null/undefined/NaN 혼용될 때 | GPS 검증은 lat/lng 모두 숫자여야 함 (타입 체크 미흡) |
| LOW | `haversineDistanceMeters` | 정확도 테스트 (각도 계산의 부동소수점 오차) | 100m 반경 내 판정이 일관성 있어야 함 |

**의심 버그:**

- **[MEDIUM]** `createManual:146-151` — 같은 shiftId를 두 attendance가 공유하려 할 때 shiftId를 null로 변경하는 로직이 있지만, 이미 taken된 shift와의 race condition 미처리 — 동시성 환경에서 두 요청이 동시에 같은 shift에 대해 체크하면 duplicate unique key 에러 발생 가능
- **[LOW]** `findAll:91-99` — startDate와 endDate 모두 있을 때 스프레드 병합 로직이 명확하지만, 잠재적 혼동의 여지 있음 — endDate 조건 내에서 startDate를 다시 체크하여 재지정 (실제로는 병합됨, 버그 아님)
- **[LOW]** `clockIn:218-219` — 비즈니스 관점: 이미 oncall 상태가 판정된 후 정책을 검증하므로 정상. 다만 정책 우선순위가 암묵적임.
- **[LOW]** `resolveClockOutStatus:822` — AttendanceStatus.LATE 상수와 attendance.status (문자열) 비교 — 공유 상수에서 LATE = 'late'라고 가정하므로 문제 없지만, 타입 안전성 개선 가능

---

### AuthService

- spec 존재: 예 · 기존 테스트 12개 · 권장 추가 18개
- public 메서드: `login`, `refresh`, `changePassword`, `forgotPassword`, `resetPassword`, `hashPassword`

**커버된 시나리오:**

- login with valid credentials returns tokens
- login with invalid password throws UnauthorizedException
- login with non-existent email throws UnauthorizedException
- forgotPassword with existing user creates token and sends email
- forgotPassword hashes token with SHA256
- forgotPassword with non-existent user returns same response (email enumeration prevention)
- forgotPassword continues on mail failure
- resetPassword with valid token updates password and marks usedAt
- resetPassword with non-existent token throws BadRequestException
- resetPassword with expired token throws BadRequestException
- resetPassword with already-used token throws BadRequestException
- changePassword with incorrect current password throws BadRequestException

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `login` | employee.isActive=false but user.isActive=true should be rejected | Employee deactivation must block login despite active user record |
| HIGH | `refresh` | employee companyId mismatch between token claim and current DB record | Multi-tenancy CRITICAL: companyId must match fresh employee lookup, not use stale token claim |
| HIGH | `refresh` | employee.accessLevel changes between token issue and refresh | Privilege escalation: refreshed token should reflect current accessLevel, not old payload |
| HIGH | `refresh` | invalid JWT signature or token tampering detection | JWT cryptography: tampered tokens must be rejected, not just expired ones |
| HIGH | `changePassword` | userId belongs to inactive employee (multi-tenancy orphan check) | Password change must validate userId maps to active employee in correct company |
| HIGH | `resetPassword` | race condition: two concurrent resetPassword calls with same token both succeed | Atomic check-then-update: usedAt null check and update must be transactional |
| MEDIUM | `login` | accessLevel enum validation before JWT payload assignment | JWT payload must contain valid AccessLevel enum value, not arbitrary strings |
| MEDIUM | `login` | concurrent login attempts behavior (rate limiting or session conflict) | Multiple simultaneous logins should be handled consistently |
| MEDIUM | `refresh` | employee deleted after token issued | Deleted employees should not be able to refresh tokens |
| MEDIUM | `changePassword` | transaction atomicity when password hash fails mid-update | Atomic write: password update must succeed or fail completely, no partial states |
| MEDIUM | `forgotPassword` | rate limiting / abuse prevention on token generation | Email enumeration attack via repeated password reset requests |
| MEDIUM | `forgotPassword` | isActive=false user should not receive reset email | Only active users should initiate password reset flow |
| MEDIUM | `resetPassword` | user deleted after token created but before reset attempted | Must verify user still exists in transaction before updating password |
| MEDIUM | `hashPassword` | no coverage: public utility zero test cases | Utility function: same input must hash to different outputs (bcrypt salt), not test for exact match |
| LOW | `changePassword` | user not found returns NotFoundException (spec has no test for this path) | Error path coverage for missing user |
| LOW | `forgotPassword` | old reset tokens not cleaned up on subsequent requests | DB cleanup: expired tokens should be removed to prevent token spray attacks |
| LOW | `resetPassword` | token hash collision or weak hashing not tested | Cryptography: two different raw tokens must produce different hashes consistently |
| LOW | `all methods` | error response format consistency (code + message structure) | API standard: errors should follow { success:false, error:{code,message} } pattern |

**의심 버그:**

- **[HIGH]** `auth.service.ts:36-62 (login method)` — Line 37-42: findUnique only filters isActive at user level but not employee.isActive in the where clause. An inactive employee record could slip through because the include doesn't enforce isActive in the join condition. The check on line 50 catches it, but the query pattern invites bugs. A user with multiple employees (should not exist but if it did) could cause issues.
- **[HIGH]** `auth.service.ts:64-87 (refresh method)` — Line 79-83: Payload companyId is used directly from old token without re-validation against current employee record. If employee.companyId was changed (admin reassignment), the refreshed JWT would still claim old company. Creates multi-tenancy bypass risk. Should validate payload.companyId === employee.companyId.
- **[HIGH]** `auth.service.ts:150-159 (resetPassword method)` — Race condition: Lines 141 and 150-159. Two concurrent requests with same token both see usedAt=null, pass validation, then both enter transaction and execute user update. The $transaction only ensures atomicity within the transaction, not across multiple concurrent calls. No SELECT FOR UPDATE or unique constraint prevents double-spend.
- **[MEDIUM]** `auth.service.ts:54-59 (login method)` — Line 58: accessLevel is cast to AccessLevel enum but no validation it's actually a valid enum value. If the database contains corrupt data or an unknown access level string, this silently passes and corrupts the JWT payload.
- **[MEDIUM]** `auth.service.ts:89-98 (changePassword method)` — No validation that userId maps to an active employee. A user account could exist without a linked employee record or with an inactive employee. Should fetch and verify employee.isActive before allowing password change.
- **[MEDIUM]** `auth.service.ts:106-110 (forgotPassword method)` — Line 107: Only filters user by isActive=true, but spec says 'should block inactive users'. However, line 110 returns early with identical response if user not found, so this is safe. But the intent is not obvious in code - should explicitly comment why isActive filter is present.
- **[LOW]** `auth.service.ts:164-166 (hashPassword method)` — Public utility with zero test coverage. While bcrypt.hash is correct, calling code might assume same password always produces same hash (it doesn't). No test documents this behavior.

---

### companies

- spec 존재: 예 · 기존 테스트 11개 · 권장 추가 16개
- public 메서드: `create`, `findById`, `update`, `generateInviteCode`, `joinByInviteCode`

**커버된 시나리오:**

- create: 회사/사용자/직원을 트랜잭션으로 생성
- create: 이미 존재하는 이메일 거부
- findById: 유효한 회사 조회 반환
- findById: 존재하지 않는 회사 NotFoundException
- findById: 다른 companyId 접근 ForbiddenException
- update: 회사 정보 수정
- generateInviteCode: 6자리 코드 생성 및 저장
- generateInviteCode: 존재하지 않는 회사 NotFoundException
- joinByInviteCode: 유효한 코드로 사용자/직원 생성
- joinByInviteCode: 유효하지 않은 코드 거부
- joinByInviteCode: 중복 이메일 거부

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findById` | 쿼리에서 companyId 필터링 누락 - 데이터베이스 조회 시 다른 회사 데이터도 조회 가능 | 멀티테넌시: 모든 DB 쿼리 where에 companyId 필수 |
| HIGH | `update` | update 쿼리에 companyId 조건 누락으로 race condition 발생 가능 | 멀티테넌시: 모든 DB 쿼리 where에 companyId 필수 |
| HIGH | `joinByInviteCode` | companySetting 조회 시 companyId 노출 위험 - 초대 코드 조회 후 companyId를 알아낼 수 있음 | 멀티테넌시: companySetting 조회 쿼리에서 companyId 보호 |
| HIGH | `create` | 트랜잭션 내 employee 생성 실패 시 user/company만 생성될 수 있는지 테스트 필요 | $transaction 원자성: 모든 엔티티 생성 성공 또는 전부 롤백 |
| HIGH | `joinByInviteCode` | 코드 사용 후 자동 삭제/무효화 메커니즘 부재 - 동일 코드로 여러 명이 계속 가입 가능 | 초대 코드는 일회용이어야 함 |
| HIGH | `create` | 관리자 권한(SUPER_ADMIN) 검증 미구현 - 누구나 create 호출 가능 | 권한 계층: SUPER_ADMIN만 회사 생성 가능 |
| HIGH | `generateInviteCode` | 관리자 권한(GENERAL_ADMIN/SUPER_ADMIN) 검증 미구현 | 권한 계층: 관리자만 초대코드 생성 가능 |
| HIGH | `update` | 관리자 권한 검증 미구현 | 권한 계층: 관리자만 회사 정보 수정 가능 |
| MEDIUM | `generateInviteCode` | 코드 만료 시간 검증 미구현 - 구버전 코드 계속 사용 가능 | 코드 생명주기 관리 필요 |
| MEDIUM | `joinByInviteCode` | 코드 유효 기간 검증 미구현 | 초대 코드 만료 시간 검증 |
| MEDIUM | `create` | adminPassword 약한 비밀번호 검증 부재 | 비밀번호 정책 검증 |
| MEDIUM | `update` | 트랜잭션 처리 없음 - 부분 업데이트 실패 시 데이터 불일치 가능 | 데이터 일관성 보장 |
| MEDIUM | `findById` | isActive=false인 회사 접근 시도 거부 확인 | 비활성 회사는 접근 불가 |
| MEDIUM | `update` | 부분 업데이트 검증 - null/undefined 필드 처리 | 업데이트 입력 검증 |
| LOW | `joinByInviteCode` | joinedAt 날짜 검증 - 미래 날짜 입력 불가 | 직원 입사일 검증 |
| LOW | `generateInviteCode` | 6자리 코드 조합 수 제한으로 중복 가능성 | 코드 유일성 보장 메커니즘 필요 |

**의심 버그:**

- **[CRITICAL]** `companies.service.ts:84-91 (update 메서드)` — update 쿼리에서 companyId 조건 누락. findById에서 권한 검증 후 update 호출하지만, update 쿼리 자체에 companyId 필터가 없어 race condition으로 타사 데이터 수정 가능. 정정된 쿼리: where: { id, companyId }
- **[CRITICAL]** `companies.service.ts:126-178 (joinByInviteCode 메서드)` — companySetting 조회 시 companyId 필터 없음. 공격자가 임의 초대코드로 companySetting을 조회하면 다른 회사의 companyId를 노출할 수 있음. 현재 코드는 코드 값으로만 검색하므로 데이터 누출 위험.
- **[HIGH]** `companies.service.ts:21-59 (create 메서드)` — 회사 생성 권한 검증 부재. 누구나 호출 가능하여 쇼핑 제어 정책 미적용. 메서드 시그니처에 userId/accessLevel 파라미터 없음.
- **[HIGH]** `companies.service.ts:93-124 (generateInviteCode 메서드)` — 초대 코드 생성 권한 검증 부재. 누구나 호출 가능하여 쇼핑 제어 정책 미적용.
- **[HIGH]** `companies.service.ts:84-91 (update 메서드)` — 업데이트 권한 검증 부재. 누구나 회사 정보 수정 가능.
- **[HIGH]** `companies.service.ts:126-178 (joinByInviteCode 메서드)` — 일회용 코드 검증 미구현. 동일 초대 코드로 여러 명이 계속 가입 가능. companySetting.value를 단순 조회만 하고 사용 후 삭제 또는 무효화하지 않음.
- **[MEDIUM]** `companies.service.ts:21-59 (create 메서드)` — 비밀번호 정책 미검증. adminPassword가 약한 비밀번호여도 수락. bcrypt 해싱 전 정책 검증 필요.
- **[MEDIUM]** `companies.service.ts:93-124 (generateInviteCode 메서드)` — 초대 코드 만료 메커니즘 부재. companySetting에 createdAt/expiresAt 추적 없음.
- **[MEDIUM]** `companies.service.ts:126-178 (joinByInviteCode 메서드)` — 초대 코드 만료 검증 미구현. 구버전 코드도 계속 유효하여 보안 위험.
- **[MEDIUM]** `companies.service.ts:84-91 (update 메서드)` — 트랜잭션 처리 없음. 업데이트 중 실패 시 데이터 불일치 가능성. 특히 회사 삭제/비활성화 시 부수 효과(직원 비활성화 등) 처리 필요.
- **[LOW]** `companies.service.ts:180-183 (generateRandomCode 메서드)` — Math.random() 사용으로 암호학적 안전성 미흡. crypto.randomBytes() 권장.

---

### approval-actions.service

- spec 존재: 예 · 기존 테스트 17개 · 권장 추가 35개
- public 메서드: `approve`, `agree`, `reject`, `preApprove`, `returnToPrevious`, `cancelApproval`, `view`, `receive`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `approve` | 대리인(proxyId)이 처리했을 때 proxyId 검증 누락 | 대결 처리 후 proxyId가 올바르게 기록되는지 검증 필요. spec은 isProxy=true 시에만 proxyId 설정을 테스트하지만, proxyId가 null 또는 잘못된 값일 때의 분기 테스트 없음. |
| HIGH | `approve` | 타사 문서 접근 시도 | 멀티테넌시: loadActionTarget에서 companyId WHERE절이 있으나, 중간단계 progressFlow 내 tx.document.findFirst(id만 사용)가 companyId 검증 없음(line 544). 다른 테넌트 문서로의 상태 변경 가능. |
| HIGH | `cancelApproval` | 대리인(isProxy=true)이 처리한 단계를 본인이 아닌 원래 담당자가 취소 시도 | line 369: isOwnAction은 assigneeId 또는 proxyId만 확인하나, 대리인이 처리한 경우 원래 담당자가 취소 가능한지가 비즈니스 규칙상 불명확. 현재 구현상 원래 담당자(assigneeId)도 취소 가능하지만, 비즈니스 의도 검증 필요. |
| HIGH | `cancelApproval` | 타사 문서 접근 시도 | 멀티테넌시: cancelApproval 반환 시 findFirst(id, companyId)는 있으나(line 428), 중간 transaction 내에서 approvalStep.updateMany에 documentId 필터만 있고 companyId 검증 없음(line 164 등). |
| MEDIUM | `reject` | REFERENCE/VIEWER 단계는 CANCELLED 제외되는지 검증 | 반려 시 REFERENCE/VIEWER role은 열람 유지되도록 where 절에서 제외(line 168 role in [...APPROVAL_FLOW_ROLES, RECEIVER])되지만, 이 분기는 spec에 검증 없음. |
| MEDIUM | `reject` | 이미 처리된 문서에 대한 반려 불가 검증 | assertDocumentPending은 호출되지만, 반려 후 다시 반려 시도 같은 이미 REJECTED 문서에 대한 reject 재호출 테스트 없음. |
| MEDIUM | `preApprove` | 전결 후 이전 단계(RETURNED)들도 SKIPPED 대상에 포함되는지 검증 | line 242: where status: [WAITING, RETURNED]로 필터하는데, RETURNED 단계가 정확히 SKIPPED되는지 spec 검증 없음. |
| MEDIUM | `returnToPrevious` | 직전 결재자가 여럿일 때 최고 stepOrder만 선택하는지 | 직전 단계는 APPROVED/PROXY_APPROVED 중 최대 stepOrder를 선택(line 295)하지만, 중복된 결재라인 시나리오에서 올바른 단계 선택 검증 없음. |
| MEDIUM | `returnToPrevious` | 전단계 반려 시 proxyId/isProxy 초기화 검증 | 직전 단계 복원 시 isProxy=false, proxyId=null 초기화(line 319)는 정확하나, 이것이 spec에 명시적으로 검증되지 않음. |
| MEDIUM | `cancelApproval` | 여러 WAITING 단계 중 최소 stepOrder만 선택 | line 393: 다음 PENDING 단계 중 최소 stepOrder 선택하나, 여러 결재라인 시나리오에서 올바른 단계 선택 검증 없음. |
| MEDIUM | `receive` | APPROVED 이외의 상태(DRAFT, PENDING, REJECTED)에서 receive 호출 | line 482: document.status !== APPROVED 검증은 있으나, REJECTED 문서에 대한 receive 시도 같은 엣지 케이스 테스트 부재. |
| MEDIUM | `view/receive` | 대리인이 view/receive 처리했을 때 proxyId 기록 | view/receive에서도 ctx.isProxy 기반 proxyId 설정(line 454, 500)이 있으나, 대리인 경로 테스트 명시되지 않음. |
| MEDIUM | `loadActionTarget` | documentId가 존재하지만 stepId가 같은 문서의 다른 라인에 속한 경우 | stepId 검증은 document.approvalLines.flatMap 후 find(line 623)로만 수행. 같은 stepId가 다른 라인에 있을 가능성은 낮지만, 데이터 정합성 검증 없음. |
| MEDIUM | `resolveActor` | ProxySettings 기간 경계값 (startDate=today, endDate=today) 검증 | line 655: setting.startDate > today \|\| endDate < today로 경계 제외 검증하나, 경계값 정확성(예: 23:59:59 vs 00:00:00) 테스트 없음. |
| MEDIUM | `todayDateOnly` | UTC vs 로컬 타임존 처리 | Date.UTC 사용으로 UTC 타임존 고정(line 695)되나, ProxySettings.startDate/endDate가 로컬 시간인 경우 비교 오류 가능. spec에 타임존 검증 없음. |
| MEDIUM | `progressFlow` | RETURNED 단계가 포함된 다음 단계 선택 | line 535: [WAITING, RETURNED] 상태 필터로 전단계 반려 후 재승인 경로 지원하나, 실제 RETURNED→PENDING 전이 시나리오 spec 검증 없음. |
| MEDIUM | `approveFlowStep / reject / preApprove 공통` | transaction 롤백 시나리오 (DB 에러) | prisma.$transaction 사용하나, transaction 내 에러 발생 시 롤백 및 에러 처리 spec 검증 없음. |
| MEDIUM | `reject` | 같은 라인의 여러 WAITING 단계 모두 CANCELLED되는지 | updateMany에서 line documentId 필터로 모든 라인 포함되는지, 같은 라인 내 후속 WAITING 단계들도 정확히 CANCELLED되는지 검증 부재. |
| MEDIUM | `cancelApproval` | currentPendingNext가 null인 경우 (이후 PENDING 단계 없음) | line 410: currentPendingNext가 null이면 update 미실행되나, 마지막 단계 취소 후 상태 정합성 검증 없음. |
| MEDIUM | `approveFlowStep` | step의 isProxy 초기값이 true인 경우 overwrite 검증 | line 111: isProxy: ctx.isProxy로 덮어쓰나, 이전 대결 정보 완전 제거 검증 필요. |
| MEDIUM | `preApprove` | APPROVER가 아닌 AGREEMENT 역할에 preApprove 시도 | line 213: expectedRole=[APPROVER]만 허용하나, AGREEMENT도 preApprove 가능해야 하는지 비즈니스 명확하지 않음. spec에 AGREEMENT preApprove 시도 검증 없음. |
| LOW | `preApprove` | allowPreApproval=true이지만 allowReDraft도 함께 설정된 케이스 | form.allowPreApproval만 검증하고 form의 다른 속성 조합은 테스트되지 않음. |
| LOW | `returnToPrevious` | 현재 단계가 RETURNED인데 다시 returnToPrevious 호출 | 현재 단계는 PENDING이어야 한다고 assertStepPending(line 284)로 검증되나, RETURNED 단계에 대한 return 재호출 테스트 없음. |
| LOW | `view` | VIEWER 단계 processing 검증 | REFERENCE/VIEWER 역할 구분 없이 동일 처리되나, VIEWER만 처리 시 문서 흐름 영향 검증 명확하지 않음. |
| LOW | `view` | 이미 VIEWED인 단계에 재호출 | assertStepPending(line 442)로 PENDING만 검증되나, VIEWED 단계 재호출 및 comment 덮어쓰기 테스트 없음. |
| LOW | `resolveActor` | ProxySettings 복수 레코드 중 최신 선택 동작 | orderBy createdAt desc (line 645)로 최신 설정만 사용하나, 활성 기간 내 다중 설정 시나리오 검증 없음. |
| LOW | `finalizeApproval` | RECEIVER 단계 없는 문서에 대한 처리 | RECEIVER 단계 없는 문서도 finalizeApproval 호출되나, RECEIVER 부재 시 updateMany count=0 상황 테스트 없음. |
| LOW | `emitProgressEvents` | finalApproved=false이고 nextAssigneeId=null인 엣지 케이스 | line 584-590: nextAssigneeId이 null이면 이벤트 미발행하나, 이 상황의 데이터 정합성 검증 필요. |
| LOW | `approveFlowStep` | comment가 매우 긴 문자열일 때 저장/반환 검증 | comment: dto.comment ?? null (line 109)로 null/undefined 처리하나, 문자열 길이 제한 및 저장 검증 없음. |
| LOW | `approve 및 agree` | 같은 stepId로 approve와 agree 중복 호출 | role 기반 분기(line 87)로 APPROVER/AGREEMENT 구분하나, 동일 단계 id의 role 불일치 시 role mismatch 에러 처리는 있으나, 중복 호출 방지 검증 없음. |
| LOW | `loadActionTarget` | approvalLines가 빈 배열인 경우 | line 622: flatMap으로 steps 도출하나, approvalLines 부재 시 stepId 찾지 못하고 NotFoundException 발생. 정상 동작이나 spec 검증 없음. |

**의심 버그:**

- **[CRITICAL]** `progressFlow:544` — tx.document.findFirst({ where: { id: document.id } })에서 companyId 검증 없음. 다른 테넌트의 문서 상태 조회 가능. 멀티테넌시 위반. loadActionTarget은 companyId 필터 있으나, progressFlow 재조회는 documentId만 사용.
- **[CRITICAL]** `reject:164-172` — approvalStep.updateMany에서 line.documentId 필터링하나, 문서 작성사(drafterId)의 권한 검증 없음. 또한 companyId 기반 테넌시 검증이 WHERE절에 없어서 같은 문서 ID가 다른 테넌트에 존재할 경우 이상 동작 가능. 트랜잭션 내 companyId 검증 재추가 필요.
- **[HIGH]** `cancelApproval:392-393` — currentPendingNext 선택 로직에서 filter(status === PENDING)로 다음 PENDING 단계를 찾으나, 여러 라인의 PENDING 단계가 있을 경우 최소 stepOrder 기준 선택이 올바른지 보장 불가. 라인별 stepOrder 격리 필요.
- **[HIGH]** `resolveActor:655` — ProxySettings.startDate > today \|\| endDate < today 비교는 자정 기준이나, setting이 여러 개일 때 orderBy createdAt desc로만 정렬. 기간 중복 시 최신 생성 설정이 항상 유효한지 보장 불가. isActive 필터만으로는 다중 활성 설정 처리 불명확.
- **[MEDIUM]** `returnToPrevious:295` — 직전 결재 단계 선택 시 APPROVAL_FLOW_ROLES 필터 + stepOrder 비교하나, 같은 stepOrder 값을 가진 중복 단계가 있을 경우(결재라인 병렬) 첫 번째 단계만 선택되고 실제 의도 단계 누락 가능.
- **[MEDIUM]** `approveFlowStep:105-114 + 150-161` — tx.approvalStep.update 호출 전 step.id 유효성 재검증 없음. loadActionTarget에서 이미 검증되지만, transaction 내 다시 조회 없이 업데이트되므로, 트랜잭션 시작 후 step이 다른 세션에서 삭제되었다면 silent fail 가능.
- **[MEDIUM]** `preApprove:237-245` — 이후 결재 단계 SKIPPED 처리 시 where 절에서 { status: [WAITING, RETURNED] } 필터만 사용. PENDING 상태의 결재 단계는 건너뛰지 않는데, 동시성 상황에서 누군가 다음 단계를 이미 PENDING으로 활성화했다면 전결 스킵 누락 가능.
- **[LOW]** `todayDateOnly:695` — new Date(Date.UTC(...))는 UTC 자정 반환하나, ProxySettings 테이블의 startDate/endDate 컬럼이 로컬 타임존으로 저장된 경우 비교 오류 발생. DB 스키마와 타임존 정합성 검증 필요하나 현 코드 범위 밖. 로그 또는 에러 발생 가능성 낮음(서버-DB 타임존 동일 가정).

---

### documents

- spec 존재: 예 · 기존 테스트 24개 · 권장 추가 18개
- public 메서드: `create`, `update`, `remove`, `submit`, `recall`, `findAll`, `findOne`

**커버된 시나리오:**

- create() - 양식 존재 시 DRAFT 생성 + steps 보관 (WAITING)
- create() - 타사 양식 404
- create() - 타사 직원이 결재선에 포함되면 400
- submit() - 채번 규칙으로 docNumber 발급 + 첫 결재단계만 PENDING
- submit() - 채번 규칙 없으면 기본 DOC-{연도}-{seq}
- submit() - REJECTED 재상신은 allowReDraft=false면 거부
- submit() - RECALLED 재상신은 allowReDraft와 무관하게 허용
- submit() - PENDING 상태이면 DOCUMENT_ALREADY_SUBMITTED 400
- submit() - 결재(APPROVER/AGREEMENT) 단계 없으면 APPROVAL_LINE_EMPTY 400
- submit() - sharedLineId로 공용 결재선 복사
- submit() - 기안자 본인 검증
- submit() - 타사 문서 404
- submit() - HR 요청 연동 문서는 DOCUMENT_MANAGED_BY_REQUEST 400
- recall() - 결재 처리된 단계 없으면 RECALLED 전환
- recall() - APPROVED 단계 있으면 DOCUMENT_CANNOT_RECALL 400
- recall() - PENDING 아닌 상태는 회수 불가
- remove() - DRAFT 아니면 DOCUMENT_NOT_DRAFT 400
- remove() - DRAFT 문서는 결재선과 함께 삭제
- findAll(draft) - 본인의 DRAFT/RECALLED/REJECTED만
- findAll(pending_approval) - 대리인(proxy) principal 포함
- findAll(ledger) - GENERAL_ADMIN 미만은 403
- findAll(ledger) - GENERAL_ADMIN은 회사 전체 조회
- findOne() - 결재 관계자 아닌 직원은 403
- findOne() - 결재 담당자는 열람 가능

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findOne` | proxy 대리인 기간 검증: ProxySettings.endDate 만료 후에도 열람 가능한 버그 |  |
| HIGH | `assertAssigneesInCompany` | 다른 회사의 직원이 steps에 포함되면 EMPLOYEE_NOT_FOUND 400 (companyId 필터) |  |
| MEDIUM | `update` | DRAFT/RECALLED/REJECTED 상태에서 steps=[] (빈 배열) 전달 시 결재선 완전 제거 동작 |  |
| MEDIUM | `update` | update(REJECTED) → submit(REJECTED) 통합 흐름에서 docNumber 재사용 검증 |  |
| MEDIUM | `findAll` | completed 박스: CANCELLED/RECALLED 상태가 '완료'로 간주되는지 미검증 |  |
| MEDIUM | `findAll` | search 필터와 box별 where 조건의 OR 조합 동작 (ledger + search) |  |
| MEDIUM | `recall` | CANCELLED 상태 문서의 회수 불가 검증 (CANCELLED은 ACTED_STEP_STATUSES 미포함) |  |
| MEDIUM | `submit` | docNumber unique 충돌 재시도 로직 (Line 189-194)의 2회차 재시도 역시 실패하면 throw 동작 |  |
| MEDIUM | `buildBoxWhere` | pending_approval 박스에서 myAssigneeIds [me, principal1, principal2, ...] 중복 없는지 검증 |  |
| MEDIUM | `initialStepStatus` | AGREEMENT가 첫 단계(stepOrder=0)일 때 PENDING으로 설정되는지 검증 |  |
| MEDIUM | `findAll` | in_progress 박스: drafterId=me 제약이 실제 적용되는지 검증 |  |
| MEDIUM | `findAll` | pending_approval 박스: APPROVAL_FLOW_ROLES 체크 (APPROVER/AGREEMENT 아닌 다른 role은 제외) |  |
| MEDIUM | `recall` | 진행중 문서에서 모든 단계가 WAITING이면 회수 가능 (ACTED_STEP_STATUSES 체크) |  |
| MEDIUM | `submit` | 재상신 시 기존 docNumber와 신규 docNumber 발급 조건 명확화 (Line 411) |  |
| LOW | `submit` | resolveSubmitSteps() - sharedLine 파싱 성공했으나 APPROVER 없는 경우 (이미 Line 477-482에서 검증됨) |  |
| LOW | `create` | steps=undefined vs steps=[] 동작 동일성 검증 |  |
| LOW | `issueDocNumber` | resetYearly=true + 연도 경계(Dec 31→Jan 1) timezone 불일치 (UTC vs Asia/Seoul) |  |
| LOW | `createDraftLine` | DRAFT 보관된 steps의 생명주기: 상신 시 삭제되는지 명시적 검증 |  |

**의심 버그:**

- **[HIGH]** `findOne (Line 700) - assertCanRead` — proxy 관계 검증에서 ProxySettings의 startDate/endDate 기간을 확인하지 않음. 기간 만료된 대리인도 여전히 문서 열람 가능. pending_approval 박스에서는 기간 체크(Line 588-596)하나 findOne에서 누락.
- **[MEDIUM]** `buildBoxWhere (Line 576-584)` — completed 박스 필터에서 status: { in: [APPROVED, REJECTED] }만 포함. CANCELLED, RECALLED 상태가 '완료'로 간주되는지 명확하지 않음. RECALLED는 재상신 가능하므로 제외가 맞으나 테스트 없음.
- **[MEDIUM]** `issueDocNumber (Line 512)` — resetYearly=true일 때 yearStart = new Date(year, 0, 1)은 UTC 기준. company.timezone이 Asia/Seoul이면 Dec 31 23:59 submit이 2025-01-01로 평가되어 시퀀스 리셋 불일치 가능. Line 512에서 UTC 타임존 하드코딩된 yearStart 사용.
- **[MEDIUM]** `submit (Line 189-194)` — docNumber unique 충돌 시 1회 재시도 로직. 2회차 retry도 실패하면 예외 throw. 고부하 시 의도하지 않은 실패율 증가 가능. 재시도 전략 명시화 필요.
- **[LOW]** `findAll (Line 287-306)` — Promise.all([findMany, count])로 조회 사이에 문서 추가/삭제되면 total과 items 개수 불일치. $transaction 미사용. 페이지네이션 UI 오류 가능성 (실제 영향 미미).

---

### employees.service

- spec 존재: 예 · 기존 테스트 25개 · 권장 추가 30개
- public 메서드: `findAll`, `findOne`, `create`, `update`, `deactivate`, `activate`, `resetDevice`, `findWageInfos`, `createWageInfo`

**커버된 시나리오:**

- findOne returns existing employee
- findOne throws EMPLOYEE_NOT_FOUND
- findOne blocks ORG_ADMIN cross-org access
- findOne allows ORG_ADMIN same-org access
- findAll with ORG_ADMIN org scope filtering
- findAll with GENERAL_ADMIN no org scope
- deactivate active employee success
- deactivate already-deactivated throws EMPLOYEE_ALREADY_DEACTIVATED
- deactivate non-existent throws EMPLOYEE_NOT_FOUND
- deactivate blocks ORG_ADMIN when permission disabled
- deactivate allows ORG_ADMIN when permission enabled
- deactivate allows GENERAL_ADMIN regardless of permission
- activate inactive employee success
- activate already-active throws EMPLOYEE_ALREADY_ACTIVE
- update with permission setting enforcement
- update self name/phone allowed even when permission disabled
- update syncs User.name/phone when changed
- update skips User sync when only other fields changed
- resetDevice clears device info
- findWageInfos returns wage history
- createWageInfo creates wage entry
- guardOrgScope allows SUPER_ADMIN
- guardOrgScope allows GENERAL_ADMIN
- guardOrgScope blocks ORG_ADMIN without org overlap
- guardOrgScope allows ORG_ADMIN with org overlap

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `create` | Successfully create employee with transaction (User + Employee + Organizations + Positions) | HR 요청→전자결재: POST /requests가 $transaction으로 requests + documents(DRAFT→PENDING) + approval_lines + approval_steps 생성. 원자성 필수. |
| HIGH | `create` | Validate that all organizationIds belong to companyId before creating (cross-company injection) | 멀티테넌시(보안 CRITICAL): 모든 DB 쿼리 where에 companyId 필수. 누락 시 타사 데이터 노출 = 버그. |
| HIGH | `update` | Access level change requires GENERAL_ADMIN authority (not ORG_ADMIN) | 권한 계층: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1). accessLevel 변경: GENERAL_ADMIN 이상만 |
| HIGH | `update` | Cannot grant access level equal to or higher than requester's level (escalation prevention) | 자신과 같거나 높은 권한은 부여할 수 없습니다 — ACCESS_LEVEL_HIERARCHY[dto.accessLevel] >= requesterLevel |
| HIGH | `update` | Update organization associations in transaction (deleteMany + createMany atomicity) | $transaction으로 조직 연결 변경 |
| HIGH | `update` | Update position associations in transaction (deleteMany + createMany atomicity) | $transaction으로 직무 연결 변경 |
| HIGH | `update` | Self-update with forbidden field (e.g., accessLevel) throws EMPLOYEE_SELF_UPDATE_FORBIDDEN | 본인: 이름/전화번호만 수정 가능. 다른 필드 시도 시 403 |
| HIGH | `update` | ORG_ADMIN targeting other employees blocked when org_admin_can_manage_employees=false | 권한 설정(permission.org_admin_can_manage_employees, 기본 true)이 꺼져 있으면 ORG_ADMIN의 직원 추가/수정/퇴사 처리를 차단 |
| HIGH | `update` | Update with organizationIds not belonging to companyId throws INVALID_ORGANIZATION | 멀티테넌시: organizationIds의 모든 항목이 companyId에 속해야 함 |
| HIGH | `update` | Update preserves companyId in where clause (no cross-tenant writes) | 멀티테넌시: 타 회사 직원 수정 불가 |
| HIGH | `deactivate` | ORG_ADMIN blocked from deactivating cross-org employee | ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능 |
| HIGH | `activate` | ORG_ADMIN blocked from activating cross-org employee | ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능 |
| HIGH | `findWageInfos` | ORG_ADMIN blocked from accessing cross-org employee wage info | ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능 |
| HIGH | `createWageInfo` | ORG_ADMIN blocked from creating wage info for cross-org employee | ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능 |
| HIGH | `resetDevice` | ORG_ADMIN blocked from resetting cross-org employee device | ORG_ADMIN은 자신의 조직에 속한 직원만 접근 가능 |
| HIGH | `guardUpdatePermission` | ORG_ADMIN cannot update other employees (non-self) without org_admin_can_manage_employees | Access level < ORG_ADMIN은 타인 수정 불가 |
| HIGH | `guardUpdatePermission` | EMPLOYEE cannot update any other employee | Access level < ORG_ADMIN은 타인 수정 불가 |
| MEDIUM | `create` | Emit EMPLOYEE_CREATED event with correct payload | event emitter 검증: EVENTS.EMPLOYEE_CREATED가 올바른 페이로드로 발행되는지 |
| MEDIUM | `create` | Handle existing user reuse (email collision) in transaction | 기존 User 재사용 또는 새로 생성하는 로직의 원자성 |
| MEDIUM | `create` | Validate primaryOrganizationId is in organizationIds list | 데이터 일관성: primaryOrganizationId가 organizationIds에 포함되지 않으면 비즈니스 룰 위반 |
| MEDIUM | `update` | ORG_ADMIN self-update allowed for name/phone even when org_admin_can_manage_employees=false | 본인 수정(이름/전화번호)은 권한 설정의 영향을 받지 않는다 |
| MEDIUM | `deactivate` | deactivate with explicit resignedAt date vs undefined (current date) | resignedAt이 명시되면 사용, 없으면 현재 시각 |
| MEDIUM | `createWageInfo` | maxHoursPerWeek defaults to 52 when not provided | 근로정보: maxHoursPerWeek 기본값은 52시간 |
| MEDIUM | `findAll` | Search filter across name, phone, employeeNumber with case-insensitive name | 검색 필터: name은 case-insensitive, phone/employeeNumber는 exact match |
| MEDIUM | `findAll` | Pagination with page/limit parameters | 페이지네이션: skip = (page - 1) * limit |
| MEDIUM | `findAll` | positionId filter with multi-position employees | 특정 직무로 필터링 |
| MEDIUM | `findAll` | organizationId filter (explicit) overrides ORG_ADMIN auto-scope | organizationId 필터가 명시되면 auto-scope와 함께 AND 조건으로 작동 |
| MEDIUM | `guardOrgScope` | Empty employee.organizations should fail access (no orgs to check overlap) | 직원이 조직에 속하지 않으면 조직관리자 접근 차단 |
| LOW | `create` | Empty positionIds should not fail (optional positions) | positionIds는 선택사항이므로 빈 배열도 정상 |
| LOW | `findAll` | isActive filter narrowing results | isActive 필터 동작 검증 |

**의심 버그:**

- **[HIGH]** `update() method, line 182-230` — When organizationIds is provided but primaryOrganizationId is NOT provided, the code falls back to organizationIds[0] (line 215). However, there's no validation that the provided primaryOrganizationId is actually in the organizationIds array. This could lead to a primary organization that doesn't exist in the employee's org list.
- **[HIGH]** `guardUpdatePermission() method, line 340-379` — The method checks if dto.accessLevel !== undefined before validating permissions (line 365). However, there's no check that requester cannot change their own accessLevel. If a self-update includes an accessLevel field, it should be rejected, but the code only guards 'not self' cases. The SELF_EDITABLE_FIELDS check (line 345) does include name/phone, but self-update with accessLevel will pass through if caught by line 345 filter.
- **[MEDIUM]** `findOne() method, line 81-105` — The guardOrgScope check happens AFTER findFirst succeeds, but companyId is already in the where clause. If a requester from company-A tries to access an employee from company-B, findFirst will return null (not throwing NotFoundException), so guardOrgScope never runs. This is actually correct behavior (silently blocks cross-tenant access), but the NotFoundException isn't thrown for invalid companyId cases.
- **[MEDIUM]** `create() method, line 115-167` — The transaction does not handle the case where validateOrganizationsBelongToCompany succeeds, but then one of the tx.employeeOrganization.createMany calls fails due to a constraint violation. There's no explicit retry or rollback logging, though Prisma should handle it.
- **[MEDIUM]** `resetDevice() method, line 286-294` — resetDevice does NOT check guardOrgAdminManagePermission (unlike deactivate/activate). It only checks guardOrgScope. An ORG_ADMIN could bypass the permission setting to reset devices. This is inconsistent with other management operations.
- **[MEDIUM]** `update() method, line 198-206` — User sync only happens if existing.userId is truthy AND (name or phone changed). However, if email-based user lookup in create() fails to find a user, user.id would be null, and subsequent updates would silently skip User sync. This could lead to stale User records.

---

### leaves

- spec 존재: 예 · 기존 테스트 38개 · 권장 추가 18개
- public 메서드: `findGroups`, `createGroup`, `updateGroup`, `deleteGroup`, `findTypes`, `createType`, `updateType`, `deleteType`, `findAccrualRules`, `createAccrualRule`, `updateAccrualRule`, `deleteAccrualRule`, `runAccrualRule`, `getBalance`, `findCompanyBalances`, `manualAccrual`, `findLeaves`, `createCompensationLeave`, `createLeave`, `validateBalance`

**커버된 시나리오:**

- findGroups - 회사 소속 그룹 목록 반환
- createGroup - 그룹 생성
- createType - 존재하는 그룹에 유형 생성 및 nonexistent 그룹 NotFoundException
- updateGroup - 그룹 수정 및 타사 그룹 접근 시 NotFoundException
- deleteGroup - 소프트 삭제(isActive=false)
- deleteType - 소프트 삭제 및 타사 유형 NotFoundException
- updateAccrualRule - items 전체 교체 및 items 미제공 시
- deleteAccrualRule - 규칙 하드 삭제
- createLeave - 잔액 검증 후 Leave 생성 및 차감, 잔액 부족/타사 직원 에러
- getBalance - 직원 잔액 목록 및 미존재 직원 NotFoundException
- findCompanyBalances - 직원별 그룹화, year 필터, organizationId 필터
- validateBalance - 충분한 잔액, 미존재 잔액, 잔액 부족, 유효기간 만료
- manualAccrual - 수동 발생 및 이벤트 emit, 여러 직원 동시 발생, 미존재 직원 에러
- createCompensationLeave - 보상휴가 발생 및 이벤트 emit
- findLeaves - 페이징된 목록 반환 및 직원 필터
- runAccrualRule - 최고 구간 선택, 그룹당 대표 유형 1개 발생, 멱등성(중복 발생 방지), 월 기준 규칙 누적 발생, 월 기준 멱등 증분, 미존재 규칙 NotFoundException

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findTypes` | companyId 멀티테넌시 검증 부재 - group: { companyId } 조건으로 테스트하지 않음 | 모든 DB 쿼리 where에 companyId 필수. 멀티테넌시 누락 시 타사 휴가 유형 노출 CRITICAL |
| HIGH | `createAccrualRule` | 존재하지 않는 leaveGroupId로 생성 시도 - assertGroupBelongsToCompany 검증 테스트 부재 | 타 회사 그룹에 규칙 생성 불가 (companyId 검증) |
| HIGH | `updateAccrualRule` | leaveGroupId 변경 시 신규 그룹이 타사 소속인 경우 - 권한 검증 테스트 부재 | 타 회사 그룹으로 변경 불가 |
| HIGH | `findLeaves` | companyId 멀티테넌시 - employee: { companyId } 조건 검증 테스트만 있으나, 필터 없이 호출 시 검증 부재 | 타사 휴가 일정 노출 위험 |
| MEDIUM | `runAccrualRule` | targetEmployeeIds 선택(일부) vs 단일 employeeId vs 전체(undefined) 3가지 분기 중 전체 분기 미테스트 | 모든 활성 직원 대상 발생 로직 누락 |
| MEDIUM | `runAccrualRule` | 그룹에 활성 leaveType이 없는 경우 (pickRepresentativeLeaveType return null) - 테스트 부재 | 대표 휴가 유형 미존재 시 processed: 0 반환 |
| MEDIUM | `calcAccrualForEmployee (private)` | tenureMonths가 어떤 item의 threshold도 충족하지 않는 경우 (applicableItem === null) - 테스트 부재 | 근속 미달 시 accrual null 반환 → 스킵 |
| MEDIUM | `calcAccrualForEmployee` | 월 기준 규칙에서 months === 0인 경우 - 테스트 부재 | 경과 개월 0일 시 accrual null → 스킵 |
| MEDIUM | `createLeave` | Leave 생성 후 leaveBalance.update 실패 시 트랜잭션 롤백 - 테스트 부재 | $transaction 내 예외 발생 시 원자성 보장 |
| MEDIUM | `manualAccrual` | 트랜잭션 내 upsert 실패 또는 부분 실패 시 롤백 - 테스트 부재 | $transaction 원자성 검증 |
| MEDIUM | `updateType` | orgScopeIds / positionScopeIds를 빈 배열로 업데이트하는 경우 (undefined vs []) - 비교 로직 오류 위험 | 라인 99-104: dto.orgScopeIds !== undefined일 때만 처리, but dto.orgScopeIds ?? undefined는 항상 undefined 반환 → 데드 코드 가능성 |
| LOW | `runAccrualRule` | employees.length === 0인 경우 조기 반환 - 테스트 부재 | 대상 직원 없을 시 processed: 0 |
| LOW | `applyAccrualTarget` | delta === 0 (정확히 같은 경우) vs delta < 0 (이미 초과 발생된 경우) - 경계값 테스트 부재 | 멱등 가드: delta <= 0이면 false |
| LOW | `findLeaves` | date 범위 필터 사용 시 gte/lte 연산자 교차 위험 (startDate > endDate 입력) - 검증 부재 | 입력 검증은 DTO 레벨에서 수행해야 함 |
| LOW | `createLeave` | daysUsed = 0인 경우 (calcLeaveDaysUsed에서 Math.max(1, ...) 미적용 시 엣지 케이스) - 테스트 부재 | 최소 1일 차감 |
| LOW | `manualAccrual` | expiresAt === null인 경우 (선택사항) - 테스트 부재 | 만료일 미설정 시 null 유지 |
| LOW | `createLeave` | year 계산 - startDate의 getFullYear()와 시간대 변환 시 UTC vs 로컬 시간 불일치 위험 | 시간대 처리 검증 |
| LOW | `calcLeaveDaysUsed` | 타임존 처리 - 'T00:00:00.000Z' UTC 강제 vs 로컬 날짜 입력 불일치 | UTC 기준 일 수 계산 |
| LOW | `dateFromMd` | MD 문자열 파싱: month === 13, day === 32 같은 무효 입력 - 검증 부재 | DTO 레벨 정규식으로 사전 검증 |
| LOW | `findTypes` | include: { group: { select... } } - group이 null인 경우 (데이터 무결성 오류) - 테스트 부재 | FK 제약 위반 시나리오 |

**의심 버그:**

- **[MEDIUM]** `updateType (line 99-104)` — orgScopeIds/positionScopeIds 업데이트 로직 오류: `dto.orgScopeIds ?? undefined`는 항상 undefined를 반환하므로 실제로는 빈 배열 또는 값을 설정할 수 없음. 조건문 내 `data['orgScopeIds'] = dto.orgScopeIds ?? undefined`에서 ?? 연산자는 dto.orgScopeIds가 null/undefined일 때만 작동하는데, 빈 배열 []을 전달해도 [] ?? undefined = []이므로 문제없지만, 코드 의도가 불명확함. 현재 로직: if (dto.orgScopeIds !== undefined)에서 이미 존재 확인했으므로, data['orgScopeIds'] = dto.orgScopeIds (??undefined 제거)로 단순화 필요.
- **[MEDIUM]** `createLeave (line 621)` — startDate의 year 계산 시 로컬 시간대 미고려: `const startDate = new Date(dto.startDate)` (문자열 '2024-06-03') → new Date()는 UTC로 파싱. 이후 `startDate.getFullYear()`는 UTC 기준. 그러나 dto.startDate 자체가 로컬 날짜 문자열이라면 시간대 변환 오류 가능. validateBalance의 startDate 비교도 동일 문제.
- **[MEDIUM]** `getBalance (line 463)` — leaveBalance 조회에 companyId 필터 부재: `findMany({ where: { employeeId } })`만 사용. 이론적으로 직원 소속 확인 후 조회하지만, leaveBalance 자체에 companyId 검증 없음. cross-company leak 위험은 낮음(employee 확인 후) 하지만, 명시적 검증 권장.
- **[LOW]** `calcLeaveDaysUsed (line 784)` — UTC 강제 시간 설정 ('T00:00:00.000Z')에서 입력이 로컬 시간대라면 일수 계산 오류. 예: 2024-06-03(로컬) vs 2024-06-03T00:00:00Z(UTC) - 시간대 차이로 +/-1일 오차 가능. 단위테스트에서는 mock되어 발견 안 됨.
- **[LOW]** `runAccrualRule (line 209-214)` — employeeIds와 employeeId 우선순위: `employeeIds.length > 0 ? employeeIds : employeeId ? [employeeId] : undefined` → 로직 맞지만, 둘 다 제공되면 employeeIds 우선. 모호함 (선택적 순서 명시 필요).
- **[LOW]** `findCompanyBalances (line 479)` — organizationId 필터 미검증: `organizations: { some: { organizationId } }`에서 조직이 타 회사 소속일 수 있음. 현재 companyId로 직원 필터되므로 실제 누출은 없으나, 중첩 필터 명시 권장.
- **[LOW]** `runAccrualRule (line 225)` — employees.length === 0 시 { processed: 0 } 반환 전, targetLeaveType 계산이 스킵됨. 구조상 문제없지만, 빈 직원 목록은 일찍 반환하는 게 성능상 명확.
- **[LOW]** `applyAccrualTarget (line 424)` — delta <= 0 조건: 음수와 0을 동일 취급. 개념상 맞지만, delta === 0 (정확히 일치)과 delta < 0 (초과)을 분리 로그하면 디버깅 용이.

---

### messages

- spec 존재: 예 · 기존 테스트 3개 · 권장 추가 42개
- public 메서드: `findTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `sendMessage`, `findMyMessages`, `markAsRead`, `findAutomations`, `createAutomation`, `updateAutomation`, `deleteAutomation`

**커버된 시나리오:**

- sendMessage: 기본 메시지 생성 및 수신자 생성
- sendMessage: sendEmail=true일 때 이메일 발송 (null user 제외)
- sendMessage: sendEmail=false일 때 이메일 발송 안함
- sendMessage: 이메일 발송 중 에러 발생 시 메시지는 저장 유지 (fire-and-forget 격리)

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findTemplates` | 다른 companyId 템플릿이 조회되지 않음을 검증 | 멀티테넌시: 모든 쿼리 where에 companyId 필수 |
| HIGH | `updateTemplate` | template이 다른 companyId에 속할 때 NotFoundException 발생 | 멀티테넌시: assertTemplateBelongsToCompany로 보호 |
| HIGH | `updateTemplate` | 존재하지 않는 templateId로 업데이트 시도 시 에러 |  |
| HIGH | `deleteTemplate` | 타사 template 삭제 시도 시 NotFoundException | 멀티테넌시: assertTemplateBelongsToCompany로 보호 |
| HIGH | `sendMessage` | templateId가 타사 회사에 속할 때 NotFoundException | 멀티테넌시: assertTemplateBelongsToCompany로 보호 |
| HIGH | `sendMessage` | 수신자 중 타사 직원 포함 시 NotFoundException | 멀티테넌시: assertEmployeesBelongToCompany로 보호 |
| HIGH | `findMyMessages` | employeeId로 본인 수신 메시지만 조회 (companyId 필터링 없음, 잠재 보안) | messageRecipient.message.companyId와 employee.companyId 일치 검증 필요 |
| HIGH | `markAsRead` | 존재하지 않는 messageId 또는 employeeId 조합 시 NotFoundException |  |
| HIGH | `findAutomations` | 타사 automation이 조회되지 않음을 검증 | 멀티테넌시: 모든 쿼리 where에 companyId 필수 |
| HIGH | `createAutomation` | templateId가 다른 companyId에 속할 때 NotFoundException | 멀티테넌시: assertTemplateBelongsToCompany로 보호 |
| HIGH | `updateAutomation` | automation이 타사에 속할 때 NotFoundException | 멀티테넌시: assertAutomationBelongsToCompany로 보호 |
| HIGH | `updateAutomation` | partial update - templateId 변경 시 검증 |  |
| HIGH | `deleteAutomation` | 타사 automation 삭제 시도 시 NotFoundException | 멀티테넌시: assertAutomationBelongsToCompany로 보호 |
| MEDIUM | `findTemplates` | 다중 페이지 조회 시 정렬 순서(createdAt desc) 검증 |  |
| MEDIUM | `updateTemplate` | partial update (일부 필드만) 검증 |  |
| MEDIUM | `deleteTemplate` | 존재하지 않는 id 삭제 시도 |  |
| MEDIUM | `sendMessage` | templateId 없이 title/content로만 발송 |  |
| MEDIUM | `sendMessage` | sendEmail=true일 때 employee.user가 null인 직원들은 제외 |  |
| MEDIUM | `sendMessage` | dispatchMessageEmails 에러 발생 시 logger.error 호출 검증 |  |
| MEDIUM | `findMyMessages` | unreadOnly=true일 때 readAt=null 필터만 조회 |  |
| MEDIUM | `findMyMessages` | 페이지네이션 정상 작동 (skip/take) |  |
| MEDIUM | `markAsRead` | 이미 readAt이 설정되었을 때 덮어쓰지 않음 (readAt ?? new Date()) |  |
| MEDIUM | `markAsRead` | note 필드만 업데이트 (readAt 미변경) |  |
| MEDIUM | `markAsRead` | note와 readAt 동시 업데이트 |  |
| MEDIUM | `findAutomations` | 페이지네이션 및 정렬(createdAt desc) 검증 |  |
| MEDIUM | `createAutomation` | sendTime을 'HH:mm' → Date 변환 검증 |  |
| MEDIUM | `createAutomation` | startsAt 미제공 시 현재 날짜로 기본값 설정 |  |
| MEDIUM | `updateAutomation` | partial update - name만 변경 |  |
| MEDIUM | `updateAutomation` | sendTime 업데이트 시 변환 검증 |  |
| MEDIUM | `updateAutomation` | isActive 토글 |  |
| MEDIUM | `deleteAutomation` | 존재하지 않는 id 삭제 |  |
| MEDIUM | `assertTemplateBelongsToCompany` | private 헬퍼 - template이 null일 때 에러 코드 검증 |  |
| MEDIUM | `assertAutomationBelongsToCompany` | private 헬퍼 - automation이 null일 때 에러 코드 검증 |  |
| MEDIUM | `assertEmployeesBelongToCompany` | private 헬퍼 - 일부 직원만 누락되었을 때 에러 |  |
| LOW | `createTemplate` | 중복된 이름 처리 (제약 없음, 리뷰 필요) |  |
| LOW | `sendMessage` | 수신자 배열이 비어있을 때 (DTO 검증 레벨이지만 서비스 레벨 에러 처리) |  |
| LOW | `findAutomations` | template 관계 포함 확인 |  |
| LOW | `createAutomation` | leaveTypeId 미제공 시 null 설정 |  |
| LOW | `toSendTimeDate` | private 헬퍼 - 'HH:mm' → Date 변환 검증 |  |
| LOW | `dispatchMessageEmails` | private 비동기 - email 필터링 로직 |  |

**의심 버그:**

- **[HIGH]** `findMyMessages` — employeeId만으로 messageRecipient를 조회하되, 메시지의 companyId와 employee의 companyId 일치를 검증하지 않음. 악의적 사용자가 employeeId 스푸핑 시 타사 메시지 수신 가능. 현재 controller에서 user.employeeId를 통과하므로 즉각적 위험은 낮으나, 서비스 레벨에서 company 소속 검증 추가 필요.
- **[MEDIUM]** `markAsRead` — messageRecipient의 recipientId 검증 시 message.companyId 확인 없음. messageRecipient 레코드가 존재하면 employee.companyId 검증 없이 readAt 업데이트. message의 companyId를 명시적으로 확인 필요.
- **[MEDIUM]** `sendMessage` — dispatchMessageEmails에서 recipientEmployeeIds로 다시 findMany를 하므로, 메시지 생성 후 직원이 삭제된 경우 이메일이 발송되지 않아도 silently fail. 로깅되지만 사용자에게 명시 안 함.
- **[LOW]** `createTemplate, updateTemplate` — 중복 템플릿 이름에 대한 제약이 없음 (hasVariables 카운팅이 필요할 수 있으나 스키마상 제약 부재). 사용성 이슈이지 보안 문제는 아님.
- **[LOW]** `toSendTimeDate` — sendTime 'HH:mm' 변환 시 UTC 기준 1970-01-01T를 사용하지만, DB의 timezone은 'Asia/Seoul'로 저장됨. 시간대 변환 로직 필요 여부 확인 필요.

---

### message-automation.processor

- spec 존재: 예 · 기존 테스트 17개 · 권장 추가 22개
- public 메서드: `process`, `renderTemplate`, `formatDateInTz`, `getHourInTz`, `addDaysToDateString`, `getDayRangeInTz`

**커버된 시나리오:**

- renderTemplate: basic substitution, whitespace, missing vars, no vars
- Date helpers: formatDateInTz, getHourInTz, addDaysToDateString, getDayRangeInTz
- Processor: automation not found, startsAt before today, sendTime mismatch, idempotency (same day duplicate), leave_start trigger with recipients, leaveTypeId filter, general notice broadcast, sendEmail=true with filtered recipients, sendEmail=false

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `process` | sendTime is UTC but compared with timezone-adjusted currentHour — potential off-by-N-hours issue if sendTime intent is company local time | Message dispatch must respect company timezone for send scheduling |
| HIGH | `process` | Email dispatch failure does not cause job failure (fire-and-forget) — missing test that verifies message persists even if email fails | Message persistence must not depend on email delivery success |
| MEDIUM | `resolveRecipients` | leave_end trigger is implemented but never tested — endDate filter not validated | Both leave_start and leave_end triggers must work symmetrically |
| MEDIUM | `process` | offsetDays only tested with -1; edge cases like 0 or large positive values untested | Date arithmetic must handle all offset values correctly |
| MEDIUM | `process` | No test for inactive employees in general notice (non-leave) path — isActive filter present but not verified | Multitenant: All employee queries must include isActive=true and companyId filters |
| MEDIUM | `process` | Database exceptions (findUnique, findMany, create, $transaction) not caught — job fails silently without proper error handling | Job processor must handle and log database errors explicitly |
| MEDIUM | `process` | companyId passed to message.create is not verified by tests — mock assertions don't check where clause or data fields | Multitenant: All data creation must explicitly set companyId |
| MEDIUM | `resolveRecipients` | No explicit test for zero recipients scenario in leave_start path (empty leaves array) | Empty recipient list should prevent message creation |
| MEDIUM | `dispatchEmails` | Email content rendering with multiple variables (name + company) not tested end-to-end | Template rendering must work for all variable combinations |
| MEDIUM | `process` | Transaction failure in per-recipient message creation (line 177-196) not tested | $transaction failures must not partially persist messages |
| LOW | `process` | No test for null or missing template.content — regex test assumes string type | Null template should be handled gracefully |
| LOW | `process` | Day boundary idempotency not tested — sentAt { gte, lt } edges not verified | Idempotency window must be exactly 24 hours in company timezone |
| LOW | `process` | Logger uses inconsistent levels (warn vs log) — no standardized error code format | Error codes should follow [DOMAIN]_[SITUATION] pattern |
| LOW | `resolveRecipients` | leaveTypeId optional filter uses conditional spread — unclear behavior if undefined | Optional filters should be explicitly documented |
| LOW | `process` | No test for recipient with null email in leave trigger path — filter behavior unclear | Recipients with null emails should be handled consistently |

**의심 버그:**

- **[HIGH]** `line 135-138 (sendTime hour comparison)` — sendTime.getUTCHours() (UTC) is compared with getHourInTz(now, timezone) (timezone-adjusted). If sendTime is meant to represent 'company local time,' this is incorrect. Test passes because test hardcodes sendTime as UTC 09:00, but real data may violate this assumption.
- **[MEDIUM]** `line 177-196 ($transaction for per-recipient messages)` — If $transaction fails partway (e.g., after creating 5 of 10 messages), no rollback is tested. Mock ignores actual transaction semantics. Real failure would be data-corrupting.
- **[MEDIUM]** `line 252-254 (leaveTypeId optional filter)` — Conditional spread `...(automation.leaveTypeId && { leaveTypeId: ... })` works but may mask undefined handling. If leaveTypeId is intended to always be present or always absent, ambiguity remains untested.
- **[LOW]** `line 172 (regex on automation.template.content)` — If automation.template is loaded but content is null, regex test fails with TypeError. No null guard before regex check.

---

### organizations

- spec 존재: 예 · 기존 테스트 18개 · 권장 추가 24개
- public 메서드: `findTree`, `create`, `update`, `remove`, `buildTree`

**커버된 시나리오:**

- buildTree: flat array to tree conversion
- buildTree: multiple root organizations
- buildTree: empty array returns empty
- findTree: retrieves active organizations and builds tree
- create: root organization with depth 0
- create: child organization with parent depth + 1
- create: parent not found throws NotFoundException
- update: organization information
- update: non-existent organization throws NotFoundException
- **update: 자기 자신을 상위로 지정 → `ORG_PARENT_CYCLE` 차단** (순환 방지)
- **update: 하위 조직을 상위로 지정 → `ORG_PARENT_CYCLE` 차단** (조상 체인 탐색)
- **update: 하위가 아닌 다른 조직으로 재지정 → 정상 처리** (회귀 방지)
- remove: soft delete when no children
- remove: prevent deletion when children exist
- remove: 소속 활성 직원 → `ORG_HAS_EMPLOYEES` 차단
- remove: 출퇴근 장소 → `ORG_HAS_TIMECLOCK_AREAS` 차단
- remove: 근무일정 → `ORG_HAS_SHIFTS` 차단
- remove: non-existent organization throws NotFoundException

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findTree` | companyId filtering in query not asserted | Multi-tenancy (멀티테넌시): 모든 DB 쿼리의 WHERE에 companyId 필수. findMany 호출이 {companyId, isActive: true}로 필터링되었는지 검증 부재. |
| HIGH | `create` | parent organization lookup filtering by companyId not verified | Multi-tenancy: 부모 조직 조회 시 companyId 필터링 필수. 코드에는 있으나(line 29) 테스트로 검증되지 않음. 교차 회사 부모 생성 방지 확인 필요. |
| HIGH | `update` | parent organization change with depth recalculation | 조직 수정 시 parentId 변경 시 깊이 재계산. 부모 변경→depth 변경 로직(line 60-77) 테스트 0건. |
| HIGH | `update` | parent to null (child to root conversion) | parentId = null 시 depth = 0으로 설정(line 61-62). 자식 조직→루트 조직 전환 테스트 0건. |
| HIGH | `remove` | child count query filters by companyId not verified | Multi-tenancy: 자식 개수 조회 시 companyId 필터링(line 95). count 호출이 {parentId, companyId, isActive}로 검증되지 않음. |
| MEDIUM | `create` | error code structure validation (ORG_PARENT_NOT_FOUND) | 에러코드: [도메인]_[상황] 형식(예: ORG_PARENT_NOT_FOUND). NotFoundException 타입만 검증, {code, message} 구조 검증 부재. |
| MEDIUM | `update` | conditional field updates not verified | 선택적 필드 업데이트: undefined 필드는 UPDATE 대상에서 제외(line 82-87). 스프레드 조건이 정확한지 검증 부재. |
| MEDIUM | `buildTree` | orphaned nodes handling (parentId exists but node not in array) | 트리 구축 시 부모 없는 노드 처리. filter(org => org.parentId === null) 반복 호출 시 무한 재귀 위험성 검증 부재. |
| ✅ 해소 | `update` | circular reference detection (write-path) | 순환 참조(자기/하위→상위) **쓰기 경로 차단 구현 완료**(`ORG_PARENT_CYCLE`, 단위 3건). 단, `buildTree`는 이미 저장된 순환 데이터에 대한 방어가 없으므로(이론상 무한 재귀) 쓰기 가드로 유입을 막는 전략. |
| MEDIUM | `create` | approverId validation (Employee existence check) | approverId 참조 검증: 해당 Employee가 실제 존재하는지 확인 필요. 현재 검증 로직 없음. |
| MEDIUM | `update` | approverId validation during update | approverId 변경 시 존재성 검증. 현재 검증 로직 없음. |
| MEDIUM | `remove` | isActive soft delete flag verification | 소프트 삭제 확인: isActive = false 설정 검증. 테스트 있지만 실제 update 호출 인자 검증 부족. |
| MEDIUM | `update` | where clause includes companyId (multi-tenancy pattern) | Update where 절에 companyId 포함 권장. 현재 id만 사용(line 80). ID 유일성에 의존하므로 LOW 리스크지만 패턴 불일치. |
| LOW | `create` | isActive default value for new organizations | 신규 조직 생성 시 isActive: true 기본값. 코드에는 있으나(line 50) 테스트 검증 부재. |
| LOW | `findTree` | ordering specification (depth, sortOrder, name) | 트리 정렬: depth ASC → sortOrder ASC → name ASC (line 18). 정렬 순서 검증 테스트 부재. |

**의심 버그:**

- **[MEDIUM]** `organizations.service.ts:16-18 (findTree method)` — findMany query filters isActive: true but doesn't guarantee query stability. If multiple inactive orgs somehow exist in database due to concurrent updates, buildTree might produce inconsistent results. Should add explicit sorting by isActive or use transaction.
- **[MEDIUM]** `organizations.service.ts:28-29 (create method)` — Parent lookup uses findFirst() without orderBy. If database contains multiple organization records with same {id, companyId, isActive} (unlikely due to id uniqueness but possible with race conditions), behavior becomes non-deterministic. Should use findUniqueOrThrow.
- **[MEDIUM]** `organizations.service.ts:64-65 (update method)` — Same issue as parent lookup in create - findFirst without explicit ordering. Parent selection in update could be non-deterministic.
- **[MEDIUM]** `organizations.service.ts:126-135 (buildTree method)` — Recursive tree building could cause stack overflow with deeply nested organizations (depth > 1000). No depth limit or cycle detection. Orphaned nodes (parentId points to non-existent org) silently get filtered out without warning.
- **[LOW]** `organizations.service.ts:80 (update method, where clause)` — Update uses where: { id } instead of where: { id, companyId }. While id uniqueness likely prevents cross-tenant updates, this violates multi-tenancy pattern enforcement. Should be: where: { id, companyId }.
- **[LOW]** `organizations.service.ts:42-52 (create method)` — approverId field set without validating Employee existence. Could create dangling foreign key reference if approverId points to non-existent employee.

---

### positions

- spec 존재: 예 · 기존 테스트 6개 · 권장 추가 12개
- public 메서드: `findAll`, `create`, `update`, `remove`

**커버된 시나리오:**

- findAll returns active positions filtered by companyId
- create inserts new position with companyId, name, color, sortOrder
- update modifies existing position after companyId+id validation
- update throws NotFoundException when position not found in company
- remove soft-deletes by setting isActive=false after validation
- remove throws NotFoundException when position not found

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `update` | update WHERE clause uses only id, not companyId | Multitenant data isolation: all DB queries must include companyId in WHERE. Missing companyId in update allows cross-tenant data modification. |
| HIGH | `remove` | remove WHERE clause uses only id, not companyId | Multitenant data isolation: all DB queries must include companyId in WHERE. Missing companyId in update allows cross-tenant soft-deletion. |
| MEDIUM | `findAll` | empty result set handling |  |
| MEDIUM | `findAll` | orderBy sequence verification (sortOrder ASC then name ASC) |  |
| MEDIUM | `create` | null color field explicit handling |  |
| MEDIUM | `create` | default sortOrder=0 verification |  |
| MEDIUM | `update` | partial updates: color, sortOrder, isActive fields independently |  |
| LOW | `update` | idempotent update (no change scenario) |  |
| LOW | `create` | input validation edge cases (name length boundaries, color format) |  |

**의심 버그:**

- **[CRITICAL]** `positions.service.ts:37-40 (update method)` — Prisma update() uses where: { id } without companyId filter. Allows authenticated user to update any position by ID, regardless of company ownership. Should be where: { id, companyId }.
- **[CRITICAL]** `positions.service.ts:48-50 (remove method)` — Prisma update() for soft-delete uses where: { id } without companyId filter. Allows cross-tenant data deletion. Should be where: { id, companyId }.
- **[HIGH]** `positions.service.ts:4` — UpdatePositionDto import duplicates CreatePositionDto. Should use separate destructured import or alias for clarity, though runtime works.

---

### reports

- spec 존재: 예 · 기존 테스트 11개 · 권장 추가 35개
- public 메서드: `getRealtimeReport`, `exportReportCsv`, `findSnapshots`, `createSnapshot`, `lockSnapshot`, `findCustomColumns`, `createCustomColumn`

**커버된 시나리오:**

- 직원별 근태 집계 기본 케이스
- 무일정 근무(isOncall)는 noScheduleCount로 분류
- 종료된 휴게 차감 후 실근무 분 계산
- 기간 내 종료된 shift 중 미출근 결근 판정
- 출근만 있고 퇴근이 없는 기록 탐지
- 유효 WageInfo 기반 연장근로 계산
- 표준화 규칙 적용 근무 분 재계산
- 표준화 규칙 없을 때 standardizedWorkMinutes = totalWorkMinutes
- 데이터 없을 때 빈 배열 반환
- 이미 잠금된 스냅샷 ConflictException
- 스냅샷 정상 잠금 업데이트
- 존재하지 않는 스냅샷 NotFoundException

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `getRealtimeReport` | lateThresholdMinutes/earlyLeaveThresholdMinutes 필터링 미구현 | 지각/조퇴 판정이 분 단위 임곗값을 지원해야 함 (TODO 주석으로 표시됨) |
| HIGH | `getRealtimeReport` | historical report 생성 시 shift 종료 판정 오류 | new Date()로 현재 시각 캡처하므로, 과거 기간 리포트 생성 시 shift 상태 판정 잘못됨 |
| HIGH | `getRealtimeReport` | contractedWorkDays 파싱 실패 시 무한값 발생 | parseContractedWorkDays 반환값이 0이면 Math.round(weeklyHours*60/0)=Infinity, 후속 Math.max 연산 오류 |
| HIGH | `exportReportCsv` | CSV 내보내기 기능 전무 테스트 | getRealtimeReport 위임하지만 CSV 인코딩, 이스케이프, 빈 파일 등 미검증 |
| HIGH | `findSnapshots` | 스냅샷 목록 조회 테스트 전무 | 페이지네이션 off-by-one, companyId 필터 누락, 정렬 순서 미검증 |
| HIGH | `createSnapshot` | 스냅샷 생성 트랜잭션 미포장 | reportSnapshot.create + reportSnapshotRow.createMany 사이 실패 시 snapshot만 남음 (고아 레코드) |
| HIGH | `createSnapshot` | 스냅샷 생성 테스트 전무 | columnConfig JSON 저장, 행 데이터 변환, 동시성 제어 미검증 |
| HIGH | `createCustomColumn` | 커스텀 열 생성 테스트 전무 | formula 검증, leaveTypeId/shiftTypeId 외래키 검증, sortOrder 자동 계산 미검증 |
| HIGH | `createCustomColumn` | formula 문법 검증 없음 | 사용자가 제공한 formula가 유효한 수식인지 검증 없음, 후속 평가 시 오류 가능 |
| MEDIUM | `getRealtimeReport` | filter.startDate > filter.endDate 미검증 | 날짜 범위 역방향 입력에 대한 검증 없음, silent empty result |
| MEDIUM | `getRealtimeReport` | organizationId='' 빈문자열 입력 시 동작 미정의 | 빈 organizationId는 조직 필터를 무시하거나 에러를 발생시켜야 함 |
| MEDIUM | `getRealtimeReport` | standardizationRule.startTimeRule/endTimeRule 값 검증 없음 | 'shift_start'/'shift_end'/'clock_out' 외 값이 오면 silent fallback, 규칙 의도 훼손 |
| MEDIUM | `createSnapshot` | lockedBy 필드 저장 없음 | lockSnapshot에서 lockedBy/lockedAt 저장 안 함, 누가 잠금했는지 감시 불가 |
| MEDIUM | `lockSnapshot` | lockSnapshot 트랜잭션 미포장 (부분 테스트) | findFirst + update 사이 동시성 경합 가능성 (race condition) |
| MEDIUM | `findCustomColumns` | 커스텀 열 목록 조회 테스트 전무 | sortOrder 정렬 유효성, 삭제된 열 필터링 미검증 |
| MEDIUM | `createCustomColumn` | sortOrder 동시성 오류 | count + create 사이 다른 요청이 삽입하면 sortOrder 중복 가능 (race condition) |
| MEDIUM | `createSnapshot` | columnConfig 스키마 검증 없음 | arbitrary JSON 입력 가능, 후속 FE 렌더링 시 XSS/오류 위험 |
| MEDIUM | `getRealtimeReport` | attendanceStatus 값 케이스 민감성 | 코드는 lowercase status 검증하지만 DB 스키마 제약 미확인 |
| LOW | `getRealtimeReport` | breaks 배열 null 안전성 | breaks는 select에 포함되지만 null일 수 있음, ?? [] 방어 필요 |
| LOW | `getRealtimeReport` | Decimal to Number 안전성 | Prisma Decimal 타입이 Number()로 정확히 변환되는지 보증 없음 (부동소수점 오차) |

**의심 버그:**

- **[CRITICAL]** `createSnapshot (lines 422-474)` — reportSnapshot.create와 reportSnapshotRow.createMany 사이에 트랜잭션 없음. 첫 번째 호출 성공, 두 번째 실패 시 snapshot만 DB에 남아 고아 레코드 생성. 매번 snapshot 생성 실패 시 비 snapshot 쌓임.
- **[HIGH]** `getRealtimeReport line 256` — const now = new Date()는 호출 시각. 과거 기간 리포트(예: 2026-01-31 리포트를 2026-06-13에 생성)를 만들 때, 2026-01-16 shift는 "지나간 일"이므로 absence 판정되어야 하지만, 실제 now > 2026-01-16 이므로 올바르게 작동. 하지만 논리적으로 "기간의 현재 시각" 기준이어야 함. 리포트 생성 지연 시나리오에서 버그 수정 어려움.
- **[HIGH]** `getRealtimeReport line 302` — parseContractedWorkDays 반환값이 0인 경우(모든 파싱 실패) Math.round((weeklyHours * 60) / 0) = Infinity. 이후 Math.max(0, workMinutes - Infinity) = -Infinity 또는 악의적 값. 방어 로직 필요.
- **[HIGH]** `createSnapshot line 438-441` — getRealtimeReport 호출이 동기적으로 응답 반환. 만약 이 과정에서 attendance/shift 쿼리가 2초 이상 걸리면, 사용자 요청 timeout. 대량 직원/기간에 대해 테스트 필요.
- **[MEDIUM]** `getRealtimeReport lines 94-96` — organizationId가 빈 문자열('')이면 { companyId, organizations: { some: { organizationId: '' } } }는 UUID 검증 실패하거나 0 결과. 명시적 에러 처리 필요.
- **[MEDIUM]** `createCustomColumn lines 515-528` — count + create 사이 다른 요청이 삽입하면 sortOrder 값이 충돌. race condition 발생 가능. 트랜잭션 또는 유니크 제약 필요.
- **[MEDIUM]** `getRealtimeReport lines 332-337` — rule.startTimeRule/endTimeRule 값이 'shift_start'/'shift_end' 아닐 경우 default로 실제 시간 사용. 규칙 오타/잘못된 값은 silent로 무시됨. 에러 발생하거나 로그 필요.
- **[MEDIUM]** `lockSnapshot lines 478-501` — findFirst + update 사이 다른 요청이 동일 snapshot을 lock하면 race condition. 두 요청 모두 update 실행 가능. findFirst+update를 원자적으로 처리 필요(Prisma raw query 또는 transaction).
- **[LOW]** `getRealtimeReport line 203` — att.breaks ?? [] 방어는 있지만, find returns에 breaks 필드가 select에 없으면 undefined. Prisma 타입 정의 재확인 필요.
- **[LOW]** `getRealtimeReport line 296` — Number(wage.contractedHoursPerWeek) — Prisma Decimal 타입의 정확한 변환 보증 미확인. 매우 큰 값이나 부동소수점 오차 가능성.

---

### schedule-patterns

- spec 존재: 예 · 기존 테스트 8개 · 권장 추가 24개
- public 메서드: `findAll`, `findOne`, `create`, `update`, `remove`, `applyPattern`

**커버된 시나리오:**

- findAll: 활성 패턴 목록을 반환한다
- create: 패턴을 생성하고 반환한다
- update: 패턴이 존재하면 수정한다
- update: 패턴이 없으면 NotFoundException을 던진다
- remove: isActive=false로 소프트 삭제한다
- applyPattern: 기간 내 Shift를 대량 생성하고 count를 반환한다
- applyPattern: 유효하지 않은 직원이 포함되면 BadRequestException을 던진다
- applyPattern: skip_and_keep 공휴일 날짜는 Shift를 생성하지 않는다

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findOne` | companyId와 id로 패턴을 조회하는 기본 케이스 | 멀티테넌시: 모든 DB 쿼리 where에 companyId 필수. |
| HIGH | `applyPattern` | 날짜 범위 같을 경우 | 경계값: 1일 적용 시나리오 테스트. |
| HIGH | `applyPattern` | startDate > endDate | 날짜 목 검증. |
| HIGH | `applyPattern` | skip_and_shift 모드 | 공휴일 처리 2가지만 테스트. |
| HIGH | `applyPattern` | no_skip 모드 |  |
| HIGH | `applyPattern` | 공휴일 날짜 낰라 무한 루프 | 두 가지 처리 검증. |
| HIGH | `applyPattern` | patternDefinition 없는 cycleIndex | undefined templateId 처리. |
| HIGH | `applyPattern` | endAt <= startAt 비교 로직 | UTC 시간 조정. |
| MEDIUM | `findOne` | 패턴이 없을 때 SCHEDULE_PATTERN_NOT_FOUND 에러 | 에러코드: [도메인]_[상황]. |
| MEDIUM | `create` | description이 undefined일 때 null로 처리되는지 테스트 | 선택적 필드 null 처리 검증. |
| MEDIUM | `update` | 부분 업데이트: 일부 필드만 변경 | 조건부 spread operator 로직이 땅바른 줜
test 가능. |
| MEDIUM | `update` | 비활성 패턴도 수정 가능한지 | 소프트 삭제된 리소스 쓰기 제어. |
| MEDIUM | `remove` | 이미 삭제된 패턴 다시 삭제 |  |
| MEDIUM | `applyPattern` | employeeIds 빈 배열 | Zod min(1) 검증. |
| MEDIUM | `applyPattern` | employeeId primaryOrgId 없음 | continue 로직 부분 숃닉 검증. |
| MEDIUM | `applyPattern` | shift createMany skipDuplicates | Unique constraint 확인. |

**의심 버그:**

- **[MEDIUM]** `applyPattern, line 186-188` — endAt <= startAt 비교 로직이 정확하지 않을 수 있음. combineDateAndTime이 UTC 시간을 반환하므로, 로컬 시간 기반 템플릿의 경우 잘못된 보정을 내뉄 수 있음.
- **[MEDIUM]** `applyPattern, line 211-214` — shift.createMany에서 skipDuplicates=true를 사용하나, 실제 중복 제약이 Shift 모델에 정의되지 않은 경우 누락된 shift 발생 가능.
- **[MEDIUM]** `applyPattern, line 179-182` — primaryOrgId가 없으면 continue로 스킵되는데, 부분 직원만 shift 생성되면 created count가 다를 수 있음.
- **[MEDIUM]** `applyPattern, line 122-135` — templateId가 실제로 존재하지 않으면 shift 생성 실패 가능. 부분 패턴 오류 상황 처리 부족.
- **[MEDIUM]** `update, line 58-77` — update 메서드가 비활성 패턴도 수정 가능. 소프트 삭제된 리소스에 대한 쓰기 제어 부족.
- **[LOW]** `applyPattern, line 254-256` — toDateStr에서 타임존 오프셋이 크면 날짜가 밀릴 수 있음.
- **[LOW]** `applyPattern, line 264-270` — nextNonHoliday에서 무한 루프 가능성. 모든 미래 날짜가 공휴일이면 무한 루프.

---

### shift-templates

- spec 존재: 예 · 기존 테스트 8개 · 권장 추가 16개
- public 메서드: `findAll`, `create`, `update`, `remove`, `assertTemplate`

**커버된 시나리오:**

- findAll: 활성 템플릿 목록 조회 with companyId filter
- create: 유효한 DTO로 템플릿 생성
- create: 유효하지 않은 shiftTypeId 에러
- update: 템플릿 이름 수정
- update: 존재하지 않는 템플릿 NotFoundException
- update: shiftTypeId 변경 시 유효성 검사
- remove: 소프트 삭제 (isActive=false)
- remove: 존재하지 않는 템플릿 NotFoundException

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `update` | 교차 테넌시 공격: 다른 company의 id로 update 시도 | 멀티테넌시(보안 CRITICAL): 모든 DB 쿼리 where에 companyId 필수. 누락 시 타사 데이터 노출 = 버그. |
| HIGH | `remove` | 교차 테넌시 공격: 다른 company의 id로 remove 시도 | 멀티테넌시(보안 CRITICAL): 모든 DB 쿼리 where에 companyId 필수. 누락 시 타사 데이터 노출 = 버그. |
| HIGH | `create` | shiftType 검증 후 template 생성 사이 race condition (트랜잭션 부재) |  |
| MEDIUM | `create` | startTime >= endTime인 경우 비즈니스 로직 검증 |  |
| MEDIUM | `create` | 유효하지 않은 시간 형식 (parseTime 함수 입력 검증) |  |
| MEDIUM | `update` | 모든 필드가 undefined인 경우 no-op 동작 검증 |  |
| MEDIUM | `update` | startTime >= endTime인 경우 비즈니스 로직 검증 |  |
| MEDIUM | `remove` | 사용 중인 템플릿(근무 일정 참조) 삭제 제약 |  |
| MEDIUM | `update` | 비활성(isActive=false) 템플릿 수정 거부 |  |
| MEDIUM | `create` | code 중복 처리 (중복 허용 vs 거부) |  |
| LOW | `findAll` | 활성 템플릿이 없는 빈 목록 반환 |  |

**의심 버그:**

- **[CRITICAL]** `shift-templates.service.ts:60-72 (update 메서드)` — update Prisma 호출에서 where: { id }로만 필터링. assertTemplate으로 companyId 확인 후에도 실제 업데이트는 id만으로 수행되어 멀티테넌시 격리 위반. 다중 DB 샤딩이나 예기치 않은 ID 충돌 시 타사 템플릿 수정 가능.
- **[CRITICAL]** `shift-templates.service.ts:80-83 (remove 메서드)` — update Prisma 호출에서 where: { id }로만 필터링. assertTemplate으로 companyId 확인 후에도 실제 업데이트는 id만으로 수행되어 멀티테넌시 격리 위반. 다중 DB 샤딩이나 예기치 않은 ID 충돌 시 타사 템플릿 삭제 가능.
- **[MEDIUM]** `shift-templates.service.ts:9-13 (parseTime 함수)` — 시간 문자열 입력 검증 없음. 'invalid', '99:99', '25:00' 같은 형식도 new Date() 생성. startTime >= endTime 검증도 없음.
- **[MEDIUM]** `shift-templates.service.ts:33-49 (create 메서드)` — validateShiftTypeBelongsToCompany 후 create 사이에 트랜잭션 없음. shiftType 삭제되면 FK 제약 위반. 또한 startTime >= endTime, code 중복 검증 없음.
- **[LOW]** `shift-templates.service.ts:88-99 (assertTemplate 메서드)` — 반환된 template 객체를 사용하지 않음. 메서드명 'assert'는 부작용이 없어야 하는데 NotFoundException 발생이 부작용. 반환값 미활용으로 혼란 가능.

---

### shifts

- spec 존재: 예 · 기존 테스트 15개 · 권장 추가 20개
- public 메서드: `findAll(companyId, filter)`, `create(companyId, dto, requester)`, `bulkCreate(companyId, dto, requester)`, `update(companyId, id, dto)`, `remove(companyId, id)`, `confirm(companyId, id, requester)`, `unconfirm(companyId, id, requester)`, `assertShift(companyId, id)`

**커버된 시나리오:**

- Single shift creation with valid DTO
- Invalid organization rejection
- Invalid shift type rejection
- Batch shift creation from template
- Batch creation with invalid template
- Draft shift update (offsite address)
- Update blocked when shift CONFIRMED
- Update fails for nonexistent shift
- Draft shift deletion
- Delete blocked when shift CONFIRMED
- Draft shift confirmation
- Confirm fails when already CONFIRMED
- GENERAL_ADMIN unconfirms CONFIRMED shift
- ORG_ADMIN forbidden from unconfirm
- Unconfirm fails when shift not CONFIRMED
- Weekly hours ≤52h returns null
- Weekly hours >52h returns warning message

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findAll` | ORG_ADMIN queries shifts from another organization via organizationId parameter | 권한 계층: ORG_ADMIN은 자기 조직만 조회 가능. 멀티테넌시 보안. |
| HIGH | `create` | ORG_ADMIN attempts to create shift in organization outside their scope | 멀티테넌시(보안 CRITICAL): 모든 DB 쓰기 where에 companyId 필수. 권한 계층: ORG_ADMIN은 자기 조직만. |
| HIGH | `bulkCreate` | ORG_ADMIN attempts batch creation in unauthorized organization | 멀티테넌시(보안 CRITICAL): 권한 계층: ORG_ADMIN scope 제한. |
| HIGH | `update` | ORG_ADMIN attempts to modify shift from different organization (cross-org shift ID) | 멀티테넌시: Organization ownership 검증 필요. ORG_ADMIN은 자기 조직만 수정. |
| MEDIUM | `bulkCreate` | Night shift (endAt before startAt) with dates spanning multiple days | 야간 근무 처리: endAt <= startAt 시 다음 날로 처리. 검증 부재. |
| MEDIUM | `bulkCreate` | Empty date range (startDate > endDate) | Input validation: dateRange 함수 검증 부재. |
| MEDIUM | `bulkCreate` | Multiple employees with night shift: verify all created with correct endAt adjustment | 일괄 생성 정확성: night shift 보정 모든 직원에 일관되게 적용. |
| MEDIUM | `checkWeeklyHours` | CANCELLED shift should not count toward weekly hours | 주 52시간 경고: CANCELLED 상태 제외 검증. |
| MEDIUM | `create` | Create returns warning when total weekly hours exceed 52h | 주 52시간 초과는 warning만. |
| MEDIUM | `bulkCreate` | bulkCreate returns warnings array for each employee exceeding 52h | 일괄 생성 후 각 직원별 주간 시간 경고. |
| MEDIUM | `unconfirm` | SUPER_ADMIN can unconfirm (verify both GENERAL_ADMIN and SUPER_ADMIN explicitly) | 권한 계층: SUPER_ADMIN(4) > GENERAL_ADMIN(3). unconfirm은 GENERAL_ADMIN 이상. |
| MEDIUM | `confirm` | Shift in DRAFT status can be confirmed (not already confirmed) | 상태머신: DRAFT→CONFIRMED 전이. |
| MEDIUM | `update` | Cannot update shiftTypeId if invalid even when other fields are valid | 관계 검증: validateShiftTypeBelongsToCompany 실패 시 BadRequestException. |
| MEDIUM | `update` | Partial update: modifying one field preserves unmodified fields | 근무일정 수정: 선택적 필드 업데이트만 반영. |
| LOW | `bulkCreate` | Large date range (30+ days) creates correct number of shifts | 일괄 생성 성능: dates.length × employeeIds.length 검증. |
| LOW | `findAll` | Empty filter returns all shifts in company | 필터 부재 시 전체 조회. |
| LOW | `findAll` | Filter by employeeId only (no organizationId/dates) | 필터 조합 유연성. |
| LOW | `findAll` | Filter by organizationId only | 필터 조합 유연성. |
| LOW | `remove` | Verify correct shift ID is deleted (not bulk accident) | 삭제 정확성: 의도한 shift만 제거. |
| LOW | `bulkCreate` | Template time parsing with non-00:00 boundary times (e.g., 13:30-22:45) | 템플릿 시간 처리: startTime/endTime UTC 기준 파싱. |

**의심 버그:**

- **[CRITICAL]** `findAll (lines 49-74)` — No permission scope check for ORG_ADMIN. Uses nested companyId filter (correct) but doesn't validate requester can query arbitrary organizationId. ORG_ADMIN from Org-A could query Org-B by passing organizationId filter. Should add guard: if ORG_ADMIN && organizationId provided, must match requester's organizationId.
- **[CRITICAL]** `create (lines 78-105)` — Missing permission validation. Does not check if requester (ORG_ADMIN/GENERAL_ADMIN) can create shifts in dto.organizationId. ORG_ADMIN could attempt cross-organization shift creation. The validateRelations() call on line 79 validates ORG exists but not if requester owns it.
- **[CRITICAL]** `bulkCreate (lines 109-187)` — Missing permission validation same as create(). ORG_ADMIN can batch-create shifts in other organizations without restriction. No requester scope check against dto.organizationId.
- **[HIGH]** `update (lines 191-216)` — assertShift() verifies shift belongs to company but not to requester's organization scope. If ORG_ADMIN, they could update shifts from other organizations by knowing the shift ID. Missing: validate shift.organizationId matches requester's scope.
- **[MEDIUM]** `bulkCreate (lines 174-186)` — No transaction wrapping createMany(). If warnings calculation fails after createMany (line 178+), shifts are orphaned. Should wrap in prisma.$transaction() to ensure atomic operation.
- **[MEDIUM]** `checkWeeklyHours (lines 331-353)` — Unclear status filter logic. Line 337 excludes CANCELLED but includes DRAFT. Should clarify: are DRAFT shifts counted toward warning? Should specification be explicit about which statuses participate in weekly hour calculation?
- **[MEDIUM]** `bulkCreate (lines 148-159)` — Night shift endAt adjustment has no bounds checking. If template defines startTime > endTime by >24h, code still adjusts to next day only. No validation that shift duration is reasonable (e.g., <48h).
- **[LOW]** `unconfirm (lines 260-264)` — AccessLevel comparison uses !== for both GENERAL_ADMIN and SUPER_ADMIN. While correct, logic could be clearer with explicit >= check or array includes. Minor clarity issue.

---

### timeclock-areas

- spec 존재: 예 · 기존 테스트 8개 · 권장 추가 14개
- public 메서드: `findAll`, `create`, `update`, `remove`

**커버된 시나리오:**

- findAll without organizationId filter returns all company areas
- findAll with valid organizationId validates org belongs to company
- findAll with invalid organizationId throws BadRequestException
- create with valid organization and GPS auth succeeds
- create with invalid organization throws BadRequestException
- update area name succeeds
- update non-existent area throws NotFoundException
- remove soft-deletes area (isActive=false)
- remove non-existent area throws NotFoundException

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findAll` | No role-based authorization validation - controller allows all authenticated users to query areas, service doesn't check if user is ORG_ADMIN/EMPLOYEE | 권한 계층: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1). ORG_ADMIN은 자기 조직만 접근 |
| HIGH | `update` | Missing role-based authorization and cross-organization access control - service doesn't validate user permission or prevent ORG_ADMIN from modifying areas in different organization | 권한 계층: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1). ORG_ADMIN은 자기 조직만, 타 조직 접근 시 403 |
| HIGH | `remove` | Missing role-based authorization and cross-organization access control - controller has no @Roles() decorator, service doesn't validate user permission | 권한 계층: SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1). ORG_ADMIN은 자기 조직만 접근 |
| HIGH | `create` | No test for organization boundary violation - missing negative test when ORG_ADMIN attempts to create area in different organization | ORG_ADMIN은 자기 조직만 접근 가능, 타 조직 접근 시 403 |
| MEDIUM | `update` | No test for partial update consistency - updating only some fields without verifying others (e.g., changing authMethod to gps without providing locationLat) | DTO superRefine validates interdependencies between authMethod and location fields |
| MEDIUM | `findAll` | No test for multiple areas filtering - only tests single result, doesn't verify organizationId filter works correctly with multiple areas |  |
| MEDIUM | `remove` | No test for soft-delete re-creation - doesn't verify behavior when attempting to recreate area with same name after soft deletion |  |
| LOW | `create` | No test for authMethod=none edge case - DTO allows 'none' authMethod but no test coverage of this special case |  |
| LOW | `update` | No test for no-op update (all fields undefined) - doesn't verify behavior when all DTO fields are undefined |  |
| LOW | `create` | Missing WiFi SSID validation in service - DTO validates presence but service doesn't re-validate before DB insertion |  |

**의심 버그:**

- **[HIGH]** `timeclock-areas.controller.ts:66-75 (update) and timeclock-areas.controller.ts:77-87 (remove)` — Missing @Roles(AccessLevel.ORG_ADMIN) authorization guards on PATCH and DELETE endpoints. Controller allows any authenticated user to update/delete areas without role validation. Service also doesn't check if ORG_ADMIN user's organizationId matches the area's organizationId.
- **[HIGH]** `timeclock-areas.service.ts:85-96 (assertArea)` — assertArea validates companyId but doesn't validate organizationId ownership. An ORG_ADMIN from org-A can call update(companyId, areaIdFromOrgB, dto) and assertArea will succeed if org-B belongs to same company. Missing organizationId check in WHERE clause.
- **[MEDIUM]** `timeclock-areas.service.ts:53-70 (update)` — update uses only 'id' in WHERE clause for Prisma query. While assertArea checks org via nested query, the actual UPDATE could theoretically operate on wrong area if companyId filtering fails upstream. Should include companyId in update WHERE for defense-in-depth.
- **[MEDIUM]** `timeclock-areas.controller.ts:43-52 (findAll)` — findAll endpoint has no @Roles decorator but should restrict to ORG_ADMIN or above per HR spec. Currently allows EMPLOYEE role to query all company areas regardless of their organization.
- **[LOW]** `timeclock-areas.service.ts:32-49 (create)` — create doesn't use $transaction. If validateOrganizationBelongsToCompany succeeds but timeclockArea.create fails, transaction consistency is not guaranteed (though risk is low for this simple operation).

---

### company-holidays

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 22개
- public 메서드: `findAll(companyId: string)`, `create(companyId: string, dto: CreateCompanyHolidayDto)`, `remove(companyId: string, id: string)`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findAll` | List holidays for a company with proper multitenant filtering | 멀티테넌시(보안 CRITICAL): 모든 DB 쿼리 where에 companyId 필수 |
| HIGH | `create` | Successfully create holiday with all fields provided |  |
| HIGH | `create` | Successfully create holiday with optional fields omitted (isAnnualRepeat, type defaults) |  |
| HIGH | `create` | Reject duplicate holiday on same date within same company | 휴일 중복 등록 방지 |
| HIGH | `create` | Allow same date holiday in different companies | 멀티테넌시: 타사 데이터와 격리 |
| HIGH | `create` | Store companyId correctly in created record | 멀티테넌시: 모든 write operation에 companyId 포함 |
| HIGH | `remove` | Successfully delete existing holiday belonging to company |  |
| HIGH | `remove` | Throw NotFoundException when holiday not found in company |  |
| HIGH | `remove` | Reject deletion by another company (multitenant isolation) | 멀티테넌시: 타사 데이터 삭제 방지 |
| MEDIUM | `findAll` | Empty result when company has no holidays |  |
| MEDIUM | `findAll` | Results ordered by holidayDate ascending |  |
| MEDIUM | `create` | Throw COMPANY_HOLIDAY_ALREADY_EXISTS error with correct code/message |  |
| MEDIUM | `create` | Handle invalid date format (non-YYYY-MM-DD, invalid dates like 2026-02-30) |  |
| MEDIUM | `create` | Preserve isAnnualRepeat=true when provided |  |
| MEDIUM | `create` | Default isAnnualRepeat to false when omitted |  |
| MEDIUM | `create` | Default type to 'custom' when omitted |  |
| MEDIUM | `remove` | Return {deleted: true} on successful deletion |  |
| MEDIUM | `remove` | Throw COMPANY_HOLIDAY_NOT_FOUND error with correct code/message |  |
| MEDIUM | `remove` | Validate UUID format before database query |  |
| MEDIUM | `remove` | Verify record actually deleted from database (idempotency/race condition) |  |
| MEDIUM | `create` | Date parsing timezone consistency - ensure YYYY-MM-DD is interpreted consistently | 날짜 변환 안정성 |
| MEDIUM | `create` | Duplicate check timezone edge case (same logical date in different TZ) | 멀티테넌시 + 날짜 정확성 |

**의심 버그:**

- **[CRITICAL]** `remove() line 51` — Security vulnerability: delete({ where: { id } }) omits companyId filter. Allows any authorized user to delete holidays from other companies if they know the ID. Must be delete({ where: { id, companyId } }) to enforce multitenant isolation.
- **[HIGH]** `create() line 17` — Date parsing ambiguity: new Date(dto.holidayDate) where input is YYYY-MM-DD string. This may be interpreted in local TZ or UTC, causing timezone-dependent behavior. Should explicitly specify timezone or use date-fns/dayjs with timezone handling.
- **[MEDIUM]** `create() line 20` — Duplicate detection uses exact Date equality on Prisma Date field. Timezone conversion during storage/comparison could yield false negatives (same calendar date in different TZ becomes different stored dates). Date comparison should be normalized.
- **[MEDIUM]** `remove() line 51` — No verification that delete actually succeeded. If prisma.companyHoliday.delete throws on not-found (which it should), the error handling is correct; but if called after the security check passes, success should be verified before returning {deleted: true}.

---

### company-settings

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 28개
- public 메서드: `get`, `getNumber`, `getAllForApi`, `patchFromApi`, `invalidate`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `get` | 캐시 키 생성 및 조회 — 정상 flow (캐시 HIT 시간 내에서) |  |
| HIGH | `get` | 캐시 만료 후 DB 재조회 — TTL 초과 시점에서 |  |
| HIGH | `get` | DB에 설정값이 없을 때 defaultValue 반환 |  |
| HIGH | `get` | DB에 설정값이 없고 defaultValue도 없을 때 SETTING_DEFAULTS에서 팔백 |  |
| HIGH | `getNumber` | 정상 숫자값 반환 |  |
| HIGH | `getNumber` | JSON value가 number가 아닐 때(문자열) Number() 변환 후 defaultValue 적용 |  |
| HIGH | `getNumber` | JSON value가 NaN / Infinity인 경우 defaultValue 반환 |  |
| HIGH | `getAllForApi` | SETTING_FIELD_MAP에 정의된 모든 필드를 camelCase로 반환 |  |
| HIGH | `getAllForApi` | DB에 값이 없는 필드는 SETTING_DEFAULTS에서 팔백 |  |
| HIGH | `getAllForApi` | 캐시 검증 — companyId별 독립적인 캐시 |  |
| HIGH | `patchFromApi` | 유효한 필드만 필터링 — SETTING_FIELD_MAP에 없는 필드는 무시 |  |
| HIGH | `patchFromApi` | undefined 값의 필드 무시 |  |
| HIGH | `patchFromApi` | transaction으로 여러 필드를 원자성 있게 저장 |  |
| HIGH | `patchFromApi` | upsert 동작 — 기존 설정이 없으면 create, 있으면 update |  |
| HIGH | `patchFromApi` | transaction 성공 후 invalidate(companyId) 호출 확인 |  |
| HIGH | `patchFromApi` | transaction 실패 시 캐시 무효화 안 됨 (원자성) |  |
| HIGH | `patchFromApi` | 캐시 무효화 후 새 getAllForApi 호출 — DB에서 즉시 최신값 반환 |  |
| HIGH | `invalidate` | 특정 companyId 캐시만 삭제 |  |
| HIGH | `loadCompany` | 첫 조회 시 DB에서 로드 후 캐시 저장 |  |
| HIGH | `loadCompany` | 캐시된 값 재사용 (같은 companyId, TTL 내) |  |
| HIGH | `loadCompany` | multitenancy — companyId 필터로 타사 데이터 노출 방지 |  |
| MEDIUM | `get` | DB에 설정값이 없고 defaultValue도 없고 SETTING_DEFAULTS도 없을 때 undefined 처리 |  |
| MEDIUM | `getNumber` | JSON value가 null일 때 처리 |  |
| MEDIUM | `getAllForApi` | DB와 SETTING_DEFAULTS 모두 없는 필드는 null 반환 |  |
| MEDIUM | `patchFromApi` | 빈 patch 객체 (모든 필드 필터링됨) — transaction 실행 안 함 |  |
| MEDIUM | `invalidate` | 여러 companyId 동시 invalidate — 독립 캐시 확인 |  |

**의심 버그:**

- **[MEDIUM]** `patchFromApi:111-120` — 에러 처리 부재 — transaction 실패 시 error가 caller로 전파되지만 명시적 에러 래핑이나 로깅 없음. 부분 실패(일부 upsert 성공, 일부 실패) 시 inconsistent state 가능성은 낮음(transaction 원자성), 하지만 네트워크/DB 에러 시 caller가 undefined 응답을 받을 수 있음
- **[MEDIUM]** `loadCompany:137` — 무한 캐시 적중 가능성 — expiresAt 기반 만료 로직은 정확하나, Date.now() 비교 시 밀리초 단위 레이스 조건은 없으나 서버 시간 점프(NTP 조정 등)에 취약할 수 있음. 프로덕션에선 매우 낮은 확률이지만 테스트 환경에선 주의 필요
- **[LOW]** `get:73` — 타입 안정성 — fallback 값이 (SETTING_DEFAULTS[key] as T)로 캐스팅되는데, SETTING_DEFAULTS가 실제로 T 타입을 보장하지 않음. 예: defaultValue 없고 SETTING_DEFAULTS도 없으면 undefined as T가 되는데, 이는 타입 체커를 우회하지만 런타임에 undefined를 반환
- **[LOW]** `patchFromApi:103-109` — 빈 entries 배열 시 transaction 호출 — entries.length === 0이면 transaction([])이 실행되는데, Prisma는 이를 no-op으로 처리하지만 불필요한 DB 라운드트립 발생

---

### permission-settings.service.ts

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 35개
- public 메서드: `getForApi`, `patchFromApi`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `getForApi` | Multitenant isolation - verify companyId is used in all readGroup lookups | 멀티테넌시: 모든 DB 쿼리 where에 companyId 필수. 누락 시 타사 데이터 노출 |
| HIGH | `getForApi` | Read all ORG_ADMIN_PERMISSION_FIELDS (7 fields) with default values |  |
| HIGH | `getForApi` | Read all EMPLOYEE_PERMISSION_FIELDS (3 fields) with default values |  |
| HIGH | `readGroup` | Type coercion: DB value is string/number instead of boolean, should use defaultValue |  |
| HIGH | `patchFromApi` | Empty patch object {orgAdmin: {}, employee: {}}, should not execute transaction |  |
| HIGH | `patchFromApi` | Partial patch with only orgAdmin fields, upsert only those records |  |
| HIGH | `patchFromApi` | Partial patch with only employee fields, upsert only those records |  |
| HIGH | `patchFromApi` | Patch with mixed orgAdmin and employee fields in single transaction |  |
| HIGH | `patchFromApi` | Upsert creates new CompanySetting records with correct companyId, section, key, value |  |
| HIGH | `patchFromApi` | Upsert updates existing CompanySetting records (unique constraint: companyId_section_key) |  |
| HIGH | `patchFromApi` | Transaction atomicity: if one upsert fails, all should rollback |  |
| HIGH | `patchFromApi` | Cache invalidation called after successful transaction |  |
| HIGH | `buildUpserts` | Upsert where clause uses correct composite key companyId_section_key | 멀티테넌시 companyId 필수 |
| HIGH | `buildUpserts` | Create clause includes all fields: companyId, section, key, value as Prisma.InputJsonValue |  |
| MEDIUM | `readGroup` | Field exists in DB with boolean true value |  |
| MEDIUM | `readGroup` | Field exists in DB with boolean false value |  |
| MEDIUM | `readGroup` | Field missing from DB, use provided defaultValue |  |
| MEDIUM | `readGroup` | Field missing from DB and defaultValue undefined, use SETTING_DEFAULTS fallback |  |
| MEDIUM | `patchFromApi` | Invalid field names in patch are silently filtered by buildUpserts |  |
| MEDIUM | `patchFromApi` | Patch with undefined values are filtered out |  |
| MEDIUM | `patchFromApi` | Patch with non-boolean values are filtered out (type guard at line 102) |  |
| MEDIUM | `patchFromApi` | Return value is fresh data via getForApi, not stale from memory |  |
| MEDIUM | `buildUpserts` | No patch provided (null/undefined), return empty array |  |
| MEDIUM | `buildUpserts` | Empty patch object, return empty array |  |
| MEDIUM | `buildUpserts` | Update clause only updates value field, preserves other fields |  |
| MEDIUM | `patchFromApi` | Concurrent patch requests to same company: final state is consistent |  |
| MEDIUM | `getForApi` | After patch, getForApi returns updated values via fresh read (not cache) |  |
| MEDIUM | `patchFromApi` | Error handling: if settingsService.invalidate throws, error propagates |  |
| MEDIUM | `patchFromApi` | Each ORG_ADMIN field individually updatable (employee_manage, employee_device_reset, etc) |  |
| MEDIUM | `patchFromApi` | Each EMPLOYEE field individually updatable (org_view_all, shift_view_others, attendance_view) |  |
| LOW | `readGroup` | PERMISSION_SECTION constant value 'permission' is used correctly in all lookups |  |
| LOW | `patchFromApi` | JSON value serialization: boolean true/false stored as JSON properly |  |
| LOW | `buildUpserts` | Field key mapping: ORG_ADMIN_PERMISSION_FIELDS keys map to correct DB keys |  |
| LOW | `buildUpserts` | Field key mapping: EMPLOYEE_PERMISSION_FIELDS keys map to correct DB keys |  |
| LOW | `patchFromApi` | Multiple patch cycles: invalidate is called each time |  |

**의심 버그:**

- **[HIGH]** `patchFromApi (line 70-71)` — Race condition: settingsService.invalidate(companyId) is called AFTER $transaction completes. If invalidate fails or throws, cache becomes inconsistent and subsequent reads return stale data. Fix: Call invalidate inside transaction or use try-catch.
- **[MEDIUM]** `readGroup (line 89)` — Type coercion risk: If DB stores JSON value as string '"true"' instead of boolean true, the typeof check fails and defaultValue is used silently. No validation that DB value is actual boolean type. Consider explicit type guard or parsing.
- **[MEDIUM]** `patchFromApi (line 70)` — No error handling on $transaction: If transaction fails mid-way, settingsService.invalidate() is never called, but if it was partially applied, cache and DB diverge. Add try-catch or wrap in async handler.
- **[LOW]** `buildUpserts (line 102)` — Incomplete validation of patch structure: Filter checks 'fields[field] !== undefined && typeof value === boolean' but doesn't validate that field names exactly match expected keys. Relies on controller Zod validation. Low risk but consider adding explicit field name whitelist check.

---

### document-forms.service

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 20개
- public 메서드: `findAll`, `create`, `update`, `remove`, `getNumberRule`, `upsertNumberRule`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findAll` | 활성 양식과 비활성 양식 구분 검증 - 비활성 양식은 제외되어야 함 | 양식 라이프사이클: isActive=true만 조회 대상 |
| HIGH | `findAll` | companyId 필터링 검증 - 타사 양식은 반환되면 안 됨 | 멀티테넌시: 모든 쿼리 where에 companyId 필수 |
| HIGH | `update` | 존재하지 않는 formId 접근 - NotFoundException 발생 |  |
| HIGH | `update` | 타사 companyId 양식 접근 - NotFoundException 발생 (assertFormBelongsToCompany) | 멀티테넌시: 다른 회사의 양식 접근 시 403/404 |
| HIGH | `remove` | 존재하지 않는 formId 삭제 - NotFoundException 발생 |  |
| HIGH | `remove` | 타사 companyId 양식 삭제 - NotFoundException 발생 | 멀티테넌시: 타사 리소스 접근 불가 |
| HIGH | `getNumberRule` | 존재하지 않는 formId - NotFoundException 발생 |  |
| HIGH | `getNumberRule` | 타사 companyId 양식 규칙 조회 - NotFoundException 발생 | 멀티테넌시 검증 |
| HIGH | `upsertNumberRule` | 존재하지 않는 formId - NotFoundException 발생 |  |
| HIGH | `upsertNumberRule` | 타사 companyId 양식 규칙 upsert - NotFoundException 발생 | 멀티테넌시 검증 |
| HIGH | `upsertNumberRule` | 신규 생성 - 규칙이 없을 때 create 호출 |  |
| HIGH | `upsertNumberRule` | 기존 규칙 업데이트 - 규칙이 있을 때 update 호출 |  |
| HIGH | `upsertNumberRule` | Race condition 검증 - 동시에 두 요청이 upsert 시도할 때 중복 생성 또는 제약 위반 발생 가능 | 양식당 1개 규칙 제약: $transaction 또는 고유 제약 필요 |
| MEDIUM | `findAll` | 정렬 순서 검증 - sortOrder 오름차순 후 name 오름차순 |  |
| MEDIUM | `create` | 기본값 적용 확인 - sortOrder=0, allowReDraft=false, allowPreApproval=false, isActive=true |  |
| MEDIUM | `create` | formOwnerId 필드 설정 - DTO에 없으므로 null로 기본값 설정되는지 확인 | 양식 생성 후 formOwnerId는 null 또는 생성자 ID로 설정되어야 함 |
| MEDIUM | `create` | fieldsSchema JSON 저장 - 복잡한 JSON 구조 저장 가능 여부 |  |
| MEDIUM | `update` | 비활성 양식(isActive=false) 수정 가능 여부 - assertFormBelongsToCompany가 isActive 무시함 | 비활성 리소스는 수정 불가 원칙 |
| MEDIUM | `update` | isActive 필드를 UpdateDocumentFormDto로 전달 - 소프트 삭제 후 재활성화 가능한가? |  |
| MEDIUM | `update` | 부분 업데이트 - name만 수정할 때 다른 필드는 유지 |  |
| MEDIUM | `update` | fieldsSchema 업데이트 - JSON 구조 변경 가능 여부 |  |
| MEDIUM | `remove` | 비활성 양식 재삭제 - assertFormBelongsToCompany가 isActive 무시하므로 가능 |  |
| MEDIUM | `getNumberRule` | 규칙이 없을 때 - null 또는 undefined 반환 |  |
| MEDIUM | `getNumberRule` | 규칙이 있을 때 - 전체 필드(id, companyId, formId, pattern, currentSeq, resetYearly) 반환 |  |
| MEDIUM | `upsertNumberRule` | currentSeq 초기화 - 신규 생성 시 0으로 설정되는지 확인 |  |
| LOW | `findAll` | 빈 배열 반환 - 양식이 없을 때 |  |
| LOW | `create` | category optional 필드 - null 값 저장 |  |
| LOW | `remove` | 삭제 후 응답 형식 { deleted: true } |  |
| LOW | `upsertNumberRule` | resetYearly 필드 반영 - 패턴에 {YYYY} 토큰이 있으면 resetYearly=true 검증 | 채번 규칙: resetYearly는 연도별 초기화 플래그 |

**의심 버그:**

- **[MEDIUM]** `assertFormBelongsToCompany (lines 106-117)` — isActive 필드 미검증으로 비활성 양식(isActive=false)에도 접근 가능. 소프트 삭제된 양식을 update/remove/getNumberRule로 접근할 수 있음. 의도적이면 문제 없으나 비활성 리소스 보호 원칙 위반.
- **[MEDIUM]** `upsertNumberRule (lines 87-96)` — Race condition: findFirst → create/update 사이에 다른 요청이 동일 formId로 create를 시도하면 DB 제약 위반. 양식당 1개 규칙 보장을 위해 $transaction 필요.
- **[MEDIUM]** `assertFormBelongsToCompany (lines 111-114)` — NotFoundException 생성자에 객체를 전달 중: throw new NotFoundException({ code, message }). NestJS NotFoundException은 string만 수용하며, 객체는 JSON.stringify 후 메시지로 사용됨. API 응답 형식 오류 가능성.
- **[LOW]** `create (lines 28-39)` — formOwnerId 필드가 DocumentForm 스키마에 정의되어 있으나 create() DTO에 없음. 설계 의도 확인 필요: null로 설정하거나 요청자 ID로 자동 설정할 것인지.

---

### proxy-settings

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 28개
- public 메서드: `findMine`, `create`, `update`, `remove`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findMine` | companyId 필터 없이 다른 회사 직원의 대리결재 설정을 조회할 수 있음 |  |
| HIGH | `create` | proxyId가 비활성(isActive=false) 직원인 경우 거부 |  |
| HIGH | `create` | proxyId가 다른 회사 소속인 경우 거부 |  |
| HIGH | `create` | 본인을 대리인으로 지정 시도 (dto.proxyId === employeeId) |  |
| HIGH | `update` | 다른 직원의 설정을 수정하려 시도 (companyId 검증 없음) |  |
| HIGH | `update` | 존재하지 않는 settingId로 수정 시도 |  |
| HIGH | `update` | endDate를 startDate보다 이전 날짜로 수정 시도 |  |
| HIGH | `remove` | 다른 직원의 설정을 삭제하려 시도 (companyId 검증 없음) |  |
| HIGH | `remove` | 존재하지 않는 settingId로 삭제 시도 |  |
| HIGH | `create` | 정상적인 대리결재 설정 생성 (모든 필드 유효) |  |
| HIGH | `update` | 정상적인 설정 수정 (endDate 변경) |  |
| MEDIUM | `findMine` | 결과가 createdAt 역순으로 정렬되는지 검증 |  |
| MEDIUM | `create` | 시작일 == 종료일 (같은 날짜) |  |
| MEDIUM | `create` | 과거 시작일 설정 |  |
| MEDIUM | `update` | endDate만 수정 (isActive 생략) |  |
| MEDIUM | `update` | isActive만 수정 |  |
| MEDIUM | `update` | endDate와 isActive 동시 수정 |  |
| MEDIUM | `remove` | 삭제 성공 시 { deleted: true } 반환 |  |
| LOW | `create` | reason이 null/undefined인 경우 정상 저장 |  |
| LOW | `findMine` | 빈 결과 처리 (설정이 없을 때) |  |

**의심 버그:**

- **[CRITICAL]** `findMine:14-17` — companyId 필터 없음. 사용자가 employeeId를 알면 다른 회사 직원의 대리결재 설정을 조회 가능. principal의 companyId로 검증 필요.
- **[CRITICAL]** `assertOwnSetting:77-88` — companyId 검증 없음. update/remove 시 principalId만 확인하므로 다른 회사의 employeeId가 principalId를 알면 타사 설정 수정/삭제 가능. principal 관계로 companyId 검증 필요.
- **[HIGH]** `create:39-47` — ProxySettings 테이블에 companyId 열이 없음. 현재는 Employee 관계로만 회사 검증 가능하지만, 향후 직접 쿼리 시 테넌시 누락 위험. 스키마에 companyId 추가 권장.
- **[MEDIUM]** `update:53` — endDate < startDate 비교 시 타입 불일치. dto.endDate는 string, setting.startDate는 Date이므로 new Date() 변환 후 비교 필요.

---

### SharedApprovalLinesService

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 18개
- public 메서드: `findAll(companyId: string)`, `create(companyId: string, dto: CreateSharedLineDto)`, `update(companyId: string, lineId: string, dto: UpdateSharedLineDto)`, `remove(companyId: string, lineId: string)`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `create` | assigneeId가 다른 company에 속한 직원일 때 정상 거부 | 멀티테넌시: 모든 DB 쿼리 where에 companyId 필수 |
| HIGH | `create` | steps 배열에 존재하지 않는 assigneeId 포함시 EMPLOYEE_NOT_FOUND 에러 | 결재선 구성원 검증 — 자사 소속 직원만 추가 가능 |
| HIGH | `update` | 존재하지 않는 lineId로 업데이트 시 NotFoundException throw | 권한 분기: 다른 companyId 라인에 접근 불가 |
| HIGH | `update` | 다른 companyId의 lineId로 업데이트 시 정상 거부 (테넌시 격리) | 멀티테넌시: assertLineBelongsToCompany 검증 동작 확인 |
| HIGH | `update` | steps 변경 시 새로운 assigneeId가 다른 company에 속하면 거부 | 멀티테넌시: 업데이트 시에도 assignee 소속 검증 |
| HIGH | `remove` | 존재하지 않는 lineId로 삭제 시 NotFoundException throw | 권한 분기: 다른 companyId 라인에 접근 불가 |
| HIGH | `remove` | 다른 companyId의 lineId로 삭제 시 정상 거부 (테넌시 격리) | 멀티테넌시: assertLineBelongsToCompany 검증 동작 확인 |
| HIGH | `remove` | 진행 중인 문서에서 참조 중인 공용 결재선 삭제 시 P2003 에러 → BadRequestException (code: SHARED_LINE_IN_USE) | 에러코드: SHARED_LINE_IN_USE — 외래키 제약 조건 위반 |
| HIGH | `findAll` | 다른 companyId로 조회 시 해당 company의 라인만 반환 | 멀티테넌시: findMany where { companyId } 필터 검증 |
| MEDIUM | `update` | steps 변경 시 version이 increment되는지 확인 | 변경 이력 추적 — steps 변경 시 version += 1 |
| MEDIUM | `update` | name만 변경할 때 version이 변경되지 않는지 확인 | 버전 관리: name 변경은 version increment 안 함 |
| MEDIUM | `update` | name과 steps를 동시에 변경할 때 정상 반영 및 version increment | 복합 업데이트 시나리오 |
| MEDIUM | `remove` | 참조 중이 아닌 공용 결재선 정상 삭제 및 { deleted: true } 응답 | 삭제 성공 케이스 및 응답 구조 검증 |
| MEDIUM | `findAll` | 같은 company 내 여러 공용 결재선을 이름순으로 조회 | 목록 조회 시 companyId 필터 및 orderBy name 동작 |

**의심 버그:**

- **[MEDIUM]** `update method, line 36-43` — update 메서드에서 Prisma update의 where 절에 companyId를 명시하지 않음. assertLineBelongsToCompany가 먼저 호출되므로 실제 버그는 아니지만, companyId 필터가 없으면 assertLineBelongsToCompany 호출을 우회할 경우 다른 company의 라인을 수정할 수 있음. where { id: lineId, companyId }로 변경 권장.
- **[MEDIUM]** `remove method, line 50` — delete 메서드에서 Prisma delete의 where 절에 companyId를 명시하지 않음. 마찬가지로 assertLineBelongsToCompany가 사전에 검증하므로 현재는 안전하지만, 방어 코드로서 where { id: lineId, companyId }로 변경 권장.
- **[LOW]** `remove method, line 51-59` — Prisma 에러 핸들링이 P2003에만 제한적. 다른 예상치 못한 에러(예: P2025 record not found)는 그대로 throw됨. 현재는 assertLineBelongsToCompany가 NotFoundException을 먼저 throw하므로 P2025는 발생하지 않지만, 에러 처리 로직 강화 고려.
- **[LOW]** `assertLineBelongsToCompany method, line 68-78` — companyId 검증은 정상이나, 반환값이 사용되지 않는 메서드도 있음(create). 코드 일관성상 void 반환으로 변경 가능하지만, 현재 설계는 기존 라인 정보를 return 하고 있으므로 미래 용도를 고려한 것으로 보임.

---

### mail

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 28개
- public 메서드: `sendInviteCode`, `sendPasswordReset`, `sendMessageMail`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `sendInviteCode` | companyName with HTML/script injection characters | XSS prevention - user input must be escaped in HTML context |
| HIGH | `sendInviteCode` | invitation email sent successfully to valid email |  |
| HIGH | `sendInviteCode` | invitation email send fails with SMTP error |  |
| HIGH | `sendPasswordReset` | reset link with token containing special URL characters | URL parameters must be properly encoded |
| HIGH | `sendPasswordReset` | password reset email sent successfully to valid email |  |
| HIGH | `sendPasswordReset` | password reset email send fails with SMTP error |  |
| HIGH | `sendMessageMail` | message email sent successfully with properly escaped content |  |
| HIGH | `sendMessageMail` | message email send fails but does not throw (fire-and-forget) | Intentional error swallowing - message saved even if email fails |
| HIGH | `sendMessageMail` | message with title containing HTML/script tags | XSS prevention - content and title properly escaped |
| HIGH | `sendMessageMail` | message with content containing HTML/script tags | XSS prevention - pre-wrap with escaped content |
| HIGH | `escapeHtml` | all HTML special characters properly escaped (&, <, >, ", ') | XSS prevention - utility function correctness |
| MEDIUM | `sendInviteCode` | invitation email with empty or invalid to parameter |  |
| MEDIUM | `sendInviteCode` | logger.log called on successful send |  |
| MEDIUM | `sendInviteCode` | logger.error called on send failure |  |
| MEDIUM | `sendPasswordReset` | password reset with empty or invalid to parameter |  |
| MEDIUM | `sendPasswordReset` | logger.log called on successful send |  |
| MEDIUM | `sendPasswordReset` | logger.error called on send failure |  |
| MEDIUM | `sendMessageMail` | message with empty or invalid to parameter |  |
| MEDIUM | `sendMessageMail` | logger.log called on successful send |  |
| MEDIUM | `sendMessageMail` | logger.error called on send failure (but not thrown) |  |
| MEDIUM | `constructor` | ConfigService returns valid email configuration |  |
| MEDIUM | `constructor` | nodemailer transporter initialized with default SMTP settings |  |
| MEDIUM | `constructor` | nodemailer transporter initialized with custom config from env vars |  |
| MEDIUM | `escapeHtml` | already-escaped content double-escaping prevention |  |
| LOW | `escapeHtml` | empty string handling |  |

**의심 버그:**

- **[CRITICAL]** `sendInviteCode, line 44` — companyName parameter directly interpolated into HTML template without escaping. Allows XSS injection via company name containing <script> or event handlers. Should use escapeHtml(companyName).
- **[HIGH]** `sendPasswordReset, line 70` — token parameter directly concatenated into URL without URL encoding. Special characters in token (?, &, =, #, etc.) can break URL structure or enable injection. Should use encodeURIComponent(token).
- **[MEDIUM]** `sendInviteCode/sendPasswordReset/sendMessageMail` — No validation of 'to' parameter. Empty strings, non-email strings, or null values would be passed to nodemailer. Should validate email format.
- **[MEDIUM]** `constructor, line 28-36` — Transporter initialization does not verify email configuration is valid. If MAIL_USER/MAIL_PASS are empty strings, transporter creation succeeds but sending will fail later. Should validate auth config.

---

### discord-webhook

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 14개
- public 메서드: `send`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `send` | Invalid webhook URL (empty string, non-URL format, null/undefined) | Input validation — webhookUrl must be non-empty, valid URL before axios.post |
| HIGH | `send` | Network errors (timeout, ECONNREFUSED, ENOTFOUND, ETIMEDOUT) | Retry logic must handle transient network errors; verify exponential backoff (1s, 2s) is applied |
| HIGH | `send` | HTTP 4xx errors (400 invalid webhook, 401 auth, 404 not found) — should not retry | Distinguish non-retryable (4xx) from retryable (5xx, network) errors; fail fast on 4xx |
| HIGH | `send` | HTTP 429 (rate limit) — should respect Retry-After header or exponential backoff | Discord webhook rate limits require proper backoff; current fixed delays may not respect limits |
| HIGH | `send` | Invalid embed parameter (null, undefined, non-object) | Embed must be object type; type signature allows object but not validated at runtime |
| MEDIUM | `send` | Successful send on first attempt — verify no retry occurs | Early return on success; should not invoke setTimeout |
| MEDIUM | `send` | Successful send on 2nd or 3rd attempt — verify retry with backoff | Exponential backoff: 1s before retry 2, 2s before retry 3 |
| MEDIUM | `send` | Final failure after 3 attempts — verify error is thrown with context | Error thrown from final attempt should include HTTP code/message for debugging |
| MEDIUM | `send` | Logger warning called on each failed attempt | Each retry should log 'Discord webhook attempt X failed' with error details |
| MEDIUM | `send` | Concurrent send() calls with same webhookUrl — retries do not block each other | No shared state between concurrent calls; each retry is independent |
| MEDIUM | `send` | Whitespace in webhookUrl (leading/trailing spaces) — should be trimmed or rejected | URL passed from NotificationRule may contain unintended whitespace |
| LOW | `send` | Large embed payload (>10MB) — axios request size limit | Discord API has payload size limits; oversized embeds should fail with clear error |
| LOW | `send` | Malformed response from Discord (non-2xx success, invalid JSON response body) | axios may throw on invalid response; error handling should be robust |
| LOW | `send` | Error type narrowing — ensure error.message is safely accessed | Catch block accesses error properties without type guard; use instanceof Error check |

**의심 버그:**

- **[HIGH]** `discord-webhook.service.ts:8-19 (send method)` — No input validation on webhookUrl — empty string, non-URL, or null could be passed to axios.post; should validate URL format before attempt loop
- **[HIGH]** `discord-webhook.service.ts:8-19 (send method)` — Type parameter embed: object is non-specific; caller (NotificationListener line 88) spreads embedTemplate + payload without validating embed shape; could send invalid Discord embed structure
- **[HIGH]** `discord-webhook.service.ts:13 (catch block)` — Error caught as generic 'e' without type narrowing; axios throws AxiosError with response.status, but code accesses e directly without instanceof check; error.message may be undefined
- **[HIGH]** `discord-webhook.service.ts:15 (throw)` — Error thrown on final attempt without context enrichment — caller (NotificationListener) logs message but loses HTTP status code; should wrap error with code + status for logging
- **[MEDIUM]** `discord-webhook.service.ts:13-15 (retry logic)` — No differentiation between retryable (5xx, network timeout) and non-retryable (4xx invalid webhook) errors; should fail fast on 400/401/404 instead of retrying 3 times
- **[MEDIUM]** `discord-webhook.service.ts:16 (setTimeout)` — Fixed backoff delays (1s, 2s) do not respect Discord rate limit Retry-After header; concurrent/repeated failures may hit 429 rate limits repeatedly
- **[LOW]** `discord-webhook.service.ts:14 (logger.warn)` — Log message 'Discord webhook attempt X failed' does not include error code/message; makes debugging webhook failures difficult without access to application logs

---

### notifications

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 28개
- public 메서드: `getRules`, `createRule`, `updateRule`, `updateWebhook`, `updateEventRule`, `getLogs`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `getRules` | SUPER_ADMIN cross-company query via queryCompanyId param (authorization + data isolation) | Multi-tenancy: Cross-tenant queries must be explicitly audited and role-verified |
| HIGH | `updateRule` | Rule not found by id+companyId (404 response) |  |
| HIGH | `updateRule` | Companyid isolation: attempt update with wrong companyId should fail (403) | Multi-tenancy: All DB queries must filter by companyId to prevent unauthorized access |
| HIGH | `updateWebhook` | Create default rules when count=0 (all 7 DEFAULT_EVENT_TYPES created atomically) |  |
| HIGH | `updateWebhook` | Atomic failure scenario: createMany partially fails midway (transaction coverage) | HR 요청→전자결재: $transaction으로 다중 레코드 생성 원자성 보장 |
| HIGH | `getLogs` | Company isolation: logs filtered via rule.companyId join (verify nested where clause) | Multi-tenancy: Nested company filtering through relation must be enforced |
| MEDIUM | `getRules` | Pagination boundary conditions (page=1 with limit=100, large offset, missing page/limit params) |  |
| MEDIUM | `createRule` | All field combinations with optional JSON fields (triggerCondition, embedTemplate null/undefined/object) |  |
| MEDIUM | `updateRule` | Partial updates: only eventType, only webhookUrl, mixed fields |  |
| MEDIUM | `updateWebhook` | Empty string webhookUrl converts to null (line 101) |  |
| MEDIUM | `updateWebhook` | Update existing rules when count>0 (updateMany operation) |  |
| MEDIUM | `updateEventRule` | Update existing rule (existing rule found) |  |
| MEDIUM | `updateEventRule` | Create new rule when not exists, inheriting webhookUrl from sibling |  |
| MEDIUM | `updateEventRule` | Create new rule when no sibling exists (webhookUrl=null) |  |
| MEDIUM | `getLogs` | Date range filtering (startDate and endDate, inclusive bounds) |  |
| MEDIUM | `getLogs` | Filter by ruleId, status, date combinations (conditional where clauses) |  |
| MEDIUM | `getLogs` | Pagination edge cases (page boundaries, limit validation 1-100) |  |
| LOW | `getRules` | Empty result set (count=0, items=[]) |  |
| LOW | `createRule` | Invalid messageTemplateId UUID format (should be caught by DTO validation) |  |
| LOW | `updateEventRule` | Verify eventType deduplication per company (same eventType should not duplicate) |  |
| LOW | `getLogs` | Empty logs result set (no matching filters) |  |
| LOW | `getLogs` | Invalid date format in startDate/endDate (DTO validation) |  |

**의심 버그:**

- **[CRITICAL]** `updateRule:line 77-78` — Missing companyId in update WHERE clause. update({where:{id}}) allows updating ANY rule across companies. Should be update({where:{id, companyId}}) to enforce tenant isolation. This is a direct multi-tenant data exposure vulnerability.
- **[HIGH]** `updateWebhook:line 106-114` — createMany() is not wrapped in $transaction, risking partial creation if process crashes mid-operation. If 4 of 7 rules created then server crashes, database is in inconsistent state. Should use: await this.prisma.$transaction([...createMany calls])
- **[MEDIUM]** `updateEventRule:line 155` — Fallback to null webhookUrl when no sibling found (line 155: sibling?.webhookUrl ?? null). If all rules had null webhookUrl, new rule inherits null silently without warning. May be intended, but underdocumented edge case.
- **[MEDIUM]** `getRules:line 35` — queryCompanyId override allows SUPER_ADMIN to query other companies. While controller enforces SUPER_ADMIN, this creates privilege escalation risk if role check ever fails. Recommend adding explicit SUPER_ADMIN check or audit logging.

---

### custom-types.service.ts

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 20개
- public 메서드: `findAll(companyId: string)`, `create(companyId: string, dto: CreateCustomRequestTypeDto)`, `update(companyId: string, id: string, dto: UpdateCustomRequestTypeDto)`, `remove(companyId: string, id: string)`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `create` | Create custom request type without verifying companyId ownership | 멀티테넌시: 모든 생성 작업 전 companyId 권한 검증 필수 |
| HIGH | `update` | Delete fields from other company's types when id collision occurs (deleteMany lacks companyId filter) | 멀티테넌시: 모든 DB 쿼리 WHERE절에 companyId 필수. 누락 시 타사 데이터 노출 |
| MEDIUM | `update` | Update with empty fields array - no validation that type should have at least 1 field | 필드 무결성: 커스텀 요청 유형은 최소 1개 필드 필수 여부 명시 필요 |
| MEDIUM | `create` | Validate field array items (duplicate fieldNames, invalid fieldType, malformed options) | 입력 검증: DTO 스키마에서만 필드 유효성 검사, 서비스는 신뢰함 |
| MEDIUM | `findAll` | Return custom request types excluding inactive ones (isActive filter not specified) | 소프트 삭제 패턴: 조회 시 활성 여부 필터 적용 여부 명시 필요 |
| MEDIUM | `update` | Concurrent update on same type + field deletion - race condition possible without pessimistic locking | 트랜잭션 원자성: $transaction 사용하나 findOneOrThrow 후 deleteMany 사이 경합 조건 가능 |
| MEDIUM | `create` | Verify sortOrder assigned correctly when creating fields with index mapping | 필드 순서: toFieldData에서 index 기반 sortOrder 할당, 0-based vs 1-based 명시 |
| LOW | `remove` | Verify NotFoundException includes proper error code format | 에러코드: CUSTOM_REQUEST_TYPE_NOT_FOUND 형식 일관성 |

**의심 버그:**

- **[CRITICAL]** `update method, line 44: deleteMany({ where: { customTypeId: id } })` — Missing companyId filter in deleteMany. If two companies have custom types with the same UUID (unlikely but possible), one company could delete the other's fields. The subsequent update checks companyId via findOneOrThrow, but the delete is unprotected.
- **[HIGH]** `create method, lines 22-36` — No validation that companyId exists or that the requester has permission to create types in this company. Unlike update/remove which use findOneOrThrow, create trusts the caller completely.
- **[MEDIUM]** `findAll method, line 14-19` — No explicit filter for isActive=true. The method returns inactive custom request types. Confirm if this is intentional (soft-deleted types should be hidden by default).
- **[LOW]** `toFieldData helper, line 81-93` — Uses array index directly as sortOrder, which is 0-based. Confirm this matches frontend expectations and doesn't cause issues with zero-based vs one-based sorting.

---

### shift-types

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 14개
- public 메서드: `findAll`, `create`, `update`, `remove`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `update` | 다른 회사의 근무일정을 수정할 수 없는지 검증 (보안) | 멀티테넌시: update where절에 companyId 필수, 누락 시 타사 데이터 노출 = 버그 |
| HIGH | `remove` | 다른 회사의 근무일정을 삭제할 수 없는지 검증 (보안) | 멀티테넌시: remove where절에 companyId 필수, 누락 시 타사 데이터 노출 = 버그 |
| MEDIUM | `findAll` | 조직이 여러 개이고 비활성 레코드가 섞여있을 때 활성 레코드만 반환하는지 검증 | isActive=true 필터링 및 name 정렬 순서 검증 |
| MEDIUM | `create` | 필수 필드(name) 누락 시 에러 처리 | Zod 검증으로 name min length 1 강제 |
| MEDIUM | `update` | 존재하지 않는 근무일정 수정 시 NotFoundException 검증 | SHIFT_TYPE_NOT_FOUND 에러코드 및 메시지 형식 검증 |
| MEDIUM | `update` | 부분 업데이트(partial DTO)가 올바르게 동작하는지 검증 | UpdateShiftTypeSchema는 partial이므로 선택 필드만 수정 가능해야 함 |
| MEDIUM | `remove` | 존재하지 않는 근무일정 삭제 시 NotFoundException 검증 | SHIFT_TYPE_NOT_FOUND 에러코드 일관성 |
| MEDIUM | `remove` | 소프트 삭제 검증: isActive가 false로 설정되고 레코드가 물리 삭제되지 않음 | isActive=false 로직이 정확히 동작해야 findAll에서 제외됨 |
| MEDIUM | `findOneOrThrow` | 에러 응답 형식: { code, message } 구조 검증 | 에러코드: [도메인]_[상황] (SHIFT_TYPE_NOT_FOUND) |
| LOW | `findAll` | 빈 조직의 근무일정 조회 | 조회 결과가 빈 배열인지 확인 |
| LOW | `create` | 기본값(default) 필드가 올바르게 설정되는지 검증 | isOvertime, isNight, isHoliday, isDeemedWork 모두 default=false |
| LOW | `create` | name이 최대길이(100)를 초과할 때 에러 | Zod max(100) 검증 |
| LOW | `update` | null 값으로 선택 필드 초기화(name 제외) | color, confirmedAlert 등 optional 필드를 null로 설정 가능 |
| LOW | `remove` | 동일한 근무일정을 연속 삭제할 때 멱등성 검증 | 두 번째 삭제 시 NotFoundException 발생 확인 |

**의심 버그:**

- **[CRITICAL]** `shift-types.service.ts:44` — update() 메서드에서 Prisma where절에 companyId 필터 누락. 다른 회사의 근무일정을 수정할 수 있는 멀티테넌시 보안 취약점. findOneOrThrow()로 companyId 검증 후 Prisma update를 호출하지만, findOneOrThrow와 update 사이에 경합 조건(TOCTOU) 가능. 즉 체크 후 업데이트 사이에 다른 요청이 isActive를 변경할 수 있음. where절을 { id, companyId }로 수정 필요.
- **[CRITICAL]** `shift-types.service.ts:49` — remove() 메서드에서 Prisma update where절에 companyId 필터 누락. 다른 회사의 근무일정을 soft-delete할 수 있는 멀티테넌시 보안 취약점. findOneOrThrow()는 companyId를 검증하지만 update 쿼리는 companyId 없이 실행되어 ID만 일치하면 삭제됨. where절을 { id, companyId }로 수정 필요.
- **[MEDIUM]** `shift-types.service.ts:43-45` — update()에서 findOneOrThrow() 호출 후 Prisma update 호출 사이의 TOCTOU(Check-Time-of-Use) 취약점. 다중 인스턴스 환경에서 findOneOrThrow와 update 사이에 다른 요청이 레코드를 삭제하거나 수정할 수 있음. $transaction으로 원자적 처리 필요.
- **[MEDIUM]** `shift-types.service.ts:47-50` — remove()에서도 findOneOrThrow() 후 update 사이의 TOCTOU 경합 조건 존재. 두 쿼리를 $transaction으로 감싸야 함.
- **[LOW]** `shift-types.service.ts:36-40` — create() DTO가 controller의 ZodValidationPipe로 검증되지만, service 계층에서 재검증이 없음. DTO 타입은 보장되지만 비즈니스 룰(예: name 중복, category enum 값) 검증 없음.

---

### standardization-rules

- spec 존재: **아니오 (신규 작성 대상)** · 기존 테스트 0개 · 권장 추가 28개
- public 메서드: `findAll`, `create`, `update`, `remove`

**커버리지 갭 (우선순위순):**

| 우선 | 메서드 | 시나리오 | 관련 룰 |
|:--:|---|---|---|
| HIGH | `findAll` | 반환 데이터의 정렬 순서 검증 (isDefault DESC, createdAt ASC) | 기본 규칙이 우선 표시되어야 함 |
| HIGH | `findAll` | 다른 회사(companyId)의 규칙이 조회되지 않는지 검증 (멀티테넌시) | companyId 필터링 누락 시 타사 데이터 노출 |
| HIGH | `findAll` | isActive=false인 규칙이 제외되는지 검증 | 소프트 삭제된 항목은 조회되지 않아야 함 |
| HIGH | `create` | 기본 규칙 생성 시 기존 기본 규칙이 제거되는지 검증 | isDefault=true일 때 다른 모든 isDefault=true 규칙을 false로 업데이트하는 트랜잭션 |
| HIGH | `create` | 트랜잭션 원자성: 기본 규칙 업데이트 중 실패 시 생성 롤백 | $transaction으로 atomicity 보장 |
| HIGH | `create` | companyId가 자동 추가되는지 검증 (멀티테넌시) | API 경로에서 전달된 companyId만 사용, 요청 본문에서 override 불가 |
| HIGH | `update` | 부분 업데이트: name만 업데이트 | 전달된 필드만 업데이트, 나머지는 유지 |
| HIGH | `update` | 부분 업데이트: isDefault를 true로 변경 시 기존 기본 규칙 제거 | 기본 규칙 전환 시 다른 규칙의 isDefault=false로 업데이트 |
| HIGH | `update` | 존재하지 않는 규칙 ID로 업데이트 시도 → NotFoundException | 에러 코드: STANDARDIZATION_RULE_NOT_FOUND |
| HIGH | `update` | 다른 회사의 규칙을 업데이트하려는 시도 차단 (멀티테넌시) | companyId 검증으로 타사 규칙 접근 방지 |
| HIGH | `update` | 트랜잭션 원자성: isDefault 변경 중 실패 시 다른 변경사항도 롤백 | $transaction으로 atomicity 보장 |
| HIGH | `remove` | 소프트 삭제: isActive=false, isDefault=false로 업데이트 | 하드 삭제 대신 isActive 플래그 변경 |
| HIGH | `remove` | 존재하지 않는 규칙 ID로 삭제 시도 → NotFoundException | 에러 코드: STANDARDIZATION_RULE_NOT_FOUND |
| HIGH | `remove` | 다른 회사의 규칙을 삭제하려는 시도 차단 (멀티테넌시) | companyId 검증으로 타사 규칙 접근 방지 |
| HIGH | `findOneOrThrow` | 존재하는 규칙 반환 | isActive=true인 규칙만 조회 |
| MEDIUM | `findAll` | 빈 결과 집합 처리 | 회사에 규칙이 없을 때 빈 배열 반환 |
| MEDIUM | `create` | positionId가 제공되지 않을 때 null로 저장되는지 검증 | positionId ?? null 처리 |
| MEDIUM | `create` | 유효하지 않은 positionId (존재하지 않는 position)를 전달할 때 에러 처리 | FK 제약 위반 처리 |
| MEDIUM | `update` | 부분 업데이트: isDefault를 false로 변경 (현재 기본 규칙에서 제거) | isDefault 값 변경 처리 |
| MEDIUM | `update` | positionId를 다른 값으로 업데이트 | positionId ?? null 처리 |
| MEDIUM | `update` | positionId를 null로 업데이트 (직위 제한 제거) | positionId: null 설정 가능 |
| MEDIUM | `remove` | 기본 규칙(isDefault=true) 삭제 시 isDefault도 함께 false로 설정 | 기본 규칙 삭제 후 isDefault 플래그 정리 |
| MEDIUM | `findOneOrThrow` | NotFoundException 에러 형식 검증 | code, message가 포함된 구조 |
| LOW | `create` | excludeNoCheckin 기본값 false 검증 | optional 필드의 기본값 |
| LOW | `create` | includeManualBreak 기본값 true 검증 | optional 필드의 기본값 |

**의심 버그:**

- **[MEDIUM]** `remove (line 82-88)` — remove()가 $transaction으로 감싸지 않음. findOneOrThrow 검증과 update 사이에 race condition 가능. 다른 요청이 규칙을 동시에 삭제하면 update가 실패할 수 있음.
- **[MEDIUM]** `create (line 23-43)` — isDefault=true로 여러 규칙을 동시에 생성하려는 경우, 트랜잭션 내부의 updateMany도 경합 상황에서 예상과 다르게 동작할 수 있음. 더 강력한 lock이 필요할 수 있음.
- **[LOW]** `update (line 68)` — positionId 부분 업데이트: dto.positionId가 undefined일 때와 null일 때의 의도가 불명확. 현재는 둘 다 null로 처리되지만, 기존 값을 유지하려면 필드를 생략해야 함.
- **[LOW]** `create (line 37-38), update (line 68)` — 외래키 제약: positionId가 존재하지 않는 값으로 설정되면 Prisma가 DB 에러를 throw하지만, 서비스 레이어에서 사전 검증이 없음.

---


## 부록 — 무결성·권한 가드 테스트 (2026-06-13 추가)

감사(132건) 후 추가된 비즈니스 가드의 단위 테스트가 각 서비스 spec에 포함된다. 정상(통과)·차단(거부) 양 경로를 검증한다.

| 서비스 spec | 추가 가드 테스트 |
|---|---|
| organizations | 하위조직/직원/출퇴근장소/근무일정 보유 시 삭제 차단 |
| positions | 활성 직원 배정 시 `POSITION_IN_USE` |
| shift-types | 템플릿/근무일정 사용 시 `SHIFT_TYPE_IN_USE` |
| shift-templates | 근무일정 사용 시 `SHIFT_TEMPLATE_IN_USE` |
| leaves | 잔여 휴가 보유 시 `LEAVE_TYPE_IN_USE`/`LEAVE_GROUP_IN_USE`(+cascade) |
| document-forms | 문서 보유 시 `FORM_IN_USE` |
| custom-types | 활성 승인규칙 사용 시 `CUSTOM_TYPE_IN_USE` |
| timeclock-areas | 출퇴근 기록 보유 시 `TIMECLOCK_AREA_IN_USE` |
| employees | 미결 결재 보유 시 퇴사 차단 + 조직 결재자 null 해제 |

> 요청 소유권/자기결재/잔액 권한은 통합(e2e) `integrity-security.e2e-spec.ts`에서 실 DB로 검증. 상세: [data-integrity-report.md](./data-integrity-report.md), [integration-test-scenarios.md](./integration-test-scenarios.md).
