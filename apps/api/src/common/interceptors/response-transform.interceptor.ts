import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

export interface ApiResponse<T> {
  success: true
  data: T
  meta?: { total: number; page: number; limit: number }
}

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        ...(data !== null && data !== undefined && typeof data === 'object' && 'meta' in data
          ? { data: (data as { data: T }).data, meta: (data as { meta: ApiResponse<T>['meta'] }).meta }
          : { data }),
      })),
    )
  }
}
