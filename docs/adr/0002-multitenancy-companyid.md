# 0002. 모든 쿼리에 companyId 강제 (멀티테넌시 격리)

**Status:** Accepted

## Context

AbleWork는 다수 회사가 한 DB를 공유하는 멀티테넌트 SaaS다. 테넌트 격리를 별도 스키마나
DB로 물리 분리하지 않고, 단일 스키마 + 행 단위 `company_id`로 논리 분리한다. 이 경우
쿼리에서 `companyId` 조건을 한 번이라도 누락하면 **타 회사 데이터가 노출**된다.

## Decision

- 모든 DB 쿼리(`findMany`/`findFirst`/`update`/`delete` 등)의 `where`에 `companyId`를
  **반드시** 포함한다.
- `companyId`는 JWT에서 `@CompanyId()` 데코레이터로 추출해 Service로 전달한다.
- 그룹사(멀티컴퍼니)는 활성 회사 전환(`/auth/switch-company`)으로 처리하되, 쿼리 격리
  원칙은 동일하게 유지한다.

## Consequences

- (+) 단일 스키마로 운영 단순, 회사 추가 비용 낮음.
- (−) 격리가 코드 규율에 의존 → 리뷰/테스트로 강제해야 한다. 멀티테넌시 통합 테스트로
  타 회사 접근이 차단되는지 검증한다.
- (−) 향후 규모 확장 시 RLS(행 수준 보안) 도입을 재검토할 수 있다.

## 관련

- 규약: 루트 [`CLAUDE.md`](../../CLAUDE.md) 5절(멀티테넌시 강제 규칙)
- 그룹사: [`docs/design/MULTI_COMPANY_GROUP.md`](../design/MULTI_COMPANY_GROUP.md)
