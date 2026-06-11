import { AccessLevel } from '@ablework/shared-constants'

export interface JwtPayload {
  sub: string        // userId
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
  iat?: number
  exp?: number
}
