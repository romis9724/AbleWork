/**
 * Jest e2e setupFiles — 각 테스트 파일 로드 전에 실행.
 * AppModule/PrismaService 가 import 되기 전에 DATABASE_URL 을 테스트 DB로 고정한다.
 */
import { applyTestEnv } from './test-db'

applyTestEnv()
