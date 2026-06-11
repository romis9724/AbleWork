import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Response } from 'express'
import { Prisma } from '@prisma/client'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

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
