# Agent Evals — 대표 task pass-rate 측정

> AI 에이전트(Claude Code 등)가 이 레포에서 자주 수행하는 대표 작업을 정의하고,
> 성공률(pass-rate)을 측정해 **AI-Readiness 개선의 ROI를 정량화**한다.
> AI-Readiness v2 · Cat G(Agent Performance Outcomes).

## 왜

컨텍스트 문서·경로 검증·ADR 같은 개선이 실제로 에이전트 성공률을 올리는지 수치로
확인해야 한다. 측정 없는 개선은 체감에 의존한다.

## 구성

| 파일 | 역할 |
|---|---|
| [`tasks.json`](tasks.json) | 대표 task 정의(프롬프트 + 성공 판정 기준) |
| [`agent-results.json`](agent-results.json) | 실행 결과 기록(task별 pass/fail, 날짜, 모델, 비고) |

## 측정 방법 (현재: 수동 → 향후: 자동)

1. 깨끗한 워크스페이스에서 `tasks.json`의 각 프롬프트를 에이전트에 준다.
2. `criteria`(검증 기준)를 사람이 or CI가 확인한다.
   - 대부분 `pnpm typecheck`·`pnpm test`·`pnpm check:context-paths`로 기계 검증 가능.
3. 결과를 `agent-results.json`에 append하고 pass-rate를 갱신한다.

### CI 자동 검증 (하네스 무결성)

LLM 실행은 CI 밖에서 하되, **eval 하네스 구조**는 CI가 지킨다. `.gitlab-ci.yml`의
`typecheck-lint`에서 `pnpm check:evals`([`scripts/check-evals.mjs`](../scripts/check-evals.mjs))가
`tasks.json`의 필수 필드·id 유일성과 `agent-results.json`이 정의된 task만 참조하는지
검증한다 → task 정의/결과 스키마가 깨지는 회귀를 머지 시점에 차단.

## Baseline

최초 baseline은 AI-Readiness Quick wins + 후속(ADR·ARCHITECTURE·모듈 CLAUDE.md) 반영
직후 시점이다. 이후 개선 전/후 pass-rate를 비교한다.

## 대표 task (요약)

`tasks.json` 참조. 예:

- **T1 새 알림 이벤트 추가** — SSOT([`packages/shared-constants/src/notification.ts`](../packages/shared-constants/src/notification.ts))에만 추가하고 3곳이 파생되는지.
- **T2 멀티테넌시 쿼리 작성** — 새 조회에 `companyId`를 빠뜨리지 않는지([ADR-0002](../docs/adr/0002-multitenancy-companyid.md)).
- **T3 전자결재 첨부 정책 준수** — 상신 이후 첨부 수정을 시도하지 않는지([ADR-0004](../docs/adr/0004-approval-state-machine.md)).
- **T4 API 기동** — `nest start`가 아닌 ts-node로 올바르게 실행하는지([ADR-0005](../docs/adr/0005-api-ts-node-runtime.md)).
- **T5 경로 표기** — 문서에 레포 루트 기준 경로를 쓰고 `check:context-paths`를 통과하는지.
