# 멀티컴퍼니(그룹) 확장 설계

> 한 사용자가 여러 계열사를 전환하며 사용하는 그룹사 멀티컴퍼니 지원.
> 신규 회사 추가 기능 + 회사 전환 + 회사별(조직도·전자결재 등) 기능 자동 적용.
>
> SSOT: 본 문서. 관련: `CLAUDE.md`(멀티테넌시 규칙), `docs/design/RBAC_AND_LOGIN.md`, `docs/design/ERD.md`

---

## 구현 상태 (2026-06-24)

**✅ 풀스택 구현 완료 · 브라우저 E2E 검증 통과**

| 단계 | 상태 | 비고 |
|---|---|---|
| P0 스키마/마이그레이션 | ✅ | `20260624211229_add_groups_and_multi_company_membership` 적용·백필 검증 |
| P1 인증 BE | ✅ | login 활성회사 선택, `POST /auth/switch-company`, `GET /auth/my-companies` |
| P2 회사 BE | ✅ | `POST /companies/add`, signup 그룹 자동생성, join 멤버십 추가화 |
| P3 FE 회사 전환 | ✅ | `CompanySwitcher` 헤더 장착, 전환 시 토큰 재발급+`qc.clear()` |
| P4 FE 회사 추가 | ✅ | `/admin/settings/company/add`, 생성→자동 전환 |
| 테스트 | ✅ | api 단위 797 통과(+신규 7), web build OK, typecheck OK |

**브라우저 검증 결과(admin@ablework.io = 2개 회사 SUPER_ADMIN):**
- 헤더 스위처에 2개 회사 + "＋회사 추가" 노출
- 전환: `seed-company-001` → `seed-company-002`, 헤더 "AbleWork 2호점"으로 갱신, 캐시 초기화
- 회사 추가: "브라우저검증 3호점" 생성(UUID 부여)→자동 전환, **추가 시점 활성 회사의 그룹 상속** 확인

**구현 중 발견·반영:**
- `SwitchCompanySchema.companyId`를 `.uuid()` → `.min(1)`로 완화. 멤버십 검증(서비스)이 실질 방어이며, `.uuid()`는 시드/테스트 ID(`seed-company-002`)에 취약했음.
- seed의 `employee.upsert({ where: { userId } })`가 `userId` 전역 unique 제거로 깨져 **고정 id 기반 upsert**로 교체. 데모용 2번째 회사(`seed-company-002`)+관리자 멤버십 추가.

---

## 0. 인터뷰 결정 요약

| 축 | 결정 |
|---|---|
| 멀티컴퍼니 모델 | **그룹사/홀딩스** — 한 사용자가 여러 계열사 전환 사용 |
| 그룹·결제 구조 | **그룹 엔티티 신설 + 회사별 개별(독립) 운영**, 결제/billing 없음 |
| 접근/멤버십 | **멤버십만** — GROUP_OWNER 등 상위 역할 없음. 회사마다 별도 권한 |
| 회사 추가 흐름 | **SUPER_ADMIN이 '회사 추가'** → 같은 그룹에 새 회사 + 본인 자동 SUPER_ADMIN |
| 산출물 | **설계 + 풀스택(BE+FE) 구현** |

### 제외 범위 (NEVER for this feature)

- ❌ 결제 / billing / 구독 / plan (원 요청 "결제"는 "결재" 오타)
- ❌ GROUP_OWNER 등 그룹 단위 상위 역할
- ❌ 그룹을 가로지르는 통합 대시보드 / cross-company 집계 뷰 (전환만)
- ❌ 2FA·생체인증 등 Enterprise 기능 (기존 NEVER 유지)

### 열린 질문 → 채택 기본값

| # | 질문 | 채택 기본값 |
|---|---|---|
| OQ1 | 기존 회사의 그룹 배정 | 각 기존 회사를 **단독 그룹(1:1)** 으로 백필 |
| OQ2 | 회사 전환 시 토큰 처리 | **JWT 재발급** (선택 회사로 스코핑) |
| OQ3 | 공개 self-signup 유지 | 유지 — **신규 그룹 부트스트랩 전용**. 추가 회사는 인증 SUPER_ADMIN |
| OQ4 | 동일 이메일 2번째 회사 합류 | **기존 User 재사용 + Employee 추가** (에러 아님) |
| OQ5 | 활성 회사 기억 | `User.lastCompanyId` 컬럼에 마지막 선택 회사 저장 |

