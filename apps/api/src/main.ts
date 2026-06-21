import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { GlobalExceptionFilter } from './common/filters/global-exception.filter'
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor'

async function bootstrap() {
  // rawBody: Discord Interactions 서명검증이 원문 바이트를 요구한다(IntegrationsController)
  const app = await NestFactory.create(AppModule, { rawBody: true })

  app.setGlobalPrefix('api/v1')

  const origins = process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000']
  app.enableCors({
    origin: origins,
    credentials: true,
  })

  app.useGlobalFilters(new GlobalExceptionFilter())
  app.useGlobalInterceptors(new ResponseTransformInterceptor())

  const config = new DocumentBuilder()
    .setTitle('AbleWork ERP API')
    .setDescription('AbleWork ERP 시스템 API 문서')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, document)

  const port = process.env.PORT ?? 3001
  await app.listen(port)
  console.log(`AbleWork API is running on: http://localhost:${port}/api`)
}

bootstrap()
