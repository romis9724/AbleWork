import { z } from 'zod'

export const ClockOutSchema = z.object({
  attendanceId: z.string().uuid('유효한 UUID를 입력하세요.'),
  clockOutAt: z.string().datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' }),
  clockOutLat: z.number().min(-90).max(90).optional(),
  clockOutLng: z.number().min(-180).max(180).optional(),
  clockOutMethod: z.enum(['qr', 'nfc', 'gps', 'wifi', 'manual']).optional(),
  note: z.string().max(500).optional(),
})

export type ClockOutDto = z.infer<typeof ClockOutSchema>

// ── 휴게 시작/종료 ────────────────────────────────────────────────────────────

export const BreakStartSchema = z.object({
  attendanceId: z.string().uuid('유효한 UUID를 입력하세요.'),
  startAt: z.string().datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' }),
  breakType: z.enum(['rest', 'meal', 'other']).default('rest'),
})

export const BreakEndSchema = z.object({
  attendanceId: z.string().uuid('유효한 UUID를 입력하세요.'),
  breakId: z.string().uuid('유효한 UUID를 입력하세요.'),
  endAt: z.string().datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' }),
})

export type BreakStartDto = z.infer<typeof BreakStartSchema>
export type BreakEndDto = z.infer<typeof BreakEndSchema>
