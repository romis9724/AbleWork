# AbleWork 테스트 가이드

이 디렉토리는 AbleWork ERP의 **재사용 가능한 테스트 자산**을 담는다. 향후 세션에서
LLM 토큰을 절약하기 위해, 시나리오 문서를 먼저 읽고 테스트 코드를 재사용/확장한다.

## 문서

| 문서 | 내용 |
|---|---|
| [unit-test-scenarios.md](./unit-test-scenarios.md) | 28개 서비스 단위 테스트 커버리지 맵·갭·의심버그 (자동 분석) |
| [integration-test-scenarios.md](./integration-test-scenarios.md) | 통합(e2e) 시나리오·하니스·시드 픽스처 |
| [final-test-report.md](./final-test-report.md) | 최종 실행 결과·커버리지·잔여 리스크 종합 |

## 실행 방법

```bash
# 사전: 인프라 기동 (postgres/redis/minio)
docker compose up -d

# 단위 테스트 (mock 기반, DB 불필요)
pnpm --filter api test                 # 전체
pnpm --filter api test -- <패턴>       # 일부
pnpm --filter api test -- --coverage   # 커버리지

# 통합 e2e (실 DB: ablework_test 자동 초기화)
pnpm --filter api test:e2e

# 타입체크 / 린트
pnpm --filter api exec tsc --noEmit
pnpm --filter api lint
```

## 테스트 레이어

| 레이어 | 위치 | 도구 | DB |
|---|---|---|---|
| 단위 | `apps/api/src/**/*.service.spec.ts` | Jest + mock PrismaService | ❌ (mock) |
| 통합(e2e) | `apps/api/test/*.e2e-spec.ts` | Jest + Supertest + NestJS Testing | ✅ `ablework_test` |
| E2E(브라우저) | `apps/web/e2e/*.spec.ts` | Playwright | ✅ 개발 `ablework` |

## 통합 하니스 파일

```
apps/api/test/
├── jest-e2e.json        # e2e jest 설정 (globalSetup/setupFiles)
├── global-setup.ts      # 매 실행: migrate deploy → TRUNCATE → seed (ablework_test)
├── setup-e2e.ts         # 워커 env를 ablework_test로 고정
├── test-db.ts           # DB URL 치환 + env 로딩 유틸
├── utils/
│   ├── test-app.ts      # Nest 앱 부트스트랩(main.ts 동일 전역설정)
│   └── auth.ts          # 시드 로그인 + authedRequest 헬퍼
└── *.e2e-spec.ts        # 시나리오별 통합 테스트
```

## 단위 테스트 모킹 패턴 (요약)

```ts
const mockPrisma = { model: { findFirst: jest.fn(), update: jest.fn(), /* ... */ }, $transaction: jest.fn() }
mockPrisma.$transaction.mockImplementation((cb) => cb(mockPrisma))   // 트랜잭션 콜백 실행
const mockEvents = { emit: jest.fn() }

beforeEach(async () => {
  jest.clearAllMocks()
  const moduleRef = await Test.createTestingModule({
    providers: [
      TheService,
      { provide: PrismaService, useValue: mockPrisma },
      { provide: EventEmitter2, useValue: mockEvents },
    ],
  }).compile()
  service = moduleRef.get(TheService)
})
```

> 멀티테넌시 보안 단언(필수): 모든 수정/삭제 쿼리의 where에 `companyId`가 포함되는지 검증한다.
> `expect(mockPrisma.x.update).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId }) }))`
