import { z } from 'zod'

// 프론트엔드/모바일에서 보내는 간소화된 필드
export const ClockInSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  method: z.enum(['gps', 'wifi', 'manual', 'web']).default('gps'),
  timeclockAreaId: z.string().optional(),
  note: z.string().max(500).optional(),
})

export type ClockInDto = z.infer<typeof ClockInSchema>
