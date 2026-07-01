# apps/web — Claude Code 가이드

> Next.js 15 (App Router) + MUI 6 + TanStack Query v5 + Zustand 5 프런트엔드.
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../../CLAUDE.md)가 우선한다.

## Overview — 이 모듈이 소유하는 것

- 관리자(admin) + 직원 셀프서비스(me) + 공개(auth) 웹 UI 전체.
- 서버 상태(TanStack Query) / 클라이언트 상태(Zustand) / URL 상태 분리.
- 멀티 테마(6종) SSR 무플래시 부트스트랩.

## 핵심 디렉터리

| 경로 | 역할 |
|---|---|
| [`apps/web/src/app/admin/`](src/app/admin/) | 관리자 화면 |
| [`apps/web/src/app/me/`](src/app/me/) | 직원 셀프서비스 화면 |
| [`apps/web/src/app/(auth)/`](src/app/) | 공개 라우트(로그인 등) |
| [`apps/web/src/components/`](src/components/) | 화면 컴포넌트(`approval`·`ab/*` 등) |
| [`apps/web/src/lib/`](src/lib/) | `api/`(axios) · `query/`(TanStack 훅) |
| [`apps/web/src/stores/`](src/stores/) | Zustand 스토어 |
| [`apps/web/src/theme/`](src/theme/) | 테마 토큰 SSOT(`tokens.ts`) |
| [`apps/web/src/middleware.ts`](src/middleware.ts) | 라우트 가드 |

## Quick commands

```bash
pnpm --filter web dev                  # 개발 서버(핫리로드)
pnpm --filter web build                # 프로덕션 빌드
pnpm --filter web exec tsc --noEmit    # 타입체크
pnpm --filter web lint                 # ESLint
pnpm --filter web exec playwright test # E2E (apps/web/e2e)
```

## Common patterns — 자주 하는 변경

- **데이터 페칭**: 직접 fetch 금지. [`apps/web/src/lib/query/`](src/lib/query/)에 훅을 만들고 컴포넌트는 훅만 소비. 서버 상태를 Zustand로 복제하지 않는다.
- **권한 게이팅**: SSOT는 [`packages/shared-constants/src/permissions.ts`](../../packages/shared-constants/src/permissions.ts). `AdminShell` 메뉴 필터 + `middleware.ts` 라우트 가드 + `usePermission` 훅이 모두 여기서 파생.
- **테마/색 토큰**: [`apps/web/src/theme/tokens.ts`](src/theme/tokens.ts) 한 곳에서만 추가/변경.
- **전자결재 UI**: [`apps/web/src/components/approval/`](src/components/approval/) — 상세 정합 규칙은 [`docs/design/THEMING.md`](../../docs/design/THEMING.md) 및 루트 CLAUDE.md.

## Non-obvious rules

- **Don't** Tailwind를 쓰지 않는다 — MUI만. (루트 CLAUDE.md NEVER 목록)
- **주의:** API 응답은 `{ success, data, error }` envelope로 래핑되어 온다. 에러 메시지는 `getApiErrorMessage`로 표준 노출.
- **Note:** 테마는 쿠키 기반 SSR 부트스트랩이라 `ThemeRegistry`/`layout` 쿠키 흐름을 깨지 않도록 주의.

## Dependencies — 관련 모듈

- [`apps/api`](../api/CLAUDE.md) — 백엔드 API. axios 클라이언트는 [`apps/web/src/lib/api/`](src/lib/api/).
- [`packages/shared-constants`](../../packages/shared-constants/CLAUDE.md) — 권한·상태·요청 유형 등 공유 상수/스키마.
- 화면 경로 전체·테마: [`docs/design/FEATURE_LIST.md`](../../docs/design/FEATURE_LIST.md) · [`docs/design/THEMING.md`](../../docs/design/THEMING.md).
