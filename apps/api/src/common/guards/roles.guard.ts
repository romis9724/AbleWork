import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ACCESS_LEVEL_HIERARCHY, AccessLevel } from '@ablework/shared-constants'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { JwtPayload } from '../types/jwt-payload.type'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AccessLevel[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) return true

    const { user } = context.switchToHttp().getRequest() as { user: JwtPayload }
    const userLevel = ACCESS_LEVEL_HIERARCHY[user.accessLevel]
    const requiredLevel = Math.min(...requiredRoles.map((r) => ACCESS_LEVEL_HIERARCHY[r]))

    if (userLevel < requiredLevel) {
      throw new ForbiddenException('접근 권한이 없습니다.')
    }

    return true
  }
}
