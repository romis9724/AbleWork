import type { AccessLevel } from '@ablework/shared-constants'

export interface JwtPayload {
  sub: string
  employeeId: string
  companyId: string
  accessLevel: AccessLevel
  iat?: number
  exp?: number
}

export interface ApiResponse<T> {
  success: true
  data: T
  meta?: { total: number; page: number; limit: number }
}

export interface ApiError {
  success: false
  error: { code: string; message: string; details?: unknown }
}
