# AbleWork ERP — Claude Code 가이드

> 중소기업(50~300인)용 통합 ERP: 인사/근태 + 전자결재 + Discord 알림  
> 상세 설계: `docs/design/` 디렉토리 참조

---

## 1. 구현 범위 (NEVER 목록)

다음은 **절대 구현하지 않는다:**

- 급여 정산 (payroll): `docs/hr/11-payroll/` 내용 및 관련 테이블/API/UI
- 전자계약 (electronic contract): 글로싸인/모두싸인 연동
- 급여명세서 메시지 (`messageUseCasePaySlip`)
- Enterprise 전용 기능: 생체인증, 2FA, IP 화이트리스트, 스케줄 게시(publish), 비례 연차 발생
- `payroll_periods`, `payroll_records` 테이블 생성 금지
- `repository` 레이어 별도 클래스 생성 금지 (Service에서 PrismaService 직접 사용)
- Tailwind CSS 사용 금지 (MUI 사용)
- 새 마이그레이션 파일 없이 DB 스키마 직접 변경 금지

---

## 2. 기술 스택 요약

```
Backend  : NestJS 11 + Prisma 6 + PostgreSQL 16 + Redis 7 + BullMQ 5
Frontend : Next.js 15 (App Router) + MUI 6 + TanStack Query v5 + Zustand 5
공유      : TypeScript 5, Zod 3 (FE/BE 스키마 공유), pnpm + Turborepo
이메일    : Nodemailer (SMTP 직접)
테스트    : Jest + Supertest + Playwright
브랜드색  : #f36f20 (오렌지) — MUI theme.palette.primary.main
```

설치 패키지 참조: `docs/design/ENGINEERING_DESIGN.md` 섹션 1, 6.1

---

## 3. 디렉토리 규칙

```
apps/api/
├── prisma/                    # schema.prisma, migrations/, seed.ts (src/ 밖)
└── src/
    ├── prisma/                # PrismaService, PrismaModule
    ├── common/                # 공통 인프라 (데코레이터, 가드, 파이프, 필터)
    ├── events/                # 도메인 이벤트 상수 (EVENTS 객체)
    └── modules/[feature]/     # 각 도메인 모듈
        ├── [feature].module.ts
        ├── [feature].controller.ts
        ├── [feature].service.ts
        ├── dto/               # Zod 스키마 기반 DTO
        └── events/            # 이벤트 타입 정의

apps/web/src/
├── app/(auth)/                # 공개 라우트
├── app/(admin)/[feature]/     # 관리자 화면 (33개 경로)
├── app/(me)/[feature]/        # 직원 셀프서비스 (14개 경로)
├── components/providers/      # ThemeRegistry ('use client'), QueryProvider
├── lib/api/                   # axios 클라이언트
├── lib/query/                 # TanStack Query 훅
└── stores/                    # Zustand 스토어
```

**전체 화면 경로:** `docs/design/FEATURE_LIST.md` 화면 목록 섹션 참조

---

## 4. 코딩 컨벤션

### 레이어 패턴

```
Controller → Service → PrismaService (직접)
```

Repository 계층을 별도로 만들지 않는다. 복잡한 쿼리는 Service 내 private 메서드로 분리한다.

### 네이밍

| 대상 | 규칙 | 예시 |
|---|---|---|
| 파일 | kebab-case | `create-employee.dto.ts` |
| 클래스/인터페이스 | PascalCase | `EmployeesService` |
| 변수/메서드 | camelCase | `findAllByCompany` |
| 상수 | UPPER_SNAKE_CASE | `EVENTS.LEAVE_APPROVED` |
| DB 컬럼 | snake_case | `company_id`, `is_active` |
| Prisma 모델 필드 | camelCase | `companyId`, `isActive` |
| React 컴포넌트 | PascalCase | `EmployeeTable` |

### 파일 크기 제한

- 단일 파일 800줄 초과 금지
- 함수/메서드 50줄 초과 시 분리

---

## 5. 공통 인프라 사용법

### 백엔드 Guard / Decorator

```typescript
// 인증 + 최소 권한 선언 패턴
@Roles('GENERAL_ADMIN')
@UseGuards(JwtAuthGuard, RolesGuard)
@Post('/types')
async create(
  @CompanyId() companyId: string,          // JWT에서 자동 추출
  @CurrentUser() user: JwtPayload,         // JWT payload 전체
  @Body(new ZodValidationPipe(CreateLeaveTypeSchema)) dto: CreateLeaveTypeDto,
) {}
```

권한 계층: `SUPER_ADMIN(4) > GENERAL_ADMIN(3) > ORG_ADMIN(2) > EMPLOYEE(1)`

### 멀티테넌시 강제 규칙 (보안)

**모든 DB 쿼리에 `companyId` 조건 필수 포함.** 이를 누락하면 다른 회사 데이터가 노출된다.

