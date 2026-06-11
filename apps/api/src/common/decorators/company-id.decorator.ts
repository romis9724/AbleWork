import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { JwtPayload } from '../types/jwt-payload.type'

export const CompanyId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest()
    return (request.user as JwtPayload).companyId
  },
)
