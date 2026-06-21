import { z } from 'zod'

const dateRegex = /^\d{4}-\d{2}-\d{2}$/

export const CreateLeaveSchema = z.object({
  employeeId: z.string().min(1, '유효한 UUID를 입력하세요.'),
  leaveTypeId: z.string().min(1, '유효한 UUID를 입력하세요.'),
  startDate: z.string().regex(dateRegex, 'YYYY-MM-DD 형식으로 입력하세요.'),
  endDate: z.string().regex(dateRegex, 'YYYY-MM-DD 형식으로 입력하세요.'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  daysUsed: z.number().min(0.01).max(999.99).default(1),
  reason: z.string().optional(),
})

export const ManualAccrualSchema = z.object({
  employeeIds: z
    .array(z.string().min(1, '유효한 UUID를 입력하세요.'))
    .min(1, '직원을 한 명 이상 선택하세요.'),
  leaveTypeId: z.string().min(1, '유효한 UUID를 입력하세요.'),
  year: z.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  days: z.number().min(0.01).max(999.99),
  expiresAt: z.string().regex(dateRegex, 'YYYY-MM-DD 형식으로 입력하세요.').optional(),
  note: z.string().optional(),
})

export const CompensationLeaveSchema = z.object({
  employeeId: z.string().min(1, '유효한 UUID를 입력하세요.'),
  leaveTypeId: z.string().min(1, '유효한 UUID를 입력하세요.'),
  year: z.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  days: z.number().min(0.01).max(999.99),
  expiresAt: z.string().regex(dateRegex, 'YYYY-MM-DD 형식으로 입력하세요.').optional(),
  reason: z.string().optional(),
})

export const CompanyBalanceFilterSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  organizationId: z.string().min(1).optional(),
})

export const LeaveFilterSchema = z.object({
  employeeId: z.string().min(1).optional(),
  leaveTypeId: z.string().min(1).optional(),
  startDate: z.string().regex(dateRegex).optional(),
  endDate: z.string().regex(dateRegex).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateLeaveDto = z.infer<typeof CreateLeaveSchema>
export type ManualAccrualDto = z.infer<typeof ManualAccrualSchema>
export type CompensationLeaveDto = z.infer<typeof CompensationLeaveSchema>
export type LeaveFilterDto = z.infer<typeof LeaveFilterSchema>
export type CompanyBalanceFilterDto = z.infer<typeof CompanyBalanceFilterSchema>
