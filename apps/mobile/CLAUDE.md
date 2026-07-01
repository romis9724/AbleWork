# apps/mobile — Claude Code 가이드

> React Native 모바일 앱 (Expo Router). 출퇴근(WiFi/GPS 장소) 등 현장 기능 중심.
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md)가 우선한다.

## Overview — 이 모듈이 소유하는 것

- 직원용 모바일 클라이언트. 출근/퇴근, WiFi 기반 장소 인증 등 **앱 전용 채널** 기능.
- 웹(apps/web)과 동일한 API를 소비하되, 일부 기능(WiFi 장소)은 앱에서만 활성.

## 핵심 디렉터리

| 경로 | 역할 |
|---|---|
| [`apps/mobile/app/`](app/) | Expo Router 화면 |
| [`apps/mobile/src/`](src/) | 컴포넌트·훅·API 클라이언트 |

## Quick commands

```bash
pnpm --filter mobile exec tsc --noEmit   # 타입체크
```

## Non-obvious rules

- **Note:** 출퇴근 `clockIn`은 앱에서 `channel: 'app'`으로 호출한다. WiFi 장소 인증은 앱 전용(웹은 GPS만).
- **주의:** API 계약은 [`apps/api`](../api/CLAUDE.md)와 공유한다. 변경 시 백엔드 DTO를 함께 확인.

## Dependencies — 관련 모듈

- [`apps/api`](../api/CLAUDE.md) — 백엔드 API.
- 근태 비즈니스 룰: 루트 [`CLAUDE.md`](../../CLAUDE.md) 6절 + [`docs/design/SYSTEM_DESIGN.md`](../../docs/design/SYSTEM_DESIGN.md).
