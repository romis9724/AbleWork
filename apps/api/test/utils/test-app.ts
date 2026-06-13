/**
 * 통합 테스트용 Nest 애플리케이션 부트스트랩 헬퍼.
 * main.ts 와 동일한 전역 설정(prefix / 필터 / 인터셉터)을 적용해
 * 실제 런타임과 동일한 조건에서 HTTP 요청을 검증한다.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../../src/app.module'
import { GlobalExceptionFilter } from '../../src/common/filters/global-exception.filter'
import { ResponseTransformInterceptor } from '../../src/common/interceptors/response-transform.interceptor'
import { PrismaService } from '../../src/prisma/prisma.service'

export const API_PREFIX = 'api/v1'

export interface TestContext {
  app: INestApplication
  prisma: PrismaService
}

/** AppModule 기반 Nest 앱을 생성하고 main.ts 와 동일한 전역 설정을 적용한다. */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()

  const app = moduleRef.createNestApplication()
  app.setGlobalPrefix(API_PREFIX)
  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(new ResponseTransformInterceptor())

  await app.init()

  const prisma = app.get(PrismaService)
  return { app, prisma }
}

/** 앱 종료 (BullMQ/Prisma 연결 정리). */
export async function closeTestApp(ctx: TestContext | undefined): Promise<void> {
  if (!ctx) return
  await ctx.app.close()
}
