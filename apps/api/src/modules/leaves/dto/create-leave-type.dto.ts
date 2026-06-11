import { z } from 'zod'

export const CreateLeaveTypeSchema = z.object({
  groupId: z.string().uuid('유효한 UUID를 입력하세요.'),
  name: z.string().min(1, '유형명을 입력하세요.').max(100),
  displayName: z.string().max(100).optional(),
  code: z.string().max(20).optional(),
  timeOption: z.enum(['full_day', 'half_day', 'hourly']).default('full_day'),
  paidHours: z.number().int().min(0).optional(),
  deductionDays: z.number().min(0).max(999.99).default(1),
  specialOption: z.string().max(30).optional(),
  minConsecutiveDays: z.number().int().min(1).optional(),
  maxConsecutiveDays: z.number().int().min(1).optional(),
  includeHolidaysInConsecutive: z.boolean().default(false),
  allowArbitraryTime: z.boolean().default(false),
  timeFixedType: z.string().max(30).optional(),
  baseHours: z.number().min(0).optional(),
  reasonDisplay: z.boolean().default(false),
  deleteEnclosedShifts: z.boolean().default(false),
  orgScopeIds: z.array(z.string().uuid()).optional(),
  positionScopeIds: z.array(z.string().uuid()).optional(),
  isActive: z.boolean().default(true),
})

export const UpdateLeaveTypeSchema = CreateLeaveTypeSchema.partial().omit({ groupId: true })

export type CreateLeaveTypeDto = z.infer<typeof CreateLeaveTypeSchema>
export type UpdateLeaveTypeDto = z.infer<typeof UpdateLeaveTypeSchema>