---

## 1. 현행 구조 (As-Is)

코드 근거:

- `User 1:1 Employee` — `Employee.userId String? @unique` (`schema.prisma:178`)
- `Employee N:1 Company` — `Employee.companyId` (`schema.prisma:177`)
- 결과적으로 **한 이메일(User)은 정확히 한 회사에만 소속**
- 로그인: `auth.service.ts:36-61` — `user.employee.companyId`를 JWT에 고정
- JWT payload: `{ sub, employeeId, companyId, accessLevel }` (`jwt-payload.type.ts`)
- `@CompanyId()` 데코레이터가 `request.user.companyId` 추출 → 모든 쿼리 스코핑
- 회사 생성: `POST /companies` (공개) → `company + user + employee(SUPER_ADMIN)` 1 트랜잭션 (`companies.service.ts:38-63`)
- 회사 합류: `POST /companies/join` 합류코드 → `EMPLOYEE` 생성. 이메일 중복 시 `COMPANY_EMAIL_ALREADY_EXISTS` (`companies.service.ts:148-199`)
- 조직도: `GET /organizations` → `findTree(companyId)` (이미 회사 스코핑)
- 전자결재·근태·휴가 등 **모든 도메인이 `companyId`로 격리됨** → 활성 회사만 바뀌면 자동 적용

### 핵심 통찰

> 멀티테넌시(데이터 격리)는 **이미 완성**. 이번 작업의 본질은
> **① User↔Company 다대다화 ② 활성 회사 전환 ③ 그룹 묶음 ④ 회사 추가 UI** 4가지.
> 조직도·결재 등 기능 자체는 거의 손대지 않는다.

---

## 2. 목표 구조 (To-Be)

### 2.1 관계 모델

```
Group 1 ──< Company 1 ──< Employee >── 1 User
                                │
User 1 ──< Employee (회사마다 1개, 각자 accessLevel)
```

- **Group 1:N Company** — 그룹 하나에 계열사 여러 개
- **User 1:N Employee** — 한 사용자가 회사마다 Employee 레코드 보유 (`userId @unique` 제거)
- **Company N:1 Group** — 모든 회사는 정확히 한 그룹에 속함
- 한 회사 내 같은 User 중복 멤버십 금지 → `Employee @@unique([companyId, userId])`

### 2.2 멤버십·권한 규칙

- 회사 전환은 **본인이 활성 Employee를 가진 회사 목록 내**에서만 가능
- 각 Employee의 `accessLevel`은 **회사별로 독립** (A사 SUPER_ADMIN, B사 EMPLOYEE 가능)
- 상위(그룹) 역할 없음 → 그룹 전체를 관장하는 권한은 존재하지 않음
- 회사 추가는 **현재 활성 회사에서 SUPER_ADMIN인 사용자**만 가능

---

## 3. 데이터 모델 변경

### 3.1 신규: `Group`

```prisma
model Group {
  id        String   @id @default(uuid())
  name      String   @db.VarChar(100)
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  companies Company[]

  @@map("groups")
}
```

> 그룹 단위 상위 역할·결제가 없으므로 `ownerUserId` 등은 두지 않는다(YAGNI).
> 그룹은 "회사 묶음" 컨테이너로만 기능한다.

### 3.2 변경: `Company`

```prisma
model Company {
  // ... 기존 필드 유지 ...
  groupId String @map("group_id")          // 신규 (NOT NULL)
  group   Group  @relation(fields: [groupId], references: [id])
  // ...
  @@index([groupId])
  @@map("companies")
}
```

### 3.3 변경: `Employee`

```prisma
model Employee {
  // ...
  userId String? @map("user_id")           // @unique 제거 (1:N 허용)
  // ...
  @@unique([companyId, userId])            // 회사 내 중복 멤버십 방지
  @@index([userId])                        // 사용자→소속회사 조회용
  // 기존 인덱스 유지
}
```

### 3.4 변경: `User`

```prisma
model User {
  // ...
  lastCompanyId String? @map("last_company_id")   // 마지막 선택 회사 (전환 기억)
  // employee Employee?  →  employees Employee[]   // 1:N 으로 변경
  employees Employee[]
  // ...
}
```

