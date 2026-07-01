# packages/shared-schemas — Claude Code 가이드

> FE/BE 공유 Zod 스키마 패키지(`@ablework/shared-schemas`).
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md)가 우선한다.

## Overview — 이 모듈이 소유하는 것

- 요청/응답 검증에 쓰는 Zod 스키마를 FE·BE가 공유. 단일 정의로 양쪽 타입 안전 확보.

## 핵심 파일

- [`packages/shared-schemas/src/index.ts`](src/index.ts) — 배럴 export.

## Non-obvious rules

- **Note:** 스키마 변경은 소비처(`apps/api` DTO, `apps/web` 폼)에 즉시 파급된다. 변경 후 양쪽 타입체크 필수.
- 상수·enum은 이 패키지가 아니라 [`packages/shared-constants`](../shared-constants/CLAUDE.md)에 둔다.

## Dependencies — 관련 모듈

- 소비처: [`apps/api`](../../apps/api/CLAUDE.md) · [`apps/web`](../../apps/web/CLAUDE.md).
