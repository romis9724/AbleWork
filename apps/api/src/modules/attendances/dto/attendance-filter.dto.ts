import { z } from 'zod'

export const AttendanceFilterSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
    .optional(),
  organizationId: z.string().uuid().optional(),
  employeeId: z.string().uuid().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export type AttendanceFilterDto = z.infer<typeof AttendanceFilterSchema>

// ── 기간 확정 ─────────────────────────────────────────────────────────────────

export const ConfirmPeriodSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.'),
  employeeIds: z
    .array(z.string().uuid())
    .min(1, '확정할 직원을 한 명 이상 선택하세요.')
    .optional(),
})

export type ConfirmPeriodDto = z.infer<typeof ConfirmPeriodSchema>

// ── 확정 해제 ─────────────────────────────────────────────────────────────────

export const UnconfirmAttendancesSchema = z
  .object({
    attendanceIds: z.array(z.string().uuid()).min(1).optional(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
      .optional(),
  })
  .refine(
    (data) => (data.attendanceIds?.length ?? 0) > 0 || (!!data.startDate && !!data.endDate),
    { message: 'attendanceIds 또는 startDate/endDate 기간 중 하나를 입력하세요.' },
  )

export type UnconfirmAttendancesDto = z.infer<typeof UnconfirmAttendancesSchema>
