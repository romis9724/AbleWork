# 0001. Repository 계층을 두지 않고 Service에서 Prisma 직접 사용

**Status:** Accepted

## Context

전형적인 레이어드 아키텍처는 `Controller → Service → Repository → ORM`로 데이터 접근을
Repository 뒤에 캡슐화한다. 그러나 Prisma는 그 자체가 타입 안전한 데이터 접근 계층이며,
Repository를 한 겹 더 두면 CRUD 위임 코드가 대량 중복되고 Prisma의 관계 쿼리·트랜잭션
표현력이 인터페이스 뒤로 가려진다.

## Decision

레이어는 `Controller → Service → PrismaService(직접)`로 고정한다. 별도 Repository
클래스를 만들지 않는다. 복잡한 쿼리는 Service 내부의 private 메서드로 분리한다.

## Consequences

- (+) 보일러플레이트 감소, Prisma 관계/트랜잭션을 있는 그대로 사용.
- (+) `$transaction`으로 다중 테이블 원자적 연산을 Service에서 직접 조합(예: HR 요청 →
  전자결재 문서 생성).
- (−) 테스트에서 PrismaService를 목킹해야 한다(Repository 인터페이스 목킹 대비 약간 번거로움).
- (−) 데이터 소스 교체 유연성 포기 — PostgreSQL/Prisma 고정을 전제로 수용.

## 관련

- 규약: 루트 [`CLAUDE.md`](../../CLAUDE.md) 4절 · [`apps/api/CLAUDE.md`](../../apps/api/CLAUDE.md)