> `lastCompanyId`는 FK로 강제하지 않는다(회사 탈퇴 시 dangling 허용, 로그인 시 유효성 재검증).

---

## 4. 마이그레이션 전략

새 마이그레이션 1개: `add_groups_and_multi_company_membership`

순서 (단일 마이그레이션 내 raw SQL 백필 포함):

1. `groups` 테이블 생성
2. `companies.group_id` 컬럼 추가 (우선 NULL 허용)
3. **백필**: 기존 회사마다 그룹 1개 생성 후 매핑 (1:1)
   ```sql
   -- 기존 회사 1개당 동명 그룹 1개 생성 + 연결
   INSERT INTO groups (id, name, is_active, created_at, updated_at)
   SELECT gen_random_uuid(), name, true, now(), now() FROM companies;
   -- (실제로는 회사별로 매핑 테이블 경유. Prisma migration SQL에 절차 명시)
   ```
   ⚠️ 정확 매핑을 위해 임시 매핑 또는 회사별 루프 SQL 사용 (구현 시 검증).
4. `companies.group_id` → `NOT NULL` + FK + 인덱스
5. `employees.user_id` 의 `UNIQUE` 제약 제거 → `@@unique([company_id, user_id])` + `@@index([user_id])` 추가
6. `users.last_company_id` 컬럼 추가

검증:

- 마이그레이션 후 모든 `companies.group_id` NOT NULL 충족
- 기존 로그인/JWT 그대로 동작 (companyId 동일)
- 기존 테스트 그린 (`pnpm --filter api test`)

> 롤백 불가한 스키마 변경(데이터 백필 포함)이므로, **시드 DB·스테이징에서 먼저 검증** 후 prod 적용.

---

## 5. 백엔드 변경

### 5.1 JWT / 인증

JWT payload는 **변경 없음** — 여전히 `{ sub, employeeId, companyId, accessLevel }`.
멀티컴퍼니는 "토큰에 들어가는 companyId/employeeId/accessLevel을 **어느 회사 것으로 채우냐**"의 문제로 환원된다.

#### 로그인 (`auth.service.login`)

```
user = findUnique(email) include employees(active) → company
if employees.length === 0 → 401 비활성 계정
activeEmployee =
  employees.find(e => e.companyId === user.lastCompanyId && e.isActive)
  ?? employees[0]            // 마지막 선택 회사 우선, 없으면 첫 회사
payload = { sub, employeeId: activeEmployee.id,
            companyId: activeEmployee.companyId,
            accessLevel: activeEmployee.accessLevel }
return tokens
```

#### 회사 전환 (신규 `POST /auth/switch-company`)

```
@UseGuards(JwtAuthGuard)
body: { companyId }
→ employee = findFirst({ userId: req.user.sub, companyId, isActive: true })
  없으면 403 COMPANY_MEMBERSHIP_NOT_FOUND
→ user.update({ lastCompanyId: companyId })   // 기억
→ payload = { sub, employeeId, companyId, accessLevel } (선택 회사 기준)
→ return new tokens (accessToken + refreshToken)
```

#### refresh (`auth.service.refresh`)

- 기존 토큰의 `employeeId`로 employee 재조회 → 그대로 유지
- (회사 전환 정보는 토큰에 박혀 있으므로 refresh는 현재 활성 회사 유지)

#### 내 소속 회사 목록 (신규 `GET /auth/my-companies`)

```
→ employees = findMany({ userId, isActive }) include company(select id,name,logoUrl)
→ return [{ companyId, companyName, logoUrl, accessLevel, isCurrent }]
```

### 5.2 회사 도메인 (`companies`)

