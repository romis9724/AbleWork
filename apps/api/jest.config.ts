import type { Config } from 'jest'

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // 단위 테스트 커버리지는 서비스/도메인 로직을 대상으로 측정한다.
  // 컨트롤러·모듈·DTO·스케줄러·부트스트랩·passport 전략·common 인프라(가드/필터/
  // 인터셉터/파이프/데코레이터)는 통합(e2e) 테스트가 전담하므로 측정에서 제외한다.
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.d.ts',
    '!main.ts',
    '!**/*.module.ts',
    '!**/*.controller.ts',
    '!**/*.dto.ts',
    '!**/*.scheduler.ts',
    '!**/*.strategy.ts',
    '!common/decorators/**',
    '!common/guards/**',
    '!common/filters/**',
    '!common/interceptors/**',
    '!common/pipes/**',
    '!events/**',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ablework/shared-constants$': '<rootDir>/../../../packages/shared-constants/src/index.ts',
    '^@ablework/shared-types$': '<rootDir>/../../../packages/shared-types/src/index.ts',
    '^@ablework/shared-schemas$': '<rootDir>/../../../packages/shared-schemas/src/index.ts',
  },
}

export default config
