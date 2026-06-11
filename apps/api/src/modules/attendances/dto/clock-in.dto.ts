import { z } from 'zod'

export const ClockInSchema = z.object({
  employeeId: z.string().uuid('유효한 UUID를 입력하세요.'),
  clockInAt: z.string().datetime({ message: 'ISO 8601 형식의 날짜/시각을 입력하세요.' }),
  timeclockAreaId: z.string().uuid().optional(),
  clockInLat: z.number().min(-90).max(90).optional(),
  clockInLng: z.number().min(-180).max(180).optional(),
  clockInMethod: z.enum(['qr', 'nfc', 'gps', 'wifi', 'manual']).optional(),
  note: z.string().max(500).optional(),
})

export type ClockInDto = z.infer<typeof ClockInSchema>