```typescript
// 올바름
await this.prisma.employee.findMany({ where: { companyId, isActive: true } })

// 잘못됨 — companyId 조건 없음 (금지)
await this.prisma.employee.findMany({ where: { isActive: true } })
```

### API 응답 포맷 (ResponseTransformInterceptor가 자동 래핑)

```typescript
// 성공
{ success: true, data: T, meta?: { total, page, limit } }
// 실패 (GlobalExceptionFilter가 자동 변환)
{ success: false, error: { code: string, message: string, details?: any } }
```

### 에러 코드 네이밍 규칙

`[도메인 대문자]_[상황]` 패턴. 예:
- `EMPLOYEE_NOT_FOUND` / `EMPLOYEE_ALREADY_EXISTS`
- `LEAVE_BALANCE_INSUFFICIENT` / `LEAVE_TYPE_NOT_FOUND`
- `DOCUMENT_ALREADY_SUBMITTED` / `DOCUMENT_CANNOT_CANCEL`
- `APPROVAL_STEP_NOT_CURRENT` / `APPROVAL_PROXY_EXPIRED`
- `ATTENDANCE_ALREADY_CONFIRMED` / `SHIFT_CONFLICT`

---

## 6. 핵심 비즈니스 룰

### 근태

| 규칙 | 내용 |
|---|---|
| 지각 판정 | `clockInAt > shiftStartAt + late_grace_minutes` → `LATE` |
| 조기 출근 | `clockInAt < shiftStartAt - clockin_before_shift_minutes` → 무일정 근무로 별도 기록 |
| 확정 잠금 | 출퇴근/근무일정 확정 후 수정 불가. 확정 해제는 SUPER_ADMIN/GENERAL_ADMIN만 |
| 무일정 정책 | `company_settings.attendance.allow_unscheduled` = `always`/`conditional`/`never` |
| 주 52시간 | 근무일정 생성 시 주 합계 52시간 초과 경고 (저장은 허용, warning만) |

### HR 요청 → 전자결재 자동 연동 (핵심 플로우)

```
POST /requests
  → [서버] $transaction {
      requests 레코드 생성
      document_forms에서 대응 양식 조회
      documents 자동 생성 (status: DRAFT)
      approval_rules에서 결재선 구성
      approval_lines + approval_steps 생성
      document status → PENDING (상신)
    }
  → 결재자에게 Discord + 이메일 알림
```

요청 유형 → 양식 매핑: `LEAVE_*` → 휴가 신청, `SHIFT_*` → 근무일정 변경, `ATTENDANCE_EDIT` → 출퇴근 정정, `DEVICE_CHANGE` → 기기 변경

### 전자결재 상태 머신

```
DRAFT ─상신─→ PENDING ─최종승인─→ APPROVED
                │                  └── 수신 처리
                ├─반려─→ REJECTED ─재상신─→ PENDING
                ├─회수─→ RECALLED ─재상신─→ PENDING
                └─결재취소─→ (이전 단계로 복원)
```

`approval_steps.status`: `PENDING | APPROVED | PRE_APPROVED | PROXY_APPROVED | RETURNED | CANCELLED | SKIPPED`

전단계 반려(`RETURNED`): 이전 결재자에게 결재권 반환, 이후 단계 `CANCELLED` 처리  
전결(`PRE_APPROVED`): 이후 모든 결재단계 `SKIPPED`로 처리 후 문서 `APPROVED`  
대결(`PROXY_APPROVED`): `approval_steps.isProxy = true`, `proxyId` 기록

### 휴가 잔액 검증

```typescript
// 차감 전 검증 순서
1. leave_balances.balance >= 신청 일수
2. leave_balances.expiresAt >= 사용 시작일 (유효기간 이내)
3. leave_types.groupId === leave_balances.leaveTypeId 그룹 일치
```

### company_settings 읽기 패턴

모든 회사 설정은 `company_settings` 테이블에서 읽는다. `CompanySettingsService`를 만들어 캐싱하여 사용한다.

```typescript
// company_settings 테이블: { companyId, section, key, value(JSONB) }
// 예: section='attendance', key='late_grace_minutes', value=15

// 읽기 패턴 (CompanySettingsService 주입)
const graceMinutes = await this.settingsService.get<number>(
  companyId, 'attendance', 'late_grace_minutes', 15 // 기본값
)
```

주요 설정 키 (기본값 포함) → `docs/design/ERD.md` company_settings 섹션 참조

---

## 7. 데이터베이스 패턴

### Prisma.$transaction 필수 사용 케이스

