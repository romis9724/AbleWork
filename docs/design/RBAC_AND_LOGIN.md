# 접근 제어(RBAC) 및 로그인 자격 발급

> 직원 로그인 문제 해결 + 접근 레벨(EMPLOYEE/ORG_ADMIN/GENERAL_ADMIN/SUPER_ADMIN)별 UI/라우트 게이팅 + 사용자(모바일) 앱의 역할 동작을 정의한다.
> SSOT 코드: `packages/shared-constants/src/permissions.ts`

---

## 1. 직원 로그인 자격 발급

### 문제
관리자 UI로 생성된 직원은 `User.passwordHash = ''`, `isActive = false`(합류코드 발급 전제)로 만들어졌으나, 합류코드 플로우가 제거(C7)되어 **비밀번호를 설정할 경로가 없어 로그인 불가**했다. (시드 계정은 정상)

### 해결
1. **직원 등록 시 초기 비밀번호** — `CreateEmployeeSchema.initialPassword`(선택). 입력 시 `bcrypt` 해시 + `User.isActive = true`로 즉시 로그인 가능. 미입력 시 비활성 계정으로 생성.
2. **비밀번호 재설정 엔드포인트** — `POST /employees/:id/reset-password` (`@Roles(ORG_ADMIN)`). 새 비밀번호 해시 저장 + 계정 활성화. 권한: GENERAL_ADMIN+ 무조건, ORG_ADMIN은 조직 스코프 + `org_admin_can_manage_employees` 설정 ON일 때.
3. 비밀번호 규칙: 영문 + 숫자 포함 8자 이상 (`EmployeePasswordSchema`, auth.dto와 동일).

웹 UI: 직원 등록 다이얼로그의 "초기 비밀번호(선택)" 필드, 직원 상세의 "비밀번호 재설정" 버튼/다이얼로그.

---

## 2. 접근 레벨 계층

`SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1)` (`ACCESS_LEVEL_HIERARCHY`).

- `hasLevel(level, min)` — 계층 비교
- `isAdminLevel(level)` — ORG_ADMIN 이상(/admin 진입 가능)
- `canDo(level, ACTION_KEYS.x)` — 액션 수행 가능 여부
- `canViewNav(level, navId)` — 메뉴 노출 여부
- `requiredLevelForPath(path)` — 경로별 최소 레벨(미들웨어)

---

## 3. 관리자 메뉴 노출 (`ADMIN_NAV_MIN_LEVEL`)

| 메뉴 | 최소 레벨 |
|---|---|
| 홈/근무일정/출퇴근/휴가/요청 (운영) | ORG_ADMIN |
| 직원 관리 | ORG_ADMIN |
| 조직 관리 | GENERAL_ADMIN |
| 결재 현황·문서대장·내 문서함 | ORG_ADMIN |
| 공용 결재선·기안양식·문서담당·백업·공통 관리 | GENERAL_ADMIN |
| 리포트·메시지 | GENERAL_ADMIN |
| 회사 설정 | GENERAL_ADMIN |
| 감사 로그 | GENERAL_ADMIN |

`AdminShell`이 `canViewNav`로 섹션/항목을 필터링(빈 섹션 제거, 번호 재계산). ORG_ADMIN은 운영·인사(직원)·거래성 결재만 보인다.

## 4. 라우트 가드 (`middleware.ts` + `ADMIN_ROUTE_GUARDS`)

- 미인증 → `/login`
- `/admin/*`: ORG_ADMIN 미만 → `/me/home`
- 경로별 최소 레벨 미충족(예: ORG_ADMIN이 `/admin/settings` 직접 접근) → `/admin/dashboard`
- 메뉴 숨김(cosmetic)과 URL 직접 접근 차단(enforce)을 동일 모델로 일치.

## 5. 액션 게이팅 (`ACTION_MIN_LEVEL`)

| 액션 | 최소 레벨 |
|---|---|
| 직원 등록 | GENERAL_ADMIN |
| 직원 수정/활성·비활성 | ORG_ADMIN |
| 비밀번호 재설정 | ORG_ADMIN |
| 기기 초기화 | GENERAL_ADMIN |
| 근로정보 관리 | GENERAL_ADMIN |
| 출퇴근/근무일정 확정 해제 | GENERAL_ADMIN |
| 요청 강제 승인/거절 | SUPER_ADMIN |
| 회사 기본정보 수정 | SUPER_ADMIN |
| 권한 변경(accessLevel 드롭다운) | GENERAL_ADMIN |

웹은 `usePermission()` 훅(`apps/web/src/hooks/usePermission.ts`)으로 버튼/드롭다운/토글을 게이팅. 백엔드 `@Roles` + 서비스 가드가 최종 강제.

## 6. 사용자(모바일) 앱 (`apps/mobile`, Expo / React Native)

직원·조직관리자·최고관리자가 **동일 앱**으로 로그인하며 JWT `accessLevel`로 분기한다.

**구조**
- 인증: `src/stores/auth.ts`(Zustand, 토큰=Expo SecureStore), `src/lib/jwt.ts`(의존성 없는 base64url 디코드), `src/lib/api-client.ts`(axios + 401 refresh 회전 + 실패/회전 콜백).
- API: `src/lib/api.ts`(authApi/attendanceApi/leaveApi/requestApi/employeeApi/approvalApi). 모든 경로는 웹 me-화면과 동일한 실제 엔드포인트(검증 완료, 발명된 경로 없음).
- 라우팅: `app/_layout.tsx`(기동 시 hydrate, segments 가드), `app/login.tsx`, `app/(tabs)/*`.

**탭 & 역할 게이팅** (`app/(tabs)/_layout.tsx`)
- EMPLOYEE: 홈(출퇴근)·출퇴근 내역·휴가·요청·내 정보.
- ORG_ADMIN 이상: 추가로 **관리** 탭(결재 대기함 승인/반려 + 팀 근무현황). `isAdminLevel(accessLevel)`로 `Tabs.Screen href`를 `null`(숨김)/`undefined`(노출) 토글. 관리 탭 내 승인/반려는 `hasLevel(ORG_ADMIN)` + 본인 PENDING 단계일 때만.
- 역할 정의는 `@ablework/shared-constants` 재사용(재정의 없음).

**검증(적대적)**: 호출 엔드포인트 13개 전부 백엔드 실재 확인 / typecheck·lint exit 0 / 역할 토큰 회전 시 `accessLevel` 즉시 반영(`setAuthRefreshHandler`) / hydrate가 유효 refresh 토큰으로 세션 복원(강제 로그아웃 버그 수정) / `GET /attendances/now-at-work`는 `@Roles(ORG_ADMIN)`로 보호(직원 직접 호출 시 회사 명단 누출 차단).

**일회성 설치(개발 머신, 네트워크 필요)**: `apps/mobile`을 `pnpm-workspace.yaml`에 등록했고 package.json은 **Expo SDK 52 정합**(RN 0.76/React 18/expo-router 4)으로 고정했다. 클린 환경에서는 루트에서 `pnpm install`(필요 시 기존 임시 `apps/mobile/node_modules` 제거 후) 한 번 실행하면 lock에 mobile importer가 기록되어 재현 가능해진다. 실행: `cd apps/mobile && npx expo start`.
