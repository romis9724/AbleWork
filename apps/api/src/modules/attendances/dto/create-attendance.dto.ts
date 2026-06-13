import { z } from 'zod'

// 관리자 수기 출퇴근 기록 추가 (ORG_ADMIN 이상)
export const CreateAttendanceSchema = z
  .object({
    employeeId: z.string().uuid('유효한 직원 ID를 입력하세요.'),
    clockInAt: z.string().datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' }),
    clockOutAt: z
      .string()
      .datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' })
      .optional(),
    status: z
      .enum(['normal', 'late', 'early_leave', 'absent', 'oncall', 'remote', 'deemed_work'])
      .optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (data) => !data.clockOutAt || new Date(data.clockOutAt) > new Date(data.clockInAt),
    { message: '퇴근 시각은 출근 시각보다 이후여야 합니다.' },
  )

export type CreateAttendanceDto = z.infer<typeof CreateAttendanceSchema>

// ── 휴게 전체 교체 (ORG_ADMIN 이상) ──────────────────────────────────────────

export const UpdateBreaksSchema = z.object({
  breaks: z.array(
    z
      .object({
        id: z.string().uuid().optional(),
        breakType: z.enum(['rest', 'meal', 'other']).default('rest'),
        startAt: z.string().datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' }),
        endAt: z
          .string()
          .datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' })
          .optional(),
      })
      .refine((b) => !b.endAt || new Date(b.endAt) > new Date(b.startAt), {
        message: '휴게 종료 시각은 시작 시각보다 이후여야 합니다.',
      }),
  ),
})

export type UpdateBreaksDto = z.infer<typeof UpdateBreaksSchema>