```typescript
// HR 요청 → Document 자동 생성 (원자적)
await this.prisma.$transaction(async (tx) => {
  const req = await tx.request.create({ data: ... })
  const doc = await tx.document.create({ data: { requestId: req.id, ... } })
  await tx.approvalLine.create({ data: { documentId: doc.id } })
  await tx.approvalStep.createMany({ data: steps })
})
// 동일 패턴: 휴가 승인→잔액 차감, 결재 완료, 출퇴근 확정
```

### Prisma 마이그레이션 규칙

```bash
# 스키마 변경 후 반드시 실행
pnpm --filter api prisma migrate dev --name <설명적인_이름>
pnpm --filter api prisma generate    # 클라이언트 재생성
```

마이그레이션 없이 `schema.prisma`만 변경하면 런타임 에러 발생.

---

## 8. 도메인 이벤트 시스템

이벤트 정의: `src/events/domain-events.ts` (`EVENTS` 객체)  
발행: 서비스 레이어에서 `this.eventEmitter.emit(EVENTS.xxx, payload)`  
구독: `NotificationListener`에서 `@OnEvent(EVENTS.xxx)` → Discord Webhook 발송

주요 이벤트 목록 → `docs/design/ENGINEERING_DESIGN.md` 섹션 8.1

---

## 9. Phase별 구현 순서 (/goal 설정 기준)

### Phase 1 (W1~W10): 인사/근태 + Discord 알림

```
Goal 1: 프로젝트 기반 (모노레포, DB, 인증, 공통 인프라)
Goal 2: 인사/조직 관리 (회사, 조직, 직원, 직무, 근로정보)
Goal 3: 근무일정 관리 (유형, 템플릿, 패턴, CRUD, 확정)
Goal 4: 출퇴근 기록 (장소 관리, 출퇴근 기록, 상태 분류, 확정)
Goal 5: 휴가 관리 (그룹, 유형, 자동 발생 규칙, 잔액)
Goal 6: 요청 관리 + Discord 알림 연동
Goal 7: 리포트 (실시간, 표준화 규칙, 스냅샷)
Goal 8: 메시지 자동화 (템플릿, Cron, 이메일)
Goal 9: 프론트엔드 — 관리자 화면 (Phase 1 대응)
Goal 10: 프론트엔드 — 직원 셀프서비스 화면 (Phase 1 대응)
```

### Phase 2 (W11~W17): 전자결재

```
Goal 11: 기안양식 관리 + 공용 결재선 + 문서번호 채번
Goal 12: 기안 작성/상신/임시저장/회수
Goal 13: 결재 처리 (승인/반려/전결/전단계반려/취소/대결)
Goal 14: 협조/공람/수신 처리 (부서협조/부서수신 포함)
Goal 15: HR 요청 → 전자결재 자동 연동 ($transaction)
Goal 16: 문서 조회 화면 (기안함/결재함/공람함/참조함/수신함/문서대장)
Goal 17: 전자결재 Discord 알림 + 프론트엔드 AP 화면
```

---

## 10. 테스트 실행 방법

```bash
pnpm test              # Jest 단위 + 통합 (api + web)
pnpm test:e2e          # Playwright E2E
pnpm --filter api test -- --coverage  # 커버리지 리포트
pnpm typecheck         # tsc --noEmit
pnpm lint              # ESLint
```

**커버리지 목표:** Service 레이어 80%+

**필수 통합 테스트 케이스:**
1. `POST /requests` → Document 자동 생성 (types: LEAVE, SHIFT, ATTENDANCE)
2. 결재 완료 → 휴가 잔액 차감 원자성 검증
3. `ORG_ADMIN` 타 조직 접근 → 403 Forbidden
4. 회수 → 재상신 → 최종 승인 전체 상태 전이

---

## 11. 로컬 개발 빠른 시작

```bash
# 1. 인프라 기동
cp .env.example .env
docker compose up -d

# 2. 의존성 설치
pnpm install

# 3. DB 초기화
pnpm --filter api prisma migrate dev
pnpm --filter api prisma db seed

# 4. 개발 서버 시작
pnpm dev
```

| 서비스 | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/api |
| Prisma Studio | http://localhost:5555 |
| MinIO Console | http://localhost:9001 |

---

## 12. 참조 문서

| 문서 | 내용 |
|---|---|
| `docs/design/SYSTEM_DESIGN.md` | 아키텍처, 모듈 상세, API 엔드포인트 전체, 연동 플로우 |
| `docs/design/ERD.md` | 52개 테이블 Mermaid ERD + company_settings 키 목록 |
| `docs/design/FEATURE_LIST.md` | 기능 목록, 우선순위, 화면 경로 목록 |
| `docs/design/ENGINEERING_DESIGN.md` | 기술 스택, 디렉토리 구조, 설정 코드, 배포 |
| `docs/design/THEMING.md` | 멀티 테마(6종) SSOT·전환·SSR. 색 토큰 추가/변경은 `apps/web/src/theme/tokens.ts` 한 곳에서 |
