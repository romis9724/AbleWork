# apps/api — Claude Code 가이드

> NestJS 11 + Prisma 6 백엔드. 인사/근태 + 전자결재 + 알림.
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md)가 우선한다 — 여기서는 이 워크스페이스에 국한된 것만 다룬다.

## Overview — 이 모듈이 소유하는 것

- REST API 전체(`/api/v1/*`), 도메인 비즈니스 로직, DB 접근(Prisma), 도메인 이벤트 발행.
- 멀티테넌시 경계의 **최종 방어선**: 모든 쿼리에 `companyId` 조건이 강제된다.
- 인증/인가(JWT + Roles), Discord/이메일/인앱 알림 디스패치.

## 핵심 디렉터리

| 경로 | 역할 |
|---|---|
| [`apps/api/src/modules/`](src/modules/) | 도메인 모듈 22개 (`documents`·`requests`·`attendances`·`leaves`·`employees` 등) |
| [`apps/api/src/common/`](src/common/) | 공통 인프라 — 데코레이터·가드·파이프·필터·인터셉터 |
| [`apps/api/src/events/`](src/events/) | 도메인 이벤트 상수(`EVENTS` 객체) |
| [`apps/api/src/prisma/`](src/prisma/) | `PrismaService`·`PrismaModule` |
| [`apps/api/prisma/`](prisma/) | `schema.prisma`·`migrations/`·`seed.ts` (src 밖) |

## Quick commands

```bash
# API는 nest start로 기동하지 않는다 — ts-node 직접 실행(watch 없음, 코드 변경 시 수동 재시작)
cd apps/api && npx ts-node --project tsconfig.json --require tsconfig-paths/register src/main.ts

pnpm --filter api test                 # Jest 단위 + 통합
pnpm --filter api test -- --coverage   # 커버리지 (Service 80% 목표)
pnpm --filter api exec tsc --noEmit    # 타입체크

# 스키마 변경 후 반드시
pnpm --filter api prisma migrate dev --name <설명적_이름>
pnpm --filter api prisma generate
```

## Common patterns — 자주 하는 변경

- **레이어**: `Controller → Service → PrismaService(직접)`. Repository 계층을 만들지 않는다. 복잡한 쿼리는 Service의 private 메서드로.
- **HR 요청 → 전자결재 자동 연동**: `POST /requests`가 `$transaction`으로 `requests`+`documents`+`approval_lines`+`approval_steps`를 원자적으로 생성. 상세는 루트 CLAUDE.md 6절 + [`docs/design/SYSTEM_DESIGN.md`](../../docs/design/SYSTEM_DESIGN.md).
- **회사 설정 읽기**: `CompanySettingsService`로 `company_settings` 테이블에서 캐싱하여 조회.
- **새 알림 이벤트**: [`packages/shared-constants/src/notification.ts`](../../packages/shared-constants/src/notification.ts)의 `NOTIFIABLE_EVENTS`에 추가(SSOT).

## Non-obvious rules

- **반드시** 모든 DB 쿼리에 `companyId`를 포함한다 — 누락 시 타 회사 데이터 노출. 루트 CLAUDE.md 5절 참조.
- **Note:** 이벤트명은 `apps/api/src/events/domain-events.ts`의 런타임 상수명과 `NOTIFIABLE_EVENTS` 키가 일치해야 한다.
- **Gotcha:** ts-node 직접 실행이라 코드 수정 후 서버를 수동 재시작해야 반영된다.
- **주의:** 마이그레이션 없이 `schema.prisma`만 바꾸면 런타임 에러. 항상 `migrate dev` + `generate`.

## Dependencies — 관련 모듈

- [`packages/shared-constants`](../../packages/shared-constants/CLAUDE.md) — FE/BE 공유 Zod 스키마·상수·권한·알림 이벤트(SSOT).
- [`apps/web`](../web/CLAUDE.md) — 이 API의 주 소비자. 응답 envelope `{ success, data, error }` 규약 공유.
- 설계 SSOT: [`docs/design/SYSTEM_DESIGN.md`](../../docs/design/SYSTEM_DESIGN.md) · [`docs/design/ERD.md`](../../docs/design/ERD.md) · [`docs/design/CHANGELOG.md`](../../docs/design/CHANGELOG.md).