| 엔드포인트 | 인증/권한 | 변경 | 동작 |
|---|---|---|---|
| `POST /companies` | 공개 | 그룹 자동 생성 | **신규 그룹 부트스트랩**: group 생성 → company(groupId) → user → employee(SUPER_ADMIN). 이메일 중복 시 정책(OQ4): 기존 user 있으면 재사용? **부트스트랩은 신규 user 전제 → 중복 시 에러 유지** |
| `POST /companies/add` | JwtAuthGuard + RolesGuard(SUPER_ADMIN) | **신규** | 현재 활성 회사의 그룹에 새 회사 추가 + **현재 사용자**를 새 회사 SUPER_ADMIN Employee로 생성. 같은 user 재사용 |
| `POST /companies/join` | JwtAuthGuard | 멤버십 추가화 | 합류코드 회사에 **현재 User 재사용 + Employee 추가**(OQ4). 이미 멤버면 `COMPANY_ALREADY_MEMBER` |
| `GET /companies/:id` | JwtAuthGuard | 유지 | cross-company 403 가드 유지 |
| `PATCH /companies/:id` | SUPER_ADMIN | 유지 | — |

#### `POST /companies/add` 트랜잭션

```
@CompanyId() companyId, @CurrentUser() user, body: CreateCompanyInGroupDto
→ current = company.findUnique(companyId) → groupId
→ $transaction {
    newCompany = company.create({ ...dto, groupId })
    employee   = employee.create({
      companyId: newCompany.id, userId: user.sub,
      accessLevel: 'SUPER_ADMIN', name: <user.name>, joinedAt: now, ...
    })
  }
→ return { company: newCompany, employee }   // FE가 이어서 switch-company 호출
```

> `add`는 **회사 + 본인 SUPER_ADMIN Employee만** 생성. 신규 User는 만들지 않음(이미 로그인됨).

#### 에러 코드 (신규)

- `COMPANY_MEMBERSHIP_NOT_FOUND` — 전환하려는 회사에 멤버십 없음
- `COMPANY_ALREADY_MEMBER` — 이미 해당 회사 멤버
- `GROUP_NOT_FOUND` — (방어) 그룹 미존재

### 5.3 멀티테넌시 가드 (불변)

- 모든 쿼리 `companyId` 조건 유지 — **변경 없음**
- cross-company 차단은 여전히 서비스 레이어 `companyId` 조건으로 (Guard 아님)
- `switch-company`로 JWT의 companyId가 바뀌면 이후 모든 요청이 새 회사로 자연 스코핑

---

## 6. 프론트엔드 변경

### 6.1 회사 전환 UI

- **위치**: 헤더(AdminShell) — 회사명/로고 드롭다운 (테마 스위처 옆)
- **컴포넌트**: `components/common/CompanySwitcher.tsx`
  - `GET /auth/my-companies`로 목록 표시 (현재 회사 체크 표시)
  - 선택 → `POST /auth/switch-company` → 새 토큰 저장 → **TanStack Query 캐시 전체 invalidate** → 라우터 리프레시
  - "+ 회사 추가" 메뉴 항목 (SUPER_ADMIN에게만 노출)
- 단일 회사만 있는 사용자는 드롭다운 비활성/숨김 (전환 대상 없음)

### 6.2 회사 추가 화면

- **경로**: `app/admin/settings/company/add` 또는 모달
- **권한**: SUPER_ADMIN만 (메뉴/라우트 가드)
- **폼(Zod)**: name(필수), businessNumber·foundedAt·timezone·locale 등 회사 기본 정보
- 제출 → `POST /companies/add` → 성공 시 `switch-company`로 새 회사 전환 → 새 회사 온보딩(조직/직원 비어 있음)

### 6.3 신규 그룹 가입(부트스트랩) 화면 — (선택, OQ3)

- `(auth)/signup` — `POST /companies` 호출. 현재 FE 미구현 상태이므로 최소 화면 추가
- 본 작업 범위에서는 **회사 추가/전환 우선**, signup 화면은 후순위로 분리 가능

### 6.4 권한/네비 영향

- 회사 전환 시 accessLevel이 회사마다 다를 수 있음 → 전환 후 토큰 재발급으로 nav/route 가드 자동 재평가 (SSOT: `shared-constants/permissions.ts`)
- `usePermission` 훅은 토큰의 accessLevel을 따르므로 추가 변경 불필요

---

## 7. 구현 단계 (Phase)

