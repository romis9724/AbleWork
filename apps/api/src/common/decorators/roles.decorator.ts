import { SetMetadata } from '@nestjs/common'
import { AccessLevel } from '@ablework/shared-constants'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: AccessLevel[]) => SetMetadata(ROLES_KEY, roles)
