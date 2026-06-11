# AbleWork ERP — 엔지니어링 설계 문서

> 버전: 1.2.0 (5라운드 점검 완료)
> 작성일: 2026-06-12
> 전제 문서: [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) · [ERD.md](./ERD.md) · [FEATURE_LIST.md](./FEATURE_LIST.md)

---

## 목차

1. [기술 스택](#1-기술-스택)
2. [모노레포 초기화](#2-모노레포-초기화)
3. [프로젝트 디렉토리 구조](#3-프로젝트-디렉토리-구조)
4. [백엔드 엔지니어링](#4-백엔드-엔지니어링)
5. [데이터베이스 전략 (Prisma)](#5-데이터베이스-전략-prisma)
6. [프론트엔드 엔지니어링](#6-프론트엔드-엔지니어링)
7. [인증/권한 구현](#7-인증권한-구현)
8. [도메인 이벤트 & Discord 알림](#8-도메인-이벤트--discord-알림)
9. [이메일 연동 (Nodemailer)](#9-이메일-연동-nodemailer)
10. [테스트 전략](#10-테스트-전략)
11. [Docker 배포 설계](#11-docker-배포-설계)
12. [환경 변수 목록](#12-환경-변수-목록)
13. [개발 스크립트](#13-개발-스크립트)

---

## 1. 기술 스택

| 레이어 | 기술 | 버전 |
|---|---|---|
| 런타임 | Node.js | 22 LTS |
| 패키지 관리 | pnpm | 9.x |
| 모노레포 | Turborepo | 2.x |
| Backend | NestJS | 11.x |
| ORM | Prisma | 6.x |
| DB | PostgreSQL | 16 |
| Cache / 큐 | Redis 7.x + BullMQ 5.x | |
| Frontend | Next.js 15.x (App Router) | |
| UI | MUI 6.x + Google Material Icons | 브랜드: `#f36f20` |
| 서버 상태 | TanStack Query v5 | |
| 클라이언트 상태 | Zustand 5.x | |
| 유효성 검사 | Zod 3.x | FE/BE 공유 |
| 폼 | React Hook Form 7.x + Zod | |
| 이메일 | Nodemailer 6.x | SMTP |
| 파일 저장 | MinIO (S3 호환) | |
| 테스트 | Jest 29 + Supertest + Playwright | |
| API 문서 | Swagger (`@nestjs/swagger`) | |
| 언어 | TypeScript 5.x | 전체 스택 |

---

## 2. 모노레포 초기화

### 2.1 초기 구성

```bash
pnpm dlx @nestjs/cli new apps/api --package-manager pnpm --skip-git
pnpm dlx create-next-app@latest apps/web --typescript --app --src-dir --skip-git
pnpm add -D turbo
```

**pnpm-workspace.yaml** / **turbo.json** (빌드 캐시, dev/test/typecheck/lint 태스크)

### 2.2 공유 패키지 설정

```json
// packages/shared-types/package.json
{ "name": "@ablework/shared-types", "version": "0.0.0",
  "main": "./src/index.ts", "exports": { ".": "./src/index.ts" } }
```

각 앱 `package.json`에 의존성 추가:
```json
{ "dependencies": { "@ablework/shared-types": "workspace:*",
                    "@ablework/shared-schemas": "workspace:*",
                    "@ablework/shared-constants": "workspace:*" } }
```

루트 `tsconfig.base.json`에 path alias 설정:
```json
{ "compilerOptions": { "paths": {
  "@ablework/shared-types":    ["./packages/shared-types/src/index.ts"],
  "@ablework/shared-schemas":  ["./packages/shared-schemas/src/index.ts"],
  "@ablework/shared-constants":["./packages/shared-constants/src/index.ts"]
}}}
```

---

## 3. 프로젝트 디렉토리 구조

```
ablework/
├── apps/
│   ├── api/                          # NestJS 백엔드
│   │   ├── prisma/                   # ← src/ 밖에 위치 (Prisma CLI 기본 경로)
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts         # 모든 전역 모듈 등록
│   │       ├── prisma/               # PrismaService, PrismaModule
│   │       ├── common/
│   │       │   ├── decorators/       # @CurrentUser, @CompanyId, @Roles
│   │       │   ├── guards/           # JwtAuthGuard, RolesGuard
│   │       │   ├── interceptors/     # ResponseTransformInterceptor
│   │       │   ├── filters/          # GlobalExceptionFilter
│   │       │   └── pipes/            # ZodValidationPipe
│   │       ├── modules/
│   │       │   ├── auth/
│   │       │   ├── companies/
│   │       │   ├── organizations/
│   │       │   ├── employees/
│   │       │   ├── positions/
│   │       │   ├── wage-info/
│   │       │   ├── timeclock-areas/
│   │       │   ├── shifts/
│   │       │   ├── shift-templates/  # ← 추가
│   │       │   ├── schedule-patterns/# ← 추가
│   │       │   ├── attendances/
│   │       │   ├── leaves/
│   │       │   ├── requests/
│   │       │   ├── documents/        # 전자결재 (AP 도메인 전체)
│   │       │   ├── proxy-settings/   # ← 추가 (대결 설정)
│   │       │   ├── standardization-rules/ # ← 추가
│   │       │   ├── reports/
│   │       │   ├── messages/
│   │       │   ├── notifications/
│   │       │   └── mail/             # ← 추가 (Nodemailer)
│   │       └── events/               # 도메인 이벤트 상수 + 핸들러
│   │
│   └── web/                          # Next.js 프론트엔드
│       └── src/
│           ├── app/
│           │   ├── (auth)/login/
│           │   ├── (admin)/
│           │   │   ├── layout.tsx
│           │   │   ├── dashboard/
│           │   │   ├── employees/[id]/
│           │   │   ├── positions/
│           │   │   ├── timeclock-areas/
│           │   │   ├── shifts/{types,templates,patterns}/
│           │   │   ├── attendances/{now}/
│           │   │   ├── leave/{types,accrual-rules,status}/
│           │   │   ├── requests/{rules,custom-types}/
│           │   │   ├── approval/{forms,status,shared-lines,dept-docs}/
│           │   │   ├── reports/{standardization,snapshots}/
│           │   │   ├── messages/automations/
│           │   │   └── settings/{notifications,company,permissions}/
│           │   └── (me)/
│           │       ├── layout.tsx
│           │       ├── home/          # 출퇴근 버튼
│           │       ├── shifts/
│           │       ├── attendances/
│           │       ├── leaves/
│           │       ├── requests/
│           │       ├── drafts/        # 기안함
│           │       ├── approvals/     # 결재함
│           │       ├── viewings/      # 공람함
│           │       ├── references/    # 참조함
│           │       ├── received/      # 수신함
│           │       ├── dept-docs/
│           │       ├── proxy-settings/
│           │       ├── messages/
│           │       └── profile/
│           ├── components/
│           │   ├── providers/         # ThemeRegistry (클라이언트), QueryProvider
│           │   ├── layout/
│           │   └── [feature]/
│           ├── hooks/
│           ├── lib/{ api/, query/ }
│           ├── stores/                # Zustand
│           └── theme/index.ts
│
└── packages/
    ├── shared-types/      # API 요청/응답 TypeScript 타입
    ├── shared-schemas/    # Zod 스키마 (FE/BE 공유)
    └── shared-constants/
        └── src/
            ├── access-level.ts      # SUPER_ADMIN | GENERAL_ADMIN | ORG_ADMIN | EMPLOYEE
            ├── document-status.ts   # DRAFT | PENDING | APPROVED | REJECTED | RECALLED | CANCELLED
            ├── approval-step-status.ts  # PENDING | APPROVED | PRE_APPROVED | PROXY_APPROVED | RETURNED | CANCELLED | SKIPPED
            └── request-type.ts     # LEAVE_CREATE | LEAVE_MODIFY | LEAVE_DELETE | SHIFT_CREATE | SHIFT_MODIFY | SHIFT_DELETE | ATTENDANCE_EDIT | DEVICE_CHANGE | CUSTOM
```

---

## 4. 백엔드 엔지니어링

### 4.1 AppModule 전역 모듈 등록

```typescript
// src/app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,                                    // @Global() — 모든 모듈에서 PrismaService 사용 가능
    EventEmitterModule.forRoot(),                    // @nestjs/event-emitter
    ScheduleModule.forRoot(),                        // @nestjs/schedule (Cron)
    BullModule.forRoot({ connection: { url: process.env.REDIS_URL } }), // @nestjs/bullmq
    BullModule.registerQueue(
      { name: 'message-automation' },
      { name: 'notification' },
      { name: 'leave-accrual' },
    ),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    // 도메인 모듈들...
    AuthModule, CompaniesModule, OrganizationsModule, EmployeesModule,
    ShiftsModule, ShiftTemplatesModule, SchedulePatternsModule,
    AttendancesModule, LeavesModule, RequestsModule, DocumentsModule,
    ProxySettingsModule, StandardizationRulesModule, ReportsModule,
    MessagesModule, NotificationsModule, MailModule,
  ],
})
export class AppModule {}
```

### 4.2 PrismaService (전역)

```typescript
// src/prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() { await this.$connect() }
}

// src/prisma/prisma.module.ts
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
```

### 4.3 공통 인프라 요약

| 구성요소 | 역할 | 사용법 |
|---|---|---|
| `ZodValidationPipe` | Zod 스키마 유효성 검사 | `@Body(new ZodValidationPipe(Schema))` |
| `GlobalExceptionFilter` | ZodError→400, Prisma unique→409, 나머지→500 | `app.useGlobalFilters(...)` |
| `ResponseTransformInterceptor` | `{ success:true, data:T, meta? }` 래핑 | `app.useGlobalInterceptors(...)` |
| `@CurrentUser` | JWT payload 전체 | 파라미터 데코레이터 |
| `@CompanyId` | JWT payload.companyId | 파라미터 데코레이터 |
| `@Roles('GENERAL_ADMIN')` | 최소 권한 선언 | 메서드/클래스 데코레이터 |
| `RolesGuard` | SUPER_ADMIN(4)>GENERAL_ADMIN(3)>ORG_ADMIN(2)>EMPLOYEE(1) | `@UseGuards(JwtAuthGuard, RolesGuard)` |

---

## 5. 데이터베이스 전략 (Prisma)

### 5.1 schema.prisma 위치 및 참조

Prisma CLI 기본 경로: `apps/api/prisma/schema.prisma`
`apps/api/package.json`에 명시:
```json
{ "prisma": { "schema": "prisma/schema.prisma", "seed": "ts-node prisma/seed.ts" } }
```

### 5.2 핵심 모델 패턴

```prisma
// N:M 추가 속성 있는 연결 테이블 패턴 (employee_organizations)
model EmployeeOrganization {
  employeeId     String
  organizationId String
  isPrimary      Boolean @default(false)
  employee       Employee     @relation(fields: [employeeId], references: [id])
  organization   Organization @relation(fields: [organizationId], references: [id])
  @@id([employeeId, organizationId])
  @@map("employee_organizations")
}

// 이력 관리 테이블 패턴 (wage_infos — effectiveFrom 기반)
model WageInfo {
  id            String   @id @default(uuid())
  employeeId    String
  hourlyWage    Decimal  @db.Decimal(10, 2)
  effectiveFrom DateTime @db.Date
  // ...
  @@index([employeeId, effectiveFrom(sort: Desc)])
  @@map("wage_infos")
}
```

### 5.3 핵심 인덱스

```prisma
@@index([companyId, isActive])           // employees, organizations
@@index([employeeId, startAt, endAt])    // shifts
@@index([employeeId, clockInAt])         // attendances
@@index([companyId, status])             // documents
@@index([assigneeId, status])            // approval_steps
@@index([companyId, section, key])       // company_settings
@@index([companyId, createdAt(sort: Desc)]) // notification_logs
```

### 5.4 Prisma.$transaction 전략

원자적 처리가 필요한 작업은 반드시 `$transaction`을 사용한다:

| 작업 | 트랜잭션 대상 테이블 |
|---|---|
| HR 요청 제출 → Document 자동 생성 | `requests` + `documents` + `approval_lines` + `approval_steps` |
| 휴가 승인 → 잔액 차감 | `request_approvals` + `leave_balances` + `leaves` |
| 결재 완료 처리 | `approval_steps` + `documents` + `approval_history` |
| 출퇴근 확정 | `attendances` (batch update) + 확정 로그 |

```typescript
// 예시: HR 요청 → Document 자동 생성
const result = await this.prisma.$transaction(async (tx) => {
  const req = await tx.request.create({ data: requestData })
  const doc = await tx.document.create({ data: { ...docData, requestId: req.id } })
  const line = await tx.approvalLine.create({ data: { documentId: doc.id } })
  await tx.approvalStep.createMany({ data: steps.map(s => ({ ...s, lineId: line.id })) })
  return { req, doc }
})
```

### 5.5 소프트 삭제 정책

| 전략 | 대상 |
|---|---|
| `isActive: false` | companies, organizations, employees, shift_types, leave_types, document_forms, timeclock_areas, positions |
| `resignedAt` 날짜 | employees 퇴사 처리 |
| 유효기간(`expiresAt`) | leave_balances, proxy_settings |
| 물리 삭제 | message_templates, notification_rules |

### 5.6 JSONB 컬럼 주요 목록

| 테이블 | JSONB 컬럼 | 설명 |
|---|---|---|
| company_settings | value | 섹션/키 구조 설정값 |
| documents | content | 기안 양식 필드값 |
| document_forms | fields_schema | 양식 필드 정의 |
| shift_types | note_templates, org_scope_ids, position_scope_ids | 노트 템플릿, 조직/직무 제한 |
| approval_rules | advanced_settings, scope_org_ids, scope_position_ids | 승인 고급 설정 |
| requests | payload | 요청 본문 |
| schedule_patterns | pattern_definition | 날짜별 템플릿 매핑 |
| shared_approval_lines | steps | 결재선 단계 배열 |
| notification_rules | trigger_condition, embed_template | 알림 조건/템플릿 |
| report_snapshot_rows | values, calculation_basis | 스냅샷 데이터 |

---

## 6. 프론트엔드 엔지니어링

### 6.1 MUI 테마 + ThemeRegistry (클라이언트 컴포넌트)

```typescript
// src/theme/index.ts
export const theme = createTheme({
  palette: { primary: { main: '#f36f20', light: '#ff9d50', dark: '#ba4d00', contrastText: '#fff' },
             secondary: { main: '#1a1a2e' } },
  typography: { fontFamily: '"Noto Sans KR", "Roboto", sans-serif' },
  components: { MuiButton: { styleOverrides: { root: { borderRadius: 8, textTransform: 'none' } } } },
})
```

```tsx
// src/components/providers/ThemeRegistry.tsx
'use client'  // ← 필수: ThemeProvider는 클라이언트 컴포넌트
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter' // SSR 스타일 직렬화
export function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>
    </AppRouterCacheProvider>
  )
}

// src/app/layout.tsx (서버 컴포넌트)
import { ThemeRegistry } from '@/components/providers/ThemeRegistry'
// <ThemeRegistry>로 감싸서 사용 — ThemeProvider를 layout.tsx에 직접 넣으면 빌드 에러
```

패키지: `pnpm --filter web add @mui/material @mui/icons-material @mui/x-data-grid @mui/x-date-pickers @mui/material-nextjs @emotion/react @emotion/styled @emotion/cache`

### 6.2 인증 흐름 (middleware.ts — Edge Runtime)

```typescript
// src/middleware.ts — Edge Runtime에서 jsonwebtoken 사용 불가, jose 사용
import { jwtVerify } from 'jose'
const secret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('accessToken')?.value
  if (!token) return NextResponse.redirect(new URL('/login', request.url))
  try {
    const { payload } = await jwtVerify(token, secret)
    // payload.accessLevel 기반 라우팅
    const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
    if (isAdminRoute && payload.accessLevel === 'EMPLOYEE')
      return NextResponse.redirect(new URL('/me/home', request.url))
  } catch { return NextResponse.redirect(new URL('/login', request.url)) }
}
export const config = { matcher: ['/admin/:path*', '/me/:path*'] }
```

패키지: `pnpm --filter web add jose`

### 6.3 상태 관리 전략

| 상태 | 도구 | 예시 |
|---|---|---|
| 서버 데이터 | TanStack Query | 직원 목록, 기안 목록 |
| 인증 세션 | Zustand + localStorage | `accessToken`, `currentUser` |
| UI 전역 | Zustand | 사이드바, 모달 |
| URL | `useSearchParams` | 필터, 페이지 |
| 폼 | React Hook Form + Zod | 기안 작성 |

### 6.4 주요 MUI 컴포넌트 매핑

| 용도 | MUI 컴포넌트 |
|---|---|
| 관리자 레이아웃 | `Drawer` + `AppBar` |
| 데이터 목록 | `DataGrid` (`@mui/x-data-grid`) |
| 날짜 선택 | `DatePicker` (`@mui/x-date-pickers`) |
| 모달 | `Dialog` + `DialogTitle/Content/Actions` |
| 폼 | `TextField`, `Select`, `Autocomplete` |
| 상태 뱃지 | `Chip` |
| 알림 | `Snackbar` + `Alert` |

---

## 7. 인증/권한 구현

### 7.1 JWT 구조

```typescript
interface JwtPayload {
  sub: string          // userId
  employeeId: string
  companyId: string    // 멀티테넌시 격리 키
  accessLevel: AccessLevel
}
// Access Token: 15분 만료 | Refresh Token: Redis TTL 7일
// key: `refresh:${userId}`, rotation 방식
```

### 7.2 조직관리자 소속 검증

`ORG_ADMIN`은 자신이 배정된 조직의 직원만 관리 가능하다. 서비스 메서드 진입 시 `guardOrgScope(requestorId, targetEmployeeId)`를 호출하여 `EmployeeOrganization` 교집합이 없으면 `ForbiddenException`을 던진다.

---

## 8. 도메인 이벤트 & Discord 알림

### 8.1 이벤트 상수 (전체)

```typescript
export const EVENTS = {
  // 근태
  ATTENDANCE_CLOCK_IN: 'attendance.clock_in',
  ATTENDANCE_CLOCK_OUT: 'attendance.clock_out',
  ATTENDANCE_LATE: 'attendance.late',
  ATTENDANCE_ABSENT: 'attendance.absent',
  // 휴가
  LEAVE_REQUESTED: 'leave.requested',
  LEAVE_APPROVED: 'leave.approved',
  LEAVE_REJECTED: 'leave.rejected',
  // 요청 (HR → 전자결재 연동)
  SHIFT_REQUESTED: 'shift.requested',
  ATTENDANCE_REQUESTED: 'attendance.requested',
  DEVICE_CHANGE_REQUESTED: 'device.change_requested',
  REQUEST_FORCE_APPROVED: 'request.force_approved',
  // 전자결재
  DOCUMENT_SUBMITTED: 'document.submitted',
  DOCUMENT_STEP_APPROVED: 'document.step_approved',
  DOCUMENT_STEP_REJECTED: 'document.step_rejected',
  DOCUMENT_PREV_RETURNED: 'document.prev_returned', // 전단계 반려
  DOCUMENT_APPROVED: 'document.approved',           // 최종 완료
  DOCUMENT_REJECTED: 'document.rejected',           // 최종 반려
  DOCUMENT_RECALLED: 'document.recalled',           // 기안자 회수
  DOCUMENT_CANCELLED: 'document.cancelled',         // 결재 취소
} as const
```

### 8.2 Discord Webhook 서비스 (재시도 3회)

```typescript
@Injectable()
export class DiscordWebhookService {
  async send(webhookUrl: string, embed: object): Promise<void> {
    for (let i = 1; i <= 3; i++) {
      try { await axios.post(webhookUrl, { embeds: [embed] }); return }
      catch (e) { if (i === 3) throw e; await new Promise(r => setTimeout(r, i * 1000)) }
    }
  }
}
```

### 8.3 Cron/Batch 작업 목록 (BullMQ + @nestjs/schedule)

| 큐 이름 | Cron | 역할 |
|---|---|---|
| `message-automation` | 매일 00:05 | 당일 휴가 알림 메시지 발송 |
| `leave-accrual` | 매월 1일 01:00 | 연차 자동 발생 (월기준 규칙) |
| `leave-accrual-annual` | 매년 1월 1일 | 연기준 연차 발생 |
| `attendance-absence-check` | 매일 22:00 | 당일 무퇴근자 감지 → 알림 |
| `weekly-overtime-check` | 매주 월요일 | 전주 52시간 초과자 경고 |

---

## 9. 이메일 연동 (Nodemailer)

```typescript
// src/modules/mail/mail.service.ts
@Injectable()
export class MailService {
  private transporter: Mail.Transporter

  constructor(private readonly config: ConfigService) {
    // ← property initializer에서 this.config 접근 불가 — 반드시 constructor에서 초기화
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: Number(this.config.get('SMTP_PORT')),
      secure: this.config.get('SMTP_SECURE') === 'true',
      auth: { user: this.config.get('SMTP_USER'), pass: this.config.get('SMTP_PASS') },
    })
  }

  async sendInviteCode(to: string, code: string, companyName: string) {
    await this.transporter.sendMail({
      from: `"AbleWork" <${this.config.get('SMTP_FROM')}>`, to,
      subject: `[${companyName}] AbleWork 합류 코드 안내`,
      html: `<p>합류 코드: <strong>${code}</strong></p>`,
    })
  }
}
```

발송 케이스: 합류 코드 · 비밀번호 재설정 · 메시지 자동화 이메일 옵션

---

## 10. 테스트 전략

| 계층 | 도구 | 대상 | 목표 |
|---|---|---|---|
| 단위 | Jest | Service 메서드, 유틸리티 | 80%+ |
| 통합 | Jest + Supertest | API 엔드포인트 | 핵심 플로우 전체 |
| E2E | Playwright | 사용자 시나리오 | 크리티컬 패스 |

**핵심 통합 테스트 케이스 (반드시 포함):**
1. `POST /requests` → Document 자동 생성 + ApprovalStep 구성 검증
2. 결재 승인 → 휴가 잔액 차감 원자성 검증
3. `ORG_ADMIN`이 타 조직 직원 접근 시 403 응답 검증
4. 회수 → 재상신 → 결재 완료 전체 흐름

---

## 11. Docker 배포 설계

```yaml
# docker-compose.yml (로컬 개발)
services:
  postgres:
    image: postgres:16-alpine
    environment: { POSTGRES_DB: ablework, POSTGRES_USER: ablework, POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}" }
    ports: ['5432:5432']
    volumes: ['postgres_data:/var/lib/postgresql/data']
  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports: ['6379:6379']
  minio:
    image: minio/minio:latest
    command: server /data --console-address ':9001'
    environment: { MINIO_ROOT_USER: "${MINIO_ROOT_USER}", MINIO_ROOT_PASSWORD: "${MINIO_ROOT_PASSWORD}" }
    ports: ['9000:9000', '9001:9001']
    volumes: ['minio_data:/data']
volumes: { postgres_data: {}, minio_data: {} }
```

**프로덕션 Dockerfile (API) — 멀티 스테이지:**
`node:22-alpine` → deps(pnpm install frozen) → builder(prisma generate + nest build) → runner(dist/ 복사, `EXPOSE 3001`)

---

## 12. 환경 변수 목록

```bash
# .env.example (루트 — docker-compose 전용)
POSTGRES_PASSWORD=change_me
REDIS_PASSWORD=change_me
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=change_me

# apps/api/.env.example
DATABASE_URL=postgresql://ablework:${POSTGRES_PASSWORD}@localhost:5432/ablework
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:6379
JWT_SECRET=your-secret-min-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@ablework.io
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=ablework
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=change_me
PORT=3001
NODE_ENV=development
CORS_ORIGINS=http://localhost:3000

# apps/web/.env.example
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
JWT_SECRET=your-secret-min-32-chars  # middleware.ts Edge Runtime 검증용
```

---

## 13. 개발 스크립트

```bash
pnpm infra:up                                         # docker compose up -d
pnpm --filter api prisma migrate dev                  # 최초 마이그레이션
pnpm --filter api prisma db seed                      # 초기 데이터
pnpm dev                                              # turbo dev (API + Web 병렬)
pnpm --filter api prisma migrate dev --name <name>    # 마이그레이션 신규 생성
pnpm --filter api prisma migrate deploy               # 프로덕션 적용
pnpm --filter api prisma studio                       # DB GUI (localhost:5555)
pnpm test && pnpm test:e2e                            # 전체 테스트
pnpm build && pnpm typecheck && pnpm lint             # 빌드/타입/린트
```

**로컬 URL:** API `http://localhost:3001` · Web `http://localhost:3000` · Swagger `http://localhost:3001/api` · MinIO `http://localhost:9001` · Prisma Studio `http://localhost:5555`

---

## 부록: Phase별 착수 체크리스트

**Phase 1 전:** 모노레포 초기화 / 인프라 기동 / `PrismaModule` + 최초 마이그레이션 / JWT+Redis 인증 / 공통 Guard·Pipe·Interceptor·Filter / Swagger 확인 / MUI `#f36f20` ThemeRegistry + 기본 레이아웃 / Zustand + TanStack Query

**Phase 2 전:** Phase 1 통합 테스트 80%+ / Discord Webhook + 이벤트 버스 검증 / documents 마이그레이션 / HR 요청 → 기안 자동 생성 `$transaction` E2E 통과
