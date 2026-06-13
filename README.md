# AbleWork ERP

> 중소기업(50~300인)을 위한 통합 HR/근태/전자결재 ERP 시스템

## 개요

인사/조직 관리, 근태 관리, 전자결재를 단일 플랫폼에서 처리한다. HR 요청(휴가, 근무일정 변경, 출퇴근 정정)이 전자결재 워크플로우로 자동 처리되며, Discord Webhook으로 실시간 알림을 제공한다.

## 주요 기능

| 모듈 | 기능 |
|---|---|
| 인사/조직 | 조직 계층 관리, 직원 등록, 직무/권한 설정, 근로정보 이력 |
| 근태 관리 | GPS/WiFi 출퇴근, 근무일정(템플릿/패턴), 휴가 자동 발생, 리포트 |
| 전자결재 | 기안 작성/결재/대결/전결, 부서협조/수신, 공용 결재선 |
| Discord 알림 | 출퇴근·결재·휴가 이벤트 실시간 알림, 재시도 3회 |
| 메시지 자동화 | 휴가 알림 Cron, 이메일 병행 발송 |

## 기술 스택

- **Backend:** NestJS + Prisma + PostgreSQL + Redis + BullMQ
- **Frontend:** Next.js 15 (App Router) + MUI + TanStack Query + Zustand
- **공유:** TypeScript + Zod + pnpm + Turborepo

## 로컬 개발 환경 설정

### 사전 요구사항

- Node.js 22 LTS (`nvm use 22`)
- pnpm 9.x (`npm install -g pnpm`)
- Docker Desktop

### 1. 저장소 클론 및 의존성 설치

```bash
git clone <repo-url> ablework
cd ablework
pnpm install
```

### 2. 환경 변수 설정

```bash
# 루트 (docker-compose 용)
cp .env.example .env

# API 앱
cp apps/api/.env.example apps/api/.env

# Web 앱
cp apps/web/.env.example apps/web/.env
```

`.env` 파일을 열어 비밀번호/시크릿 값을 설정한다.

### 3. 인프라 서비스 기동

```bash
docker compose up -d
# PostgreSQL(호스트 :5433 → 컨테이너 5432), Redis(:6379), MinIO(:9000/:9001) 기동
```

### 4. 데이터베이스 초기화

```bash
pnpm --filter api prisma migrate dev   # 마이그레이션 적용
pnpm --filter api prisma db seed       # 초기 데이터 삽입
```

### 5. 개발 서버 실행

> ⚠️ **API는 `nest start`(= `pnpm dev`)로 기동되지 않는다.** 모노레포 공유 패키지(`packages/*`) 때문에 빌드 산출물이 `dist/apps/api/src/main.js`로 중첩되어 `node dist/main`이 깨진다. **API는 `ts-node`로 직접 실행**하며, **파일 변경 감지(watch)가 없어 백엔드 코드 수정 후 수동 재시작이 필요**하다.

**① API 서버 (포트 3001)** — 전용 터미널 1개:

```bash
cd apps/api
npx ts-node --project tsconfig.json --require tsconfig-paths/register src/main.ts
# 기동 완료 로그: "AbleWork API is running on: http://localhost:3001/api"
```

**② Web 서버 (포트 3000)** — 전용 터미널 1개 (Next.js, 핫리로드 지원):

```bash
pnpm --filter web dev
```

- 백엔드(`apps/api/src`) 코드를 고치면 **API 서버를 `Ctrl+C`로 멈추고 ①을 다시 실행**해야 반영된다.
- 프론트엔드(`apps/web`)는 저장 시 자동 반영된다.

### 서버 정지 / 재기동

```bash
# 정지 — 포트로 종료 (3000=web, 3001=api). 둘 다 한 번에:
kill $(lsof -tiTCP:3000 -tiTCP:3001 -sTCP:LISTEN)

# 실행 상태 확인 (리스닝 중인 포트 표시)
lsof -iTCP:3000 -iTCP:3001 -sTCP:LISTEN -n -P

# API 헬스 체크 (200 이면 정상)
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ablework.io","password":"admin1234!"}'

# 인프라(DB/Redis/MinIO) 정지 / 재기동
docker compose stop      # 정지 (데이터 보존)
docker compose up -d     # 재기동
```

> **로그인이 안 될 때 1순위 점검:** API 서버(3001)가 떠 있는지 `lsof`로 확인한다. 3001이 없으면 위 **① API 서버** 명령으로 재기동하면 된다. (웹만 떠 있으면 로그인 요청이 백엔드에 도달하지 못한다.)

### 접속 URL

| 서비스 | URL |
|---|---|
| 웹 앱 | http://localhost:3000 |
| API 서버 | http://localhost:3001 |
| Swagger 문서 | http://localhost:3001/api |
| Prisma Studio | `pnpm --filter api prisma studio` → http://localhost:5555 |
| MinIO 콘솔 | http://localhost:9001 |

## 개발 명령어

```bash
# 개발 서버 실행은 위 "5. 개발 서버 실행" 참조 (API는 ts-node 직접 실행, pnpm dev 불가)
pnpm build             # 전체 빌드 (Turborepo 캐시)
pnpm test              # Jest 단위 + 통합 테스트 (API)
pnpm --filter api test:e2e   # 통합 e2e (실 DB ablework_test 자동 초기화)
pnpm test:e2e          # Playwright E2E 테스트
pnpm typecheck         # TypeScript 타입 검사
pnpm lint              # ESLint

# Prisma
pnpm --filter api prisma migrate dev --name <이름>   # 마이그레이션 생성
pnpm --filter api prisma generate                    # 클라이언트 재생성
pnpm --filter api prisma studio                      # DB GUI
```

## 구현 Phase

| Phase | 기간 | 내용 |
|---|---|---|
| Phase 1 | W1~W10 | 인사/조직 + 근태 + Discord 알림 + 메시지 자동화 |
| Phase 2 | W11~W17 | 전자결재 + HR 요청 자동 연동 |

## 설계 문서

```
docs/design/
├── SYSTEM_DESIGN.md       # 아키텍처, 모듈 상세, API 설계, 연동 흐름
├── ERD.md                 # 52개 테이블 Mermaid ERD
├── FEATURE_LIST.md        # 기능 목록, Phase별 우선순위, 화면 경로
└── ENGINEERING_DESIGN.md  # 기술 스택, 구현 패턴, 설정 코드
```

Claude Code로 구현 시 `CLAUDE.md`를 먼저 참조한다.

## 기여 방법

1. 구현 전 `docs/design/FEATURE_LIST.md`에서 우선순위 확인
2. 커밋 메시지: `feat:`, `fix:`, `refactor:`, `docs:`, `test:` 접두사 사용
3. 스키마 변경 시 `prisma migrate dev` 실행 후 커밋
4. PR 생성 전 `pnpm typecheck && pnpm lint && pnpm test` 통과 확인

## 구현 제외 항목

급여 정산, 전자계약, Enterprise 전용 기능(2FA, 생체인증, IP 제어 등)은 구현하지 않는다.  
자세한 내용: `docs/design/SYSTEM_DESIGN.md` 섹션 1.4
