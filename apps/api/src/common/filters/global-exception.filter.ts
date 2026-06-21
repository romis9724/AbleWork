import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
  Optional,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { EVENTS } from '../../events/domain-events'
import { ApiErrorEvent } from './api-error-event'

@Injectable()
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  // APP_FILTER(DI)로 등록되어 EventEmitter2를 주입받는다. 수동 인스턴스화(테스트 등)에서도
  // 동작하도록 @Optional — 없으면 에러 분석 이벤트만 생략하고 응답 처리는 그대로 한다.
  constructor(@Optional() private readonly eventEmitter?: EventEmitter2) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let code = 'INTERNAL_SERVER_ERROR'
    let message = '서버 오류가 발생했습니다.'
    let details: unknown = undefined

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exceptionResponse = exception.getResponse()
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>
        code = (res.code as string) || this.statusToCode(status)
        message = (res.message as string) || exception.message
        details = res.details
      } else {
        code = this.statusToCode(status)
        message = exception.message
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT
        code = 'ALREADY_EXISTS'
        message = '이미 존재하는 데이터입니다.'
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND
        code = 'NOT_FOUND'
        message = '데이터를 찾을 수 없습니다.'
      } else {
        this.logger.error(`Prisma error ${exception.code}`, exception.stack)
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack)
    }

    response.status(status).json({
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    })

    // 부가: 에러 분석 파이프라인으로 이벤트 발행(실패해도 응답에 영향 없음)
    this.publish(exception, request, status, code, message, details)
  }

  private publish(
    exception: unknown,
    request: Request | undefined,
    status: number,
    code: string,
    message: string,
    details: unknown,
  ): void {
    if (!this.eventEmitter) return
    try {
      const user = (request as { user?: { companyId?: string; sub?: string } } | undefined)?.user
      const payload: ApiErrorEvent = {
        status,
        code,
        message,
        method: request?.method ?? '',
        path: request?.originalUrl ?? request?.url ?? '',
        companyId: user?.companyId,
        userId: user?.sub,
        details,
        stack: exception instanceof Error ? exception.stack : undefined,
        at: new Date().toISOString(),
      }
      this.eventEmitter.emit(EVENTS.API_ERROR_DETECTED, payload)
    } catch (err) {
      this.logger.warn(`에러 이벤트 발행 실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
    }
    return map[status] || 'INTERNAL_SERVER_ERROR'
  }
}
