# packages/shared-constants — Claude Code 가이드

> FE(apps/web)와 BE(apps/api)가 공유하는 상수·Zod 스키마·권한 규칙의 SSOT.
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md)가 우선한다.

## Overview — 이 모듈이 소유하는 것

- FE/BE 양쪽이 import하는 **단일 진실 공급원**. 여기서 바뀌면 양쪽에 즉시 반영된다.
- 권한 계층, 알림 이벤트 목록, 문서/요청 상태 enum, 근태·시프트 상수, 동적 폼 필드 스키마.

## 핵심 파일

| 파일 | 역할 |
|---|---|
| [`packages/shared-constants/src/permissions.ts`](src/permissions.ts) | 권한 SSOT — `canViewNav`·`ADMIN_NAV_MIN_LEVEL`·`ACTION_MIN_LEVEL`·라우트 가드 |
| [`packages/shared-constants/src/access-level.ts`](src/access-level.ts) | `AccessLevel` 계층(`hasLevel`) |
| [`packages/shared-constants/src/notification.ts`](src/notification.ts) | 알림 이벤트 SSOT — `NOTIFIABLE_EVENTS`·`NOTIFIABLE_EVENT_TYPES` |
| [`packages/shared-constants/src/document-status.ts`](src/document-status.ts) | 전자결재 문서/스텝 상태 enum |
| [`packages/shared-constants/src/document-form-fields.ts`](src/document-form-fields.ts) | 동적 폼 필드 스키마·헬퍼 |
| [`packages/shared-constants/src/request-type.ts`](src/request-type.ts) | HR 요청 유형 |
| [`packages/shared-constants/src/index.ts`](src/index.ts) | 배럴 export |

## Common patterns — 자주 하는 변경

- **새 알림 이벤트**: `notification.ts`의 `NOTIFIABLE_EVENTS`에 추가. event명은 `apps/api/src/events/domain-events.ts`의 런타임 상수명과 **일치해야** 한다(짧은 키 금지).
- **새 상수/스키마**: 해당 파일에 추가 후 `index.ts`에서 export. FE/BE가 `@ablework/shared-constants`로 소비.

## Non-obvious rules

- **반드시** export는 `index.ts` 배럴을 거친다 — 심층 경로 import를 피한다.
- **Warning:** 이 패키지는 FE·BE 양쪽 빌드에 영향을 준다. 변경 시 `apps/api`와 `apps/web` 타입체크를 함께 돌릴 것.
- **Note:** 리스너·BE 기본값·FE 토글이 모두 `NOTIFIABLE_EVENTS`에서 파생되므로, 여기만 고치면 3곳이 동기화된다.

## Dependencies — 관련 모듈

- 소비처: [`apps/api`](../../apps/api/CLAUDE.md) · [`apps/web`](../../apps/web/CLAUDE.md).
- 형제 패키지: `packages/shared-schemas` · `packages/shared-types`.
- 알림 설계 SSOT: [`docs/design/SYSTEM_DESIGN.md`](../../docs/design/SYSTEM_DESIGN.md).
