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
  // 조회 필터 FK는 형식(uuid) 강제 대신 서비스의 companyId 스코프 존재 검증에 맡긴다.
  organizationId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  // 직원 셀프서비스 '우리 조직' 탭 — 서버가 요청자 소속 조직을 직접 해석해 스코프(클라이언트 조직 ID 신뢰 안 함)
  scope: z.enum(['mine', 'org']).optional(),
  status: z.string().optional(),
  // 퇴근 누락(clockOutAt null) 기록만 조회 — 쿼리스트링 'true'/'false' 모두 수용
  missingClockOut: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export type AttendanceFilterDto = z.infer<typeof AttendanceFilterSchema>

// ── 기간 확정 ─────────────────────────────────────────────────────────────────

export const ConfirmPeriodSchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식으로 입력하세요.')
      .optional(),
    employeeIds: z
      .array(z.string().min(1))
      .min(1, '확정할 직원을 한 명 이상 선택하세요.')
      .optional(),
    attendanceIds: z
      .array(z.string().min(1))
      .min(1, '확정할 기록을 하나 이상 선택하세요.')
      .optional(),
  })
  .refine(
    (data) => (data.attendanceIds?.length ?? 0) > 0 || (!!data.startDate && !!data.endDate),
    { message: 'attendanceIds 또는 startDate/endDate 기간 중 하나를 입력하세요.' },
  )

export type ConfirmPeriodDto = z.infer<typeof ConfirmPeriodSchema>

// ── 확정 해제 ─────────────────────────────────────────────────────────────────

export const UnconfirmAttendancesSchema = z
  .object({
    attendanceIds: z.array(z.string().min(1)).min(1).optional(),
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