| 단계 | 내용 | 검증 |
|---|---|---|
| **P0 스키마** | Group 모델 + Company.groupId + Employee 1:N + User.lastCompanyId + 마이그레이션 백필 | `prisma migrate` 성공, 기존 테스트 그린 |
| **P1 인증 BE** | login 활성회사 선택, `switch-company`, `my-companies` | 단위/통합 테스트 (전환·미멤버 403) |
| **P2 회사 BE** | `POST /companies/add`, join 멤버십 추가화, signup 그룹 자동생성 | 통합 테스트 (추가→멤버십, 중복멤버 차단) |
| **P3 FE 전환** | CompanySwitcher + my-companies 연동 + 캐시 invalidate | 브라우저 검증 (전환 후 데이터 스위칭) |
| **P4 FE 추가** | 회사 추가 화면 + 추가 후 자동 전환 | 브라우저 검증 (추가→빈 회사 진입) |
| **P5 회귀** | RBAC·멀티테넌시 회귀, 다회사 사용자 시나리오 E2E | 전 게이트 통과 |

---

## 8. 테스트 계획

### 단위/통합 (api)

- 로그인 시 `lastCompanyId` 우선 활성 회사 선택, 없으면 첫 회사
- `switch-company`: 멤버 회사 전환 성공 / 비멤버 회사 403 `COMPANY_MEMBERSHIP_NOT_FOUND`
- `my-companies`: 본인 활성 Employee 회사만, 현재 회사 표시
- `POST /companies/add`: 새 회사 + 본인 SUPER_ADMIN Employee, 동일 그룹 연결, 비SUPER_ADMIN 403
- `join`: 동일 이메일 → 기존 User 재사용 + Employee 추가, 이미 멤버 → `COMPANY_ALREADY_MEMBER`
- **멀티테넌시 회귀**: A사 활성 토큰으로 B사 데이터 접근 불가 (전환 전/후)

### E2E / 브라우저

- 2개 회사 멤버 사용자: 로그인 → A사 데이터 확인 → 전환 → B사 데이터로 스위칭 (조직도·결재함 회사별 격리 확인)
- SUPER_ADMIN: 회사 추가 → 자동 전환 → 빈 조직/직원 화면 진입

---

## 9. 리스크 & 완화

| 리스크 | 완화 |
|---|---|
| `userId @unique` 제거 = 비가역 스키마 변경 | 시드/스테이징 선검증, 백필 SQL 단위 검증, prod 적용 전 백업 |
| 회사 전환 후 stale 캐시 노출(타 회사 데이터 잔존) | 전환 시 TanStack Query **전체 invalidate** + 라우터 refresh 필수 |
| 동일 이메일 멀티멤버십 → 기존 중복 차단 로직 충돌 | join/add 경로에서 중복 정책 재정의(OQ4), signup만 신규 user 강제 |
| accessLevel 회사별 상이로 인한 nav 혼선 | 전환 시 토큰 재발급으로 권한 재평가, 회사명 항상 헤더 표기 |
| 합류코드 만료 없음(기존 약점) | 본 작업 범위 외(별도 이슈), 단 멀티멤버십으로 노출면 확대 주의 |

---

## 10. 영향 받는 파일(예상)

**BE**

- `apps/api/prisma/schema.prisma` (Group, Company, Employee, User)
- `apps/api/prisma/migrations/*_add_groups_and_multi_company_membership/`
- `apps/api/src/modules/auth/auth.service.ts` (login/switch/my-companies)
- `apps/api/src/modules/auth/auth.controller.ts` (신규 엔드포인트)
- `apps/api/src/modules/companies/companies.service.ts` (add/join/signup)
- `apps/api/src/modules/companies/companies.controller.ts`
- `apps/api/src/modules/companies/dto/*` (CreateCompanyInGroupDto, SwitchCompanyDto)
- 에러 코드 상수

**FE**

- `apps/web/src/components/common/CompanySwitcher.tsx` (신규)
- `apps/web/src/components/.../AdminShell` (헤더에 스위처 장착)
- `apps/web/src/app/admin/settings/company/add/*` (신규)
- `apps/web/src/lib/api/*`, `apps/web/src/lib/query/*` (my-companies, switch, add 훅)
- `apps/web/src/stores/*` (활성 회사/토큰 갱신)

**문서**

- `docs/design/ERD.md` (Group 추가, 관계 갱신)
- `docs/design/RBAC_AND_LOGIN.md` (전환·멤버십 반영)
- `CLAUDE.md` (멀티컴퍼니 1줄 추가 시)
