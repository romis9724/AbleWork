# deploy — Claude Code 가이드

> AWS 배포 산출물(Docker·IaC 스크립트·compose). 운영 런북 SSOT는 [`docs/design/AWS_OPERATIONS.md`](../docs/design/AWS_OPERATIONS.md).
> 프로젝트 전역 규칙은 루트 [`CLAUDE.md`](../CLAUDE.md)가 우선한다.

## Overview — 이 디렉터리가 소유하는 것

- 프로덕션 배포 자산: 멀티타겟 [`deploy/Dockerfile`](Dockerfile)(api·web), compose,
  단계별 AWS 프로비저닝 스크립트(`deploy/aws/00~09-*.sh`), 앱 배포 스크립트.

## 핵심 파일

- [`deploy/Dockerfile`](Dockerfile) — arm64 멀티타겟(api·web) 이미지
- [`deploy/docker-compose.app.yml`](docker-compose.app.yml) · [`deploy/docker-compose.db.yml`](docker-compose.db.yml)
- [`deploy/aws/`](aws/) — 프로비저닝/운영 스크립트(`00~09-*.sh`)
- [`docs/design/AWS_OPERATIONS.md`](../docs/design/AWS_OPERATIONS.md) — 운영 런북·리소스 ID·트러블슈팅(SSOT)

## Quick commands

```bash
# 배포는 main 병합 시 CI 자동 수행. 수동 프로비저닝은 순서대로:
AWS_PROFILE=ablework bash deploy/aws/00-prereqs.sh   # 이후 01~09 순차 실행
```

## Common changes — 자주 하는 변경 (how to)

- **배포 트리거**: `apps/*`·`packages/*`·`deploy/`·`package.json` 변경을 main에 병합 → GitLab CI가 자동 배포. 별도 명령 불필요.
- **인프라 스크립트 수정**: `deploy/aws/NN-*.sh`는 번호 순 의존. 변경 후 런북([`AWS_OPERATIONS.md`](../docs/design/AWS_OPERATIONS.md)) 동기화 필수.

## Non-obvious rules

- **주의:** 배포는 **main 병합 시 GitLab CI(`.gitlab-ci.yml`)가 자동 수행**한다(arm64 buildx → ECR → EC2/SSM). 수동 배포는 런북 참조.
- **Note:** 운영 런북·리소스 ID·트러블슈팅은 [`docs/design/AWS_OPERATIONS.md`](../docs/design/AWS_OPERATIONS.md)가 SSOT.

## Dependencies — 관련 모듈

- CI 파이프라인: [`.gitlab-ci.yml`](../.gitlab-ci.yml).
- 빌드 대상: [`apps/api`](../apps/api/CLAUDE.md) · [`apps/web`](../apps/web/CLAUDE.md).
