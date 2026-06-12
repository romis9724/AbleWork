import { z } from 'zod'

// 퇴근: attendanceId 불필요 (서버가 오늘 미퇴근 레코드 자동 조회)
export const ClockOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  method: z.enum(['gps', 'wifi', 'manual', 'web']).default('gps'),
  note: z.string().max(500).optional(),
})

export type ClockOutDto = z.infer<typeof ClockOutSchema>

// 휴게 시작/종료: attendanceId는 서버가 현재 출근 레코드에서 자동 조회
export const BreakStartSchema = z.object({
  breakType: z.enum(['rest', 'meal', 'other']).default('rest'),
})

export const BreakEndSchema = z.object({
  breakId: z.string().optional(), // 없으면 마지막 열린 휴게 종료
})

export type BreakStartDto = z.infer<typeof BreakStartSchema>
export type BreakEndDto = z.infer<typeof BreakEndSchema>
