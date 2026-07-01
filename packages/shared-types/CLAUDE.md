# packages/shared-types — Claude Code 가이드

> FE/BE 공유 TypeScript 타입 패키지(`@ablework/shared-types`).
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md)가 우선한다.

## Overview — 이 모듈이 소유하는 것

- 순수 타입 정의(런타임 코드 없음)를 FE·BE가 공유.

## 핵심 파일

- [`packages/shared-types/src/index.ts`](src/index.ts) — 배럴 export.

## Non-obvious rules

- **Note:** 런타임 값(상수)은 [`packages/shared-constants`](../shared-constants/CLAUDE.md), 검증 스키마는 [`packages/shared-schemas`](../shared-schemas/CLAUDE.md). 이 패키지는 타입 전용.

## Dependencies — 관련 모듈

- 소비처: [`apps/api`](../../apps/api/CLAUDE.md) · [`apps/web`](../../apps/web/CLAUDE.md).
