# Architecture Decision Records (ADR)

> 되돌리기 어렵거나 비자명한 설계 결정의 **근거**를 기록한다. 코드/문서만으로는
> "왜 이렇게 했는가"가 드러나지 않는 것들을 남겨, 신규 기여자·에이전트가 같은
> 함정을 반복하지 않도록 한다.

## 형식

각 ADR: **Context(배경) → Decision(결정) → Consequences(결과/트레이드오프) → Status**.
번호는 순차 부여, 파일명 `NNNN-kebab-title.md`.

## 목록

| # | 제목 | Status |
|---|------|--------|
| [0001](0001-no-repository-layer.md) | Repository 계층을 두지 않고 Service에서 Prisma 직접 사용 | Accepted |
| [0002](0002-multitenancy-companyid.md) | 모든 쿼리에 companyId 강제 (멀티테넌시 격리) | Accepted |
| [0003](0003-hr-request-approval-dualtrack.md) | HR 요청 승인자와 전자결재 결재선의 이원화 | Accepted |
| [0004](0004-approval-state-machine.md) | 전자결재 상태 머신 + 첨부 DRAFT 한정 + 재상신 폐지 | Accepted |
| [0005](0005-api-ts-node-runtime.md) | API를 nest start가 아닌 ts-node로 직접 실행 | Accepted |

## 관련

- 설계 SSOT: [`docs/design/SYSTEM_DESIGN.md`](../design/SYSTEM_DESIGN.md) · [`docs/design/ERD.md`](../design/ERD.md)
- 변경 이력 SSOT: [`docs/design/CHANGELOG.md`](../design/CHANGELOG.md)
