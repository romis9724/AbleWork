import { Injectable, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<T>(err: Error, user: T): T {
    if (err || !user) {
      throw err || new UnauthorizedException('인증이 필요합니다.')
    }
    return user
  }
}
