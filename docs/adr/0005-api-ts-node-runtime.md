# 0005. API를 nest start가 아닌 ts-node로 직접 실행

**Status:** Accepted

## Context

모노레포에서 `apps/api`는 `packages/*` 공유 패키지를 참조한다. `nest start`(=`pnpm dev`)로
기동하면 빌드 산출물이 `dist/apps/api/src/main.js`처럼 중첩되어 `node dist/main` 경로가
깨진다.

## Decision

로컬 개발에서 API는 **ts-node로 직접 실행**한다.

```bash
cd apps/api
npx ts-node --project tsconfig.json --require tsconfig-paths/register src/main.ts
```

`tsconfig-paths`로 워크스페이스 경로 별칭을 해석한다. 프로덕션은 별도 빌드 파이프라인
(deploy/Dockerfile 멀티타겟)에서 처리한다.

## Consequences

- (+) 모노레포 경로 별칭이 그대로 동작, 별도 빌드 단계 없이 기동.
- (−) **파일 변경 감지(watch)가 없다.** 백엔드 코드 수정 후 서버를 **수동 재시작**해야
  반영된다 — 이 사실을 모르면 "변경이 왜 반영 안 되지?"로 시간을 허비한다.

## 관련

- 기동 방법: [`README.md`](../../README.md) · [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md)
