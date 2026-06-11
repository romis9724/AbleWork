export const AccessLevel = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  GENERAL_ADMIN: 'GENERAL_ADMIN',
  ORG_ADMIN: 'ORG_ADMIN',
  EMPLOYEE: 'EMPLOYEE',
} as const

export type AccessLevel = (typeof AccessLevel)[keyof typeof AccessLevel]

export const ACCESS_LEVEL_HIERARCHY: Record<AccessLevel, number> = {
  SUPER_ADMIN: 4,
  GENERAL_ADMIN: 3,
  ORG_ADMIN: 2,
  EMPLOYEE: 1,
}
