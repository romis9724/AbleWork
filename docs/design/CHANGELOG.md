# AbleWork 변경 이력 (CHANGELOG)

> 기능·설계·데이터·운영 변경의 단일 이력(SSOT). 신규 설치·추적·롤백 판단의 기준 문서.
> 각 항목: **요청 → 변경 → 영향(파일/마이그레이션/엔드포인트) → 배포(커밋)**.
> 배포 정책: **main 병합 시 GitLab CI 자동 배포**. 마이그레이션은 api 컨테이너 부팅 시 `prisma migrate deploy` 자동 적용.

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
- **배포**: 미배포(작업 트리). 직전 `7b68aa1` 배포가 CI 빌드 인스턴스 OOM freeze로 web 미반영 상태 → 복구 후 다음 배포에 함께 포함 예정.

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
- **반영(검증)**: 직원 **33명 신규**(전원 재직·`accessLevel=EMPLOYEE`), 직위(Position) 마스터 **9개**(PM·과장·대리·매니저·부대표·부장·사원·이사·차장), 직원↔조직 링크 35·직원↔직위 링크 28. 회사 직원 총 34(+admin). 로그인=공통 임시비번 `Label2026!`(앱과 동일 **bcryptjs** 해시·강제변경 아님, self-compare 검증).
- **확정 규칙(인터뷰)**: 로그인 이메일=**ID 컬럼 우선**(펑위양·오비청은 ID≠이메일). 입사일 공란 15명=`2026-01-01`. 고용형태=`regular` 기본. 조직은 **기존 20개 마스터에 이름 매칭**(신규 생성 없음). `경영지원 본부`(정재훈)=운영에 동명 조직 없어 상위 본부급 **경영관리그룹**에 매핑. `비즈니스그룹`→기존 `비지니스그룹`(철자 변형). 복수 소속 2명(정재훈·이세원)=CSV 선두 조직이 주(primary).
- **멀티컴퍼니**: 정재훈(louis2012cloud@gmail.com)은 이미 운영 계정 존재 → 기존 User에 레이블 Employee만 추가(에이비웍스+레이블 양사 소속). 이 1명은 **기존 비밀번호 유지**.
- **미반영(스키마 외)**: 닉네임·생일·성별·근무위치(Employee 필드 아님).
- **후속 TODO(관리자)**: ①임시비번 `Label2026!` 배포·교체 안내(32명) ②직책 보유자 12명(팀장8·본부장3·그룹장1) 조직 승인자(approverId)·권한 승격 검토 ③필요 시 휴가/근무 데이터 별도 이관.

---

## 운영 노트 (2026-06-29)

- **CI 빌드 러너 행(hang) 장애·복구**: arm64+Next 빌드가 `ablework-ci-build`(t4g.medium) 메모리 부담으로 행 → SSM `ConnectionLost`·빌드 정지. 복구=`aws ec2 reboot-instances --instance-ids i-05a7153e5318c5098`. 진단/복구 상세는 [AWS_OPERATIONS.md](./AWS_OPERATIONS.md).
- **프론트 배포 특성**: web 이미지(Next build)가 api보다 느려 web 컨테이너 교체까지 시간이 더 걸림. 검증은 ECR `ablework-web` 신규 SHA 태그 + web 컨테이너 재생성(uptime) 확인.
- **운영 DB 디버깅**: 로컬 플러그인 없이 `aws ssm send-command`(문서명 `AWS-RunShellScript`, 리전 ap-northeast-2) → `docker exec ablework-api-1 sh -c 'cd /app/apps/api && node ...'`(Prisma). 상세 [AWS_OPERATIONS.md](./AWS_OPERATIONS.md).
