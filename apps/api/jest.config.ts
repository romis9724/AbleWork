import type { Config } from 'jest'

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@ablework/shared-constants$': '<rootDir>/../../../packages/shared-constants/src/index.ts',
    '^@ablework/shared-types$': '<rootDir>/../../../packages/shared-types/src/index.ts',
    '^@ablework/shared-schemas$': '<rootDir>/../../../packages/shared-schemas/src/index.ts',
  },
}

export default config
